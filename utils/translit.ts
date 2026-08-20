/**
 * Cyrillic to Latin, for the two places a Russian string has to survive as
 * ASCII: a deep-link slug and a storage object key.
 *
 * Both would otherwise reduce a perfectly good name to a row of dashes — and
 * in the storage case the key is what Telegram shows as the filename of a
 * document, so «Чеклист.pdf» becoming «-------.pdf» is visible to the reader.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch', ы: 'y', э: 'e',
  ю: 'yu', я: 'ya', ь: '', ъ: '',
};

export function transliterate(value: string): string {
  return value
    .toLowerCase()
    .split('')
    .map((character) => TRANSLIT[character] ?? character)
    .join('');
}
