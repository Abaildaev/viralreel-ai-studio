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
    'family=Roboto:wght@300;400;500;700',
    'family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900',
    'family=M+PLUS+1p:wght@100;300;400;500;700',
    'family=Noto+Serif:ital,wght@0,400;0,700;1,400;1,700',
  ].join('&') +
  '&display=swap';

const LINK_ID = 'reel-render-fonts';

let loadPromise: Promise<void> | null = null;

/**
 * Injects the render-only webfonts and resolves once the browser reports every
 * face ready, so a canvas draw never lands on a fallback family.
 */
export function ensureRenderFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve) => {
    let link = document.getElementById(LINK_ID) as HTMLLinkElement | null;

    if (!link) {
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      link.href = RENDER_FONTS_HREF;
      document.head.appendChild(link);
    }

    const settle = () => {
      // `fonts.ready` only settles once the newly linked faces are accounted
      // for, so it has to be awaited after the stylesheet lands — not before.
      if (document.fonts?.ready) {
        document.fonts.ready.then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };

    if (link.sheet) {
      settle();
      return;
    }

    link.addEventListener('load', settle, { once: true });
    // A blocked or offline font CDN must not stall a render.
    link.addEventListener('error', () => resolve(), { once: true });
  });

  return loadPromise;
}
