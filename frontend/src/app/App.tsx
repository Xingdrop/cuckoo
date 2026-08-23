import { lazy, Suspense, useEffect } from 'react';
import type { ComponentType } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../components/RequireAuth';
import { ReminderScheduler } from '../features/reminders/ReminderScheduler';
import { LoginPage } from '../pages/LoginPage';
import { useAuthStore } from '../stores/authStore';

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

/** 路由 chunk 加载中的全屏骨架 */
function PageFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center text-sm text-ink-300">加载中…</div>
  );
}

/**
 * 路由表（页面清单见 docs/需求分析文档.md §7）
 * P-02 登录 ｜ P-03 今日看板 ｜ P-04 提醒列表 ｜ P-05 创建/编辑提醒 ｜ P-18 设置
 * 后续里程碑挂载：M2 P-07~09 药品；M3 P-10 微运动；M4 P-11~14 社区；M5 P-15~17 统计/成就/通知
 */
export function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <BrowserRouter>
      <ReminderScheduler />
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
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
    </BrowserRouter>
  );
}
