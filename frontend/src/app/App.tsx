// @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8ZnJvbnRlbmQvc3JjL2FwcC9BcHAudHN4fDIwMjYtMDh8NjdjYzRlNDE4ZQ==
import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../components/RequireAuth';
import { ReminderScheduler } from '../features/reminders/ReminderScheduler';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { ReminderEditPage } from '../pages/ReminderEditPage';
import { ReminderListPage } from '../pages/ReminderListPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SocialPage } from '../pages/SocialPage';
import { MedicinesPage } from '../pages/MedicinesPage';
import { MedicineEditPage } from '../pages/MedicineEditPage';
import { MedicineLogsPage } from '../pages/MedicineLogsPage';
import { StatsPage } from '../pages/StatsPage';
import { PomodoroPage } from '../pages/PomodoroPage';
import { ExercisesPage } from '../pages/ExercisesPage';
import { WaterSettingsPage } from '../pages/WaterSettingsPage';
import { NotificationsPage } from '../pages/NotificationsPage';
import { PostDetailPage } from '../pages/PostDetailPage';
import { ReportsPage } from '../pages/ReportsPage';
import { ReportPage } from '../pages/ReportPage';
import { AchievementsPage } from '../pages/AchievementsPage';
import { PrivacyPage } from '../pages/PrivacyPage';
import { ProfilePage } from '../pages/ProfilePage';
import { FollowListPage } from '../pages/FollowListPage';
import { PlansPage } from '../pages/PlansPage';
import { PlanPreviewPage } from '../pages/PlanPreviewPage';
import { TemplatePreviewPage } from '../pages/TemplatePreviewPage';
import { FamilyPage } from '../pages/FamilyPage';
import { FamilyPartnerPage } from '../pages/FamilyPartnerPage';
import { FamilyChatPage } from '../pages/FamilyChatPage';
import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { useGuestStore } from '../guest/guestStore';
import { tokenStore } from '../services/http';

/**
 * #15/#17/#23：同步结果横幅——
 * 联网恢复 或 打开 App（已有离线镜像）时尝试同步：
 * 成功 → 「✓ 数据同步成功」；失败 → 「✗ 数据同步失败，请检查网络后重试」
 */
function SyncOnOnline() {
  const [msg, setMsg] = useState<null | 'ok' | 'fail'>(null);
  useEffect(() => {
    const run = async () => {
      // 未登录（无 token）时没有回灌对象：种子镜像访客触发 import 必然 401，
      // 既弹"同步失败"横幅又会被 401 拦截器误踢到登录页
      if (!tokenStore.get()) return;
      try {
        const { syncMirrorToCloud } = await import('../guest/mirror');
        const ok = await syncMirrorToCloud();
        setMsg(ok ? 'ok' : 'fail');
      } catch {
        setMsg('fail');
      }
      setTimeout(() => setMsg(null), 4000);
    };
    // 仅离线镜像上下文触发（游客/在线账户无需本地→云端回灌）
    const shouldSync = () => {
      const g = useGuestStore.getState();
      return useConnectionStore.getState().online && g.mirrorOf !== null && !g.active;
    };
    const alreadyOnline = useConnectionStore.getState().online;
    const unsub = useConnectionStore.subscribe((s, prev) => {
      if (s.online && !prev.online && shouldSync()) void run();
    });
    // 打开 App：离线账户镜像 + 启动即联网 → 立即同步一次（在线账户由服务端主导，不弹横幅）
    if (alreadyOnline && useGuestStore.getState().mirrorOf?.startsWith('seed:') && !useGuestStore.getState().active) {
      void run();
    }
    return () => {
      unsub();
    };
  }, []);
  if (!msg) return null;
  return (
    <div
      className={`pointer-events-none fixed bottom-32 left-1/2 z-[45] -translate-x-1/2 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white shadow-lg ${
        msg === 'ok' ? 'bg-primary-500' : 'bg-danger-500'
      }`}
    >
      {msg === 'ok' ? '✓ 数据同步成功' : '✗ 数据同步失败，请检查网络后重试'}
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
      <div>
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
            path="/family"
            element={
              <RequireAuth>
                <FamilyPage />
              </RequireAuth>
            }
          />
          <Route
            path="/family/partner/:id"
            element={
              <RequireAuth>
                <FamilyPartnerPage />
              </RequireAuth>
            }
          />
          <Route
            path="/family/chat/:id"
            element={
              <RequireAuth>
                <FamilyChatPage />
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
      </div>
      </div>
    </BrowserRouter>
  );
}