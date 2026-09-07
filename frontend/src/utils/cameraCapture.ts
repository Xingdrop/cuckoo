/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvdXRpbHMvY2FtZXJhQ2FwdHVyZS50c3wyMDI2LTA5fDQyNzg1YjczNw== */
import { Capacitor } from '@capacitor/core';

/**
 * 2026-09-07 真机反馈 #8：APK 内 <input type=file capture> 拉起相机走 WebView file chooser，
 * 部分机型 Activity 被回收/崩溃 →「一点拍照就自动退出」且照片丢失。
 * → 原生端改走 @capacitor/camera 插件（onActivityResult 由插件桥接管，无 file chooser）。
 * 返回：File = 拍照/选图成功；null = 原生端取消或失败；undefined = Web 端（调用方回退隐藏 input）。
 */
export async function captureNativePhoto(
  source: 'camera' | 'gallery' = 'camera',
): Promise<File | null | undefined> {
  if (!Capacitor.isNativePlatform()) return undefined;
  try {
    const { Camera, CameraSource, CameraResultType } = await import('@capacitor/camera');
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: source === 'camera' ? CameraSource.Camera : CameraSource.Photos,
      quality: 85,
      width: 1920,
      correctOrientation: true,
    });
    if (!photo.dataUrl) return null;
    const res = await fetch(photo.dataUrl);
    const blob = await res.blob();
    return new File([blob], `capture-${Date.now()}.jpg`, { type: blob.type || 'image/jpeg' });
  } catch {
    return null; // 用户取消或权限拒绝
  }
}
