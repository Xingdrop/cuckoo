// @Sdrop 布谷(Cuckoo) v1 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2FwcC9BcHAudHN4fDIwMjYtMDg=
import { lazy, Suspense, useEffect, useState } from 'react';
import type { ComponentType } from 'react';
import { WifiOff } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../components/RequireAuth';
import { ReminderScheduler } from '../features/reminders/ReminderScheduler';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { tokenStore } from '../services/http';

/**
 * 懒加载页面的辅助包装：页面组件均为 named export。
 * 分包收益：recharts（Dashboard/Stats）与各页面独立 chunk，首屏只加载登录页与骨架。
 */
function lazyPage<T extends Record<string, unknown>>(loader: () => Promise<T>, name: keyof T) {
  return lazy(async () => ({ default: (await loader())[name] as ComponentType }));
}

// 首屏（登录页）保持静态导入；其余按路由分包
const DashboardPage = lazyPage(() => import('../pages/DashboardPage'), 'DashboardPage');
const ReminderEditPage = lazyPage(() => import('../pages/ReminderEditPage'), 'ReminderEditPage');
const ReminderListPage = lazyPage(() => import('../pages/ReminderListPage'), 'ReminderListPage');
const SettingsPage = lazyPage(() => import('../pages/SettingsPage'), 'SettingsPage');
const SocialPage = lazyPage(() => import('../pages/SocialPage'), 'SocialPage');
const MedicinesPage = lazyPage(() => import('../pages/MedicinesPage'), 'MedicinesPage');
const MedicineEditPage = lazyPage(() => import('../pages/MedicineEditPage'), 'MedicineEditPage');
const MedicineLogsPage = lazyPage(() => import('../pages/MedicineLogsPage'), 'MedicineLogsPage');
const StatsPage = lazyPage(() => import('../pages/StatsPage'), 'StatsPage');
const PomodoroPage = lazyPage(() => import('../pages/PomodoroPage'), 'PomodoroPage');
const ExercisesPage = lazyPage(() => import('../pages/ExercisesPage'), 'ExercisesPage');
const WaterSettingsPage = lazyPage(() => import('../pages/WaterSettingsPage'), 'WaterSettingsPage');
const NotificationsPage = lazyPage(() => import('../pages/NotificationsPage'), 'NotificationsPage');
const PostDetailPage = lazyPage(() => import('../pages/PostDetailPage'), 'PostDetailPage');
const ReportsPage = lazyPage(() => import('../pages/ReportsPage'), 'ReportsPage');
const ReportPage = lazyPage(() => import('../pages/ReportPage'), 'ReportPage');
const AchievementsPage = lazyPage(() => import('../pages/AchievementsPage'), 'AchievementsPage');
const PrivacyPage = lazyPage(() => import('../pages/PrivacyPage'), 'PrivacyPage');
const ProfilePage = lazyPage(() => import('../pages/ProfilePage'), 'ProfilePage');
const FollowListPage = lazyPage(() => import('../pages/FollowListPage'), 'FollowListPage');
const PlansPage = lazyPage(() => import('../pages/PlansPage'), 'PlansPage');
const PlanPreviewPage = lazyPage(() => import('../pages/PlanPreviewPage'), 'PlanPreviewPage');
const TemplatePreviewPage = lazyPage(() => import('../pages/TemplatePreviewPage'), 'TemplatePreviewPage');

/** 路由 chunk 加载中的全屏骨架 */
function PageFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-ink-300">加载中…</div>
  );
}

/** #15/#17：联网恢复 → 本地变更合并回远端 + 重新拉取全量镜像 */
function SyncOnOnline() {
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    const unsub = useConnectionStore.subscribe((s, prev) => {
      if (s.online && !prev.online) {
        void (async () => {
          const { syncMirrorToCloud } = await import('../guest/mirror');
          const ok = await syncMirrorToCloud();
          if (ok) {
            setSynced(true);
            setTimeout(() => setSynced(false), 2500);
          }
        })();
      }
    });
    return () => {
      unsub();
    };
  }, []);
  if (!synced) return null;
  return (
    <div className="fixed left-1/2 top-2 z-[70] -translate-x-1/2 rounded-full bg-primary-500 px-3 py-1 text-[11px] font-medium text-white shadow">
      ☁️ 网络已恢复，本地修改已同步到云端
    </div>
  );
}

/** #17/#19：未联网顶部横幅（网络断开 / APK 无服务器时；可点击 × 关闭；检测完成前不闪现） */
function GlobalOfflineBadge() {
  const online = useConnectionStore((s) => s.online);
  const checked = useConnectionStore((s) => s.lastCheck > 0);
  const [hidden, setHidden] = useState(false);
  if (online || !checked || hidden) return null;
  if (!checked) return null;
  return (
    <div className="fixed inset-x-0 top-0 z-[75] flex items-center justify-center gap-1.5 bg-warning-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm">
      <WifiOff size={12} strokeWidth={2.2} />
      未联网 — 显示本地数据（断网前接收的社交内容可浏览），联网后自动同步
      <button
        onClick={() => setHidden(true)}
        aria-label="关闭未联网提示"
        className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/20 text-[10px] leading-none hover:bg-white/35"
      >
        ✕
      </button>
    </div>
  );
}

/**
 * 路由表（页面清单见 docs/需求分析文档.md §7）
 * P-02 登录 ｜ P-03 今日看板 ｜ P-04 提醒列表 ｜ P-05 创建/编辑提醒 ｜ P-18 设置
 * 后续里程碑挂载：M2 P-07~09 药品；M3 P-10 微运动；M4 P-11~14 社区；M5 P-15~17 统计/成就/通知
 */
export function App() {
  const init = useAuthStore((s) => s.init);
  const online = useConnectionStore((s) => s.online);

  useEffect(() => {
    void init();
    // #16/#17：APK 预置离线种子只加载+校验（不自动登录）；登录后本地校验密码进入离线模式
    void import('../guest/seed').then((m) => m.bootstrapSeed());
    // 联网检测（服务器健康检查）
    void useConnectionStore.getState().init();
    // #17：联网状态监听（online/offline 事件 → 重新探测）
    const onNet = () => setTimeout(() => void useConnectionStore.getState().refresh(), 300);
    window.addEventListener('online', onNet);
    window.addEventListener('offline', onNet);
    const timer = window.setInterval(() => {
      const s = useConnectionStore.getState();
      if (!s.online) void s.refresh();
    }, 45_000);
    return () => {
      window.removeEventListener('online', onNet);
      window.removeEventListener('offline', onNet);
      window.clearInterval(timer);
    };
  }, [init]);

  // 应用启动时：已登录（token）且联网 → 预拉全量镜像（断网可用）
  useEffect(() => {
    const s = useConnectionStore.getState();
    if (s.online && tokenStore.get() && useAuthStore.getState().user) {
      void import('../guest/mirror').then((m) => m.refreshLocalCache());
    }
  }, [online]);

  return (
    <BrowserRouter>
      <GlobalOfflineBadge />
      <SyncOnOnline />
      <ReminderScheduler />
      <div className={online ? '' : 'pt-6'}>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route
            path="/plans"
            element={
              <RequireAuth>
                <PlansPage />
              </RequireAuth>
            }
          />
          <Route
            path="/posts/:id/plan"
            element={
              <RequireAuth>
                <PlanPreviewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/plan-templates/:id"
            element={
              <RequireAuth>
                <TemplatePreviewPage />
              </RequireAuth>
            }
          />
          <Route
            path="/today"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reminders"
            element={
              <RequireAuth>
                <ReminderListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reminders/new"
            element={
              <RequireAuth>
                <ReminderEditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reminders/:id/edit"
            element={
              <RequireAuth>
                <ReminderEditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/medicines"
            element={
              <RequireAuth>
                <MedicinesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/medicines/new"
            element={
              <RequireAuth>
                <MedicineEditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/medicines/:id/edit"
            element={
              <RequireAuth>
                <MedicineEditPage />
              </RequireAuth>
            }
          />
          <Route
            path="/medicines/:id/logs"
            element={
              <RequireAuth>
                <MedicineLogsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/stats"
            element={
              <RequireAuth>
                <StatsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/pomodoro"
            element={
              <RequireAuth>
                <PomodoroPage />
              </RequireAuth>
            }
          />
          <Route
            path="/water-settings"
            element={
              <RequireAuth>
                <WaterSettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/notifications"
            element={
              <RequireAuth>
                <NotificationsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/posts/:id"
            element={
              <RequireAuth>
                <PostDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/exercises"
            element={
              <RequireAuth>
                <ExercisesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/social"
            element={
              <RequireAuth>
                <SocialPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <ReportsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports/:id"
            element={
              <RequireAuth>
                <ReportPage />
              </RequireAuth>
            }
          />
          <Route
            path="/achievements"
            element={
              <RequireAuth>
                <AchievementsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/:id"
            element={
              <RequireAuth>
                <ProfilePage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/:id/following"
            element={
              <RequireAuth>
                <FollowListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/profile/:id/followers"
            element={
              <RequireAuth>
                <FollowListPage />
              </RequireAuth>
            }
          />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </Suspense>
      </div>
    </BrowserRouter>
  );
}