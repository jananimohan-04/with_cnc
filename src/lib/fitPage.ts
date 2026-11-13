import { useEffect, type RefObject } from 'react';

/**
 * Every page fills the screen exactly, at every Display Size (50% – 145%), on a computer screen:
 *  1. the scaled page area is always exactly as tall as the visible area (no empty band under a page);
 *  2. the main list table of the page takes the room that is left: its rows scroll inside it (headings stay visible),
 *     so the page itself does not scroll down. Short tables keep their natural height.
 * A page whose other content is taller than the screen (a long form, say) still scrolls, nothing is cut off.
 * Phones keep normal page scrolling.
 *
 * `main` is the scrolling <main>; `page` is the scaled (CSS zoom) box inside it; `scale` = display size / 100.
 */
export function useFitPage(main: RefObject<HTMLElement | null>, page: RefObject<HTMLElement | null>, scale: number, routeKey: string) {
  useEffect(() => {
    const m = main.current;
    const p = page.current;
    if (!m || !p) return;
    const desktop = window.matchMedia('(min-width: 1024px)');
    let frame = 0;

    const release = () => m.querySelectorAll<HTMLElement>('[data-fit-table]').forEach((el) => { el.style.maxHeight = ''; el.style.overflowY = ''; delete el.dataset.fitTable; });

    const fit = () => {
      frame = 0;
      // 1. the page area is exactly the visible height (in the page's own, unscaled pixels)
      p.style.minHeight = `${m.clientHeight / scale}px`;
      release();
      if (!desktop.matches) return;

      // 2. the biggest list table on the page (not in a popup) takes the room that is left
      //    (the box a table sits in; tables inside another table or inside a popup are left alone)
      const boxes = [...m.querySelectorAll<HTMLTableElement>('table')]
        .map((t) => t.parentElement)
        .filter((el): el is HTMLElement => !!el && el !== p && !el.closest('table, [role="dialog"], .fixed') && el.offsetParent !== null);
      if (!boxes.length) return;
      const box = boxes.reduce((a, b) => (b.scrollHeight > a.scrollHeight ? b : a));
      box.dataset.fitTable = '1';
      box.style.overflowY = 'auto';                              // the rows scroll inside the box
      box.style.maxHeight = 'none';                              // its full height first...
      const over = m.scrollHeight - m.clientHeight;              // ...then how far the page now runs past the screen
      if (over > 1) {
        const visible = box.getBoundingClientRect().height - over;   // on-screen pixels the table may use
        box.style.maxHeight = `${Math.max(160, Math.floor(visible / scale))}px`;
      }
    };
    const later = () => { if (!frame) frame = requestAnimationFrame(fit); };

    fit();
    const t = window.setTimeout(later, 400);                     // after the page's data has arrived
    const grow = new ResizeObserver(later);
    grow.observe(m);
    const change = new MutationObserver(later);                  // rows loaded, filters, pages, tabs...
    change.observe(p, { childList: true, subtree: true });
    window.addEventListener('resize', later);
    desktop.addEventListener('change', later);
    return () => {
      window.clearTimeout(t);
      if (frame) cancelAnimationFrame(frame);
      grow.disconnect();
      change.disconnect();
      window.removeEventListener('resize', later);
      desktop.removeEventListener('change', later);
      release();
    };
  }, [main, page, scale, routeKey]);
}
