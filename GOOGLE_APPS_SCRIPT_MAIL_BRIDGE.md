# Бесплатная почта OrbitDesk через Google Apps Script

Этот вариант не использует SMTP и не требует платного Render. OrbitDesk отправляет HTTPS POST на Google Apps Script, а скрипт отправляет письмо из Gmail-аккаунта, под которым был опубликован web app.

## 1. Открой Apps Script

Открой https://script.google.com/ под аккаунтом `orbitdesksupport@gmail.com`.

Создай новый проект и замени содержимое `Code.gs` кодом из `mail-bridge/Code.gs`.

## 2. Задай секрет

В `Code.gs` замени:

`CHANGE_ME_TO_A_LONG_RANDOM_SECRET`

на длинную случайную строку. Этот же секрет будет записан в Render как `MAIL_BRIDGE_TOKEN`.

## 3. Авторизуй Gmail

Нажми Run для функции `testAuthorization` и выдай разрешение Google на отправку почты.

## 4. Опубликуй как Web app

Apps Script → Deploy → New deployment → тип `Web app`.

- Execute as: Me
- Who has access: Anyone

Нажми Deploy и скопируй URL, который заканчивается на `/exec`.

Google подтверждает, что Apps Script web apps используют `doPost(e)` для POST-запросов и могут выполняться от имени владельца скрипта. 

## 5. Render

В `cuddly-octo-memory → Environment` добавь:

`MAIL_PROVIDER=apps-script`

`MAIL_BRIDGE_URL=<URL вашего /exec>`

`MAIL_BRIDGE_TOKEN=<тот же секрет>`

`MAIL_FROM_NAME=OrbitDesk`

При использовании Apps Script `RESEND_*` можно оставить, но они не будут использоваться, пока `MAIL_PROVIDER=apps-script`.

## 6. Проверка

После Save and Deploy OrbitDesk → регистрация → ввод email. Письмо отправляется от Gmail-аккаунта, который владеет опубликованным Apps Script web app.
