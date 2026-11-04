// BLD-03 (Astra builds audit): a promoter with an open EventForm or unsaved builder / listing edits could click
// "Back to My Meets", any header link, or reload, and the draft vanished without a word. The tab guard only covered
// the editor's own tabs. This guard covers the rest:
//   - `beforeunload` puts up the browser's leave dialog on reload, tab close and typed URLs;
//   - a capture-phase click listener on the document asks before any in-app link leaves the current page. Next's
//     <Link> checks `defaultPrevented` before it routes, so cancelling here stops the navigation.
// The browser back button is not intercepted: the App Router has no cancellable popstate, and faking one with a pushed
// history entry breaks the back stack. Reload and link clicks were the two cases the audit saw lose a draft.
'use client';

import { useEffect } from 'react';

export const LEAVE_MESSAGE = 'You have unsaved changes on this meet. Leave and lose them?';

export interface LinkClickInfo {
  href: string | null;          // the anchor's resolved href (absolute) or null when the click was not on a link
  target: string | null;
  currentHref: string;          // window.location.href
  modifier: boolean;            // ctrl / meta / shift / alt, or a non-primary button: the page stays, no dialog
  download: boolean;
}

/** True when a click would navigate this tab away from the current page. Pure, so it is unit-tested. */
export function leavesPage(info: LinkClickInfo): boolean {
  if (!info.href || info.modifier || info.download) return false;
  if (info.target && info.target !== '_self') return false;
  let next: URL; let here: URL;
  try { next = new URL(info.href, info.currentHref); here = new URL(info.currentHref); } catch { return false; }
  if (next.protocol === 'mailto:' || next.protocol === 'tel:' || next.protocol === 'javascript:') return false;
  if (next.origin !== here.origin) return true;
  // same page, different hash: not a navigation
  return next.pathname !== here.pathname || next.search !== here.search;
}

export function infoFromClick(e: MouseEvent): LinkClickInfo {
  const el = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
  return {
    href: el ? el.href : null,
    target: el?.getAttribute('target') ?? null,
    currentHref: window.location.href,
    modifier: e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey,
    download: !!el?.hasAttribute('download'),
  };
}

/** While `active`, reloads and in-app link clicks ask before leaving. `confirmFn` is injectable for tests. */
export function useUnsavedGuard(active: boolean, confirmFn: (msg: string) => boolean = (m) => window.confirm(m)): void {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented) return;
      if (!leavesPage(infoFromClick(e))) return;
      if (!confirmFn(LEAVE_MESSAGE)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClick, true);
    };
  }, [active, confirmFn]);
}
