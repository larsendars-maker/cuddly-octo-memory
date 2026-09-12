# OrbitDesk React Render v35

OrbitDesk browser/workspace for Render.

## Email verification

v19 no longer uses SMTP or Brevo for verification. It uses Resend API over HTTPS, so it works with a Render Free Web Service without direct SMTP connections.

Read `GMAIL_RENDER_SETUP.md` for the one-time Google Cloud/OAuth setup.

## Admin

Only usernames listed in `admins.json` are configured admins. Current default:

```json
{"admins":["Larsenda"]}
```

Admin panel includes accounts, history, audit, admins and mail connection status.


## v20 mail fix
Verification email delivery now uses Resend over HTTPS; old SMTP/Gmail-sender settings are no longer required. Public auth endpoints are also exempted from the CSRF middleware so code confirmation/resend cannot fail with `CSRF_FAILED`.

## Безопасность GitHub
Не коммить `DATABASE_URL`, `MAIL_BRIDGE_TOKEN`, `PHOTO_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` или любые API-ключи. Секреты задаются в Render Environment; токен Google Apps Script хранится в Script Properties. Для приватного исходного кода сделай репозиторий GitHub Private.


## v35 — Google Apps Script verification restored

- Registration now requires email verification again.
- The account is created as unverified, then OrbitDesk sends a 6-digit code through the Google Apps Script Mail Bridge.
- The user is not logged in until the code is confirmed.
- If the mail bridge is missing or rejects the message, the temporary account is rolled back.
- `MAIL_PROVIDER=apps-script`, `MAIL_BRIDGE_URL` and `MAIL_BRIDGE_TOKEN` are the intended mail settings.
- No SMTP configuration is required.


### Account creation limit
`MAX_ACCOUNTS_PER_DEVICE=2` allows at most two accounts from the same browser/device identifier.
