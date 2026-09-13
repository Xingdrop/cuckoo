<!-- @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8UkVBRE1FLnpoLUNOLm1kfDIwMjYtMDl8ZDE4NjU3N2E1MA== -->

> 🌏 English documentation: [README.md](./README.md) ｜ [![CI](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml/badge.svg)](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml)

# 布谷（Cuckoo）

<!-- @Sdrop 布谷(Cuckoo) v1 © 2026 Xingdrop -->

布谷，您的忠实生活伴侣——如那只从不误时的欢快啼鸟，温柔唤醒、准点提醒（用药、喝水、锻炼、休息），并与家人一起悉心守护您的每日作息。

**Cuckoo, your faithful life companion — like the cheerful bird that never misses an hour, it wakes you gently, reminds you right on time, and cares for your daily rhythm together with family.**

> 📄 许可：**商业用途须书面授权**（PolyForm 风格商业许可，详见 [LICENSE](./LICENSE)）；授权联系与申请模板见 [CONTACT.md](./CONTACT.md)。
> 🛡 漏洞报告：见 [SECURITY.md](./SECURITY.md)（私密报告 + 响应时间承诺）。

## ✨ 特性

- **多分类提醒**：吃药 / 喝水 / 锻炼 / 休息 / 工作 / 自定义，支持每日多时间点、每周/每月、间隔循环与**不定时**提醒
- **健康数据看板**：完成率、连续天数、分类统计、喝水进度（达成当日目标记 1 次）
- **用药管理**：库存扣减、低库存预警、服药历史（按日/周/月筛选）
- **运动与专注**：微运动库（14 个跟练动作配图解）、番茄钟（默认 25+5 可自定义）、拍照打卡
- **社交社区**：帖子图文/视频分享、评论点赞收藏、一键加入计划、个人主页与关注
- **我的计划**：自建/加入/官方计划，一键发帖，计划内提醒可修改（显示来源与已修改标记）
- **消息通知**：站内通知中心 + Web Push（到期/漏服/低库存三触发源）
- **周报/月报**：热力图、趋势、环比建议；**成就系统**：不间断坚持、用药/锻炼/喝水达人
- **隐私与安全**：数据导出/注销、登录锁定与限流、上传三重校验、审计日志
- **亲友协作**：邀请码绑定家人、只读健康摘要、图文聊天、紧急联系人通知
- **多端**：Web PWA（离线可用）+ Android APK（设置页可下载最新安装包）

## 🚀 快速启动

要求：Node.js 20+。

```bash
# 后端
cd backend
cp .env.example .env      # 配置 JWT_SECRET 等
npm install
npm start                 # http://localhost:3000/api

# 前端（另开终端）
cd frontend
npm install
npm run dev               # http://localhost:5173
```

> 生产部署（Nginx + PM2 + 备份）说明见项目发行材料；Web Push 需在 `.env` 配置 VAPID 密钥对。

## 🧰 技术栈

前端：React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + React Router 7（PWA 离线可用）
后端：NestJS 11 + TypeORM + better-sqlite3（WAL）+ JWT + Swagger + class-validator + Web Push + 定时任务

## 🧪 测试

| 类型 | 命令 |
|---|---|
| 后端单测 | `cd backend && npx jest --runInBand` |
| 前端单测 | `cd frontend && npx vitest run` |
| E2E（自动拉起前后端） | `cd frontend && npm run test:e2e` |
| 代码评审 | 提交前由 AI 助手按项目规范完成（不依赖外部服务） |

## 📦 目录

```
backend/   后端服务（modules 按业务域划分）
frontend/  前端应用（pages / components / stores / services / utils）
```

## 📜 变更记录

版本迭代记录见发行说明（Release Notes）；提交历史遵循 Conventional Commits。
