# OrbitDesk 2.0 — React + TypeScript

Это новая версия OrbitDesk без ручного монолитного HTML-интерфейса.

## Стек
- React + TypeScript + Vite — frontend
- Node.js + Express 5 — backend
- WebSocket — чат
- PostgreSQL — аккаунты, роли, вкладки, таблицы, друзья, сообщения, фото
- Helmet/rate-limit/CSRF/session security — защита

## Render
Web Service:
- Build: `npm install && npm run build`
- Start: `npm start`
- Health: `/health`

Для автоматического PostgreSQL используй Render Blueprint (`render.yaml`) или вручную задай `DATABASE_URL` на Web Service.

## GitHub
Коммить весь репозиторий целиком. Реальные секреты не коммить: `.env` игнорируется, `.env.example` содержит только имена переменных.

## Локально
`npm install`
`npm run dev`
Для production: `npm run build` затем `npm start`.
