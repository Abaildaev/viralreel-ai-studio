/*
  The families in `FontFamily` (types.ts) exist only to be burned into rendered
  Reels. Loading all of them with the document cost every visitor several
  hundred kilobytes of blocking webfont before the first paint, on every page,
  including the ones that never render video.

  They are fetched on demand instead. Both the generator (on mount, to warm the
  cache while the user is still choosing settings) and the renderers themselves
  (as a guarantee) call this; it is idempotent and safe to call anywhere.
*/

const RENDER_FONTS_HREF =
  'https://fonts.googleapis.com/css2?' +
  [
    'family=Inter:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400',
    'family=Roboto:wght@300;400;500;700',
    'family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900',
    'family=M+PLUS+1p:wght@100;300;400;500;700',
    'family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700',
    'family=Playfair+Display:ital,wght@0,400;0,700;0,900;1,400;1,700;1,900',
    'family=Prata',
    'family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400;1,600',
    'family=Unbounded:wght@400;600;700;800',
    'family=Manrope:wght@400;500;600;700;800',
    'family=Pacifico',
    'family=Style+Script',
    'family=Parisienne',
    'family=Marck+Script',
    'family=Bad+Script',
    'family=Dancing+Script:wght@400;700',
    'family=Great+Vibes',
    'family=Caveat:wght@400;700',
    'family=Grenze+Gotisch:wght@700',
    'family=Oswald:wght@700',
    'family=Roboto+Mono:wght@400;500',
  ].join('&') +
  '&display=swap';

const LINK_ID = 'reel-render-fonts';

/*
  Attaching the stylesheet is not enough. A `@font-face` is fetched lazily, only
  once something actually renders text in it, and `document.fonts.ready` waits
  only on downloads already in flight — so it resolves immediately here and
  reports success while every face is still missing. A canvas draw would then
  silently fall back to a system font and the mistake would surface only on the
  finished video.

  Each face therefore has to be requested explicitly. `Georgia` is absent on
  purpose: it resolves to a local family and has nothing to download.
*/
const FACES_TO_LOAD: string[] = [
  ...['300', '400', '500', '600', '700'].map((w) => `${w} 40px "Inter"`),
  ...['300', '400'].map((w) => `italic ${w} 40px "Inter"`),
  ...['300', '400', '500', '700'].map((w) => `${w} 40px "Roboto"`),
  ...['300', '400', '700', '900'].flatMap((w) => [
    `${w} 40px "Merriweather"`,
    `italic ${w} 40px "Merriweather"`,
  ]),
  ...['100', '300', '400', '500', '700'].map((w) => `${w} 40px "M PLUS 1p"`),
  ...['400', '700'].flatMap((w) => [
    `${w} 40px "Noto Serif"`,
    `italic ${w} 40px "Noto Serif"`,
  ]),
  ...['400', '700'].flatMap((w) => [
    `${w} 40px "Playfair Display"`,
    `italic ${w} 40px "Playfair Display"`,
  ]),
  '400 40px "Prata"',
  ...['400', '600', '700'].map((w) => `${w} 40px "Cormorant Garamond"`),
  ...['400', '600', '700', '800'].map((w) => `${w} 40px "Unbounded"`),
  ...['400', '500', '700', '800'].map((w) => `${w} 40px "Manrope"`),
  '400 40px "Pacifico"',
  '400 40px "Style Script"',
  '400 40px "Parisienne"',
  '400 40px "Marck Script"',
  '400 40px "Bad Script"',
  '400 40px "Dancing Script"',
  '700 40px "Dancing Script"',
  '400 40px "Great Vibes"',
  '700 40px "Caveat"',
  '700 40px "Oswald"',
  ...['400', '500'].map((w) => `${w} 40px "Roboto Mono"`),
];

/*
  Faces with no cyrillic subset at all.

  `document.fonts.load` filters the faces it fetches by the unicode-range of
  the sample text, so asking for a latin-only family with the bilingual
  sample below matches nothing and quietly downloads nothing — the same
  silent fallback the sample was introduced to prevent, in reverse. These
  are requested with latin text instead; a Russian word set in them lands on
  the next family in the stack by design.
*/
const LATIN_ONLY_FACES: string[] = [
  '700 40px "Grenze Gotisch"',
];

const LATIN_SAMPLE = 'Sample BESbswy 0123';

/*
  Google serves each family as several @font-face rules split by
  unicode-range, and `document.fonts.load(font)` only fetches the subsets its
  sample text needs — the default sample is "BESbswy", pure latin. A canvas
  drawing Russian text then lands on a fallback family while the cyrillic
  subset is still unrequested. The sample below spans both scripts so every
  subset a reel might use is downloaded before the render starts.
*/
const LOAD_SAMPLE = 'Пример текста BESbswy 0123';

let loadPromise: Promise<void> | null = null;

function attachStylesheet(): Promise<void> {
  return new Promise<void>((resolve) => {
    const existing = document.getElementById(LINK_ID) as HTMLLinkElement | null;
    if (existing?.sheet) {
      resolve();
      return;
    }

    const link = existing ?? document.createElement('link');
    if (!existing) {
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      link.href = RENDER_FONTS_HREF;
      document.head.appendChild(link);
    }

    link.addEventListener('load', () => resolve(), { once: true });
    // A blocked or offline font CDN must not stall a render.
    link.addEventListener('error', () => resolve(), { once: true });
  });
}

/**
 * Injects the render-only webfonts and resolves once every face has actually
 * been downloaded, so a canvas draw never lands on a fallback family.
 *
 * Individual failures resolve rather than reject: a missing face degrades one
 * typeface choice, while a rejection would abort the whole render.
 */
export function ensureRenderFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = attachStylesheet()
    .then(() =>
      Promise.all([
        ...FACES_TO_LOAD.map((face) =>
          document.fonts.load(face, LOAD_SAMPLE).catch(() => undefined),
        ),
        ...LATIN_ONLY_FACES.map((face) =>
          document.fonts.load(face, LATIN_SAMPLE).catch(() => undefined),
        ),
      ]),
    )
    .then(() => undefined);

  return loadPromise;
}
