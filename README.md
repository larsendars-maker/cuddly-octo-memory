# OrbitDesk React Render v10

Full-stack workspace/browser for Render: React + TypeScript + Vite client, Node/Express + WebSocket server, PostgreSQL persistence.

## New in v10
- `Larsenda` is the default admin username (`ADMIN_USERNAME`). Existing Larsenda accounts are promoted to admin on database initialization.
- Admin panel has: user management, global visit history, and audit log.
- Email verification with expiring verification tokens. SMTP is configurable through Render environment variables.
- Google Sheets OAuth integration: connect Google, list spreadsheets, open a sheet, read values and write changes back to Google Sheets.
- Google OAuth tokens are encrypted at rest with AES-256-GCM using `PHOTO_ENCRYPTION_KEY`.
- Personal visit history is recorded whenever a user opens a site tab.
- Existing profile customization, internal tabs, chat, friends, bookmarks and local tables remain available.

## Render Blueprint
Recommended first deployment:

- Render -> New -> Blueprint
- Select the GitHub repository
- Render reads `render.yaml` and creates `orbitdesk` plus `orbitdesk-db`

The Blueprint wires `DATABASE_URL` from the Postgres connection string and generates `PHOTO_ENCRYPTION_KEY` automatically.

## Required Google OAuth setup
In Google Cloud Console enable:
- Google Sheets API
- Google Drive API

Create a Web OAuth client and set the redirect URI to:
`https://YOUR-RENDER-DOMAIN/api/integrations/google/callback`

Then add these Render environment variables:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI

## Email verification
Set:
- SMTP_HOST
- SMTP_PORT (default 587)
- SMTP_SECURE (false for STARTTLS, true for SMTPS)
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

New accounts receive a verification link. `REQUIRE_EMAIL_VERIFICATION=true` blocks login until email is verified.

## Security
Never commit real secrets to GitHub. Use Render Environment Variables. `.env` is ignored by Git.
