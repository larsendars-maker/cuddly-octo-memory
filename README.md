# OrbitDesk React Render v8

## Fix for the current Render deploy
This version does NOT crash when `DATABASE_URL` or `PHOTO_ENCRYPTION_KEY` is missing.

### Existing Render Web Service
Set:
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
- Health Check Path: `/health`

If no PostgreSQL is connected, the app starts with temporary in-memory storage. Data may reset when the instance restarts/redeploys.

### Persistent production setup
Create a Render PostgreSQL database separately, then add this Web Service environment variable:
`DATABASE_URL=<PostgreSQL Internal Database URL>`

Recommended secret:
`PHOTO_ENCRYPTION_KEY=<64 hex characters>`

`render.yaml` is a Blueprint example, but an already-created Web Service will NOT apply it automatically.
