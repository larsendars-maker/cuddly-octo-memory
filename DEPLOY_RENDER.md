# OrbitDesk — Render deployment

## 1. GitHub
Upload the whole project root. Keep the folder structure; do not flatten it into one HTML file.

## 2. Render (recommended)
Use **New → Blueprint** and select the GitHub repository. This applies `render.yaml` and creates `orbitdesk-db` automatically.

## 3. Required mail settings
Registration requires a six-digit email code. Set these Environment Variables in Render:
- SMTP_HOST
- SMTP_PORT=587
- SMTP_SECURE=false
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

Email verification uses Brevo HTTP API so it works on Render Free, which blocks outbound SMTP ports 25/465/587. Production registration intentionally returns `MAIL_API_NOT_CONFIGURED` if Brevo is not configured instead of allowing unverified accounts.

## 4. Google Sheets
Create OAuth credentials in Google Cloud and add:
- GOOGLE_CLIENT_ID
- GOOGLE_CLIENT_SECRET
- GOOGLE_REDIRECT_URI

Redirect URI:
`https://YOUR-RENDER-DOMAIN/api/integrations/google/callback`

The exact URI must be configured in Google Cloud OAuth credentials.

## 5. Service commands
Build: `npm install && npm run build`
Start: `npm start`
Health: `/health`

## 6. Important
Do not put DATABASE_URL, SMTP_PASS, GOOGLE_CLIENT_SECRET or encryption keys in GitHub. Keep them in Render Environment Variables.


## Persistence
Keep the same Render Postgres database resource connected to the service. Application deploys do not delete relational data; schema changes use CREATE IF NOT EXISTS / ALTER IF NOT EXISTS and a schema_migrations table. Do not delete/recreate the Postgres resource. On Render Free Postgres, the database itself expires after 30 days; use a paid Postgres plan for long-term production persistence and backups.

## Администраторы и блокировки (v16)
- `admins.json` находится в корне проекта. Добавляй туда ники администраторов. После изменения нужен новый deploy.
- В админ-панели появилась вкладка «Аккаунты»: логин, email, дата создания, подтверждение email, роль и блокировка.
- Блокировка удаляет активные сессии пользователя и не даёт войти.
- В «Журнале» фиксируется создание аккаунта с логином/email, подтверждение email, изменения ролей и блокировки.
- Если пользователь после регистрации закрыл вкладку, при обычной попытке входа с правильным паролем OrbitDesk автоматически откроет поле для 6-значного кода.

## Free email delivery (Brevo)

Render Free blocks outbound SMTP ports, so OrbitDesk uses Brevo over HTTPS. Add `BREVO_API_KEY`, `BREVO_SENDER_EMAIL=orbitdesksupport@gmail.com`, and optionally `BREVO_SENDER_NAME=OrbitDesk` in the Web Service Environment. In Brevo, verify `orbitdesksupport@gmail.com` as a sender before testing. The Brevo Free plan currently allows 300 email sends/day.
