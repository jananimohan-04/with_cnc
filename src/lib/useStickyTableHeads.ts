import { useEffect, type RefObject } from 'react';

/**
 * Keeps every table's column headings (Company ID, Company, Address ...) visible while its rows scroll.
 *
 * A heading can only stick if no wrapper between it and the scrolling area clips the table in a way that blocks it, so
 * for each table on the page this makes the wrapper cooperate:
 *  - a wrapper that only hides overflow (rounded cards) becomes `overflow: clip`, which looks the same but lets the
 *    heading stick;
 *  - the box that scrolls the table sideways is given a height that ends at the bottom of the screen, so a long table
 *    scrolls its rows inside that box under the pinned heading. A short table is not affected.
 */
export function useStickyTableHeads(ref: RefObject<HTMLElement | null>, routeKey: string) {
  useEffect(() => {
    const main = ref.current;
    if (!main) return;
    let frame = 0;
    const scrollers = new Set<HTMLElement>();

    const prepare = (table: HTMLTableElement) => {
      if (table.dataset.stickyHead === '1' || !table.tHead || table.closest('[role="dialog"], .fixed')) return;
      table.dataset.stickyHead = '1';
      let scroller: HTMLElement | null = null;
      for (let a = table.parentElement; a && a !== main; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if (cs.overflowX === 'hidden' && cs.overflowY === 'hidden') { a.style.overflow = 'clip'; continue; }
        if (!scroller && (cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflowX === 'auto' || cs.overflowX === 'scroll')) scroller = a;
      }
      // a box that already has its own height limit keeps it (its heading sticks inside it)
      if (scroller && getComputedStyle(scroller).maxHeight === 'none' && !scroller.style.height && !scroller.dataset.fixedBox) {
        scroller.dataset.stickyBox = '1';
        scroller.style.overflowY = 'auto';
        scrollers.add(scroller);
      }
    };

    const sizeBoxes = () => {
      const mr = main.getBoundingClientRect();
      scrollers.forEach(box => {
        if (!box.isConnected) { scrollers.delete(box); return; }
        const top = box.getBoundingClientRect().top - mr.top; // distance from the top of the visible area
        // leave room under the table for its footer (page size / pagination) and the page padding
        box.style.maxHeight = `${Math.max(300, Math.round(main.clientHeight - Math.max(top, 0) - 90))}px`;
      });
    };

    const apply = () => {
      frame = 0;
      main.querySelectorAll('table').forEach(t => prepare(t as HTMLTableElement));
      sizeBoxes();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply); };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(main, { childList: true, subtree: true });
    window.addEventListener('resize', schedule);
    return () => { observer.disconnect(); window.removeEventListener('resize', schedule); if (frame) cancelAnimationFrame(frame); };
  }, [ref, routeKey]);
}
