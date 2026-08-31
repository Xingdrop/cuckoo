import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { remindersApi } from '../../services/api/api.reminders';
import { enqueueOp, isOfflineQueueSupported, replayOps } from '../../utils/offline-queue';
import type { Reminder } from '../../types';

/** 从提醒列表中选出下一个应触发的提醒（纯函数，可单测） */
export function pickNextReminder(reminders: Reminder[], now: Date): Reminder | null {
  const upcoming = reminders
    .filter((r) => r.isActive && r.nextTriggerAt && new Date(r.nextTriggerAt) > now)
    .sort(
      (a, b) => new Date(a.nextTriggerAt!).getTime() - new Date(b.nextTriggerAt!).getTime(),
    );
  return upcoming[0] ?? null;
}

/**
 * 本地调度引擎（通道 A：页面打开时的精确调度）。
 * - 轮询提醒列表（15s）+ 立即刷新
 * - 选出下一个到期提醒 → setTimeout 到点触发
 * - 触发后置 activeReminder，由 ReminderOverlay 全屏展示
 * - 弹窗操作（完成/延迟/跳过）回调后重载列表，进入下一轮调度
 * - ack/delay 失败 → 写入 IndexedDB 离线队列，网络恢复后重放（技术方案 §2.2）
 */
export function useReminderScheduler() {
  const user = useAuthStore((s) => s.user);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [active, setActive] = useState<Reminder | null>(null);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef<Reminder | null>(null);
  activeRef.current = active;

  const load = async (silent = false) => {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const list = await remindersApi.list();
      setReminders(list);
      // #25：补弹——回到前台时若提醒刚错过（≤3 分钟且本会话未弹过）立即全屏展示，避免"直接变已错过"
      if (!activeRef.current) {
        const now = Date.now();
        const due = list.find(
          (r) =>
            r.isActive &&
            r.nextTriggerAt &&
            !shownRef.current.has(r.id) &&
            now - new Date(r.nextTriggerAt).getTime() >= 0 &&
            now - new Date(r.nextTriggerAt).getTime() <= 3 * 60_000,
        );
        if (due) {
          shownRef.current.add(due.id);
          setActive(due);
        }
      }
    } catch {
      // 静默失败，下一轮重试
    } finally {
      setLoading(false);
    }
  };
  const loadRef = useRef(load);
  loadRef.current = load;

  /** 重放离线队列（防并发：replayingRef 互斥） */
  const retryOffline = useCallback(async () => {
    if (replayingRef.current || !isOfflineQueueSupported()) return;
    replayingRef.current = true;
    try {
      const { success } = await replayOps(async (op) => {
        if (op.type === 'delay') {
          await remindersApi.delay(op.reminderId, op.minutes ?? 5);
        } else {
          await remindersApi.ack(op.reminderId, {
            status: op.status ?? 'completed',
            scheduledTime: op.scheduledTime,
            photoUrl: op.photoUrl,
          });
        }
      });
      if (success > 0) void loadRef.current(true);
    } finally {
      replayingRef.current = false;
    }
  }, []);

  const replayingRef = useRef(false);
  /** #25：已补弹过的提醒（会话内去重，防止反复弹） */
  const shownRef = useRef(new Set<string>());

  // 轮询 + 首次加载 + 事件刷新（创建/编辑/删除后即时感知）
  useEffect(() => {
    if (!user) return;
    void load();
    const interval = setInterval(() => void load(true), 10_000);
    const onChanged = () => void load(true);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void load(true);
    };
    window.addEventListener('cuckoo:reminders-changed', onChanged);
    window.addEventListener('focus', onChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener('cuckoo:reminders-changed', onChanged);
      window.removeEventListener('focus', onChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // 离线队列重放：登录后 + 网络恢复时
  useEffect(() => {
    if (!user) return;
    void retryOffline();
    window.addEventListener('online', retryOffline);
    return () => window.removeEventListener('online', retryOffline);
  }, [user?.id, retryOffline]);

  // 调度：下一个到期提醒
  useEffect(() => {
    if (!user || activeRef.current) return;
    const next = pickNextReminder(reminders, new Date());
    if (!next) return;
    const delay = new Date(next.nextTriggerAt!).getTime() - Date.now();
    // 最多延迟 24h（超过说明数据异常，等下一轮轮询）
    if (delay > 86_400_000) return;

    timerRef.current = setTimeout(() => {
      setActive(next);
    }, Math.max(0, delay));

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [reminders, user]);

  /** 弹窗操作：完成/延迟/跳过/拍照完成 → ack（幂等）→ 关闭 → 重载 */
  const handleAction = async (
    status: 'completed' | 'delayed' | 'skipped' | 'challenge_completed',
    minutes?: number,
    photoUrl?: string,
  ) => {
    const current = activeRef.current;
    if (!current?.nextTriggerAt) return;
    try {
      if (status === 'delayed') {
        await remindersApi.delay(current.id, minutes ?? 5);
      } else {
        await remindersApi.ack(current.id, {
          status,
          scheduledTime: current.nextTriggerAt,
          photoUrl,
        });
      }
    } catch {
      // ack/delay 失败不阻塞：写入离线同步队列，网络恢复后重放（后端幂等保证不重复扣减）
      void enqueueOp(
        status === 'delayed'
          ? {
              type: 'delay',
              reminderId: current.id,
              scheduledTime: current.nextTriggerAt,
              minutes: minutes ?? 5,
            }
          : {
              type: 'ack',
              reminderId: current.id,
              scheduledTime: current.nextTriggerAt,
              status,
              photoUrl,
            },
      );
    } finally {
      setActive(null);
      void load(true);
    }
  };

  return { reminders, active, loading, handleAction, refresh: () => load() };
}
