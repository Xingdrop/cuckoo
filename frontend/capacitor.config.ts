/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8Y2FwYWNpdG9yLmNvbmZpZy50c3wyMDI2LTA5fDhiOWI5OTZiMmM= */
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xingdrop.cuckoo',
  appName: '布谷Cuckoo',
  webDir: 'dist',
  // 2026-09-07：WebView 以 https://localhost 加载，默认拦截页内 http:// 请求（Mixed Content）
  // → APK 访问局域网 http 后端必须放开（配合 Manifest usesCleartextTraffic，缺一不可）
  android: { allowMixedContent: true }
};

export default config;
