/*
  Обращение по имени — там, где имя действительно есть.

  Instagram отдаёт поле `name`, но оно не обязано быть именем: рядом с «Кирилл
  Селиверстов» в тех же данных лежат «officiant», «ylua» и «𝓐𝓭𝓪𝓶 𝓓𝓸𝓻𝓸𝓯𝔂».
  Подставить такое в приветствие хуже, чем не обращаться вовсе: «Привет,
  officiant!» читается как рассылка, а математический юникод у части людей
  превращается в квадраты.

  Поэтому имя проходит проверку, а текст написан так, чтобы одинаково хорошо
  звучать с обращением и без него.
*/

const PLACEHOLDER = /\{имя\}/g;

/* Эмодзи, вариационные селекторы и знаки нулевой ширины — до разбора на слова. */
const DECORATION = /[\p{Extended_Pictographic}\uFE0F\u200B-\u200D\u2060]/gu;

/*
  Кириллица и латиница, названные диапазонами, а не свойством `\p{Lu}`.

  Свойство здесь не годится: «𝓐» из математического юникода — тоже заглавная
  буква, и проверка на `\p{Lu}\p{L}*` пропускала «𝓐𝓭𝓪𝓶» как имя. Диапазоны
  лежат в Latin-1 и кириллице, а математические символы живут от U+1D400 и
  выше, так что они отсекаются самой формой шаблона.
*/
const UPPER = "A-ZÀ-ÖØ-ÞА-ЯЁ";
const LOWER = "a-zß-öø-ÿа-яё";
const NAME_SHAPE = new RegExp(`^[${UPPER}][${UPPER}${LOWER}'’-]+$`, "u");

const MIN_NAME_CHARS = 2;
const MAX_NAME_CHARS = 20;

/**
 * Первое слово `display_name`, если оно похоже на имя. Иначе null.
 *
 * Заглавная буква — главный различитель: люди пишут имя с большой, а ник вроде
 * «officiant» приходит строчным. Правило грубое и намеренно осторожное: цена
 * пропущенного имени — обычное безличное приветствие, цена ложного — «Привет,
 * ylua» под постом, который видят все.
 */
export function resolveFirstName(
  displayName: string | null | undefined,
  username?: string | null,
): string | null {
  const cleaned = (displayName ?? "").replace(DECORATION, " ").trim();
  if (!cleaned) return null;

  const first = cleaned.split(/\s+/)[0]?.replace(/[.,!?;:]+$/u, "") ?? "";
  if (first.length < MIN_NAME_CHARS || first.length > MAX_NAME_CHARS) return null;
  if (!NAME_SHAPE.test(first)) return null;

  // Ник, записанный с большой буквы, остаётся ником.
  if (username && first.toLowerCase() === username.toLowerCase()) return null;

  return first;
}

/**
 * Подставляет имя в шаблон или убирает обращение вместе с его пунктуацией.
 *
 * Без второй половины плейсхолдер пришлось бы ставить только в конец фразы;
 * так его можно писать там, где обращение звучит естественно, и текст остаётся
 * читаемым, когда имени не нашлось.
 */
export function personalize(template: string, name: string | null): string {
  if (name) return template.replace(PLACEHOLDER, name);

  const stripped = template
    /* «Всё, {имя}, отправил» → «Всё, отправил» */
    .replace(/,\s*\{имя\}/g, "")
    /* «{имя}, лови» → «лови» */
    .replace(/\{имя\}\s*[,!]?\s*/g, "")
    .replace(/\{имя\}/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim();

  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
