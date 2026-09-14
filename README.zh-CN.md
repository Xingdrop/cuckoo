<!-- <!-- @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8UkVBRE1FLnpoLUNOLm1kfDIwMjYtMDl8ZDE4NjU3N2E1MA== --> -->

> 🌏 English documentation: [README.md](./README.md) ｜ [![CI](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml/badge.svg)](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml)

# 布谷（Cuckoo）

<!-- @Sdrop 布谷(Cuckoo) v1 © 2026 Xingdrop -->

布谷——如布谷鸟般从不误时，温柔守护你的每日作息。

**Cuckoo — gentle, on-time reminders like the cuckoo's call.**

> 📄 许可：**商业用途须书面授权**（PolyForm 风格商业许可，详见 [LICENSE](./LICENSE)）；授权联系与申请模板见 [CONTACT.md](./CONTACT.md)。
> 🛡 漏洞报告：见 [SECURITY.md](./SECURITY.md)（私密报告 + 响应时间承诺）。
> 📝 变更记录：[CHANGELOG.md](./CHANGELOG.md)。

布谷是一个开源、移动优先的健康提醒 PWA（可装到手机桌面），并提供可选的 Android APK：帮你按时吃药、喝足水、开会间隙起身活动、把微习惯坚持下去，家人也能在你身后盯着你。

## ✨ 特性

- **多分类提醒**：吃药 / 喝水 / 锻炼 / 休息 / 工作 / 自定义，支持每日多时间点、每周/每月、间隔循环与**不定时**提醒；全屏提醒浮层支持「稍后」「跳过」；拍照打卡挑战
- **健康数据看板**：完成率、连续天数、分类统计、喝水进度（达成当日目标记 1 次）
- **用药管理**：库存自动扣减、低库存预警、服药历史（按日/周/月筛选）
- **运动与专注**：微运动库（13 个跟练动作，多帧图解可滑动；一键把动作连同整组图加入提醒）、番茄钟（默认 25+5 可自定义）
- **社交社区**：帖子图文/视频分享、评论点赞收藏、一键加入计划、个人主页与关注
- **我的计划**：自建/加入/官方计划，一键发帖，计划内提醒可修改（显示来源与「已修改」标记）
- **消息通知**：站内通知中心 + Web Push（到期 / 漏服 / 低库存三类触发源）；Android 端另用精确闹钟保证锁屏准点响铃
- **周报/月报**：热力图、趋势、环比建议；**成就系统**：不间断坚持、用药/锻炼/喝水达人
- **亲友协作**：邀请码绑定家人（需对方同意）、只读健康摘要、图文聊天、紧急联系人提醒（**仅站内通知**，未内置短信服务商）
- **语音 / 打字助手**：点按底部按钮说话即可操作 App；也可把该按钮切换成**打字输入**。使用你自己填写的 OpenAI 兼容 API 密钥（仅存本机），每次请求先生成可核对的**预案**（动作清单 + 参数），确认后才执行
- **离线优先**：游客模式与离线账户无需服务器即可使用，登录后自动合并到云端
- **多主题**：内置 3 套主题（蜜桃暖阳 / 青翠原野 / 冰川海湾），设置页随时切换
- **隐私与安全**：数据按账户隔离、数据导出与注销、登录限流与锁定、上传三重校验、审计日志；生产环境若未配置强 `JWT_SECRET` 会**拒绝启动**
- **多端**：Web PWA（离线可用）+ Android APK（设置页内可下载最新安装包）

## 🚀 快速启动

要求：Node.js 22+（CI 与本地开发使用 Node 24；jsdom 单测依赖较新的 undici）。

```bash
# 后端
cd backend
cp .env.example .env      # 配置 JWT_SECRET 等
npm install
npm start                 # 接口  http://localhost:3000/api/v1
                          # 文档  http://localhost:3000/api   （Swagger，仅非生产环境）

# 前端（另开终端）
cd frontend
npm install
npm run dev               # http://localhost:5173
```

> Web Push 需在 `backend/.env` 配置 VAPID 密钥对（见 `.env.example`）。
> 生产部署（Nginx + PM2 + 备份）说明随项目内部文档维护。要点：后端构建**必须带 dev 依赖**（`npm ci && npm run build`），再把 `dist/` 与仅生产依赖的 `node_modules` 同步到运行机，并显式设置 `NODE_ENV`、`JWT_SECRET`、`CORS_ORIGINS`、`UPLOAD_DIR`。生产环境下若 `JWT_SECRET` 缺失、仍是默认值或短于 32 字符，进程会立即退出。

## 📱 Android 应用

后端提供最新安装包下载：`GET /api/v1/app/download`（App 内「设置」页也有入口，仅 App 内可见）。

APK 的语音识别为**自研实现**：`NativeSpeech` 常驻一个识别器实现无缝续听；在无系统 `RecognitionService` 的机型（如 ColorOS）自动降级到 `NativeVosk`——内置离线中文模型，飞行模式下也能识别。**不使用** `@capacitor-community/speech-recognition`：它每次启动都销毁重建识别器，会丢开头几个字。

## 🧰 技术栈

前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + React Router 7（PWA 离线可用）
后端：NestJS 11 + TypeORM + better-sqlite3（WAL）+ JWT + Swagger + class-validator + Web Push + 定时任务
移动端：Capacitor 8（Android），含 4 个自研原生插件（精确闹钟 / 语音识别 / 离线语音 / 照片保存）

## 🧪 测试

| 类型 | 命令 |
|---|---|
| 后端单测 | `cd backend && npx jest --runInBand` |
| 前端单测 | `cd frontend && npx vitest run` |
| 前端类型检查 | `cd frontend && npx tsc -b --noEmit` |
| E2E（Playwright） | `cd backend && npm run build && cd ../frontend && npm run test:e2e` |

E2E 会用 `backend/dist` 自行拉起后端，所以要先构建后端；若本机 3000 / 5173 端口已有服务，会自动复用。

## 📦 目录

```
backend/   后端服务 — modules 按业务域划分，含种子数据与定时任务
frontend/  前端应用 — pages / components / stores / services / utils + Capacitor Android 工程（android/）
.github/   CI 工作流 + Dependabot 配置
```

## 🤝 参与贡献

1. Fork 仓库并建一个主题分支。
2. 改动保持聚焦，沿用现有模块划分；提交信息遵循 Conventional Commits。
3. 提 PR 前先跑单测与类型检查：`cd backend && npx jest`，再 `cd frontend && npx vitest run && npx tsc -b --noEmit`。
4. **绝不提交**密钥、真实用户数据或本机环境文件——`.env`、`data/`、`uploads/` 已按设计加入 gitignore。

安全相关问题请按 [SECURITY.md](./SECURITY.md) 私密报告，不要开公开 issue。

## 📜 许可与变更记录

商业用途须书面授权，详见 [LICENSE](./LICENSE) 与 [CONTACT.md](./CONTACT.md)。面向用户的变更记录见 [CHANGELOG.md](./CHANGELOG.md)。
