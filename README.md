# OrbitDesk

Персональный full-stack «браузер внутри сайта» на Node.js + PostgreSQL + WebSocket.

## Render Blueprint
В репозитории есть `render.yaml`, который создаёт Web Service и Postgres и автоматически прокидывает `DATABASE_URL` через `fromDatabase`.

### Render
1. GitHub repository → Render → **New Blueprint Instance**.
2. Выбери репозиторий.
3. Render увидит `render.yaml` и создаст `orbitdesk` + `orbitdesk-db`.
4. Для веб-сервиса используются:
   - Build: `npm install`
   - Start: `npm start`
   - Health: `/health`

На Free Postgres есть ограничения: 1 GB и срок жизни 30 дней. Для постоянного проекта базу нужно потом перевести на платный план. У Free Web Service также есть spin-down при бездействии. Подробнее: https://render.com/docs/free

## Возможности
- регистрация / авторизация / JWT;
- ранги и XP;
- браузерные вкладки;
- быстрые сайты и клавиатурные бинды;
- встроенные пресеты: gdz.top, SFPD DB, Evolve RP, VK, YouTube, Google, Lichess, CrazyGames;
- таблицы;
- фото: PNG/JPEG/WebP/GIF до 2 MB, до 50 файлов на пользователя;
- темы, акцент, blur, ширина боковой панели, скругления, обои URL, компактный режим;
- друзья, заявки и WebSocket-чат;
- fallback на новую вкладку для сайтов, которые запрещают iframe.
