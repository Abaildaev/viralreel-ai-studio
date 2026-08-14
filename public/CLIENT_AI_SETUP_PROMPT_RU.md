# Задание для ИИ-агента: полностью развернуть ViralReel AI Studio для нового клиента

Ты — технический агент, который должен самостоятельно развернуть и настроить переданный проект ViralReel AI Studio для нового владельца. Пользователь может не разбираться в программировании, Meta Developers, Supabase, Webhooks и терминале. Не ограничивайся объяснениями: выполняй все безопасные действия самостоятельно через файлы проекта, терминал, Supabase CLI и управляемый браузер. Проси пользователя вмешаться только там, где необходимы пароль, CAPTCHA, двухфакторная авторизация, юридические данные или явное подтверждение рискованного внешнего действия.

Работай до фактического результата: новый комментарий с кодовым словом под Reels должен вызвать публичный ответ и private reply в Instagram Direct.

## 1. Главные правила

1. Все аккаунты, проекты, токены и приложения должны принадлежать клиенту. Не используй Supabase project ref, Meta App ID, Instagram App ID, токены или Keychain-записи предыдущего владельца.
2. Никогда не печатай секреты в ответе, логах, Markdown, Git, скриншотах или итоговом отчёте.
3. Не проси клиента вставлять в чат пароли, App Secret, access token, service role key, verify token или коды 2FA.
4. Для авторизации используй официальный браузерный вход. Если секрет нужно сохранить локально, используй системную связку ключей или Supabase Secrets.
5. Перед публикацией Meta App, изменением разрешений, созданием платного ресурса, удалением данных или отправкой App Review попроси точное подтверждение пользователя непосредственно перед действием.
6. CAPTCHA и 2FA всегда передавай пользователю. Не пытайся обходить защиту.
7. Не удаляй старое рабочее приложение или проект до успешного end-to-end теста нового окружения.
8. Сначала проводи read-only диагностику, затем меняй только то, что необходимо.
9. После каждого важного изменения проверяй фактический результат, а не только отсутствие ошибки команды.
10. Не заявляй, что всё готово, пока не выполнен чек-лист завершения из последнего раздела.

## 2. Сначала собери минимальные данные

Проверь файлы проекта и доступное окружение. Если данные невозможно определить автоматически, запроси у клиента только следующее:

- название продукта и компании;
- публичный контактный email для политики конфиденциальности;
- GitHub URL проекта, если проект ещё не открыт локально;
- желаемый регион Supabase;
- username профессионального Instagram-аккаунта;
- название Chrome-профиля, в котором клиент авторизован в Meta и Supabase;
- нужен ли доступ только для собственного Instagram-аккаунта или для аккаунтов сторонних клиентов.

Не запрашивай секреты в сообщении. Если пользователь уже передал секрет в чат, используй его только с явного разрешения, затем предложи перевыпустить его после настройки.

## 3. Подключение к браузеру

Для операций Meta и Supabase используй браузерную сессию клиента.

1. Если пользователь назвал Chrome, используй именно Chrome, а не встроенный браузер.
2. Найди подключённый Chrome-профиль по отображаемому имени. Разрешено читать только метаданные профиля и список открытых вкладок; не просматривай cookies, localStorage, сохранённые пароли или историю без необходимости.
3. Если нужный Chrome недоступен, попроси клиента открыть Codex/ChatGPT → Settings → Computer use, установить или включить браузерное расширение и открыть Chrome с нужным профилем.
4. Попроси клиента заранее войти в:
   - `https://developers.facebook.com/apps/`
   - `https://supabase.com/dashboard/`
5. После входа продолжай в той же вкладке и профиле.
6. Если появляется 2FA, пароль, CAPTCHA или подтверждение личности, остановись на этом экране и попроси клиента выполнить шаг самостоятельно. После ответа «готово» продолжай с текущей страницы.
7. Не переключайся на другой браузер только потому, что в текущем нет авторизации.

## 4. Диагностика репозитория

В терминале:

```bash
pwd
rg --files -g '!node_modules/**' | sed -n '1,240p'
git status --short
node --version
npm --version
```

Полностью прочитай:

- `README.md`
- `package.json`
- `.env.example`
- `supabase/config.toml`
- `docs/META_INSTAGRAM_SETUP.md`, если файл существует;
- функции в `supabase/functions/`;
- миграции в `supabase/migrations/`;
- страницы подключения Instagram и лид-магнитов;
- `meta-graph-mcp/`, если административный MCP нужен клиенту.

Найди все значения старого владельца:

```bash
rg -n "1838487097516540|1729297678195701|ygkxumlxriymuuixrron|neurobog\.academy|avtoins|META_|SUPABASE_|v[0-9]+\.0" . \
  --hidden --glob '!node_modules/**' --glob '!dist/**'
```

Не заменяй всё автоматически вслепую. Раздели найденное на:

- runtime-конфигурацию, которую нужно заменить;
- документацию, которую нужно актуализировать;
- миграции/историю, которую менять нельзя без причины;
- секреты, которых в репозитории вообще не должно быть.

Сохраняй существующие пользовательские изменения. Не выполняй `git reset --hard`, `git checkout --` или массовое удаление.

## 5. Локальный запуск

Установи зависимости и создай локальное окружение:

```bash
npm ci
cp .env.example .env.local
```

Не заполняй `.env.local` старыми значениями. После создания клиентского Supabase в нём должны быть только публичные frontend-параметры:

```env
VITE_SUPABASE_URL=https://CLIENT_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=CLIENT_ANON_KEY
```

Никогда не добавляй `SUPABASE_SERVICE_ROLE_KEY`, Meta App Secret или Instagram access token во frontend `.env.local`.

Запусти приложение:

```bash
npm run dev
```

Проверь `http://127.0.0.1:3000/`, регистрацию, вход и сохранение сессии после перезагрузки.

## 6. Создание клиентского Supabase

Предпочтительный путь — официальный Supabase Dashboard в авторизованном браузере или `npx supabase login` с браузерной авторизацией.

1. Создай новый Supabase project в организации клиента.
2. Перед финальным созданием покажи пользователю название, организацию, регион и возможную стоимость.
3. Пароль базы данных должен ввести и сохранить клиент; не проси его присылать пароль в чат.
4. Получи project ref, Project URL и anon/publishable key.
5. Запиши URL и anon key в `.env.local`.
6. Свяжи CLI:

```bash
npx supabase login
npx supabase link --project-ref CLIENT_PROJECT_REF
npx supabase db push
```

7. Разверни все функции, реально присутствующие в проекте. Минимальный набор этой версии:

```bash
npx supabase functions deploy auto-publish --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy publish-reels --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy publish-telegram --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy verify-instagram-token --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy check-tokens --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy cleanup-storage --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy connect-instagram-account --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy subscribe-instagram-webhooks --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy list-instagram-media --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy instagram-webhook --project-ref CLIENT_PROJECT_REF
npx supabase functions deploy meta-legal --project-ref CLIENT_PROJECT_REF
```

8. Убедись, что в `supabase/config.toml` публичные функции не требуют JWT:

```toml
[functions.instagram-webhook]
verify_jwt = false

[functions.meta-legal]
verify_jwt = false
```

9. Проверь RLS: клиент должен видеть только свои аккаунты, правила и события. Frontend не должен получать service role key.

## 7. Юридические страницы клиента

Открой `supabase/functions/meta-legal/index.ts` и замени данные предыдущего владельца на данные клиента:

- название сервиса/компании;
- контактный email;
- дату обновления;
- фактическое описание обработки данных;
- инструкции удаления данных.

Не выдумывай юридическое лицо, адрес или регистрационные данные. Если обязательной информации нет, запроси её у клиента.

После развертывания проверь HTTP 200 для:

```text
https://CLIENT_PROJECT_REF.supabase.co/functions/v1/meta-legal?page=privacy
https://CLIENT_PROJECT_REF.supabase.co/functions/v1/meta-legal?page=terms
https://CLIENT_PROJECT_REF.supabase.co/functions/v1/meta-legal?page=deletion
```

## 8. Создание клиентского Meta App

В Meta for Developers:

1. Создай новый App типа Business в аккаунте/Business Portfolio клиента.
2. Выбери сценарий управления сообщениями и контентом Instagram.
3. Добавь Instagram API с Instagram Login.
4. Зафиксируй несекретные значения:
   - Meta App ID;
   - Instagram App ID.
5. App Secret не показывай и не копируй в отчёт.
6. Добавь разрешения:
   - `instagram_business_basic`;
   - `instagram_business_manage_comments`;
   - `instagram_business_manage_messages`.
7. Если клиент использует публикацию Reels, добавь разрешение публикации, требуемое выбранным сценарием Meta.
8. Проверь, что нужные разрешения имеют минимум статус «Готово к тестированию».

Официальные разделы:

- `https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/`
- `https://developers.facebook.com/docs/instagram/platform/instagram-api/webhooks/`
- `https://developers.facebook.com/docs/app-review/`

Используй актуальную версию Graph API, поддерживаемую Meta на момент настройки. Затем обнови одну константу версии во всех функциях проекта и проверь через `rg`, что старые версии не остались. Для текущей переданной версии проекта исходным ориентиром является `v26.0`, но не предполагай, что она всё ещё актуальна без проверки официальной панели Meta.

## 9. Основные настройки Meta App

В App Settings → Basic заполни данными клиента:

- Display Name;
- Contact Email;
- Privacy Policy URL;
- Terms of Service URL;
- User Data Deletion URL;
- App Icon;
- Category;
- App Domains и OAuth Redirect URI, если используется web OAuth.

Не указывай `facebook.com` вместо реальных legal URL. Все страницы должны открываться публично по HTTPS без авторизации.

## 10. Секреты Meta и Webhook

Создай новый случайный verify token не короче 32 байт. Сохрани секреты в Supabase:

```bash
npx supabase secrets set \
  META_APP_SECRET='CLIENT_META_APP_SECRET' \
  META_WEBHOOK_VERIFY_TOKEN='CLIENT_RANDOM_VERIFY_TOKEN' \
  --project-ref CLIENT_PROJECT_REF
```

Не вводи реальные секреты прямо в команду, если она будет показана в чате или сохранена в истории. Используй безопасный ввод или системную связку ключей.

В Instagram API Setup → Webhooks:

- Callback URL: `https://CLIENT_PROJECT_REF.supabase.co/functions/v1/instagram-webhook`
- Verify Token: тот же клиентский `META_WEBHOOK_VERIFY_TOKEN`

Нажми «Подтвердить и сохранить». Затем включи минимум:

- `comments`;
- `messages`.

Выставь выбранную актуальную Graph API version для обоих полей. Используй «Тестировать» для `comments` и подтверди успешную доставку на сервер.

## 11. Публикация и App Review

Для теста собственного аккаунта:

- Instagram-владелец должен иметь роль администратора, разработчика или тестировщика Meta App;
- Standard Access обычно достаточен только для аккаунтов, связанных с ролями приложения.

Для подключения любых клиентских Instagram-аккаунтов:

1. Пройди Business Verification, если Meta потребует.
2. Подготовь App Review для:
   - `instagram_business_basic`;
   - `instagram_business_manage_comments`;
   - `instagram_business_manage_messages`.
3. Запроси Advanced Access.
4. Подготовь screencast полного сценария:
   - авторизация клиента;
   - подключение Instagram Professional account;
   - создание правила с кодовым словом;
   - новый комментарий под Reels;
   - публичный ответ;
   - private reply в Direct;
   - отключение аккаунта и удаление данных.
5. Не отправляй App Review без явного подтверждения клиента.

Перед переводом App в Published покажи пользователю, что именно станет публичным, и запроси подтверждение. Публикация не заменяет Advanced Access.

## 12. Подключение Instagram-аккаунта

1. Аккаунт должен быть Professional: Business или Creator.
2. Сгенерируй новый Instagram access token только после добавления всех разрешений.
3. Для автоматизаций этой архитектуры токен должен начинаться с `IGAA`.
4. Подключи аккаунт в разделе «Аккаунты» приложения.
5. Убедись, что аккаунт сохраняется после перезагрузки страницы.
6. Проверь, что `connect-instagram-account` автоматически подписал его через:

```text
POST /{ig_user_id}/subscribed_apps
subscribed_fields=comments,messages
```

7. В записи аккаунта должны быть:
   - `webhook_subscribed_at` — заполнено;
   - `webhook_error` — пусто;
   - `is_active` — `true`.
8. Если разрешение добавили после выпуска токена, обязательно выпусти новый токен и переподключи аккаунт.

Каждый новый Instagram-аккаунт требует собственного токена и собственной подписки `subscribed_apps`. Общего callback URL недостаточно.

## 13. Обновление конфигурации проекта

Замени справочные значения старого владельца на клиентские во всех релевантных файлах, включая:

- `.env.local`;
- клиентские справочные компоненты и внутренний runbook, если они присутствуют;
- `meta-graph-mcp/run-meta-graph-mcp.zsh`, если MCP используется;
- любые deployment-конфиги и документацию.

Не хардкодь секреты. App ID и project ref могут быть документированы, но секреты должны читаться из Keychain или Supabase Secrets.

Если административный Meta MCP нужен клиенту:

1. Обнови App ID.
2. Создай новый App Access Token именно нового Meta App.
3. Сохрани его в уникальной записи Keychain клиента.
4. Настрой MCP на чтение токена из Keychain.
5. Проверь только безопасные read-only методы до любых изменений.

MCP не является частью runtime Webhook и не заменяет IGAA-токены Instagram-аккаунтов.

## 14. Настройка автоматизации кодового слова

Создай тестовое правило:

- ключевое слово: `Гайд`;
- matching: без учёта регистра;
- источник: комментарии;
- публикации: все или выбранный Reels;
- публичный ответ: включён;
- private reply в Direct: включён;
- правило: активно;
- anti-spam/repeat delay: включён.

Проверь, что функция:

- нормализует регистр и пробелы;
- не обрабатывает одно событие дважды;
- не отвечает самому владельцу бесконечно;
- сохраняет результат или ошибку в `instagram_automation_events`;
- использует Graph API version, совпадающую с настройками Meta.

## 15. Финальное end-to-end тестирование

1. В Meta Dashboard отправь тест поля `comments` и получи успешную доставку.
2. С другого реального Instagram-аккаунта оставь **новый** комментарий `Гайд` под Reels подключённого аккаунта.
3. Не редактируй старый комментарий — нужен новый webhook event.
4. Проверь публичный ответ под видео.
5. Проверь private reply в Direct.
6. Проверь запись события в базе и отсутствие ошибок функции.
7. Перезагрузи приложение и убедись, что аккаунт и правило не исчезли.
8. Проверь истечение токена и механизм переподключения.
9. Запусти:

```bash
npm test
```

10. Выполни скан репозитория на случайно сохранённые секреты. Не выводи найденный секрет целиком; показывай только имя файла и тип проблемы.

## 16. Критерии завершения

Задача считается выполненной только если:

- приложение запускается локально;
- клиент может зарегистрироваться и войти;
- создан отдельный клиентский Supabase;
- миграции и Edge Functions развернуты;
- legal URL клиента доступны по HTTPS;
- создан отдельный клиентский Meta App;
- Webhook подтверждён;
- `comments` и `messages` подписаны;
- Meta App опубликован либо явно оставлен в тестовом режиме по решению клиента;
- Instagram-аккаунт сохраняется после перезагрузки;
- реальный комментарий с кодовым словом вызывает публичный ответ и Direct;
- `npm test` проходит;
- секреты отсутствуют в Git и отчёте;
- клиент получил объяснение разницы между Standard и Advanced Access;
- для подключения произвольных аккаунтов App Review либо одобрен, либо зафиксирован как единственный оставшийся внешний этап.

## 17. Формат итогового отчёта

В конце дай короткий отчёт без секретов:

```text
Локальный запуск: готов / не готов
Supabase: готов / не готов
Meta App: ID и статус публикации
Graph API: версия
Webhook callback: URL и результат теста
Webhook fields: список
Instagram permissions: Standard/Advanced по каждому разрешению
Подключённый Instagram: @username, без токена
Реальный тест «Гайд»: публичный ответ / Direct / ошибка
App Review: не нужен для теста / требуется / отправлен / одобрен
Проверка npm test: результат
Оставшиеся действия клиента: только действительно необходимые шаги
```

Начни работу с диагностики файлов и доступного браузера. Не проси пользователя повторять данные, которые можно безопасно определить из проекта или открытой панели.
