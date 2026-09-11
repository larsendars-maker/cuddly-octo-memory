# Обязательная проверка почты OrbitDesk

В OrbitDesk подтверждение email обязательно, если `REQUIRE_EMAIL_VERIFICATION=true`.

1. Пользователь регистрируется.
2. Аккаунт создаётся с `email_verified=false`.
3. Сервер отправляет одноразовый 6-значный код на введённый email.
4. Код действует 15 минут и хранится только в виде SHA-256 хэша.
5. Пока код не введён верно, пользователь не получает полноценную сессию и доступ к приложению.
6. После успешного ввода сервер ставит `email_verified=true`, удаляет код и создаёт сессию.
7. Администратор видит статус почты и может повторно отправить код из вкладки «Аккаунты».

Для бесплатного Render рекомендуется Google Apps Script mail bridge:
- `MAIL_PROVIDER=apps-script`
- `MAIL_BRIDGE_URL=https://script.google.com/macros/s/.../exec`
- `MAIL_BRIDGE_TOKEN=<секрет>`
- `MAIL_FROM_NAME=OrbitDesk`

Resend не требуется для этой схемы.
