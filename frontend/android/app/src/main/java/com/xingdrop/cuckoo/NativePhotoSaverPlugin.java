/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20veGluZ2Ryb3AvY3Vja29vL05hdGl2ZVBob3RvU2F2ZXJQbHVnaW4uamF2YXwyMDI2LTA5fDA1N2VlYjg0ZTI= */ */
package com.xingdrop.cuckoo;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import org.json.JSONObject;

/**
 * #36（2026-09-10 深夜）：照片导出到手机公共目录。
 * 用户反馈：HTML 报告内嵌照片「用户找不到文件」。本插件把照片以**真实文件**写入
 * 公共 Download/布谷照片/ 并返回绝对路径，文件管理器直接可见：
 * - API 29+：MediaStore Downloads（分区存储官方通道，无需任何存储权限）；
 *   同名已存在自动跳过 → 重复导出不产生副本；
 * - API 24-28：旧版存储写公共目录需运行时权限，回退应用专属外部目录
 *   （Android/data/.../files/布谷照片，USB 与文件管理器均可访问）。
 */
@CapacitorPlugin(name = "NativePhotoSaver")
public class NativePhotoSaverPlugin extends Plugin {

    private static final String SUB_DIR = "布谷照片";

    /**
     * 批量保存照片。
     * 入参 photos: [{ name: 文件名(含扩展名), data: 纯 base64（无 data: 前缀） }]
     * 返回 { dir: 绝对目录, saved: 新增数, skipped: 已存在数, failed: 失败数 }
     */
    @PluginMethod
    public void savePhotos(PluginCall call) {
        JSArray photos = call.getArray("photos");
        if (photos == null || photos.length() == 0) {
            call.reject("photos required");
            return;
        }
        Context ctx = context();
        int saved = 0;
        int skipped = 0;
        int failed = 0;
        String dir = "";
        try {
            if (Build.VERSION.SDK_INT >= 29) {
                // 分区存储：MediaStore Downloads，文件管理器在「下载/布谷照片」可见
                String relPath = Environment.DIRECTORY_DOWNLOADS + "/" + SUB_DIR + "/";
                dir = new File(Environment.getExternalStoragePublicDirectory(
                        Environment.DIRECTORY_DOWNLOADS), SUB_DIR).getAbsolutePath();
                for (int i = 0; i < photos.length(); i++) {
                    JSONObject p = photos.getJSONObject(i);
                    String name = p.getString("name");
                    byte[] bytes = Base64.decode(p.getString("data"), Base64.DEFAULT);
                    try {
                        if (queryExists(ctx, name, relPath)) {
                            skipped++;
                            continue;
                        }
                        ContentValues cv = new ContentValues();
                        cv.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                        cv.put(MediaStore.MediaColumns.MIME_TYPE, mimeOf(name));
                        cv.put(MediaStore.MediaColumns.RELATIVE_PATH, relPath);
                        cv.put(MediaStore.MediaColumns.IS_PENDING, 1);
                        Uri uri = ctx.getContentResolver().insert(
                                MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                        if (uri == null) {
                            failed++;
                            continue;
                        }
                        try (OutputStream os = ctx.getContentResolver().openOutputStream(uri)) {
                            os.write(bytes);
                            os.flush();
                        }
                        ContentValues done = new ContentValues();
                        done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                        ctx.getContentResolver().update(uri, done, null, null);
                        saved++;
                    } catch (Exception e) {
                        failed++;
                    }
                }
            } else {
                // API <29 回退：应用专属外部目录（无需权限）
                File base = new File(ctx.getExternalFilesDir(null), SUB_DIR);
                if (!base.exists() && !base.mkdirs()) {
                    call.reject("cannot create dir");
                    return;
                }
                dir = base.getAbsolutePath();
                for (int i = 0; i < photos.length(); i++) {
                    JSONObject p = photos.getJSONObject(i);
                    File f = new File(base, p.getString("name"));
                    try {
                        if (f.exists()) {
                            skipped++;
                            continue;
                        }
                        try (FileOutputStream fo = new FileOutputStream(f)) {
                            fo.write(Base64.decode(p.getString("data"), Base64.DEFAULT));
                            fo.flush();
                        }
                        saved++;
                    } catch (Exception e) {
                        failed++;
                    }
                }
            }
            JSObject ret = new JSObject();
            ret.put("dir", dir);
            ret.put("saved", saved);
            ret.put("skipped", skipped);
            ret.put("failed", failed);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("save failed: " + e.getMessage());
        }
    }

    /** 同目录同名文件是否已存在（重复导出去重；查询失败按不存在处理） */
    private boolean queryExists(Context ctx, String name, String relPath) {
        Cursor c = null;
        try {
            c = ctx.getContentResolver().query(
                    MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                    new String[] { MediaStore.MediaColumns._ID },
                    MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?",
                    new String[] { name, relPath },
                    null);
            return c != null && c.moveToFirst();
        } catch (Exception e) {
            return false;
        } finally {
            if (c != null) c.close();
        }
    }

    /** 与 NativeAlarmPlugin 同款：取应用上下文（MediaStore/文件操作用 applicationContext） */
    private Context context() {
        return getContext().getApplicationContext();
    }

    private String mimeOf(String name) {
        String n = name.toLowerCase();
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".gif")) return "image/gif";
        return "image/jpeg";
    }
}
