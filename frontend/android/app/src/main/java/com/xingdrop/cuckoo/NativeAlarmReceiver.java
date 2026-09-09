/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20veGluZ2Ryb3AvY3Vja29vL05hdGl2ZUFsYXJtUmVjZWl2ZXIuamF2YXwyMDI2LTA5fDhmYTcxNTRmNjA= */
package com.xingdrop.cuckoo;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

/**
 * setAlarmClock 触发器：到点弹出本地通知（与旧插件共用 cuckoo-reminders 高优先级渠道，
 * heads-up + 震动 + 声音由渠道决定）。一次性闹钟——触发后清理记录，下一次触发由前端
 * syncNativeSchedule 全量重排（10s 轮询 + 指纹去重，幂等）。
 */
public class NativeAlarmReceiver extends BroadcastReceiver {

    private static final String CHANNEL_ID = "cuckoo-reminders";
    private static final String STORE = "native_alarm_store";

    @Override
    public void onReceive(Context context, Intent intent) {
        int id = intent.getIntExtra("id", -1);
        if (id < 0) return;
        Context ctx = context.getApplicationContext();

        SharedPreferences sp = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        String json = sp.getString("n_" + id, null);
        sp.edit().remove("n_" + id).apply();

        String title = "布谷提醒";
        String body = "到点啦，点击打开处理";
        if (json != null) {
            try {
                JSONObject o = new JSONObject(json);
                title = o.optString("title", title);
                body = o.optString("body", body);
            } catch (Exception ignored) {
            }
        }

        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "提醒",
                    NotificationManager.IMPORTANCE_HIGH);
            ch.enableVibration(true);
            ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(ch);
        }

        Intent open = new Intent(ctx, MainActivity.class);
        PendingIntent contentPi = PendingIntent.getActivity(ctx, id, open,
                PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, CHANNEL_ID)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(contentPi)
                .setAutoCancel(true)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC);

        if (Build.VERSION.SDK_INT >= 33
                && ctx.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                        != PackageManager.PERMISSION_GRANTED) {
            return; // 无通知权限静默（App 启动时已引导授权）
        }
        nm.notify(id, b.build());
    }
}
