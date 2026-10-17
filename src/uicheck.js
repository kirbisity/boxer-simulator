// A dev tool for the menus and the fight's buttons: is every control on
// the screen big enough for a finger, inside the window, and not covered by
// anything (the fight's surface, a banner, another button)? Run it from the
// console as boxer.checkButtons(). The judging is plain data (tested in
// Node); checkButtons measures the page and hands it over.

export const UI_CHECK = {
  // px: the smaller side of a control at least this (a fingertip).
  minSize: 44,
  // px of slack for rounding.
  slack: 0.5,
  // What counts as a control.
  selector: 'button, a[href], select, input:not([type="hidden"]), [role="button"]',
  // Below this opacity a control is not shown, and not judged.
  faint: 0.05,
};

/**
 * Judge controls. Each target: { name, rect: { left, top, width, height }
 * (the control's own box), hit (whether a press at the centre of its shown
 * part reaches it), cover (what is there instead, if not), small (true:
 * allowed to be smaller, a named exception) }. `viewport`: { width, height }.
 * Returns the targets with a `problems` list each (empty when it passes).
 */
export function auditTargets(targets, viewport, { minSize = UI_CHECK.minSize, slack = UI_CHECK.slack } = {}) {
  return targets.map((target) => {
    const { left, top, width, height } = target.rect;
    const problems = [];
    if (!target.small && Math.min(width, height) < minSize - slack) problems.push(`small ${Math.round(width)}×${Math.round(height)}`);
    if (left < -slack || top < -slack || left + width > viewport.width + slack || top + height > viewport.height + slack) problems.push('outside the window');
    if (!target.hit) problems.push(`covered${target.cover ? ` by ${target.cover}` : ''}`);
    return { ...target, problems };
  });
}

/** A short name for an element: its id, its words, its label, or its class. */
function controlName(node) {
  if (!node) return '';
  const words = (node.getAttribute?.('aria-label') || node.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 32);
  return [node.id ? `#${node.id}` : `${node.tagName?.toLowerCase()}${node.classList?.[0] ? `.${node.classList[0]}` : ''}`, words && `“${words}”`].filter(Boolean).join(' ');
}

/** The part of an element its clipping ancestors and the window let show. */
function controlShownRect(node) {
  let { left, top, right, bottom } = node.getBoundingClientRect();
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const box = parent.getBoundingClientRect();
    left = Math.max(left, box.left);
    top = Math.max(top, box.top);
    right = Math.min(right, box.right);
    bottom = Math.min(bottom, box.bottom);
  }
  left = Math.max(left, 0);
  top = Math.max(top, 0);
  right = Math.min(right, innerWidth);
  bottom = Math.min(bottom, innerHeight);
  return right - left > 1 && bottom - top > 1 ? { left, top, right, bottom } : null;
}

/** Shown at all: laid out, not hidden, not faded out (with its ancestors). */
function controlShown(node) {
  if (node.checkVisibility && !node.checkVisibility({ checkOpacity: false, checkVisibilityCSS: true })) return false;
  const box = node.getBoundingClientRect();
  if (box.width < 1 || box.height < 1) return false;
  let opacity = 1;
  for (let at = node; at && at !== document.documentElement; at = at.parentElement) opacity *= Number(getComputedStyle(at).opacity);
  return opacity >= UI_CHECK.faint;
}

/** Whether a press at the middle of the shown part of a control reaches it (it, or something inside it, is on top there). */
function pressReaches(node, part) {
  const top = document.elementFromPoint((part.left + part.right) / 2, (part.top + part.bottom) / 2);
  return Boolean(top && (top === node || node.contains(top)));
}

/** The nearest ancestor that scrolls, if any. */
function controlScroller(node) {
  for (let parent = node.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (/(auto|scroll)/.test(style.overflowY + style.overflowX) && (parent.scrollHeight > parent.clientHeight + 1 || parent.scrollWidth > parent.clientWidth + 1)) return parent;
  }
  return null;
}

/**
 * Every control shown on the page now, measured and judged. A control in a
 * scrolling list that is scrolled away is brought into view to be judged
 * (to the middle, clear of anything pinned at its edges; the lists put back after). Marked `data-small-ok` = an allowed
 * exception to the size. Logs a table; returns { size, total, failures, results }.
 */
export function checkButtons({ log = true } = {}) {
  const scrolled = new Map();
  const targets = [];
  for (const node of document.querySelectorAll(UI_CHECK.selector)) {
    if (node.closest('[inert]') || !controlShown(node)) continue;
    const list = controlScroller(node);
    let note = '';
    const bringIntoView = () => {
      if (!scrolled.has(list)) scrolled.set(list, [list.scrollLeft, list.scrollTop]);
      node.scrollIntoView({ block: 'center', inline: 'center' });
      note = 'scrolled to';
    };
    let part = controlShownRect(node);
    if (list && (!part || part.bottom - part.top < node.getBoundingClientRect().height - 1)) {
      bringIntoView();
      part = controlShownRect(node);
    }
    if (!part) continue;
    let hit = pressReaches(node, part);
    // In a scrolling list, under something pinned at its edge (a sticky button): judged where scrolling brings it.
    if (!hit && list && !note) {
      bringIntoView();
      part = controlShownRect(node) ?? part;
      hit = pressReaches(node, part);
    }
    const box = node.getBoundingClientRect();
    const top = hit ? null : document.elementFromPoint((part.left + part.right) / 2, (part.top + part.bottom) / 2);
    targets.push({
      name: controlName(node), note, small: node.closest('[data-small-ok]') !== null,
      rect: { left: box.left, top: box.top, width: box.width, height: box.height },
      hit, cover: hit ? '' : controlName(top),
    });
  }
  for (const [list, [left, top]] of scrolled) list.scrollTo(left, top);
  const results = auditTargets(targets, { width: innerWidth, height: innerHeight });
  const failures = results.filter((result) => result.problems.length);
  const report = { size: `${innerWidth}×${innerHeight}`, total: results.length, failures: failures.map(({ name, problems }) => `${name}: ${problems.join(', ')}`), results };
  if (log) {
    console.log(`checkButtons ${report.size}: ${results.length} controls, ${failures.length} failing`);
    if (failures.length) console.table(failures.map(({ name, problems }) => ({ name, problems: problems.join(', ') })));
  }
  return report;
}
