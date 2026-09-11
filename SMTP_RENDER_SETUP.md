# SMTP for OrbitDesk on Render

For Gmail, set these Web Service environment variables:

- SMTP_HOST = smtp.gmail.com
- SMTP_PORT = 587
- SMTP_SECURE = false
- SMTP_USER = your OrbitDesk Gmail address
- SMTP_PASS = Google App Password (not the normal Gmail password)
- SMTP_FROM = your OrbitDesk Gmail address

The user receiving a verification email can use any supported email provider. The SMTP account above is only the sender used by the OrbitDesk server.

## Verification flow

- Registration sends a 6-digit verification code.
- Verification and resend endpoints use the CSRF cookie/header.
- Logging in with an unverified account automatically sends a fresh code and opens the code-entry state in the client.
- Verification/resend requests are rate-limited to reduce mail abuse.
