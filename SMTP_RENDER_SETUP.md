# OrbitDesk — Gmail SMTP через Render

Для `orbitdesksupport@gmail.com` используй Google App Password, а не обычный пароль Gmail.

## Render Environment Group

```text
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=orbitdesksupport@gmail.com
SMTP_PASS=<16-значный App Password Google>
SMTP_FROM=orbitdesksupport@gmail.com
SMTP_SECURE=false
```

Не коммить App Password в GitHub. Храни его только в Render Environment / Environment Group.

## После изменения

Сохрани переменные и выполни новый Deploy сервиса OrbitDesk. После запуска новая регистрация отправит 6-значный код на email пользователя. При повторной отправке кода интерфейс ставит 60-секундную паузу.
