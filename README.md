# 布谷（Cuckoo）

<!-- @Sdrop 布谷(Cuckoo) v1 © 2026 开发者所有。水印校验：node tools/scripts/sdrop-verify.mjs -->
> 水印信息与解码算法存档于本机 `E:\ASEE\项目\开发\水印信息\`（不随仓库发布）；
> 本地敏感信息（.env、数据库）备份于 `E:\ASEE\项目\开发\本地信息\`，公开发布前请按该目录 §2 审计。

准时提醒，温柔守护——布谷，你的健康生活管家。

> 📄 许可：**商用需书面授权**（详见 [LICENSE](./LICENSE)，含开源协议选型对比）；
> 🛡 漏洞报告：见 [SECURITY.md](./SECURITY.md)（私密报告 + 响应时间承诺）。

智能提醒与健康管理社交 App（Web PWA）：用药管理、短时锻炼、生活习惯养成、计划社交分享、数据统计与成就激励。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + Zustand + Recharts（PWA） |
| 后端 | NestJS 11 + TypeORM + SQLite（可迁移 PostgreSQL）+ JWT + Web Push |
| 测试 | Vitest / Jest / Playwright / Supertest |
| 质量 | 多模态 AI 视觉评审（.zcode/skills/ui-review，内置视觉直接读图，无外部 Key） |

## 目录结构

```
docs/       项目文档（需求分析 / 技术方案 / 项目计划与验收 / 源文档）
frontend/   Web PWA 前端
backend/    NestJS API 后端（.env.example 为可转移参数入口）
tools/      开发工具（UI 评审、脚本）
Plugin/     下载的第三方插件包（已评估：Vercel 系 skill 已安装至 .zcode/skills/；ui-theme-designer 为 SAP 专用、vercel-optimize 仅适用 Vercel 部署，均不适用）
```

## 快速启动

```powershell
# 方式一：一键启动（自动清理端口占用 → 启动前后端 → 打开浏览器）
powershell -ExecutionPolicy Bypass -File tools/scripts/dev-all.ps1

# 方式二：手动
# 后端
cd backend
cp .env.example .env          # 配置环境变量（JWT_SECRET、VAPID 密钥等）
npm install
npm run start:dev             # http://localhost:3000/api

# 前端（另开终端）
cd frontend
npm install
npm run dev                   # http://localhost:5173（/api 自动代理到 3000）
```

## 文档索引

- [需求分析文档](docs/需求分析文档.md)
- [技术方案设计](docs/技术方案设计.md)
- [项目计划与单元测试验收文档](docs/项目计划与单元测试验收文档.md)
- [部署手册](docs/部署手册.md)（Nginx + PM2 + 备份 + Docker 可选）
- [项目审查报告](docs/项目审查报告.md)（2026-08 深度审查 + 修复记录）

## 约定

- 任何 key/token 严禁硬编码，一律走 `backend/.env`（模板 `.env.example`）
- 新增可转移参数须同步 `.env.example` 与《技术方案设计.md》§9
- 页面开发完成后截图 → 按 `.zcode/skills/ui-review` 用内置多模态直接读图评审（评分 ≥ 8 门禁）
