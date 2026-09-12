# OrbitDesk v38 — защита кода и Render Environment

## Что важно

`package.json -> private: true` НЕ делает GitHub-репозиторий приватным. Для реального скрытия исходников переведи сам GitHub-репозиторий в **Private**. Render может продолжать собирать сервис из репозитория, к которому у владельца есть доступ.

Не помещай реальные значения `DATABASE_URL`, `MAIL_BRIDGE_TOKEN`, `PHOTO_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` и другие секреты в GitHub, `render.yaml` или `.env.example`.

## Render Environment

Для Production используй Render → Service → Environment или Environment Group. Секретные значения храни только там.

Рекомендуемые переменные:

```text
NODE_ENV=production
ADMIN_USERNAME=Larsenda
BOOTSTRAP_ADMIN_EMAIL=<твоя почта>
DATABASE_URL=<Render PostgreSQL URL>
PHOTO_ENCRYPTION_KEY=<длинный случайный секрет>
REQUIRE_EMAIL_VERIFICATION=true
MAX_ACCOUNTS_TOTAL=2
MAIL_PROVIDER=apps-script
MAIL_BRIDGE_URL=<Apps Script /exec>
MAIL_BRIDGE_TOKEN=<секретный токен>
MAIL_FROM_NAME=OrbitDesk
```

Не добавляй реальные значения в файл проекта.

## Защита Render

Для Production рекомендуется сделать Project Environment **Protected**. В таком окружении только Render workspace Admin может просматривать или изменять секретные environment variables и secret files.

## Админ друга

Другу НЕ нужен доступ к Render Environment. Зарегистрируй второй аккаунт в OrbitDesk, затем под аккаунтом Larsenda открой **Админка → Аккаунты** и поставь ему роль `ADMIN`. После этого он получает права админки сайта.

Лимит OrbitDesk остаётся равным 2 аккаунтам.
