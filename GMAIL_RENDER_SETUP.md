# OrbitDesk — Gmail API setup (free Render)

OrbitDesk v19 does NOT use SMTP for verification emails. This avoids Render Free's SMTP port restrictions. It sends through the Gmail API over HTTPS.

## 1. Google Cloud

1. Open https://console.cloud.google.com/ and create/select a project.
2. Enable **Gmail API**.
3. Configure **Google Auth platform / OAuth consent screen**.
4. Add `orbitdesksupport@gmail.com` as a test user if the app is External and in testing.
5. Create an **OAuth 2.0 Client ID**. A Web application client is convenient for Render.
6. Add this exact Authorized redirect URI:

`https://YOUR-RENDER-DOMAIN/api/admin/gmail-sender/callback`

Replace `YOUR-RENDER-DOMAIN` with the real Render hostname.

The required Gmail OAuth scope is:

`https://www.googleapis.com/auth/gmail.send`

Google's Gmail API requires OAuth 2.0 authorization to send messages, and `messages.send` sends a base64url-encoded MIME message. See the official docs:
https://developers.google.com/workspace/gmail/api/guides/sending

## 2. Render variables

In `cuddly-octo-memory -> Environment` add:

- `GMAIL_CLIENT_ID` = OAuth client ID
- `GMAIL_CLIENT_SECRET` = OAuth client secret
- `GMAIL_REDIRECT_URI` = `https://YOUR-RENDER-DOMAIN/api/admin/gmail-sender/callback`
- `GMAIL_SENDER_EMAIL` = `orbitdesksupport@gmail.com`

Keep your existing:

- `DATABASE_URL`
- `PHOTO_ENCRYPTION_KEY`
- `ADMIN_USERNAME=Larsenda`
- `REQUIRE_EMAIL_VERIFICATION=true`
- `BOOTSTRAP_ADMIN_EMAIL`

Delete old `SMTP_*` and `BREVO_*` variables; v19 does not read them.

## 3. Connect the mailbox

1. Deploy v19.
2. Log in as `Larsenda`.
3. Open Admin -> Mail.
4. Click **Connect orbitdesksupport@gmail.com**.
5. Sign in to Google with the OrbitDesk support account.
6. Grant Gmail send permission.
7. Return to OrbitDesk.
8. In Admin -> Mail click **Send test email**.

The refresh token is stored encrypted in PostgreSQL, not in the frontend.

## Notes

Google API usage is subject to quotas. Standard Gmail API usage is currently available at no additional cost; current official quotas are documented by Google.
