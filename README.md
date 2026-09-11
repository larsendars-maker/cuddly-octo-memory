# OrbitDesk React Render v11

OrbitDesk is a React + TypeScript + Vite workspace with a Node/Express backend, WebSocket chat and PostgreSQL.

## Main changes in v11
- No automatic GДЗ site in quick sites.
- Quick sites are user-controlled bookmarks.
- Omnibox suggests popular sites while typing and remembers frequently visited sites.
- Custom sites can be added directly from the omnibox.
- Fixed username + editable visual display name.
- Avatar accepts URL or data:image and is automatically fitted with object-fit: cover.
- Themes and accent colors, plus optional lightweight particles. Particles are OFF by default and configurable in Settings.
- Registration is blocked until the 6-digit email code is verified.
- Google OAuth integration for Google Sheets: sign in, list, create and edit spreadsheets.
- Local table editor with autosave and a lightweight AI-style formula helper.

## Render
Use a Render Blueprint if you want render.yaml to create and wire the Postgres database automatically.

Required production envs for email verification:
- SMTP_HOST
- SMTP_PORT
- SMTP_SECURE
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

Required Google OAuth envs for Sheets:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI

`GOOGLE_REDIRECT_URI` must match the OAuth redirect configured in Google Cloud exactly, for example:
`https://YOUR-RENDER-DOMAIN/api/integrations/google/callback`

Build command:
`npm install && npm run build`

Start command:
`npm start`

## Tables + free Orbit AI
Google connection is now inside the Tables workspace. There is no separate Connections tab.
Orbit AI is a free built-in helper that does not require an external API key; it provides spreadsheet formulas, table-structure hints, and safe code/API examples.
