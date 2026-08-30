#!/usr/bin/env node
/*
 * Как отработала воронка Instagram → Direct → Telegram за последние сутки.
 *
 * Собирает те же срезы, по которым разбирались вручную: дошёл ли публичный
 * ответ, кого и почему пропустили, что показывает A/B и не сыплются ли ошибки.
 * Отдельно проверяет настройки, которые уже один раз молча ломали воронку —
 * выключенный публичный ответ и сумму процентов A/B, не оставляющую доли
 * контрольной группе.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/automation-health.mjs
 *   ... node scripts/automation-health.mjs --hours 48
 *
 * Токен нигде не хранится: он читается из окружения и уходит только в
 * api.supabase.com. Нужен personal access token из Supabase → Account →
 * Access Tokens.
 */

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF ?? 'ygkxumlxriymuuixrron';
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;

const hoursArg = process.argv.indexOf('--hours');
const HOURS = hoursArg > -1 ? Number(process.argv[hoursArg + 1]) || 24 : 24;

if (!TOKEN) {
  console.error('Нужен SUPABASE_ACCESS_TOKEN в окружении.');
  console.error('Supabase → Account → Access Tokens → Generate new token.');
  process.exit(1);
}

async function query(sql) {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql }),
    },
  );

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? `Supabase ответил ${response.status}`);
  }
  return body;
}

function table(rows) {
  if (!rows || rows.length === 0) return '  (пусто)';
  const columns = Object.keys(rows[0]);
  const width = (column) =>
    Math.max(column.length, ...rows.map((row) => String(row[column] ?? '').length));
  const widths = Object.fromEntries(columns.map((column) => [column, width(column)]));
  const line = (cells) =>
    '  ' + columns.map((column) => String(cells[column] ?? '').padEnd(widths[column])).join('  ');
  return [
    line(Object.fromEntries(columns.map((c) => [c, c]))),
    '  ' + columns.map((c) => '-'.repeat(widths[c])).join('  '),
    ...rows.map(line),
  ].join('\n');
}

const since = `now() - interval '${HOURS} hours'`;

const sections = [
  {
    title: `Доставки за ${HOURS} ч`,
    sql: `select trigger_type, status, public_reply_status, dm_status, count(*)
          from instagram_automation_events
          where created_at > ${since}
          group by 1,2,3,4 order by count desc;`,
  },
  {
    title: 'Публичный ответ по дням (вернулся ли)',
    sql: `select date_trunc('day', created_at)::date as day,
                 count(*) filter (where public_reply_status = 'sent') as ответили,
                 count(*) filter (where public_reply_status = 'failed') as ошибка,
                 count(*) filter (where public_reply_status = 'skipped') as пропущено
          from instagram_automation_events
          where trigger_type = 'comment' and created_at > now() - interval '7 days'
          group by 1 order by 1 desc;`,
  },
  {
    title: 'Кого пропустили и почему',
    sql: `select case
                   when error_message is not null then 'блок 24 часа / ошибка'
                   when incoming_text ilike '%пром%' or incoming_text ilike '%прост%'
                     or incoming_text ilike '%promt%' or incoming_text ilike '%prompt%'
                     then 'ОПЕЧАТКА в кодовом слове'
                   else 'не кодовое слово'
                 end as причина,
                 count(*), count(distinct commenter_username) as людей
          from instagram_automation_events
          where status = 'ignored' and created_at > ${since}
          group by 1 order by 2 desc;`,
  },
  {
    /* `experiment_variant` не разделяет доставки сам по себе:
       персонализированные помечаются как quick_reply, чтобы работало
       нажатие, — отличает их `direct_ai_written`. */
    title: 'Доходимость до Telegram по форме доставки',
    sql: `select case
                   when e.direct_ai_written then 'ИИ, без ссылки в 1-м'
                   when e.experiment_variant = 'quick_reply' then 'quick reply (шаблон)'
                   when e.experiment_variant = 'profile_link' then 'ссылка в шапке'
                   when e.experiment_variant = 'control' then 'control (ссылка сразу)'
                   else 'без A/B'
                 end as форма,
                 count(*) as ушло_в_direct,
                 count(*) filter (
                   where exists (select 1 from telegram_subscribers s
                                 where s.automation_event_id = e.id)
                 ) as дошло_до_telegram
          from instagram_automation_events e
          where e.dm_status = 'sent' and e.created_at > ${since}
          group by 1 order by 2 desc;`,
  },
  {
    /*
      Сравнивать плечи можно только там, где они работали в одни и те же
      дни. Панель в интерфейсе этого не делает и однажды уже показала
      победителем плечо, набравшее объём после починки воронки, против
      плеча, работавшего во время поломки.
    */
    title: 'A/B на общих днях (только там, где работали все плечи)',
    sql: `with days as (
            select created_at::date as d
            from instagram_automation_events
            where experiment_variant is not null and dm_status = 'sent'
            group by 1
            having count(distinct experiment_variant) >= 2
          )
          select e.experiment_variant as плечо,
                 count(*) as доставок,
                 count(*) filter (
                   where exists (select 1 from telegram_subscribers s
                                 where s.automation_event_id = e.id)
                 ) as дошло,
                 round(100.0 * count(*) filter (
                   where exists (select 1 from telegram_subscribers s
                                 where s.automation_event_id = e.id)
                 ) / nullif(count(*), 0), 1) as процент,
                 count(distinct e.created_at::date) as дней
          from instagram_automation_events e
          join days on days.d = e.created_at::date
          where e.dm_status = 'sent' and e.experiment_variant is not null
          group by 1 order by 4 desc nulls last;`,
  },
  {
    /*
      Плечо profile_link отправляет в шапку профиля, а та ссылка одна на
      всех и метки события не несёт — его подписчики приходят сюда, а не в
      своё плечо. Прямой конверсии у него не будет по построению; читать
      его можно только по движению этой строки.
    */
    title: 'Приходы в бот без метки события (шапка профиля и прочие ссылки)',
    sql: `select created_at::date as день,
                 count(*) filter (where automation_event_id is null) as без_метки,
                 count(*) filter (where automation_event_id is not null) as из_direct,
                 count(*) as всего
          from telegram_subscribers
          where created_at > now() - interval '10 days'
          group by 1 order by 1 desc;`,
  },
  {
    title: 'Ошибки',
    sql: `select error_message, count(*), max(created_at) as последняя
          from instagram_automation_events
          where error_message is not null and created_at > ${since}
          group by 1 order by 2 desc limit 10;`,
  },
  {
    /* Имя подставляется только тем, чей профиль воркер успел прочитать, и
       кэширует он их сюда же — так что рост таблицы показывает, что
       обращение по имени вообще включилось в работу. */
    title: 'Контакты для обращения по имени',
    sql: `select count(*) as всего,
                 count(*) filter (where updated_at > ${since}) as добавлено_за_период,
                 count(display_name) as с_именем
          from instagram_contacts;`,
  },
  {
    title: 'Настройки, которые уже ломали воронку',
    sql: `select title,
                 public_reply_enabled as публичный_ответ,
                 ab_quick_reply_percent as ab_кнопка,
                 ab_profile_reply_percent as ab_профиль,
                 100 - ab_quick_reply_percent - ab_profile_reply_percent as контрольная_доля,
                 direct_ai_personalize as ии_пишет_direct,
                 array_length(keywords, 1) as ключевых_слов
          from lead_magnets where is_active;`,
  },
];

console.log(`\nВоронка Instagram — отчёт за ${HOURS} ч (проект ${PROJECT_REF})\n`);

let failed = false;
for (const section of sections) {
  console.log(`\n### ${section.title}`);
  try {
    console.log(table(await query(section.sql)));
  } catch (error) {
    failed = true;
    console.log(`  Не удалось получить: ${error.message}`);
  }
}

console.log(`
### На что смотреть
  - «пропущено» в публичном ответе при включённом тумблере — ответы снова молчат.
  - Сравнивать плечи ТОЛЬКО по таблице «A/B на общих днях». Первая таблица по
    формам смешивает разные периоды и вводит в заблуждение.
  - «ОПЕЧАТКА в кодовом слове» — потерянные лиды, лечится ключевыми словами.
  - «добавлено_за_период» = 0 при новых комментариях — имя не подставляется.
  - У profile_link прямая конверсия будет около нуля по построению: его люди
    приходят без метки. Смотри вместо неё строку «без_метки» по дням.
  - Итог воронки за день — это «всего» в той же таблице, а не проценты плеч.
`);

process.exit(failed ? 1 : 0);
