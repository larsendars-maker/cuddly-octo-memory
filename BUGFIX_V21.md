# OrbitDesk v21

Fixed the Render startup crash `gmailSenderConfigured is not defined`. The Resend migration left stale Gmail startup logging in `server.js`.

The server now logs Resend configuration status and does not crash merely because email provider variables are absent. Registration/email verification still correctly returns `MAIL_API_NOT_CONFIGURED` until `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured.
