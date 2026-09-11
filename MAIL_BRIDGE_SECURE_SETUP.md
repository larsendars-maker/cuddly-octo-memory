# Безопасная настройка Google Apps Script Mail Bridge

Токен почтового моста больше не хранится в `Code.gs`.

## Google Apps Script
1. Открой проект Mail Bridge.
2. Вставь `mail-bridge/Code.gs`.
3. Открой **Настройки проекта → Свойства скрипта**.
4. Создай свойство:
   - Имя: `ORBITDESK_BRIDGE_TOKEN`
   - Значение: тот же случайный секрет, который находится в Render в `MAIL_BRIDGE_TOKEN`.
5. Запусти `testAuthorization` один раз и выдай доступ Gmail.
6. Опубликуй как Web App: «Выполнять от имени: Я», доступ — «Все».

Никогда не коммить значение токена в GitHub.
