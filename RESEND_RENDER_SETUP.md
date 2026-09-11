# Resend + Render Free

OrbitDesk v20 sends verification emails through the Resend HTTPS API, not SMTP. This avoids Render Free SMTP port restrictions.

Render variables:
- `RESEND_API_KEY` — your Resend API key (server-side secret).
- `RESEND_FROM_EMAIL` — a sender address verified in Resend.
- `RESEND_FROM_NAME` — `OrbitDesk`.

Keep these values only in Render Environment. Never commit the API key to GitHub and never paste it into chat.

After adding variables, use **Save and deploy**.
