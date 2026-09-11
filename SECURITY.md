# OrbitDesk security notes

- Passwords are stored with bcrypt hashes, not reversible encryption.
- Sessions use HttpOnly, Secure, SameSite=Strict cookies and store only a SHA-256 token hash in PostgreSQL.
- CSRF protection is enabled for state-changing API requests.
- Helmet/CSP, rate limiting, no-store API caching, and origin checks are enabled.
- Google OAuth tokens are encrypted at rest with AES-256-GCM.
- Verification tokens and OAuth states are stored only as SHA-256 hashes and expire.
- Admin history and audit data are server-side and role protected.
- Do not put DATABASE_URL, Google client secrets, SMTP passwords or encryption keys in GitHub.
