import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from '../components/RequireAuth';
import { ReminderScheduler } from '../features/reminders/ReminderScheduler';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { ReminderEditPage } from '../pages/ReminderEditPage';
import { ReminderListPage } from '../pages/ReminderListPage';
import { SettingsPage } from '../pages/SettingsPage';
import { SocialPage } from '../pages/SocialPage';
import { MedicinesPage } from '../pages/MedicinesPage';
import { MedicineEditPage } from '../pages/MedicineEditPage';
import { MedicineLogsPage } from '../pages/MedicineLogsPage';
import { useAuthStore } from '../stores/authStore';

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
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
        <Route path="*" element={<Navigate to="/today" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
