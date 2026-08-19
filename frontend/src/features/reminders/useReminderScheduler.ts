import { useEffect, useRef, useState } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { remindersApi } from '../../services/api/api.reminders';
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
 * - 轮询提醒列表（30s）+ 立即刷新
 * - 选出下一个到期提醒 → setTimeout 到点触发
 * - 触发后置 activeReminder，由 ReminderOverlay 全屏展示
 * - 弹窗操作（完成/延迟/跳过）回调后重载列表，进入下一轮调度
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
      setReminders(await remindersApi.list());
    } catch {
      // 静默失败，下一轮重试
    } finally {
      setLoading(false);
    }
  };

  // 轮询 + 首次加载 + 事件刷新（创建/编辑/删除后即时感知）
  useEffect(() => {
    if (!user) return;
    void load();
    const interval = setInterval(() => void load(true), 15_000);
    const onChanged = () => void load(true);
    window.addEventListener('cuckoo:reminders-changed', onChanged);
    return () => {
      clearInterval(interval);
      window.removeEventListener('cuckoo:reminders-changed', onChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

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
      // ack 失败不阻塞（本地已展示），下一轮同步兜底
    } finally {
      setActive(null);
      void load(true);
    }
  };

  return { reminders, active, loading, handleAction, refresh: () => load() };
}
