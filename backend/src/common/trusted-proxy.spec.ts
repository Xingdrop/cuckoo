/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8YmFja2VuZC9zcmMvY29tbW9uL3RydXN0ZWQtcHJveHkuc3BlYy50c3wyMDI2LTA5fDNkM2YwZWUwMmU= */
import { isTrustedProxy, normalizeIp } from './trusted-proxy';

describe('trusted-proxy（public 模式 trust proxy 判定）', () => {
  it('归一化 IPv4-mapped IPv6', () => {
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::1')).toBe('::1');
    expect(normalizeIp(' 10.0.0.5 ')).toBe('10.0.0.5');
  });

  it('回环地址恒受信（同机 cloudflared / nginx）', () => {
    expect(isTrustedProxy('127.0.0.1')).toBe(true);
    expect(isTrustedProxy('::1')).toBe(true);
    expect(isTrustedProxy('::ffff:127.0.0.1')).toBe(true);
  });

  it('外部直连地址不受信——伪造 X-Forwarded-For 无效', () => {
    expect(isTrustedProxy('203.0.113.9')).toBe(false);
    expect(isTrustedProxy('::ffff:203.0.113.9')).toBe(false);
    expect(isTrustedProxy('192.168.1.20')).toBe(false);
  });

  it('显式配置的跨机反代地址受信', () => {
    const trusted = ['192.168.1.20', '10.0.0.7'];
    expect(isTrustedProxy('192.168.1.20', trusted)).toBe(true);
    expect(isTrustedProxy('::ffff:10.0.0.7', trusted)).toBe(true);
    expect(isTrustedProxy('10.0.0.8', trusted)).toBe(false);
  });

  it('无地址 / 空配置表时保守判定为不受信', () => {
    expect(isTrustedProxy(undefined)).toBe(false);
    expect(isTrustedProxy('')).toBe(false);
    expect(isTrustedProxy('127.0.0.1', [''])).toBe(true);
  });
});