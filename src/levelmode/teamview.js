// Level mode, the team on the screen (styled under "Level Mode: the team" in fightui.css): a panel above the player's card with each
// comrade's name and health (a fallen one struck through), and over the head of each living comrade within TEAM.markerRange a
// soft green pip with his name, so that the friends are plain at a glance. Plain DOM over the fight; what it shows is team.js's.

import { P } from '../body.js';
import { TEAM, teamStatus } from './team.js';
import { levelOf } from './items.js';

const teamElement = (tag, className, html = '') => Object.assign(document.createElement(tag), { className, innerHTML: html });

/** Over a head this much higher than the head's own point (m), and no nearer than this to the camera before the pip is hidden (m). */
const PIP = { lift: 0.38, behind: 0.3 };

/**
 * The team's panel and pips, in `root` (the fight's own layer: they show only while the fight does). `hooks`: world(), active(),
 * camera() (the three.js camera). Returns { update, reset, destroy }.
 */
export function createTeamView(root, hooks) {
  const panel = root.appendChild(teamElement('div', 'lv-team'));
  panel.hidden = true;
  const pips = root.appendChild(teamElement('div', 'lv-pips'));
  const rows = new Map();
  const tags = new Map();
  const point = new THREE.Vector3();

  function row(entry) {
    let node = rows.get(entry.id);
    if (!node) {
      node = panel.appendChild(teamElement('div', 'lv-mate', '<i class="lv-dot"></i><b></b><span class="lv-mate-bar"><i></i></span>'));
      node.dataset.spawn = entry.spawn;
      node.querySelector('b').textContent = entry.name;
      rows.set(entry.id, node);
    }
    return node;
  }

  function tag(entry) {
    let node = tags.get(entry.id);
    if (!node) {
      node = pips.appendChild(teamElement('div', 'lv-pip', '<i></i><b></b>'));
      node.querySelector('b').textContent = entry.name;
      tags.set(entry.id, node);
    }
    return node;
  }

  function update() {
    const world = hooks.world();
    const on = hooks.active() && Boolean(levelOf(world));
    const team = on ? teamStatus(world) : [];
    panel.hidden = !team.length;
    if (!team.length) {
      for (const node of tags.values()) node.hidden = true;
      return;
    }
    const camera = hooks.camera?.();
    const box = root.getBoundingClientRect();
    for (const entry of team) {
      const node = row(entry);
      node.classList.toggle('fallen', !entry.alive);
      node.classList.toggle('fighting', entry.state === 'aggro');
      node.classList.toggle('down', entry.state === 'down');
      node.querySelector('.lv-mate-bar i').style.width = `${Math.round(entry.fraction * 100)}%`;
      const mark = tag(entry);
      let shown = false;
      if (entry.near && camera) {
        const fighter = world.fighters[entry.id];
        point.set(fighter.x[P.head * 3], fighter.x[P.head * 3 + 1] + PIP.lift, fighter.x[P.head * 3 + 2]);
        const far = camera.position.distanceTo(point);
        point.project(camera);
        shown = point.z < 1 && far > PIP.behind && Math.abs(point.x) < 1.1 && Math.abs(point.y) < 1.1;
        if (shown) {
          mark.style.transform = `translate(${((point.x + 1) / 2) * box.width}px, ${((1 - point.y) / 2) * box.height}px) translate(-50%, -100%)`;
          // Fades toward the edge of its range (nothing pops).
          mark.style.opacity = String(Math.min(1, (TEAM.markerRange - entry.distance) / 3));
          mark.classList.toggle('fighting', entry.state === 'aggro');
        }
      }
      mark.hidden = !shown;
    }
  }

  function reset() {
    panel.hidden = true;
    panel.replaceChildren();
    pips.replaceChildren();
    rows.clear();
    tags.clear();
  }

  return { update, reset, destroy: () => { panel.remove(); pips.remove(); } };
}
