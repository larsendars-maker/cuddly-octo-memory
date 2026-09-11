# Security

- Do not commit `.env`, `DATABASE_URL`, `PHOTO_ENCRYPTION_KEY`, API keys, or Render credentials.
- Use a private GitHub repository for application source.
- Rotate secrets immediately if they are exposed.
- Put secrets in Render Environment Variables/Secret Files, not in source control.
- Keep PostgreSQL on Render and use its internal connection string from the web service.
