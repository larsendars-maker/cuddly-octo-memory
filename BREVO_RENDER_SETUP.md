# OrbitDesk: free email verification on Render

OrbitDesk now sends verification codes through Brevo's HTTPS API instead of SMTP. This avoids Render Free's SMTP port restriction.

## Render variables

```text
BREVO_API_KEY=...
BREVO_SENDER_EMAIL=orbitdesksupport@gmail.com
BREVO_SENDER_NAME=OrbitDesk
```

Do not commit the API key to GitHub or send it in chat.

## Brevo
1. Create a free Brevo account.
2. Open Senders / Domains and add `orbitdesksupport@gmail.com` as a sender.
3. Complete the verification email sent to that Gmail inbox.
4. Create an API key (v3) and put it into `BREVO_API_KEY` on Render.
5. Redeploy the Web Service.

Brevo's official transactional email API is `POST https://api.brevo.com/v3/smtp/email` and uses the `api-key` header. The Free plan currently includes 300 email sends/day.

The user registration flow remains: account -> verification code -> code entry -> login.
