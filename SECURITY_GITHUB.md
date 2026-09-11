# OrbitDesk — GitHub security

Полностью «зашифровать сайт под GitHub» нельзя: исходный код, который лежит в репозитории, должен быть читаемым для сборки. Но секреты и пользовательские данные нельзя хранить в репозитории.

## Что сделано
- `.env`, ключи, пароли, `DATABASE_URL` и локальные секреты исключены через `.gitignore`.
- `.env.example` содержит только шаблоны.
- Почтовый bridge больше не хранит токен в `Code.gs`: токен хранится в Google Apps Script Script Properties.
- GitHub Actions запускает аудит зависимостей и build.
- Добавлен отдельный secret scan workflow.

## Для приватного кода
Сделай GitHub-репозиторий Private. Secrets держи только в Render Environment Variables и Google Apps Script Script Properties.
