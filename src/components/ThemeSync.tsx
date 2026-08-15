'use client';

import { useEffect } from 'react';
import { applyStoredTheme } from '@/lib/ui/theme';

/**
 * Keeps `<html>` on the stored appearance for as long as the page is open.
 *
 * The blocking script in the document has already run by the time this mounts;
 * this is for what happens afterwards — an OS that goes dark at sunset under a
 * listener who never picked a side. It re-reads the stored choice on every
 * change rather than remembering one, so the answer can't be a preference the
 * listener has since told us to stop following.
 *
 * Rendering nothing is the point: an appearance that depended on where it sat
 * in the tree would be one more thing to get right on a new page.
 */
export function ThemeSync() {
  useEffect(() => {
    // The document and React have both had a go at the class attribute by now;
    // this is the cheap way to be sure they agreed.
    applyStoredTheme();

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyStoredTheme();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return null;
}
