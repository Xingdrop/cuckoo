/* @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8dGVzdHMvdW5pdC9vZmZsaW5lLXF1ZXVlLnNwZWMudHN8MjAyNi0wOXwxYzExNjcxMjhk */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  _setOpStoreForTest,
  enqueueOp,
  listOps,
  removeOp,
  replayOps,
} from '../../src/utils/offline-queue';
import type { OpStore, PendingOp } from '../../src/utils/offline-queue';

/** 内存版 OpStore（IndexedDB 在 jsdom 不可用，注入测试实现） */
function memoryStore(): OpStore & { dump: () => PendingOp[] } {
  const ops: PendingOp[] = [];
  return {
    dump: () => [...ops],
    getAll: async () => [...ops],
    put: async (op) => {
      ops.push(op);
    },
    delete: async (id) => {
      const idx = ops.findIndex((o) => o.id === id);
      if (idx >= 0) ops.splice(idx, 1);
    },
  };
}

describe('offline-queue（离线同步队列）', () => {
  let store: ReturnType<typeof memoryStore>;

  beforeEach(() => {
    store = memoryStore();
    _setOpStoreForTest(store);
  });

  afterEach(() => _setOpStoreForTest(null));

  it('enqueue → list 按创建时间排序', async () => {
    await enqueueOp({ type: 'ack', reminderId: 'r1', scheduledTime: '2026-08-29T10:00:00.000Z', status: 'completed' });
    await enqueueOp({ type: 'delay', reminderId: 'r2', scheduledTime: '2026-08-29T11:00:00.000Z', minutes: 10 });
    const ops = await listOps();
    expect(ops).toHaveLength(2);
    expect(ops[0].type).toBe('ack');
    expect(ops[1].type).toBe('delay');
    expect(ops[0].id).toBeTruthy();
  });

  it('replay 成功 → 该条移除，executor 收到完整载荷', async () => {
    await enqueueOp({
      type: 'ack',
      reminderId: 'r9',
      scheduledTime: '2026-08-29T10:00:00.000Z',
      status: 'challenge_completed',
      photoUrl: '/uploads/x.webp',
    });
    const seen: PendingOp[] = [];
    const result = await replayOps(async (op) => {
      seen.push(op);
    });
    expect(seen[0].reminderId).toBe('r9');
    expect(seen[0].status).toBe('challenge_completed');
    expect(result).toEqual({ success: 1, failed: 0 });
    expect(await listOps()).toHaveLength(0);
  });

  it('replay 失败 → 保留待下次重试，不中断后续条目', async () => {
    await enqueueOp({ type: 'ack', reminderId: 'r-bad', scheduledTime: 't1', status: 'completed' });
    await enqueueOp({ type: 'delay', reminderId: 'r-ok', scheduledTime: 't2', minutes: 5 });
    const result = await replayOps(async (op) => {
      if (op.reminderId === 'r-bad') throw new Error('网络异常');
    });
    expect(result).toEqual({ success: 1, failed: 1 });
    const rest = await listOps();
    expect(rest).toHaveLength(1);
    expect(rest[0].reminderId).toBe('r-bad');
  });

  it('removeOp 幂等（删除不存在的 id 不抛错）', async () => {
    await enqueueOp({ type: 'ack', reminderId: 'r1', scheduledTime: 't', status: 'completed' });
    const [op] = await listOps();
    await removeOp(op.id);
    await removeOp('not-exists');
    expect(await listOps()).toHaveLength(0);
  });
});
