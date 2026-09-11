# OrbitDesk React Render v19

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
