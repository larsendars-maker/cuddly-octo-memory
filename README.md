# OrbitDesk React v6 — Render deployment

## Important
Deploy this repository as a **Render Blueprint**, not as a manually-created Web Service, so `render.yaml` can create and wire the Postgres database.

The Blueprint automatically provisions:
- `orbitdesk` Web Service
- `orbitdesk-db` Postgres
- `DATABASE_URL` from the database connection string
- `PHOTO_ENCRYPTION_KEY` via Render-generated secret

Only `BOOTSTRAP_ADMIN_EMAIL` is entered manually during the first Blueprint sync.

## Render
1. Push the complete repository to GitHub.
2. In Render choose **New → Blueprint**.
3. Select the repository.
4. Confirm the Blueprint resources.
5. Enter `BOOTSTRAP_ADMIN_EMAIL` when Render prompts for it.

Do not put `DATABASE_URL` or `PHOTO_ENCRYPTION_KEY` in GitHub. Render manages them as environment variables.

## Manual existing Web Service
If you insist on keeping the old manually-created service, you must manually attach a Postgres database and set `DATABASE_URL` to its **Internal Database URL**. The Blueprint is the recommended path because it wires the service and database automatically.
