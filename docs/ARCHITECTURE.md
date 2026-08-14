# ViralReel AI Studio — Architecture & Technical Overview

## 🏗️ 1. Общая архитектура системы

Платформа представляет собой современный веб-сервис для автоматизации создания вирусных Instagram Reels, лидогенерации (Comment-to-DM воронки) и симуляции ИИ-продаж в Direct.

```mermaid
flowchart TB
    Client[React + Vite Frontend] <-->|Auth & Data queries| Supabase[Supabase PostgreSQL]
    Client <-->|Signed URLs (Upload / Preview)| Storage[Supabase Storage: reels, templates, audio]
    Client <-->|BYOK AI Prompts| DeepSeek[DeepSeek V3 / V4 API]
    
    Instagram[Instagram Graph API] <-->|Webhooks: Comments & DM| EdgeFunc[Supabase Edge Functions: instagram-webhook]
    EdgeFunc <-->|Verify & Process Rules| Supabase
    EdgeFunc -->|Send DM & Public Reply| Instagram
```

---

## 🔒 2. Модель безопасности Хранилища (Storage Hardening)

Все бакеты хранилища изолированы и защищены RLS:
- **`reels` (Private)**: Готовые отрендеренные ролики пользователей. Доступны только владельцу через краткосрочные подписанные ссылки (`getSignedUrl`) со сроком жизни 3600 секунд.
- **`templates` (Private)**: Исходные видеоподложки пользователей.
- **`audio` (Private)**: Пользовательские музыкальные дорожки и звуковые эффекты.

---

## 🤖 3. Модуль ИИ и генерации контента

- **API-клиент**: `services/ai/deepseekClient.ts` (модель `deepseek-v4-pro`).
- **Ключи доступа (BYOK)**: Ключ DeepSeek хранится локально в `localStorage` браузера пользователя (`deepseek_api_key`), не передается на сервер и не хранится в публичном бандле.
- **Модуль «ИИ-Менеджер»**: Интерактивная песочница и симулятор для обучения базы знаний продуктов, скриптов отработки возражений и тестирования промптов.

---

## 📊 4. Лидогенерация & Comment-to-DM

- **Триггеры**: Отслеживание кодовых слов под выбранными или всеми Reels аккаунта.
- **Обработка в Edge Function**:
  1. Защита от дубликатов (`repeat_delay_hours`).
  2. Задержка ответа (`reply_delay_seconds`) для имитации живого поведения.
  3. Публичный ответ под постом из пула вариантов (`public_reply_variants`).
  4. Личное сообщение в Direct с кнопкой перехода.
- **Аналитика**: Live-лента событий в реальном времени, конверсии по кодовым словам и статус здоровья токенов.
