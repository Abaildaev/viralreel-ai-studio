import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CONTACT_EMAIL = "neurobog.academy@gmail.com";

type LegalPage = "privacy" | "terms" | "deletion";

const pages: Record<LegalPage, { title: string; description: string; content: string }> = {
  privacy: {
    title: "Политика конфиденциальности",
    description: "Как avtoins обрабатывает данные пользователей и профессиональных аккаунтов Instagram.",
    content: `
      <h2>1. Общие положения</h2>
      <p>Эта Политика описывает, как сервис avtoins («Сервис») обрабатывает данные при подключении профессионального аккаунта Instagram и использовании функций публикации и автоматизации.</p>
      <h2>2. Какие данные мы обрабатываем</h2>
      <ul>
        <li>идентификатор, имя пользователя и базовые сведения подключенного профессионального аккаунта Instagram;</li>
        <li>идентификаторы публикаций, комментарии и сообщения, необходимые для выполнения настроенных пользователем автоматизаций;</li>
        <li>токены доступа Meta, статусы подключений и технические журналы выполнения операций;</li>
        <li>контент и настройки, которые пользователь самостоятельно загружает или создает в Сервисе.</li>
      </ul>
      <h2>3. Для чего используются данные</h2>
      <p>Данные используются только для подключения аккаунта, публикации контента, получения разрешенных событий Webhooks, отправки настроенных ответов, обеспечения безопасности и диагностики ошибок.</p>
      <h2>4. Передача и хранение</h2>
      <p>Мы не продаем персональные данные. Для работы Сервиса данные могут обрабатываться поставщиками инфраструктуры и API, включая Meta и Supabase, только в объеме, необходимом для оказания услуг. Данные хранятся до отключения аккаунта, удаления пользователем или истечения разумного технического срока хранения.</p>
      <h2>5. Безопасность</h2>
      <p>Мы применяем разграничение доступа, защищенные соединения и серверное хранение секретов. Несмотря на принимаемые меры, ни один способ передачи или хранения не гарантирует абсолютную безопасность.</p>
      <h2>6. Права пользователя</h2>
      <p>Пользователь может отключить Instagram-аккаунт, отозвать разрешения Meta, запросить доступ, исправление или удаление своих данных. Инструкции приведены на странице «Удаление данных».</p>
      <h2>7. Контакты</h2>
      <p>По вопросам конфиденциальности напишите на <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    `,
  },
  terms: {
    title: "Пользовательское соглашение",
    description: "Условия использования сервиса avtoins.",
    content: `
      <h2>1. Использование сервиса</h2>
      <p>avtoins предоставляет инструменты для создания, планирования, публикации контента и автоматизации взаимодействий в Instagram. Пользователь обязан соблюдать правила Meta, применимое законодательство и права третьих лиц.</p>
      <h2>2. Аккаунт и разрешения</h2>
      <p>Пользователь самостоятельно подключает аккаунты и предоставляет необходимые разрешения. Пользователь отвечает за безопасность своего аккаунта и за содержание создаваемых автоматизаций.</p>
      <h2>3. Ограничения</h2>
      <p>Запрещено использовать Сервис для спама, обмана, незаконного сбора данных, нарушения авторских прав либо обхода ограничений платформ Meta.</p>
      <h2>4. Доступность</h2>
      <p>Функции могут зависеть от доступности API Meta и сторонней инфраструктуры. Сервис предоставляется «как есть» в пределах, разрешенных законом.</p>
      <h2>5. Прекращение использования</h2>
      <p>Пользователь может в любое время отключить интеграцию Instagram и запросить удаление данных.</p>
      <h2>6. Контакты</h2>
      <p>Вопросы по условиям использования: <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>.</p>
    `,
  },
  deletion: {
    title: "Удаление данных пользователя",
    description: "Как удалить данные, связанные с avtoins и Instagram.",
    content: `
      <h2>Как запросить удаление</h2>
      <ol>
        <li>Отключите Instagram-аккаунт в разделе «Аккаунты» сервиса avtoins.</li>
        <li>Отзовите доступ приложения avtoins в настройках интеграций Meta, если он еще активен.</li>
        <li>Отправьте письмо на <a href="mailto:${CONTACT_EMAIL}?subject=Удаление%20данных%20avtoins">${CONTACT_EMAIL}</a> с темой «Удаление данных avtoins» и укажите имя подключенного Instagram-аккаунта.</li>
      </ol>
      <p>Мы подтвердим получение запроса и удалим связанные данные, если их дальнейшее хранение не требуется по закону. Технические резервные копии могут быть окончательно очищены в течение 30 дней.</p>
      <h2>Что будет удалено</h2>
      <p>Токены подключения, настройки автоматизаций, сохраненные идентификаторы Instagram, журналы событий и связанный пользовательский контент, относящийся к запросу.</p>
    `,
  },
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character]!);
}

Deno.serve((request) => {
  const url = new URL(request.url);
  const requestedPage = url.searchParams.get("page") ?? url.pathname.split("/").filter(Boolean).at(-1);
  const pageName: LegalPage = requestedPage === "terms" || requestedPage === "deletion"
    ? requestedPage
    : "privacy";
  const page = pages[pageName];
  const html = `<!doctype html>
  <html lang="ru">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="${escapeHtml(page.description)}" />
      <title>${escapeHtml(page.title)} — avtoins</title>
      <style>
        :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #172033; background: #f5f7fb; }
        * { box-sizing: border-box; }
        body { margin: 0; line-height: 1.65; }
        header { background: #111827; color: white; }
        nav, main, footer { width: min(880px, calc(100% - 32px)); margin: 0 auto; }
        nav { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .brand { color: white; font-size: 21px; font-weight: 800; text-decoration: none; }
        .links { display: flex; flex-wrap: wrap; gap: 14px; }
        .links a { color: #cbd5e1; text-decoration: none; font-size: 14px; }
        main { margin-top: 38px; margin-bottom: 38px; padding: clamp(24px, 5vw, 52px); background: white; border: 1px solid #e5e7eb; border-radius: 22px; box-shadow: 0 16px 50px rgba(15, 23, 42, .08); }
        h1 { margin: 0 0 10px; font-size: clamp(30px, 5vw, 46px); line-height: 1.15; }
        h2 { margin-top: 34px; font-size: 21px; }
        p, li { color: #475569; }
        a { color: #2563eb; }
        .updated { margin-bottom: 30px; color: #64748b; font-size: 14px; }
        footer { padding: 0 0 42px; color: #64748b; font-size: 14px; }
        @media (max-width: 620px) { nav { align-items: flex-start; flex-direction: column; padding: 18px 0; } }
      </style>
    </head>
    <body>
      <header>
        <nav>
          <a class="brand" href="?page=privacy">avtoins</a>
          <div class="links">
            <a href="?page=privacy">Конфиденциальность</a>
            <a href="?page=terms">Соглашение</a>
            <a href="?page=deletion">Удаление данных</a>
          </div>
        </nav>
      </header>
      <main>
        <h1>${escapeHtml(page.title)}</h1>
        <p class="updated">Последнее обновление: 13 августа 2026 г.</p>
        ${page.content}
      </main>
      <footer>© 2026 avtoins · <a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a></footer>
    </body>
  </html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=300",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
    },
  });
});
