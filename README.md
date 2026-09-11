# OrbitDesk React Render

Full-stack workspace/browser for Render: React + TypeScript + Vite client, Node/Express + WebSocket server, PostgreSQL persistence.

## Main changes in this version
- No photo section. Profile customization is used instead: display name, avatar URL, bio, theme, accent and workspace appearance.
- No modal window for normal work. Sites, tables, profile, settings, chat and admin are internal OrbitDesk tabs.
- Site tabs use a real in-app iframe with navigation/refresh/URL controls. Some third-party sites can still block iframe embedding via their own security policy; this cannot be bypassed by frontend JavaScript.
- Tables are full internal tabs with editable cells, autosave and last-updated status.
- User-created tabs remain persisted through the API.

## Render Web Service
Build Command: `npm install && npm run build`
Start Command: `npm start`
Health Check: `/health`

For persistent data, set `DATABASE_URL` to your Render PostgreSQL internal connection string.
Do not commit real secrets to GitHub.
