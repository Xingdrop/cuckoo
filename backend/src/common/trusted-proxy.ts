/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL3RydXN0ZWQtcHJveHkudHN8MjAyNi0wOXxhMjE2ZmY1MjE1 */
/**
 * 反向代理信任判定（2026-09-17 安全加固）。
 *
 * 背景：public 模式此前用 `trust proxy = 1` —— 无条件信任一层 X-Forwarded-For。
 * 但本服务监听全部网卡（`0.0.0.0`），只要端口可被直连（局域网或公网暴露），
 * 客户端自带 `X-Forwarded-For: <任意值>` 就能让 `req.ip` 变成任意值：
 * 按 IP 的限流、登录失败计数（`IP + username`）全部可被绕过。
 *
 * 现改为「只信任受信代理」：仅当 **TCP 对端本身** 是受信地址（默认回环——
 * cloudflared / nginx 与本服务同机时的连接来源）才采信 XFF；
 * 直连请求（对端是攻击者真实地址）一律使用 socket 地址，伪造的 XFF 被忽略。
 * 跨机反代场景把其地址写入 `TRUSTED_PROXIES`。
 */

/** 恒受信的回环地址（远程客户端不可能以这些地址建立 TCP 连接） */
const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);

/** 归一化 IPv4-mapped IPv6（Node 中 ::ffff:127.0.0.1 是常见形态），便于精确比对 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  return trimmed.toLowerCase().startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}

/**
 * TCP 对端地址是否属于受信代理 —— 即是否采信其写入的 `X-Forwarded-For`。
 * @param remoteAddress socket 对端地址（`req.socket.remoteAddress`）
 * @param trusted 额外受信地址表（来自 `TRUSTED_PROXIES`，逗号分隔）
 */
export function isTrustedProxy(
  remoteAddress: string | undefined,
  trusted: readonly string[] = [],
): boolean {
  if (!remoteAddress) return false;
  const ip = normalizeIp(remoteAddress);
  if (LOOPBACK.has(ip)) return true;
  return trusted.some((entry) => entry !== '' && normalizeIp(entry) === ip);
}