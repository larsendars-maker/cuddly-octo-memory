# OrbitDesk v32

- Temporary email verification requirement disabled for normal users.
- Admins can manually mark a user's email as verified from the admin panel.
- Registration no longer depends on the mail provider.
- Login no longer blocks unverified users while REQUIRE_EMAIL_VERIFICATION=false.
- New account limit: 2 registrations per source IP (configurable via MAX_ACCOUNTS_PER_IP, default 2).
- Registration IP is stored in PostgreSQL for enforcement and audit.
- Normal users no longer see an email verification banner while verification is disabled.
