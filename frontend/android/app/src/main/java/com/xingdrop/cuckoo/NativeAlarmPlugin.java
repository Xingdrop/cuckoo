/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20veGluZ2Ryb3AvY3Vja29vL05hdGl2ZUFsYXJtUGx1Z2luLmphdmF8MjAyNi0wOXxlNGU1YThhOTkx */
package com.xingdrop.cuckoo;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/**
 * 2026-09-09 闹钟根治：ColorOS 对 setExactAndAllowWhileIdle 在 AlarmManager 服务层
 * 静默放宽为 1 小时窗口（插件自报 granted、dumpsys 却 windowLength=3600000，已实锤），
 * 应用层权限无法解除。改用 AlarmManager.setAlarmClock —— 用户可见闹钟 API，
 * AOSP 明确豁免 Doze/电池优化，OEM（含 ColorOS）不会对其降级，是国内提醒类
 * App 在国产 ROM 上保证准时弹出的标准做法。
 * 通知内容存 SharedPreferences，由 NativeAlarmReceiver 到点弹出。
 */
@CapacitorPlugin(name = "NativeAlarm")
public class NativeAlarmPlugin extends Plugin {

    private static final String STORE = "native_alarm_store";

    /** 最近一次由通知点击/全屏意图带入的闹钟 id（JS 侧 consumeLastAlarmId 消费后清零） */
    private static volatile int sLastAlarmId = -1;
    /** 对应业务提醒 id（reminder.id 原始字符串——hashId 单向无法反查，排程时随内容存 SP） */
    private static volatile String sLastAlarmRid = null;

    /** MainActivity（onCreate/onNewIntent）转发通知点击携带的 alarmId/alarmRid */
    public static void setLastAlarm(int id, String rid) {
        sLastAlarmId = id;
        sLastAlarmRid = rid;
    }

    /** JS 消费：返回最近一次通知点击/全屏弹出的闹钟 id 与业务提醒 id（无则 -1/null），取后即清 */
    @PluginMethod
    public void consumeLastAlarmId(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("alarmId", sLastAlarmId);
        ret.put("alarmRid", sLastAlarmRid);
        sLastAlarmId = -1;
        sLastAlarmRid = null;
        call.resolve(ret);
    }

    /** 排一条闹钟：id 为通知 id（int，由 rid 哈希而来），at 为触发时刻（epoch ms，字符串避免 JS 数值精度问题），rid 为业务提醒 id（触发后直达弹窗用） */
    @PluginMethod
    public void schedule(PluginCall call) {
        Integer id = call.getInt("id");
        Long at = parseAt(call.getString("at"));
        String title = call.getString("title", "");
        String body = call.getString("body", "");
        String rid = call.getString("rid");
        if (id == null || id < 0 || at == null || at <= System.currentTimeMillis()) {
            call.reject("invalid id or at");
            return;
        }
        Context ctx = context();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);

        SharedPreferences sp = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        try {
            JSONObject o = new JSONObject();
            o.put("title", title);
            o.put("body", body);
            o.put("at", at);
            if (rid != null) o.put("rid", rid);
            sp.edit().putString("n_" + id, o.toString()).apply();
        } catch (Exception ignored) {
        }

        // showIntent：系统闹钟图标/闹钟界面点按后打开应用
        Intent show = new Intent(ctx, MainActivity.class);
        PendingIntent showPi = PendingIntent.getActivity(ctx, id, show,
                PendingIntent.FLAG_CANCEL_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.setAlarmClock(new AlarmManager.AlarmClockInfo(at, showPi), broadcastPi(ctx, id));

        JSObject ret = new JSObject();
        ret.put("id", id);
        call.resolve(ret);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Integer id = call.getInt("id");
        if (id == null || id < 0) {
            call.reject("invalid id");
            return;
        }
        Context ctx = context();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(broadcastPi(ctx, id));
        ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE).edit().remove("n_" + id).apply();
        call.resolve();
    }

    /** 清掉本插件排的全部闹钟（前端全量重排前调用，幂等） */
    @PluginMethod
    public void cancelAll(PluginCall call) {
        Context ctx = context();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        SharedPreferences sp = ctx.getSharedPreferences(STORE, Context.MODE_PRIVATE);
        SharedPreferences.Editor ed = sp.edit();
        for (String key : sp.getAll().keySet()) {
            if (key.startsWith("n_")) {
                try {
                    am.cancel(broadcastPi(ctx, Integer.parseInt(key.substring(2))));
                } catch (NumberFormatException ignored) {
                }
            }
            ed.remove(key);
        }
        ed.apply();
        call.resolve();
    }

    /** 当前已排的通知 id 列表（对齐/调试用） */
    @PluginMethod
    public void list(PluginCall call) {
        SharedPreferences sp = context().getSharedPreferences(STORE, Context.MODE_PRIVATE);
        JSArray ids = new JSArray();
        for (String key : sp.getAll().keySet()) {
            if (key.startsWith("n_")) {
                try {
                    ids.put(Integer.parseInt(key.substring(2)));
                } catch (NumberFormatException ignored) {
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("ids", ids);
        call.resolve(ret);
    }

    static PendingIntent broadcastPi(Context ctx, int id) {
        Intent i = new Intent(ctx, NativeAlarmReceiver.class);
        i.putExtra("id", id);
        // FLAG_UPDATE_CURRENT：同 id 重排时覆盖旧 extras
        return PendingIntent.getBroadcast(ctx, id, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private Long parseAt(String s) {
        if (s == null) return null;
        try {
            return Long.parseLong(s);
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private Context context() {
        return getContext().getApplicationContext();
    }
}
