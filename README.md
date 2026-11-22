# Доступно у Львові — привабливий дизайн без React/Vite

1. Створи проєкт у Supabase.
2. Запусти `supabase.sql` у SQL Editor.
3. Встав Project URL і publishable/anon key у `config.js`.
4. Завантаж файли на GitHub Pages.

Сайт складається з двох HTML-сторінок, CSS та JS. Дані читаються/записуються через Supabase API, фото зберігаються в Supabase Storage. База не лежить у репозиторії.

Це стартовий варіант: клієнтська перевірка фото не захищає від обходу прямим API-запитом. Тут немає серверного фільтра нецензурної лексики, CAPTCHA і rate limit. Для публічного запуску ці перевірки потрібно винести в Supabase Edge Function та закрити прямий INSERT/upload для anon. Не публікуй service_role/secret key у браузері.
