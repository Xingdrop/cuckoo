# 布谷（Cuckoo）UI 评审报告（M5 + 需求迭代）

> 评审方式：`.zcode/skills/ui-review` 内置多模态视觉直接读图（390×844 截图，`tools/scripts/capture-ui.mjs` 生成）
> 门禁：评分 ≥ 8（《项目计划与单元测试验收文档.md》§8）

## 1. 里程碑评审（2026-08-29，18 页）

| 页面 | 文件 | 评分 | 备注 |
|---|---|---|---|
| 登录 | login.png | 9 | 品牌区/表单/入口完整 |
| 今日看板 | today.png | 8.5 | 空态；**迭代后**改为完成率+喝水并排（见 §2） |
| 提醒列表 | reminders.png | 9 | 修复快捷块文字孤行后复评；迭代后含"我的计划"区块（见 §2） |
| 新建提醒 | reminder-edit.png | 9 | 分类 chips/多时间点/不定时开关 |
| 药品列表 | medicines.png | 8.5 | 空态 + 库存状态 |
| 添加药品 | medicine-edit.png | 9 | 双列表单/日期/勾选 |
| 统计 | stats.png | 8.5 | 4 档热力图/趋势/分类 |
| 番茄钟 | pomodoro.png | 9.5 | 计时/循环 |
| 喝水管理 | water-settings.png | 8.5 | 进度/开关/设置 |
| 微运动库 | exercises.png | 8.5 | 分类分组/加入计划 |
| 社交（旧"动态"） | social.png | 8.5 | 迭代后改为广场/我的/官方/小组 + 头像圈入口 |
| 通知中心 | notifications.png | 8.5 | 空态 |
| 报告列表 | reports.png | 8.5 | 空态 + 生成入口 |
| 报告详情 | report-detail.png | 9 | 周期/环比/建议 |
| 成就墙 | achievements.png | 9 | 指标卡/7 规则进度 |
| 设置 | settings.png | 9 | 通知偏好/我的数据/隐私入口 |
| 全屏提醒弹窗 | reminder-overlay.png | 8.5 | 深色主色/操作区 |
| 帖子详情 | post-detail.png | 9 | 评论/加入（迭代后按钮缩小，见 §2） |

**门禁结论**：18 页全部 ≥8 ✅；唯一 7.5（提醒列表快捷块孤行）已修复复评 9 ✅；发布前关键页面（今日/弹窗/社区）精评 **8.5（达标 ≥8.5 线）**。

## 2. 需求迭代新增/变更页（2026-08-29 下午）

| 页面 | 文件 | 评分 | 说明 |
|---|---|---|---|
| 提醒列表（含我的计划区块） | reminders.png | 8.5 | 快捷块下方新增「📋 我的计划」（新建/来源标签/启停/添加提醒/一键发帖/展开明细） |
| 个人主页 | profile.png | 8.5 | 头像/关注·粉丝（可点列表）/累计完成/TA 的帖子/设置入口 |

## 3. 评审记录与修复循环

- **提醒列表快捷块**（原 7.5）：描述文字孤行（"药品/库存/历|史"）→ 缩短文案 + truncate → 复评 9 ✅
- **看板相对时间**（功能问题连带视觉）：“明天的提醒显示 10 分钟后”→ pending 徽标改以当前 slot 为基准 ✅
- **一键加入按钮**：大号长方形 → 小号胶囊 + 计划卡 padding 减半 ✅

## 4. 工具与复跑

```powershell
# 前置：后端 3000、前端 5173 已启动（或直接运行 tools/scripts/dev-all.ps1）
cd frontend
node ..\tools\scripts\capture-ui.mjs            # 全页面（自动造数）
$env:PAGES='reminders,profile'; node ..\tools\scripts\capture-ui.mjs   # 部分页面
```
