# OrbitDesk v3 — Render Web Service + PostgreSQL

## Что исправлено
- Сайты ГДЗ / SFPD DB / Evolve RP / VK больше НЕ добавляются автоматически во вкладки.
- Предустановки показываются только как быстрые кнопки по роли:
  - user: ГДЗ, VK, YouTube, Google, Lichess
  - assistant: user + Evolve RP, SFPD DB, CrazyGames
  - admin: все доступные пресеты
- Админ может менять роли пользователей: `user`, `assistant`, `admin`.
- Новый аккаунт получает `admin` только если база пустая или email совпадает с `BOOTSTRAP_ADMIN_EMAIL`; остальные — `user`.
- Добавлен более понятный вывод ошибки отсутствующей DATABASE_URL.

## ВАЖНО: как исправить твой Render DATABASE_URL
`render.yaml` создаёт PostgreSQL и связывает его с сервисом. Это работает при создании/обновлении через Render Blueprint.

Вариант A (рекомендуется):
1. Render → New → Blueprint.
2. Выбери GitHub-репозиторий.
3. Render прочитает `render.yaml`.
4. Будут созданы `orbitdesk` и `orbitdesk-db`, а `DATABASE_URL` подключится автоматически.

Вариант B (если оставляешь существующий Web Service):
1. Создай Render PostgreSQL с базой `orbitdesk`.
2. Открой Web Service → Environment.
3. Создай `DATABASE_URL` со значением **Internal Database URL / Internal Connection String** от этой БД.
4. Сохрани и сделай Manual Deploy.

`npm start` остаётся Start Command. Build Command: `npm install`.

## Bootstrap admin
Можно задать переменную `BOOTSTRAP_ADMIN_EMAIL`. Пользователь с этим email получит `admin` при регистрации/инициализации. Если база полностью новая, первый зарегистрированный пользователь также становится admin.
