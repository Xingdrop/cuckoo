<!-- @Sdrop 布谷(Cuckoo) v2 SKEY_5biD6LC3KEN1Y2tvbyl8UkVBRE1FLm1kfDIwMjYtMDh8ZTY1NmZkZjJkMg== -->
# Cuckoo (布谷)

[![CI](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml/badge.svg)](https://github.com/Xingdrop/cuckoo/actions/workflows/ci.yml)

**Gentle reminders, faithful care — Cuckoo, your health-life companion.**

> 📄 License: **Commercial use requires written permission** (PolyForm-style commercial license, see [LICENSE](./LICENSE)); licensing contact: [CONTACT.md](./CONTACT.md).
> 🛡 Security reports: [SECURITY.md](./SECURITY.md).
> 🌏 简体中文文档：[README.zh-CN.md](./README.zh-CN.md)

Cuckoo is an open-source, mobile-first health reminder PWA (installable on your phone) with an optional Android APK — built to help you take medicine on time, drink enough water, stretch between meetings, and stick to tiny habits, with family members watching your back.

## ✨ Highlights

- **Smart reminders** — medication / water / exercise / rest / work / custom categories; multi-time daily, weekly, monthly, interval loops and untimed reminders; full-screen overlay with snooze & skip; photo check-in challenges
- **Health dashboard** — completion rate, streak days, per-category stats, water intake progress
- **Medication management** — stock deduction on completion, low-stock alerts, medicine history (day/week/month filter)
- **Exercise library** — 14 follow-along micro-exercises with cute multi-frame illustrations; detail modal with swipeable steps
- **Focus** — Pomodoro timer (classic 25+5 by default, fully customizable)
- **Social** — share posts with photos/videos, like / comment / favorite, one-tap plan joining, profiles & follows
- **Family care** — invite-code binding with approval, read-only health summary of your loved one, in-app chat, emergency-contact notifications
- **Reports & achievements** — weekly/monthly reports, heatmap, 7 achievement rules
- **Offline-first** — guest mode & offline accounts work without a server; data merges to the cloud when you sign in
- **Theming** — 3 built-in themes (Peach Sunrise / Verdant Meadow / Glacier Bay), switchable in Settings
- **Voice assistant** — long-press & swipe-to-mic dictation driving app actions via your own OpenAI-compatible API key (stored only on-device); native speech recognition in the Android app
- **Privacy & security** — data export & account deletion, login rate-limiting & lockout, triple-checked uploads, audit logs

## 🚀 Quick start

Requirements: Node.js 20+.

```bash
# Backend
cd backend
cp .env.example .env      # configure JWT_SECRET etc.
npm install
npm start                 # http://localhost:3000/api

# Frontend (another terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

> Production deployment (Nginx + PM2 + backups) notes ship with the project; Web Push needs a VAPID key pair in `.env`.

## 📱 Android app

The backend serves the latest APK at `GET /api/v1/app/download` (also linked from the in-app Settings page, hidden inside the app itself). Speech recognition in the APK uses the native `@capacitor-community/speech-recognition` plugin.

## 🧰 Tech stack

Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + React Router 7 (offline-capable PWA)
Backend: NestJS 11 + TypeORM + better-sqlite3 (WAL) + JWT + Swagger + Web Push + scheduled jobs
Mobile: Capacitor 8 (Android)

## 🧪 Testing

| Type | Command |
|---|---|
| Backend unit | `cd backend && npx jest --runInBand` |
| Frontend unit | `cd frontend && npx vitest run` |
| E2E (auto-starts both servers) | `cd frontend && npm run test:e2e` |

## 📦 Repository layout

```
backend/   NestJS API (domain modules)
frontend/  React PWA + Capacitor Android project
```

## 📜 Changelog

See release notes; commits follow Conventional Commits. 简体中文说明：[README.zh-CN.md](./README.zh-CN.md)
