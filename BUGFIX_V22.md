# OrbitDesk v22

## Render deploy fix
The previous deploy failed because the Web Service used `npm install` as the build command, while `dist/index.html` was not committed.
v22 changes:
- Render build command is `npm install && npm run build` in `render.yaml`.
- `npm start` now runs `npm run build && node server.js`, so a manual Web Service configured with `npm install` also builds the frontend before starting.
- Removed the server-side attempt to run Vite during startup; this avoided a silent/opaque startup failure.

Recommended Render settings:
- Build Command: `npm install && npm run build`
- Start Command: `npm start`
