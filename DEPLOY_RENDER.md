# OrbitDesk — Render deployment

## 1. GitHub
Upload the whole project root. Keep the folder structure; do not flatten it into one HTML file.

## 2. Render (recommended)
Use **New → Blueprint** and select the GitHub repository. This applies `render.yaml` and creates `orbitdesk-db` automatically.

## 3. Required mail settings
Регистрация больше не требует подтверждения email. После регистрации пользователь сразу попадает в OrbitDesk; чат открывается автоматически через 60 секунд или вручную администратором.
- SMTP_HOST
- SMTP_PORT=587
- SMTP_SECURE=false
- SMTP_USER
- SMTP_PASS
- SMTP_FROM

Для текущей версии почта не блокирует регистрацию и вход. Mail Bridge остаётся для служебных писем и будущих сценариев.

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
- В админ-панели появилась вкладка «Аккаунты»: логин, email, роль, доступ к чату, XP и блокировка.
- Блокировка удаляет активные сессии пользователя и не даёт войти.
- В «Журнале» фиксируется создание аккаунта, выдача/забор чата, изменения ролей, блокировки и другие действия.
- Если пользователь после регистрации закрыл вкладку, при обычной попытке входа с правильным паролем OrbitDesk автоматически откроет поле для 6-значного кода.

## Free email delivery (Brevo)

Render Free blocks outbound SMTP ports, so OrbitDesk uses Brevo over HTTPS. Add `BREVO_API_KEY`, `BREVO_SENDER_EMAIL=orbitdesksupport@gmail.com`, and optionally `BREVO_SENDER_NAME=OrbitDesk` in the Web Service Environment. In Brevo, verify `orbitdesksupport@gmail.com` as a sender before testing. The Brevo Free plan currently allows 300 email sends/day.
