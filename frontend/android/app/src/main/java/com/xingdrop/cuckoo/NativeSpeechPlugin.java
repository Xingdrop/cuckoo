/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20veGluZ2Ryb3AvY3Vja29vL05hdGl2ZVNwZWVjaFBsdWdpbi5qYXZhfDIwMjYtMDl8ZDEzMzQ5NjRlOQ== */
package com.xingdrop.cuckoo;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.SystemClock;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import java.util.ArrayList;

/**
 * #6（2026-09-09 深夜）语音识别根治：@capacitor-community/speech-recognition 每次 start()
 * 都 destroy+recreate SpeechRecognizer（数百 ms 预热窗），且 Google 端点检测静音 ~1-2s
 * 即终止会话（onResults 后识别器不再听）——长按期间被反复拆建，用户持续说的话整段丢失，
 * 表现为「还在长按就自动中断/没收到语音」。
 * 本插件：识别器常驻复用（永不销毁），会话结束/出错且 JS 仍在长按时立即无缝续听
 * （cancel→startListening，窗口 ~几十 ms）；partial/final 事件带 session 号供 JS 分段累计。
 *
 * #31（2026-09-10 深夜）加固（真机仍报中断）：
 * - 启动节流 ≥250ms：onError→立即续听若服务持续 busy 会形成紧密空转循环（始终聋）；
 * - 连续错误降级：连续 ≥3 次 BUSY/CLIENT/SERVER → destroy+recreate 识别器（部分 OEM
 *   服务 cancel+startListening 复用失效，必须重建恢复）；
 * - 连续 ≥10 次 → 停止续听上报 JS，杜绝无提示的静默失败；
 * - 全链路原生日志（logcat 过滤 NativeSpeech）：JS [SR] 之外补齐原生侧行为证据。
 */
@CapacitorPlugin(
    name = "NativeSpeech",
    permissions = {@Permission(strings = {Manifest.permission.RECORD_AUDIO}, alias = "speechRecognition")}
)
public class NativeSpeechPlugin extends Plugin implements RecognitionListener {

    private static final String TAG = "NativeSpeech";
    /** 两次 startListening 最小间隔（ms）——防 onError→续听 紧密循环 */
    private static final long START_THROTTLE_MS = 250;
    /** 连续错误达到该值 → 重建识别器（OEM 服务复用失效的降级手段） */
    private static final int REBUILD_AFTER_ERRORS = 3;
    /** 连续错误达到该值 → 放弃续听（上报 JS，避免无限空转） */
    private static final int GIVE_UP_AFTER_ERRORS = 10;

    private SpeechRecognizer recognizer;
    private Intent intent;
    /** JS 侧是否要求聆听（长按中）——false 后 onResults/onError 不再续听 */
    private volatile boolean jsListening = false;
    /** 会话号：每次 startListening 递增，事件携带供 JS 区分会话边界 */
    private int session = 0;
    private long lastStartAt = 0;
    private int consecutiveErrors = 0;

    @Override
    public void load() {
        super.load();
        bridge
            .getWebView()
            .post(() -> {
                recognizer = SpeechRecognizer.createSpeechRecognizer(bridge.getActivity());
                recognizer.setRecognitionListener(this);
                Log.i(TAG, "recognizer created in load()");
            });
    }

    @PluginMethod
    public void available(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", SpeechRecognizer.isRecognitionAvailable(bridge.getContext()));
        call.resolve(ret);
    }

    /** 开始聆听：立即 resolve，结果经 partial/final 事件送达（session 号区分会话） */
    @PluginMethod
    public void start(PluginCall call) {
        if (recognizer == null) {
            call.reject("recognizer not ready");
            return;
        }
        String language = call.getString("language", "zh-CN");
        intent = buildIntent(language);
        jsListening = true;
        consecutiveErrors = 0;
        startSession();
        call.resolve();
    }

    /** 松手：停止聆听（进行中的会话仍会给出最终结果，经 final 事件送达） */
    @PluginMethod
    public void stop(PluginCall call) {
        jsListening = false;
        try {
            if (recognizer != null) recognizer.stopListening();
        } catch (Exception ignored) {
        }
        Log.i(TAG, "stop(): jsListening=false");
        call.resolve();
    }

    private Intent buildIntent(String language) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, bridge.getActivity().getPackageName());
        return i;
    }

    /** 无缝续听：复用同一识别器 cancel→start，不 destroy（销毁重建的预热窗是丢词元凶）；带节流 */
    private void startSession() {
        if (recognizer == null || intent == null || !jsListening) return;
        long since = SystemClock.elapsedRealtime() - lastStartAt;
        if (lastStartAt > 0 && since < START_THROTTLE_MS) {
            bridge.getWebView().postDelayed(this::doStart, START_THROTTLE_MS - since);
            return;
        }
        doStart();
    }

    private void doStart() {
        if (recognizer == null || intent == null || !jsListening) return;
        lastStartAt = SystemClock.elapsedRealtime();
        session++;
        Log.d(TAG, "startListening session=" + session);
        try {
            recognizer.cancel();
            recognizer.startListening(intent);
        } catch (Exception e) {
            Log.w(TAG, "startListening failed: " + e);
        }
    }

    /** 识别器重建降级：部分 OEM 服务对 cancel+start 复用失效（持续 busy/client 错误），必须重建 */
    private void rebuild() {
        Log.w(TAG, "rebuild recognizer");
        try {
            recognizer.destroy();
        } catch (Exception ignored) {
        }
        try {
            recognizer = SpeechRecognizer.createSpeechRecognizer(bridge.getActivity());
            recognizer.setRecognitionListener(this);
        } catch (Exception e) {
            Log.w(TAG, "rebuild failed: " + e);
            recognizer = null;
        }
    }

    @Override
    public void onReadyForSpeech(Bundle params) {
        Log.d(TAG, "onReadyForSpeech session=" + session);
    }

    @Override
    public void onBeginningOfSpeech() {
        JSObject ret = new JSObject();
        ret.put("status", "started");
        notifyListeners("listeningState", ret);
    }

    @Override
    public void onRmsChanged(float rmsdB) {}

    @Override
    public void onBufferReceived(byte[] buffer) {}

    @Override
    public void onEndOfSpeech() {
        Log.d(TAG, "onEndOfSpeech session=" + session);
        JSObject ret = new JSObject();
        ret.put("status", "stopped");
        notifyListeners("listeningState", ret);
    }

    @Override
    public void onError(int error) {
        consecutiveErrors++;
        Log.w(TAG, "onError code=" + error + " consecutive=" + consecutiveErrors + " jsListening=" + jsListening);
        JSObject ret = new JSObject();
        ret.put("code", error);
        ret.put("consecutive", consecutiveErrors);
        notifyListeners("srError", ret);
        if (!jsListening) return;
        // 权限缺失重试无意义；连续失败过多放弃续听（避免无提示空转）；OEM 复用失效先重建
        if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) return;
        if (consecutiveErrors >= GIVE_UP_AFTER_ERRORS) {
            Log.w(TAG, "give up auto-restart");
            return;
        }
        if (consecutiveErrors >= REBUILD_AFTER_ERRORS
                && (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY
                    || error == SpeechRecognizer.ERROR_CLIENT
                    || error == SpeechRecognizer.ERROR_SERVER)) {
            rebuild();
        }
        startSession();
    }

    @Override
    public void onPartialResults(Bundle partialResults) {
        consecutiveErrors = 0;
        ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;
        JSObject ret = new JSObject();
        ret.put("session", session);
        ret.put("matches", new JSArray(matches));
        notifyListeners("partial", ret);
    }

    @Override
    public void onResults(Bundle results) {
        consecutiveErrors = 0;
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        Log.d(TAG, "onResults session=" + session + " matches=" + (matches == null ? 0 : matches.size()));
        JSObject ret = new JSObject();
        ret.put("session", session);
        ret.put("matches", matches == null ? new JSArray() : new JSArray(matches));
        notifyListeners("final", ret);
        // 会话随结果终止——长按未松手则立即续听（无缝，不等 JS watchdog）
        if (jsListening) startSession();
    }

    @Override
    public void onEvent(int eventType, Bundle params) {}

    @Override
    protected void handleOnDestroy() {
        jsListening = false;
        try {
            if (recognizer != null) recognizer.destroy();
        } catch (Exception ignored) {
        }
        recognizer = null;
    }
}
