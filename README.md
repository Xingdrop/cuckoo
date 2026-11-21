<!-- @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8WGluZ2Ryb3B8UkVBRE1FLm1kfDIwMjYtMDh8ZTY1NmZkZjJkMg== -->
# Cuckoo (布谷)

[![CI](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml/badge.svg)](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml)

**Cuckoo — gentle, on-time reminders like the cuckoo's call.**

准时提醒，温柔守护——布谷，你的健康生活管家。

> 📄 License: **Commercial use requires written permission** (PolyForm-style commercial license, see [LICENSE](./LICENSE)); licensing contact: [CONTACT.md](./CONTACT.md).
> 🛡 Security reports: [SECURITY.md](./SECURITY.md).
> 📝 Changelog: [CHANGELOG.md](./CHANGELOG.md).
> 🌏 简体中文文档：[README.zh-CN.md](./README.zh-CN.md)

Cuckoo is an open-source, mobile-first health reminder PWA (installable on your phone) with an optional Android APK — built to help you take medicine on time, drink enough water, stretch between meetings, and stick to tiny habits, with family members watching your back.

## ✨ Highlights

- **Social community** — photo/video posts, likes, comments and favorites, one-tap plan joining, profiles and follows, official plans and a family channel
- **Voice & AI assistant** — tap the bottom button and speak, or switch it to **typing input**; drives app actions through your own OpenAI-compatible API key, stored only on-device. Every request produces a reviewable plan (action list + parameters) that only runs after you confirm, with multi-turn context and undoable history
- **Smart reminders** — medication / water / exercise / rest / work / custom categories; multi-time daily, weekly, monthly, interval loops and untimed reminders; full-screen overlay with delay & skip; photo check-in challenges
- **Health dashboard** — completion rate, streak days, per-category stats, water intake progress
- **Medication management** — stock deduction on completion, low-stock alerts, medicine history (day/week/month filter)
- **Exercise library** — 13 follow-along micro-exercises with multi-frame illustrations; swipeable frame viewer; one tap to prefill a new reminder with the move and its whole image set
- **Focus** — Pomodoro timer (classic 25+5 by default, fully customizable)
- **My plans** — create, join or use official plans, share a plan as a post, edit reminders inside a plan (source and "modified" markers included)
- **Notifications** — in-app notification center plus Web Push (due / missed / low stock); Android adds exact alarms that ring on time with the screen locked
- **Reports & achievements** — weekly/monthly reports with a monthly heatmap, category stats, period-over-period comparison and suggestions; 7 achievement rules
- **Family care** — invite-code binding with approval, read-only health summary of your loved one, in-app chat, emergency-contact alerts (in-app only; no SMS provider is bundled)
- **Offline-first** — guest mode & offline accounts work without a server; data merges to the cloud when you sign in
- **Theming** — 3 built-in themes (蜜桃暖阳 Peach Sunrise / 青翠晨露 Verdant Dew / 冰岛蓝湾 Iceland Bay), switchable in Settings
- **Privacy & security** — per-user data isolation, data export & account deletion, login rate-limiting & lockout, upload validation, audit logs; a production deployment refuses to boot without a strong `JWT_SECRET`

## 🚀 Quick start

Requirements: Node.js 22+ (CI and local development use Node 24; the jsdom unit tests need a recent undici).

```bash
# Backend
cd backend
cp .env.example .env      # configure JWT_SECRET etc.
npm install
npm start                 # API:   http://localhost:3000/api/v1
                          # docs:  http://localhost:3000/api   (Swagger, non-production only)

# Frontend (another terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

> Web Push needs a VAPID key pair in `backend/.env` (see `.env.example`).
> Production deployment notes (Nginx + PM2 + backups) are kept with the project's private docs. The essentials: build the backend **with** dev dependencies (`npm ci && npm run build`), then ship `dist/` plus a production-only `node_modules` to the runtime host, and set `NODE_ENV`, `JWT_SECRET`, `CORS_ORIGINS` and `UPLOAD_DIR` explicitly. In production the process exits immediately if `JWT_SECRET` is missing, still the default value, or shorter than 32 characters.

## 🧰 Tech stack

Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + React Router 7 (offline-capable PWA)
Backend: NestJS 11 + TypeORM + better-sqlite3 (WAL) + JWT + Swagger + Web Push + scheduled jobs
Mobile: Capacitor 8 (Android) with four purpose-built native plugins (exact alarm / speech / offline ASR / photo saver)

## 📜 License & changelog

Commercial use requires written permission — see [LICENSE](./LICENSE) and [CONTACT.md](./CONTACT.md). User-facing changes are tracked in [CHANGELOG.md](./CHANGELOG.md).

## 📸 Feature tour

Every screenshot below comes from a real running Cuckoo instance using a demo account: all data is demo data, no real user information is shown, and the AI key field is masked.

### 🌱 Social community

![Community](./docs/images/features/social.png)

- Five channels: **Square / Following / Mine / Official plans / Family**; "Publish" supports photos and video.
- Posts can be **liked, commented on and favorited**, and any plan post can be **joined in one tap**, saving it to My plans; turn on the plan switch to create its reminders.
- Tap an avatar to open a profile, browse public posts and follow; the bell shows the live unread notification count.
- "Official plans" collects joinable templates, while "Family" only lists updates from relatives you have bound.

### 🎙 Voice & AI assistant

Configuration and input first:

![Assistant settings](./docs/images/features/assistant-settings.png)

- The switch lives under **Settings → Voice assistant**; the floating button on Today only appears once it is enabled.
- Provide an **AI API base URL** (OpenAI-compatible, e.g. `https://api.openai.com/v1`), an **API key** and a **model name** (e.g. `gpt-4o-mini`, `deepseek-chat`).
- The key is stored only in this browser's local storage and is **never uploaded to Cuckoo's servers**; the field is always masked.
- "Test connection" performs a real request and shows the model's reply, or the exact error, in a dialog.

Two input modes, one processing pipeline:

![Typing input](./docs/images/features/assistant-typing.png)

- The floating button is "Tap to speak" by default: tap once to start recording, tap again to stop (long-press is gone).
- Tap the **keyboard icon** next to it to switch to "Tap to type"; the choice is kept on this device and restored next time.
- Speech recognition uses the Web Speech API in browsers and the self-built `NativeSpeech` in the APK (a persistent recognizer for seamless dictation; devices without a system recognition service fall back to offline `NativeVosk`, which even works in airplane mode).
- When recognition is unreliable or speech is unsupported, type instead — the rest of the flow is identical.

**Step 1 — build a plan; nothing runs yet**

![Plan confirmation](./docs/images/features/assistant-plan.png)

- One sentence can contain several tasks: the assistant splits it into up to 5 actions and lists exactly what it *will* do with key parameters, e.g. "Title: water 200ml · Time: 07:00 · Repeat: daily · Category: water".
- The recognized/typed text stays editable: fix a typo and hit "↻ Re-parse", or tap "🎤 Continue speaking" to append another sentence before re-parsing.
- No account data is touched before confirmation; "Cancel" discards the plan.
- Supported actions cover creating / completing / delaying / skipping / deleting / toggling reminders, logging water, switching reminder notifications, sound and vibration, and navigating pages; social actions are described only and never executed.

**Step 2 — confirm, then get a per-action report**

![Execution result](./docs/images/features/assistant-result.png)

- "Confirm (N actions)" executes each action and reports it as **recognized → change → result**, with a ✅ and a concrete outcome (e.g. "Created the daily 07:00 'water 200ml' reminder").
- Failed actions show their own reason without blocking the ones that succeeded.
- "Continue conversation" keeps context; "New conversation" clears it.

**Step 3 — history you can inspect and undo**

![Voice history](./docs/images/features/assistant-history.png)

- The 🎤 button in the Today header opens the execution history with time, original sentence, understanding and per-action results.
- Multi-step tasks can be undone with "↩ Undo this task", which reverses actions in order (for example deleting the reminder it just created) and marks the record as undone.
- Tick a few records and tap "Continue speaking" to use only those as context; "Clear" asks for a second confirmation.
- Only **executed** tasks are stored — cancelled plans never enter the history.

> Speech recognition needs HTTPS in a browser; typing input has no such restriction.

### 🔐 Sign in & accounts

![Sign in](./docs/images/features/login.png)

- Registration usernames are **2–24 characters** and may contain Chinese characters, letters, digits, underscores (`_`) and hyphens (`-`); sign-in and sign-up live on one page, and registration logs you in immediately.
- **Try it as a guest**: the whole app works without a server (data stays on device), and local data is merged into the cloud once you register or sign in.
- Login endpoints are **rate-limited with failure lockout**; in production the process refuses to start when `JWT_SECRET` is missing, still the default, or shorter than 32 characters.
- The privacy policy and health disclaimer are always reachable from the bottom of this page.

### 🏠 Today dashboard

![Today](./docs/images/features/today.png)

- A **swipeable date strip** with the lunar date sits on top; a "Today" chip appears when you are on the current day.
- **Completion card**: done / total, missed count and streak days. "Choose" lets you pick which reminders count toward the completion rate (e.g. count "water goal reached" as one), and "Stats" jumps to the full dashboard.
- **Water card**: today's intake vs. the daily goal and the remaining amount, plus a "+200" shortcut to log a drink.
- **Today's reminders** sorted by time: multi-time reminders collapse into a single card showing completed / pending / missed; **untimed reminders** get their own row with one-tap ✓ / ×; completed or missed items can be expanded to back-fill.
- The three icons at the top right open stats, the assistant history and settings.

### ⏰ Reminder management

![Reminders](./docs/images/features/reminders.png)

- The collapsible "Services & management" section holds a quick-access grid: **Medicines / Water / Exercise library / Pomodoro**, with **My plans** below it.
- The collapsible "All reminders" section lists every reminder with its **category icon, title, repeat rule and next time**, plus an "Enabled" badge.
- Each row can be **edited, deleted or paused** without opening a detail page; paused reminders stop notifying and stop counting toward completion.

### ➕ Creating & editing reminders

![New reminder](./docs/images/features/reminder-new.png)

- **Category**: medication, exercise, water, rest, work or custom — it drives the icon and the statistics bucket.
- **Multiple times per reminder**: every time slot fires independently; ticking "untimed" gives one daily reminder without a fixed clock time.
- **Repeat rules**: once, daily, weekly, monthly and custom intervals (every N days / weeks / months).
- **Optional content**: free text, images (up to 9), video and an external link (Bilibili, docs, any web page) that opens on tap when the reminder fires.
- Choosing the water category reveals an amount field that feeds the daily goal automatically.
- Saved reminders show up immediately on Today and in the reminder list, and join the notification schedule.

### 💧 Water tracking

![Water](./docs/images/features/water-settings.png)

- Shows today's progress bar and intake vs. goal, with quick logging.
- Configure **amount per drink** and the **daily goal**; both drive the shortcut button on Today.
- Create water reminders with multiple times in one tap — completing one logs the water amount.
- Water can still be logged after deleting the reminders, and reaching the goal can optionally count as one completion (configured under "Choose" on Today).

### 💊 Medication management

![Medicines](./docs/images/features/medicines.png)

- Each card shows the name, dosage and administration (e.g. "1 tablet · with food · after breakfast"), plus a **"Low stock"** badge when running out.
- Four shortcuts: **take one dose** (deducts stock and writes a log), **restock**, **edit** and **history**.
- The history page filters by day / week / month and records every dose, quantity and back-filled entry.
- When adding a medicine you can set stock, low-stock threshold, expiry date, instructions and up to 9 photos; low stock raises an in-app notification (and can be delivered over Web Push).

### 🤸 Micro-exercise library

![Exercises](./docs/images/features/exercises.png)

- **13 follow-along moves** grouped by stretching / pelvic-floor / neck, each with a suggested duration (20 seconds to 2 minutes).
- Every move has multiple illustration frames you can swipe through (perfect for a break at your desk).
- "**+ Add to plan**" opens a prefilled new-reminder screen with the move and its whole image set, ready to follow along once saved.

### 🍅 Pomodoro

![Pomodoro](./docs/images/features/pomodoro.png)

- Focus and break modes, defaulting to 25 minutes of focus plus a 5-minute break.
- Both durations are customizable (50+10 for deep work, 15+3 to get started); the timer rolls into the next block automatically.
- A short guidance note at the bottom helps you tune the rhythm to your own attention span.

### 🎯 My plans

![Plans](./docs/images/features/plans.png)

- **Create your own plan**, **join** someone else's from the community, or start from an official template.
- Each card shows its reminder count and an enable switch that pauses or resumes every reminder in the plan.
- Actions: **add reminder** (new reminders are attached to the plan), **share as a post**, **rename** and **delete** (deleting a plan also deletes all of its reminders).
- Reminders inside a plan show their source and a "modified" marker in the reminder list, so originals and personal tweaks stay distinguishable.

### 📊 Statistics

![Stats](./docs/images/features/stats.png)

- The orange header summarizes streak days, today's completion rate and water progress.
- A **monthly heatmap** shades each day by completion rate; switch months freely.
- A **7-day trend** bar chart plus a per-category breakdown shows which category keeps falling behind.

### 📅 Weekly & monthly reports

![Reports](./docs/images/features/reports.png)

![Weekly report](./docs/images/features/report-detail.png)

- Generate a **weekly report** in one tap from the page header; weekly reports are also created automatically every Monday at 08:00 and monthly reports on the 1st at 08:00 for every account, each posting an in-app notification.
- A report includes the period completion rate with **change vs. the previous period**, **highlights** (best category, most completed reminder), a **per-category breakdown** (completed / planned and percentage) and a tailored suggestion.
- Every historical report is kept, so you can look back at any week or month.

### 🏆 Achievements

![Achievements](./docs/images/features/achievements.png)

- Cumulative counters on top: streak days, medication completions, water completions.
- **7 achievement rules**: seven-day streak, monthly ironman, hundred-day foundation, king of the year, medication master, exercise model and hydration expert.
- Each achievement has a live progress bar and lights up once unlocked — a visible reward for long-term consistency.

### 👨‍👩‍👧 Family care

![Family](./docs/images/features/family.png)

- **Two-way invite-code binding**: generate a 6-character code (valid for 24 hours) for a relative; they submit it under "Their invite code" and the binding completes only after you approve.
- Once bound you can see each other's **read-only** reminder completion, photo records and medicine stock, and chat with photos in the family channel.
- **Missed-dose / low-stock contacts** are notified when a reminder is overdue or stock runs low (in-app only; no SMS provider is bundled).

### 🔔 Notification center

![Notifications](./docs/images/features/notifications.png)

- Collects every in-app notification: reminder due, missed dose, low stock, report generated, family activity and more.
- Unread items are marked with a red dot, "Mark all read" clears them in one tap, and each item links to its page.
- Together with **Web Push** (VAPID) notifications arrive even when the browser is closed; on Android an **exact alarm** rings on time with the screen locked.

### ⚙️ Settings & themes

![Settings](./docs/images/features/settings.png)

- **Themes**: 蜜桃暖阳 Peach Sunrise / 青翠晨露 Verdant Dew / 冰岛蓝湾 Iceland Bay, applied instantly.
- **Notification preferences**: reminder notifications, sound, vibration and whether the "Skip" button is shown, each independently switchable.
- **Background-reminder troubleshooting**: built-in guidance for per-brand battery optimization, autostart and background locks so reminders are not silently killed.
- The account section offers sign-out, data export, account deletion, the privacy policy and the Android APK download.

### 📱 Android app

- The backend serves the latest APK at `GET /api/v1/app/download` (also linked from the in-app Settings page, hidden inside the app itself).
- Speech recognition in the APK is **self-built**: `NativeSpeech` keeps a single recognizer alive for seamless dictation, and on devices without a system `RecognitionService` (e.g. ColorOS) it falls back to `NativeVosk` — a bundled offline Chinese model, so dictation also works in airplane mode.
- The `@capacitor-community/speech-recognition` plugin is deliberately not used, because it recreates the recognizer on every start and drops the first words.
