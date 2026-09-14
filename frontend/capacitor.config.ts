/* /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvY2FwYWNpdG9yLmNvbmZpZy50c3wyMDI2LTA5fDY0NTFiYzc2MjM= */ */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xingdrop.cuckoo',
  appName: '布谷Cuckoo',
  webDir: 'dist',
  // 2026-09-07：WebView 以 https://localhost 加载，默认拦截页内 http:// 请求（Mixed Content）
  // → APK 访问局域网 http 后端必须放开（配合 Manifest usesCleartextTraffic，缺一不可）
  android: { allowMixedContent: true },
  // 2026-09-14（公开前加固）：关闭 WebView 远程调试——开启时任何能 USB 调试的人
  // 都可用 chrome://inspect 读取 WebView 内 localStorage（含 JWT / AI 密钥）。排查真机问题时可临时改回 true
  webContentsDebuggingEnabled: false,
};

export default config;
