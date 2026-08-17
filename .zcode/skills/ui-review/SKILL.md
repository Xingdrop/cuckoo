---
name: ui-review
description: 使用火山方舟豆包视觉模型（ARK API）对布谷 APP 界面截图进行 AI 视觉评审。适用于：前端页面开发完成后截图评审 UI 美观度/一致性/可用性、页面改版前后对比、批量评审多页面、向评审模型提供页面上下文说明。使用前需配置 ARK_API_KEY。
---

# UI 视觉评审（火山方舟豆包）

对布谷 APP 前端页面截图进行 AI 视觉评审，输出结构化改进建议，作为前端开发的质量门禁之一。

## 前置条件

1. 环境变量 `ARK_API_KEY` 必须可用（读取自 `backend/.env` 或系统环境变量）。
2. 前端页面需先通过 Playwright/浏览器截取 PNG 截图（建议分辨率 390×844，即 iPhone 14 视口，方便评审移动端布局）。

## 评审流程

### 1. 准备截图

- 开发中页面：用 `webapp-testing` skill 或 Playwright 截图，保存到 `tools/screenshots/` 目录。
- 截图命名建议：`页面名-版本号.png`，如 `reminder-create-v1.png`。

### 2. 单张评审

```bash
python tools/ui_review.py tools/screenshots/reminder-create-v1.png "创建提醒页面：分类选择、时间设置、重复规则、标题输入"
```

### 3. 批量评审（改版对比/全页面体检）

```bash
python tools/ui_review.py --dir tools/screenshots -o tools/screenshots/review-report.md
```

### 4. 模型选择

- 默认 `doubao-seed-2-0-pro-260215`（评审质量高）
- 批量/快速评审可用 `ARK_MODEL=doubao-seed-2-0-lite-260215` 提速
- 排查模型是否开通：`python tools/ui_review.py --list-models`

## 评审报告解读与落地

模型输出按【严重/一般/建议】分级问题清单 + 1-10 评分。处理规则：

| 评分 | 处理 |
|------|------|
| ≥ 8  | 通过，可进入功能评审 |
| 6-7  | 修复【严重】项后通过 |
| < 6  | 修复严重+一般项后重新截图复评 |

修复后必须**重新截图复评**，直到评分 ≥ 8（视觉质量门禁）。

## 注意事项

- 截图必须是真实渲染结果（浏览器截图），不要用手绘稿或代码截图。
- 每次评审前确认页面状态一致（同一路由、同一数据），否则评审对比无意义。
- ARK 为付费 API，批量评审前估算图片数量；单图约消耗 1-2K token。
