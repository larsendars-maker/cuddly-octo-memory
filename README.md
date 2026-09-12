## OrbitDesk 2.11.3

Исправлен WebSocket-чат: авторизация больше не зависит от email_verified, доступ к чату проверяется через chat_enabled, добавлено безопасное переподключение и защита от гонок нескольких вкладок.

# OrbitDesk React Render

OrbitDesk — личный браузер и рабочее пространство для Render.

## Почта и подтверждение

Регистрация сразу открывает OrbitDesk после создания аккаунта. Подтверждение email для входа не требуется. Чат для нового аккаунта открывается автоматически через 60 секунд или может быть выдан администратором из админ-панели с повторной проверкой пароля.

Основные переменные Render:

- `MAIL_PROVIDER=apps-script`
- `MAIL_BRIDGE_URL`
- `MAIL_BRIDGE_TOKEN`
- `MAIL_FROM_NAME=OrbitDesk`
- `REQUIRE_EMAIL_VERIFICATION=true`

SMTP/Resend для основной схемы не нужны.

## Администраторы

Главный администратор — `Larsenda` с ролью `GL.ADMIN`. Обычные `ADMIN` не могут снять права другого `ADMIN`; выдача ролей и опасные действия требуют повторной проверки пароля.

## Лимит аккаунтов

`MAX_ACCOUNTS_PER_DEVICE=2` — максимум два аккаунта для одного браузера/устройства. Лимит считается отдельно для разных устройств.

## Защита

Регистрация и вход используют rate limit, honeypot, проверку времени заполнения формы и фильтрацию типичных automation User-Agent. Включение: `BLOCK_AUTOMATION_USER_AGENTS=true`.

Не коммить секреты в GitHub: `DATABASE_URL`, `MAIL_BRIDGE_TOKEN`, `PHOTO_ENCRYPTION_KEY`, `GOOGLE_CLIENT_SECRET` и другие ключи хранятся в Render Environment / Script Properties.

## Google Sheets

Для Google Sheets используются OAuth-переменные `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` и `GOOGLE_REDIRECT_URI`. Подробности — в `GOOGLE_OAUTH_SETUP.md`.


### Чат
`CHAT_AUTO_UNLOCK_SECONDS=60` — время автоматической выдачи доступа к чату для нового аккаунта. Администратор может выдать или забрать доступ вручную.


## 2.11.0
- Таблицы теперь работают только через Google Sheets внутри вкладки OrbitDesk.
- Добавлен встроенный умный помощник на Google Gemini через `GEMINI_API_KEY`.
- Убрана старая подпись Orbit AI/«Бесплатно».
- Изменение XP в админке подтверждается паролем.
- Omni-bar показывается только на главной.
