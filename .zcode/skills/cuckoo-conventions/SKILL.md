---
name: cuckoo-conventions
description: 布谷（Cuckoo）项目开发约定速查 — 在修改本仓库任何前端/后端代码或文档前加载。包含：运行/测试命令、文档同步三件套规则、TypeORM 陷阱、调度算法双端同步、UI 视觉门禁、错误码与 API 规范、git 提交约定、M5 待办概览。触发词：布谷/Cuckoo 项目、改提醒调度、新增 API、加环境变量、新增实体、UI 截图评审、提交前检查。
---

# 布谷项目约定速查

> 本 skill 是 `docs/交接文档.md` 的**浓缩索引**，冲突时以交接文档与三份主文档为准。
> 完整信息：`docs/交接文档.md`（API 全表 §6、实体 §8、环境变量 §9）；`docs/技术方案设计.md` §9 配置表；`docs/项目计划与单元测试验收文档.md` §0 进度总表（勾选状态唯一真源）。

## 1. 项目一句话

React 19 + Vite + Tailwind v4（CSS 变量 tokens）+ Zustand + React Router 7 + Recharts 前端 Web PWA；NestJS 11 + TypeORM + better-sqlite3 + JWT + Web Push 后端。**M0–M4 已完成，当前处于 M5（周报月报/热力图完善/成就系统/数据导出注销/部署手册/UI 评审）**。

## 2. 运行与测试

```bash
# 后端（http://localhost:3000，Swagger: /api）
cd backend && npm run start:dev
# 前端（http://localhost:5173，/api 代理到 3000）
cd frontend && npm run dev
# 测试（基线：后端 33 通过 / 前端 9 通过）
cd backend && npm test
cd frontend && npm test
```

排错：行为"没变化"先 `taskkill //F //IM node.exe` 后干净重启；端口 5173 被占 Vite 会换端口（代理与 CORS 白名单均按 5173 配置）。

## 3. 硬性规则（违反必返工）

1. **新增可转移参数** → 同步三处：`backend/config/configuration.ts` + `backend/.env.example` + `docs/技术方案设计.md` §9（交接文档 §9 表格也同步）
2. **新增实体** → 必须在 `app.module.ts` entities 注册，否则运行 500
3. **改调度算法** `reminder-schedule.ts` → 必须同步 `frontend/src/utils/reminder-schedule.ts` 并跑双端单测
4. **UI 每次改动** → 截图（390×844）→ 用 `.zcode/skills/ui-review`（内置多模态直接读图，无需 ARK 脚本）评分 ≥ 8 再提交
5. **每完成任何任务** → 更新《项目计划与单元测试验收文档.md》勾选（☐→☑）与 §0 进度总表
6. **api 封装**：页面/组件禁止直接 `import axios`，一律走 `services/http.ts`（唯一出口）
7. **错误码**：业务异常用 `{code, message}`（AllExceptionsFilter 归一化），controller 层禁止 try/catch 吞错误
8. **敏感信息**：密钥只进 `backend/.env`，代码/文档/示例文件中出现即违规；生产替换 `JWT_SECRET`/VAPID
9. **git**：main 分支 + Conventional Commits（feat/fix/test/docs/chore），里程碑独立 commit

## 4. TypeORM 陷阱（血泪史）

- 裸列必须显式 `type: 'varchar'`（`string | null` 推断失败 → DataTypeNotSupportedError）
- datetime 必须用 `utcDateTime` transformer 读取补 `Z`；
- `CreateDateColumn` + transformer 的 `to()` 对 undefined 必须返回 undefined
- **禁用 `save(loadedEntity)` 更新**（会反向写旧值），一律 `repo.update({id, userId}, patch)`
- 不要自定义 boolColumn/intColumn transformer（二次转换 bool 写入 0）
- 生产 `NODE_ENV=production` 时 `synchronize` 自动关闭（app.module 已处理），需 migration 策略

## 5. 领域速记

- 统计口径（勿改）：完成率 = done / planned（skip 不计分母）；连续天数从今天（或昨天）回溯全完成
- 库存事务：ack 用药提醒 → transaction 内 扣库存 + 写 log + 预警（STOCK_EXCEEDED 回滚）；幂等 UNIQUE(reminderId, scheduledTime)
- 一键加入：事务内 解析快照 → 批量建提醒 → PlanJoinRecord(UNIQUE) → joinedCount 原子 +1
- 漏服扫描：`missed-scanner.ts` @Interval 60s（env 可调），阈值 `missedThresholdMinutes`（默认 30）
- 通知去重：NotificationLog.dedupKey；Web Push 通过 `push.service.ts#sendToUser`（VAPID 未配自动降级 no-op）
- **已知未打通**：SW push/notificationclick 事件处理器缺失（到期推送前端收不到弹通知）；亲友联系人无 CRUD API；E2E 套件未沉淀

## 6. 文档同步映射（修改时需要同步的四份文档）

| 变更类型 | 必须同步 |
|---|---|
| 功能/API 变更 | 交接文档 §6 API 表 + 计划文档 §6 AC 清单 + 技术方案（如涉目录/架构） |
| 配置/环境变量 | 技术方案 §9 + `.env.example` + 交接文档 §9 |
| 测试/验收 | 计划文档 §3/§4/§5/§6/§7 对应用例勾选 + §0 总表 |
| 页面/路由 | 交接文档 §5.2 路由表 + 需求文档 §7 页面清单（P-xx 编号） |
| 视觉规范 | 需求文档/技术方案中涉及设计系统处 + tokens.css |

## 7. 目录速查

```
backend/src/common/          调度算法纯函数/utc transformer/守卫/过滤器
backend/src/modules/         按领域模块（contacts 有实体无 CRUD；reports/achievements 属 M5）
frontend/src/app/App.tsx     路由表（全部 RequireAuth）
frontend/src/services/       http.ts + api/*.ts 按领域封装
frontend/src/features/reminders/  本地调度（ReminderScheduler/useReminderScheduler/ReminderOverlay）
frontend/src/utils/          reminder-schedule（与后端同源）/calendar/push
tools/screenshots/           UI 评审截图存档
```
