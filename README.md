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

- **Smart reminders** — medication / water / exercise / rest / work / custom categories; multi-time daily, weekly, monthly, interval loops and untimed reminders; full-screen overlay with snooze & skip; photo check-in challenges
- **Health dashboard** — completion rate, streak days, per-category stats, water intake progress
- **Medication management** — stock deduction on completion, low-stock alerts, medicine history (day/week/month filter)
- **Exercise library** — 13 follow-along micro-exercises with multi-frame illustrations; swipeable frame viewer; one tap to turn any exercise into a reminder with its whole image set
- **Focus** — Pomodoro timer (classic 25+5 by default, fully customizable)
- **Social** — share posts with photos/videos, like / comment / favorite, one-tap plan joining, profiles & follows
- **Family care** — invite-code binding with approval, read-only health summary of your loved one, in-app chat, emergency-contact alerts (in-app only; no SMS provider is bundled)
- **Reports & achievements** — weekly/monthly reports, heatmap, 7 achievement rules
- **Offline-first** — guest mode & offline accounts work without a server; data merges to the cloud when you sign in
- **Theming** — 3 built-in themes (Peach Sunrise / Verdant Meadow / Glacier Bay), switchable in Settings
- **Voice & typing assistant** — tap to talk, or flip the bottom button to **typing input**; drives app actions through your own OpenAI-compatible API key, stored only on-device. Every request produces a reviewable plan (action list + parameters) and only runs after you confirm
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

## 📱 Android app

The backend serves the latest APK at `GET /api/v1/app/download` (also linked from the in-app Settings page, hidden inside the app itself).

Speech recognition in the APK is **self-built**: `NativeSpeech` keeps a single recognizer alive for seamless dictation, and on devices without a system `RecognitionService` (e.g. ColorOS) it falls back to `NativeVosk` — a bundled offline Chinese model, so dictation also works in airplane mode. The `@capacitor-community/speech-recognition` plugin is deliberately not used, because it recreates the recognizer on every start and drops the first words.

## 🧰 Tech stack

Frontend: React 19 + TypeScript + Vite + Tailwind CSS v4 + Zustand + React Router 7 (offline-capable PWA)
Backend: NestJS 11 + TypeORM + better-sqlite3 (WAL) + JWT + Swagger + Web Push + scheduled jobs
Mobile: Capacitor 8 (Android) with four purpose-built native plugins (exact alarm / speech / offline ASR / photo saver)

## 🧪 Testing

| Type | Command |
|---|---|
| Backend unit | `cd backend && npx jest --runInBand` |
| Frontend unit | `cd frontend && npx vitest run` |
| Frontend type-check | `cd frontend && npx tsc -b --noEmit` |
| E2E (Playwright) | `cd backend && npm run build && cd ../frontend && npm run test:e2e` |

The E2E run boots its own backend from `backend/dist`, so build the backend first. It reuses already-running servers on ports 3000 and 5173 when they exist.

## 📦 Repository layout

```
backend/    NestJS API — domain modules, seed data, scheduled jobs
frontend/   React PWA + Capacitor Android project (android/ = native shell)
.github/    CI workflow + Dependabot config
```

## 🤝 Contributing

1. Fork the repo and create a topic branch.
2. Keep changes focused and follow the existing module layout; commits use Conventional Commits.
3. Before opening a PR, run the unit tests and a type-check — `cd backend && npx jest`, then `cd frontend && npx vitest run && npx tsc -b --noEmit`.
4. Never commit secrets, real user data or local environment files: `.env`, `data/` and `uploads/` are git-ignored on purpose.

Please report security-relevant issues through [SECURITY.md](./SECURITY.md) rather than a public issue.

## 📜 License & changelog

Commercial use requires written permission — see [LICENSE](./LICENSE) and [CONTACT.md](./CONTACT.md). User-facing changes are tracked in [CHANGELOG.md](./CHANGELOG.md).
