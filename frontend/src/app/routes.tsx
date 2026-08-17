import { Navigate, Route, Routes } from 'react-router-dom';
import { DashboardPage } from '../pages/DashboardPage';
import { LoginPage } from '../pages/LoginPage';
import { ReminderListPage } from '../pages/ReminderListPage';
import { SettingsPage } from '../pages/SettingsPage';

/**
 * 路由表（页面清单见 docs/需求分析文档.md §7）
 * P-02 登录 ｜ P-03 今日看板 ｜ P-04 提醒列表 ｜ P-18 设置
 * 后续页面在对应里程碑挂载：
 *   M1: P-01 引导, P-05 创建/编辑提醒, P-06 全屏弹窗
 *   M2: P-07 药品, P-08 服药记录, P-09 亲友
 *   M3: P-10 微运动
 *   M4: P-11~P-14 社区/帖子/小组
 *   M5: P-15 统计, P-16 成就, P-17 通知中心
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/today" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/today" element={<DashboardPage />} />
      <Route path="/reminders" element={<ReminderListPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
  );
}
