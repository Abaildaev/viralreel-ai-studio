import { useCallback, useEffect, useState } from 'react';
import { AppView } from '../types';

/*
  Which section is open, kept in the URL.

  The app had this in component state, which meant every section shared one
  address: no link could point at the scheduler, a reload always landed back on
  the generator, and the browser's back button left the app entirely instead of
  going back a step. With twelve sections that stopped being a small annoyance.

  Hash routing rather than paths, deliberately. Path routing on a single-page
  app needs the host to rewrite every unknown URL to index.html — one more piece
  of Firebase configuration to keep in sync, and a 404 for anyone who deploys
  without it. A hash never reaches the server, so deep links work wherever the
  bundle is served from.
*/

const VIEWS: AppView[] = [
  'generator',
  'automations',
  'telegram',
  'scheduler',
  'budget',
  'aishowcase',
  'templates',
  'batch',
  'history',
  'audio',
  'accounts',
  'settings',
];

const DEFAULT_VIEW: AppView = 'generator';

function isAppView(value: string): value is AppView {
  return (VIEWS as string[]).includes(value);
}

/**
 * Reads the section out of an address, falling back to the default.
 *
 * Split out from the hook and exported so it can be tested without a DOM: this
 * is the part with actual rules — tolerating a missing hash, a stale link to a
 * section that no longer exists, and the `#/name` and `#name` spellings that
 * both occur in hand-typed URLs.
 */
export function parseView(hash: string): AppView {
  const raw = hash.replace(/^#\/?/, '').trim().toLowerCase();
  return isAppView(raw) ? raw : DEFAULT_VIEW;
}

function viewFromHash(): AppView {
  return parseView(window.location.hash);
}

export interface AppRoute {
  view: AppView;
  navigate: (view: AppView) => void;
}

/**
 * Two-way binding between the open section and the address bar.
 *
 * `hashchange` covers both the back button and a hand-edited URL, so there is
 * no separate "the user pressed back" path to get wrong — every change of
 * section, whoever caused it, arrives through the same event.
 */
export function useAppView(): AppRoute {
  const [view, setView] = useState<AppView>(() => viewFromHash());

  useEffect(() => {
    const onHashChange = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  /* An address with no hash is normalised once, so the first section the reader
     sees is linkable without them having navigated anywhere. */
  useEffect(() => {
    if (!window.location.hash) {
      window.history.replaceState(null, '', `#/${DEFAULT_VIEW}`);
    }
  }, []);

  const navigate = useCallback((next: AppView) => {
    if (next === viewFromHash()) return;
    // Assigning the hash pushes a history entry, which is what makes the back
    // button step through sections instead of leaving the app.
    window.location.hash = `#/${next}`;
  }, []);

  return { view, navigate };
}

export default useAppView;
