# 布谷（Cuckoo）

准时提醒，温柔守护——布谷，你的健康生活管家。

智能提醒与健康管理社交 App（Web PWA）：用药管理、短时锻炼、生活习惯养成、计划社交分享、数据统计与成就激励。

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS + Zustand + Recharts（PWA） |
| 后端 | NestJS 11 + TypeORM + SQLite（可迁移 PostgreSQL）+ JWT + Web Push |
| 测试 | Vitest / Jest / Playwright / Supertest |
| 质量 | ARK 视觉 UI 评审（tools/ui_review.py） |

## 目录结构

```
docs/       项目文档（需求分析 / 技术方案 / 项目计划与验收 / 源文档）
frontend/   Web PWA 前端
backend/    NestJS API 后端（.env.example 为可转移参数入口）
tools/      开发工具（UI 评审、脚本）
Plugin/     下载的第三方插件包（ui-theme-designer，已安装至 .zcode/skills/）
```

## 快速启动

```bash
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
- 部署手册（M5 里程碑产出）：docs/部署手册.md

## 约定

- 任何 key/token 严禁硬编码，一律走 `backend/.env`（模板 `.env.example`）
- 新增可转移参数须同步 `.env.example` 与《技术方案设计.md》§9
- 页面开发完成后截图 → `tools/ui_review.py` 视觉评审（评分 ≥ 8 门禁）
