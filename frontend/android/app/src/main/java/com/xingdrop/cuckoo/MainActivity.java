/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20veGluZ2Ryb3AvY3Vja29vL01haW5BY3Rpdml0eS5qYXZhfDIwMjYtMDl8N2ZmNWQ1MmJhNg== */
package com.xingdrop.cuckoo;

import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 2026-09-09：注册 setAlarmClock 调度插件（绕过 ColorOS 对精确闹钟的 1h 窗口降级）。
        // 注意：Capacitor v6+ 要求 registerPlugin 在 super.onCreate 之前调用，否则插件不会注入 bridge。
        registerPlugin(NativeAlarmPlugin.class);
        // #6（2026-09-09 深夜）：常驻识别器语音插件——会话结束/出错自动无缝续听，治「长按中断/没收到语音」
        registerPlugin(NativeSpeechPlugin.class);
        // #36（2026-09-10 深夜）：照片导出插件——MediaStore 写公共 Download/布谷照片，返回绝对路径
        registerPlugin(NativePhotoSaverPlugin.class);
        // #37（2026-09-10）：Vosk 离线语音识别——系统无 RecognitionService 时兜底
        registerPlugin(NativeVoskPlugin.class);
        handleAlarmIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // app 已在后台时点击通知/全屏意图走 onNewIntent（launchMode singleTask）
        handleAlarmIntent(intent);
        // 通知 WebView 侧 App 插件 resume 逻辑正常触发（Capacitor 在 onNewIntent 里处理）
    }

    @Override
    public void onResume() {
        super.onResume();
        // #5（2026-09-09 深夜）：从原生相机/相册返回后 WebView 偶发整体失焦——
        // 所有按钮点击无响应（Capacitor 已知问题，ColorOS 高发）。
        // onResume 强制 WebView 重新持有焦点，恢复触摸事件派发。
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().requestFocus();
        }
    }

    /** 提取通知点击/全屏意图携带的闹钟 id 与业务提醒 id，转交插件供 JS 消费（直达对应提醒弹窗） */
    private void handleAlarmIntent(Intent intent) {
        if (intent != null && intent.hasExtra("alarmId")) {
            NativeAlarmPlugin.setLastAlarm(
                    intent.getIntExtra("alarmId", -1),
                    intent.getStringExtra("alarmRid"));
            // 清掉 extra，避免重复消费
            intent.removeExtra("alarmId");
            intent.removeExtra("alarmRid");
        }
    }
}
