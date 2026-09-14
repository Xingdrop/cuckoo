/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20veGluZ2Ryb3AvY3Vja29vL05hdGl2ZVZvc2tQbHVnaW4uamF2YXwyMDI2LTA5fGE5ODM3NDQxMjU= */
package com.xingdrop.cuckoo;

import android.Manifest;
import android.content.Context;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import org.json.JSONObject;
import org.vosk.LibVosk;
import org.vosk.LogLevel;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;
import org.vosk.android.SpeechService;

/**
 * #37（2026-09-10）：离线语音识别兜底。
 * 一加 Ace 3（ColorOS）实锤：系统无任何 RecognitionService（无 Google 服务、
 * 小布 com.heytap.speechassist 不导出公开服务），pm query-services 两 action 均空，
 * logcat "no available voice recognition services found"——NativeSpeechPlugin 的
 * SpeechRecognizer 从系统层面就不可用，识别永远空结果 →「未识别到语音」。
 * 本插件用 Vosk 中文小模型（vosk-model-small-cn-0.22，APK 内置 assets zip，约 42MB）
 * 纯离线识别：首次启动后台解压+载模型（数秒），之后常驻复用。
 *
 * 事件协议与 NativeSpeechPlugin 完全对齐（partial/final/listeningState/srError，
 * 载荷 {session, matches}），speechAdapter 无感切换：
 * - onPartialResult → partial（会话内替换语义）
 * - onResult（端点检测出一句完整话）→ final（session 号不变），随后 session++
 *   ——JS rollSession 把上一句落账进 committed，下一句从零开始
 * - onFinalResult（stop() 后线程退出）→ final（当前 session，JS 直接收尾）
 * - onError → srError（code=-1，consecutive 计数）
 * startListening 用单参重载 = 无静音超时（默认 -1），点按模式下用户停顿不会断流。
 */
@CapacitorPlugin(
    name = "NativeVosk",
    permissions = {@Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "speechRecognition")}
)
public class NativeVoskPlugin extends Plugin implements RecognitionListener {

    private static final String TAG = "NativeVosk";
    /** assets 中的模型 zip（构建时下载，不入 git） */
    private static final String MODEL_ASSET = "model-small-cn.zip";
    private static final int SAMPLE_RATE = 16000;

    /** Capacitor Plugin 基类无 context()（NativeAlarmPlugin 同款 helper），需自行定义 */
    private Context context() {
        return getContext().getApplicationContext();
    }

    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private Model model;
    private Recognizer recognizer;
    private SpeechService service;
    private volatile boolean listening = false;
    private int session = 0;
    private int consecutiveErrors = 0;
    private String prepareError = null;

    @Override
    public void load() {
        super.load();
        // app 启动即后台解压+载模型（首次数秒），避免用户首次点按时等待
        exec.execute(this::prepareQuietly);
    }

    private void prepareQuietly() {
        try {
            ensureEngine();
            Log.i(TAG, "model ready (background)");
        } catch (Exception e) {
            prepareError = String.valueOf(e.getMessage());
            Log.w(TAG, "prepare failed: " + e);
        }
    }

    /** 是否打包了模型 zip（未跑模型下载脚本构建的包 → JS 端回退「不支持」提示） */
    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        boolean hasAsset = false;
        try {
            for (String s : context().getAssets().list("")) {
                if (MODEL_ASSET.equals(s)) {
                    hasAsset = true;
                    break;
                }
            }
        } catch (Exception ignored) {
        }
        ret.put("available", hasAsset);
        // 诊断：模型 zip 损坏/解压失败时透出原因（available 仍为 true——start 会重试 ensureEngine）
        if (prepareError != null) ret.put("prepareError", prepareError);
        call.resolve(ret);
    }

    /** 开始聆听：立即 resolve；模型未就绪时在后台队列等它（首启几秒），结果经事件送达 */
    @PluginMethod
    public void start(PluginCall call) {
        exec.execute(() -> {
            try {
                ensureEngine();
                if (listening) {
                    call.resolve();
                    return;
                }
                recognizer.reset();
                boolean ok = service.startListening(this);
                if (!ok) {
                    call.reject("start failed (already listening or mic busy)");
                    return;
                }
                listening = true;
                consecutiveErrors = 0;
                session++;
                Log.i(TAG, "startListening session=" + session);
                call.resolve();
            } catch (Exception e) {
                Log.w(TAG, "start failed: " + e);
                call.reject("start failed: " + e.getMessage());
            }
        });
    }

    /** 点按结束：stop() 让识别线程退出并回调 onFinalResult（最后一段文本） */
    @PluginMethod
    public void stop(PluginCall call) {
        listening = false;
        try {
            if (service != null) service.stop();
        } catch (Exception ignored) {
        }
        Log.i(TAG, "stop()");
        call.resolve();
    }

    /** 解压模型 + 建三件套（Model/Recognizer/SpeechService），全程持有单线程锁 */
    private synchronized void ensureEngine() throws IOException {
        if (model != null) return;
        LibVosk.setLogLevel(LogLevel.WARNINGS);
        File dir = ensureModelDir();
        model = new Model(dir.getAbsolutePath());
        recognizer = new Recognizer(model, SAMPLE_RATE);
        service = new SpeechService(recognizer, SAMPLE_RATE);
        Log.i(TAG, "engine ready at " + dir);
    }

    /** 解压 assets 模型 zip 到 filesDir/vosk-model/<模型目录>；已解压（含 am/）直接复用 */
    private File ensureModelDir() throws IOException {
        File base = new File(context().getFilesDir(), "vosk-model");
        File found = findModelDir(base);
        if (found != null) return found;
        deleteRecursive(base);
        if (!base.mkdirs()) throw new IOException("cannot create model dir");
        byte[] buf = new byte[1 << 16];
        try (InputStream is = context().getAssets().open(MODEL_ASSET);
             ZipInputStream zis = new ZipInputStream(is)) {
            ZipEntry e;
            while ((e = zis.getNextEntry()) != null) {
                File out = new File(base, e.getName());
                // zip 路径穿越防护
                if (!out.getCanonicalPath().startsWith(base.getCanonicalPath() + File.separator)) continue;
                if (e.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                try (FileOutputStream fo = new FileOutputStream(out)) {
                    int n;
                    while ((n = zis.read(buf)) > 0) fo.write(buf, 0, n);
                }
                zis.closeEntry();
            }
        }
        File dir = findModelDir(base);
        if (dir == null) throw new IOException("model unpack failed");
        return dir;
    }

    /** 模型目录 = vosk-model/ 下含 am/（声学模型）的那个目录（解压完成标志） */
    private File findModelDir(File base) {
        File[] subs = base.listFiles();
        if (subs == null) return null;
        for (File f : subs) {
            if (f.isDirectory() && new File(f, "am").isDirectory()) return f;
        }
        return null;
    }

    private void deleteRecursive(File f) {
        File[] subs = f.listFiles();
        if (subs != null) for (File s : subs) deleteRecursive(s);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    /** 假设 JSON：{"text": "..."}；解析失败/为空返回空串 */
    private String textOf(String json) {
        try {
            return new JSONObject(json).optString("text", "");
        } catch (Exception e) {
            return "";
        }
    }

    private void emitMatches(String event, String text) {
        JSObject ret = new JSObject();
        ret.put("session", session);
        ArrayList<String> list = new ArrayList<>();
        if (text != null && !text.isEmpty()) list.add(text);
        ret.put("matches", new JSArray(list));
        notifyListeners(event, ret);
    }

    @Override
    public void onPartialResult(String hypothesis) {
        String t = textOf(hypothesis);
        if (t.isEmpty()) return;
        if (BuildConfig.DEBUG) Log.d(TAG, "partial session=" + session + " text=" + t);
        emitMatches("partial", t);
    }

    @Override
    public void onResult(String result) {
        // 端点检测出一句完整话：final（session 不变）→ session++，下一句从新会话开始
        String t = textOf(result);
        if (BuildConfig.DEBUG) Log.d(TAG, "result session=" + session + " text=" + t);
        emitMatches("final", t);
        consecutiveErrors = 0;
        session++;
    }

    @Override
    public void onFinalResult(String hypothesis) {
        // stop() 后线程退出/超时：最后一段文本，随当前 session 送达
        String t = textOf(hypothesis);
        if (BuildConfig.DEBUG) Log.d(TAG, "final session=" + session + " text=" + t);
        emitMatches("final", t);
        listening = false;
    }

    @Override
    public void onError(Exception exception) {
        consecutiveErrors++;
        Log.w(TAG, "onError consecutive=" + consecutiveErrors + " : " + exception);
        JSObject ret = new JSObject();
        ret.put("code", -1);
        ret.put("consecutive", consecutiveErrors);
        notifyListeners("srError", ret);
        listening = false;
    }

    @Override
    public void onTimeout() {
        // 静音超时：我们用无超时重载，正常不触发；真触发则线程退出随后 onFinalResult
        Log.w(TAG, "onTimeout");
        listening = false;
    }

    @Override
    protected void handleOnDestroy() {
        listening = false;
        exec.execute(() -> {
            try {
                if (service != null) service.shutdown();
            } catch (Exception ignored) {
            }
            try {
                if (recognizer != null) recognizer.close();
            } catch (Exception ignored) {
            }
            try {
                if (model != null) model.close();
            } catch (Exception ignored) {
            }
            service = null;
            recognizer = null;
            model = null;
        });
    }
}
