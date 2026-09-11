# OrbitDesk Secure v5

Security-focused Render build.

## Important
You cannot make browser-delivered frontend code completely secret: the browser must receive it. For source confidentiality use a private GitHub repository. Security is enforced server-side.

## Render (recommended)
Deploy as a **Blueprint** so `render.yaml` creates and wires Postgres automatically. `DATABASE_URL` is never committed.

Required secret values:
- `PHOTO_ENCRYPTION_KEY`: 32-byte (64 hex chars). Render can generate it from the Blueprint.
- `BOOTSTRAP_ADMIN_EMAIL`: optional admin email for first/known account.

If you keep an existing Web Service instead of Blueprint, create a Render Postgres in the same region and put its **Internal Database URL** into `DATABASE_URL`. Render recommends the internal URL for services in the same region.

## Security included
- HttpOnly + Secure + SameSite session cookie
- server-side sessions with hashed session tokens
- CSRF protection
- Helmet security headers + CSP
- rate limits
- strict input size limits
- password hashing with bcrypt
- encrypted photo blobs using AES-256-GCM
- image magic-byte validation
- no secrets in GitHub
- WebSocket origin + session authentication
- private photo access
- API no-store/noindex headers
- automatic expired-session cleanup

## GitHub
Keep the repository private. Never commit `.env`, database URLs, Render tokens, JWT/API keys, or encryption keys. `.env.example` is safe to commit.
