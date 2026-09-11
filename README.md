# OrbitDesk

Private browser-style workspace with registration, login, saved sites, tabs, keyboard binds, personal tables, profile/ranks and real-time friend chat.

## Render
Create a **Web Service** and connect this repo.
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check: `/health`

Set `DATABASE_URL` to a PostgreSQL connection string and optionally `JWT_SECRET` (Render can generate it automatically).

The app serves its frontend and API from one Web Service, and uses WebSocket for chat. Render Web Services support inbound WebSockets; public clients should connect over `wss://`. See Render's WebSocket documentation.

## Local
1. Create a PostgreSQL database.
2. Set `DATABASE_URL` and `JWT_SECRET`.
3. Run `npm install` then `npm start`.
4. Open `http://localhost:10000`.
