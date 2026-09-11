# MOBA Arena Online — Render Web Service

## GitHub Desktop
1. Распакуй ZIP.
2. В GitHub Desktop: File → Add local repository → выбери распакованную папку.
3. Если GitHub пишет, что это не Git-репозиторий: Repository → Create New Repository (или File → New Repository) и укажи эту папку.
4. Сделай Commit to main.
5. Нажми Publish repository и включи доступ Public (или Private, если твой Render имеет доступ).

## Render
Создай New → Web Service и выбери этот GitHub-репозиторий.
- Runtime: Node
- Build Command: npm install
- Start Command: npm start
- Health Check Path: /health

Render сам подставит PORT. Не ставь Static Site.

## После деплоя
Открой выданный Render URL. Для HTTPS WebSocket клиент автоматически использует wss://.
