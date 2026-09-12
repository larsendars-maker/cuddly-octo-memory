# OrbitDesk v37 — admin email approval + 2-account limit

- Maximum total accounts: 2.
- Maximum accounts from the same IP: 2.
- New accounts remain unverified until email code verification or manual admin approval.
- Registration no longer deletes the account if the mail bridge is unavailable; the admin can approve the email manually.
- Login is blocked until `email_verified=true`.
- Admin panel shows `✅ Почта подтверждена` / `⏳ Ожидает подтверждения` and has `✅ Подтвердить email`.
- Existing Google Apps Script verification flow remains available when the mail bridge is configured.
