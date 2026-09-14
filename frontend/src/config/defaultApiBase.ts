// /* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8ZnJvbnRlbmQvc3JjL2NvbmZpZy9kZWZhdWx0QXBpQmFzZS50c3wyMDI2LTA5fDU3OTNlNDU4MWE= */
/**
 * APK 默认后端地址（构建时注入：gitignored 的 .env.local 提供，不入库）。
 * 仅在原生平台且用户未手动配置时兜底——局域网私有地址不可被外网路由，无外网暴露面。
 */
export const DEFAULT_NATIVE_API_BASE: string =
  (import.meta.env.VITE_DEFAULT_API_BASE as string | undefined) ?? '';
