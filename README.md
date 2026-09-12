# OrbitDesk React Render

OrbitDesk — личный браузер и рабочее пространство для Render.

## Почта и подтверждение

Регистрация требует подтверждения email. Код из 6 цифр отправляется через Google Apps Script Mail Bridge. Пользователь не входит в аккаунт, пока почта не подтверждена кодом или администратором.

Основные переменные Render:

- `MAIL_PROVIDER=apps-script`
- `MAIL_BRIDGE_URL`
- `MAIL_BRIDGE_TOKEN`
- `MAIL_FROM_NAME=OrbitDesk`
- `REQUIRE_EMAIL_VERIFICATION=true`

SMTP/Resend для основной схемы не нужны.

## Администраторы

Администраторы задаются в `admins.json`. Базовый администратор — `Larsenda`. Дополнительные роли можно выдавать через админ-панель.

## Лимит аккаунтов

`MAX_ACCOUNTS_PER_DEVICE=2` — максимум два аккаунта для одного браузера/устройства. Лимит считается отдельно для разных устройств.

## Защита

Регистрация и вход используют rate limit, honeypot, проверку времени заполнения формы и фильтрацию типичных automation User-Agent. Включение: `BLOCK_AUTOMATION_USER_AGENTS=true`.

Не коммить секреты в GitHub: `DATABASE_URL`, `MAIL_BRIDGE_TOKEN`, `PHOTO_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` и другие ключи хранятся в Render Environment / Script Properties.

## Google Sheets

Для Google Sheets используются OAuth-переменные `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` и `GOOGLE_REDIRECT_URI`. Подробности — в `GOOGLE_OAUTH_SETUP.md`.
