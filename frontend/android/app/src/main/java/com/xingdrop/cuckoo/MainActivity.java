/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvYW5kcm9pZC9hcHAvc3JjL21haW4vamF2YS9jb20veGluZ2Ryb3AvY3Vja29vL01haW5BY3Rpdml0eS5qYXZhfDIwMjYtMDl8N2ZmNWQ1MmJhNg== */
package com.xingdrop.cuckoo;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 2026-09-09：注册 setAlarmClock 调度插件（绕过 ColorOS 对精确闹钟的 1h 窗口降级）。
        // 注意：Capacitor v6+ 要求 registerPlugin 在 super.onCreate 之前调用，否则插件不会注入 bridge。
        registerPlugin(NativeAlarmPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
