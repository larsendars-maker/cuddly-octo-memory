# Google OAuth для OrbitDesk

Нужен только для функций, которым требуется доступ к Google Sheets/Drive через API. Обычное открытие docs.google.com в отдельной вкладке работает без OAuth.

## 1. Google Cloud

Открой Google Cloud Console и создай/выбери проект.

Далее в **Google Auth Platform** настрой приложение (Branding/Audience/Data Access), затем включи:

- Google Sheets API
- Google Drive API

## 2. OAuth Client

В **Google Auth Platform → Clients → Create Client** выбери **Web application**.

В Authorized redirect URIs добавь:

```text
https://cuddly-octo-memory.onrender.com/api/integrations/google/callback
```

## 3. Render Environment

Добавь:

```text
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://cuddly-octo-memory.onrender.com/api/integrations/google/callback
```

После сохранения сделай новый deploy.

## 4. Подключение

В OrbitDesk открой **Таблицы → Google Sheets → Подключить Google**.

Google покажет окно согласия. Выбери нужный аккаунт и разреши доступ.

Если приложение находится в режиме Testing, добавь свой Google-аккаунт как Test user.

## 5. Если Google показывает Unverified app

Это может быть нормально для личного/тестового приложения. Для публичного приложения при чувствительных/ограниченных OAuth scopes Google может потребовать проверку приложения.

## Важно

- `GOOGLE_CLIENT_SECRET` нельзя публиковать в GitHub или отправлять в чат.
- Redirect URI должен совпадать с URL в Google Cloud точно.
- При переезде на другой домен redirect URI нужно изменить и в Google Cloud, и в Render.
