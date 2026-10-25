import test from 'node:test';
import assert from 'node:assert/strict';

// The menu is built from the page's DOM; this is just enough of one for menu.js (elements that hold
// children, classes, text and clicks) and a THREE that answers anything, since render.js is imported.

function fakeDocument(ids) {
  const make = (tag) => {
    const node = {
      tag, children: [], className: '', hidden: false, dataset: {}, style: {}, onclick: null, textContent: '', parent: null,
      classList: { add(name) { node.className += ` ${name}`; }, remove() {}, contains: (name) => node.className.split(' ').includes(name) },
      append(...items) { for (const item of items) { if (item && typeof item === 'object') item.parent = node; node.children.push(item); } },
      replaceChildren(...items) { node.children = []; node.append(...items); },
      addEventListener() {},
      get parentElement() { return node.parent ?? node; },
      get text() { return [node.textContent, ...node.children.map((child) => child?.text ?? (typeof child === 'string' ? child : ''))].join(' '); },
      all(test, found = []) { if (test(node)) found.push(node); node.children.forEach((child) => child?.all?.(test, found)); return found; },
    };
    return node;
  };
  const byId = Object.fromEntries(ids.map((id) => [id, make('div')]));
  return { byId, document: { body: make('body'), createElement: make, getElementById: (id) => byId[id] } };
}

const stub = new Proxy(function stand() {}, { get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : stub), apply: () => stub, construct: () => stub });

async function withPage(run) {
  const kept = { THREE: globalThis.THREE, document: globalThis.document };
  const page = fakeDocument(['home', 'quick', 'levels-screen', 'stages-screen', 'versus', 'wizard', 'settings-screen']);
  globalThis.THREE = stub;
  globalThis.document = page.document;
  try {
    const { installMenus } = await import('../src/menu.js');
    await run(installMenus, page.byId);
  } finally {
    globalThis.THREE = kept.THREE;
    globalThis.document = kept.document;
  }
}

const cards = (root) => root.all((node) => node.tag === 'button' && node.children.some((child) => child.className === 'words'));
const titleOf = (button) => button.all((node) => node.tag === 'b')[0].textContent;
const cardTitled = (root, title) => cards(root).find((button) => titleOf(button) === title);

test('the home menu offers Battle Mode and Level Mode (no "Levels"), and Level Mode opens the stage list', async () => {
  await withPage((installMenus, byId) => {
    const started = [];
    const menus = installMenus({ onMenu() {}, attract() {}, onStage: (key) => started.push(key), level() {}, tutorial() {} });
    menus.home();
    const titles = cards(byId.home).map(titleOf);
    assert.deepEqual(titles, ['Career', 'Battle Mode', 'Level Mode', 'Deadliest Warrior', 'Quick Battle', 'Sandbox']);
    cardTitled(byId.home, 'Level Mode').onclick();
    assert.equal(byId['stages-screen'].hidden, false);
    assert.equal(byId.home.hidden, true);
    const stage1 = cardTitled(byId['stages-screen'], 'Stage 1 · Memories of Dunnottar');
    const stage2 = cardTitled(byId['stages-screen'], 'Stage 2 · Coming soon');
    assert.ok(stage1.onclick, 'Stage 1 is playable');
    assert.equal(stage2.onclick, null, 'Stage 2 is not open');
    assert.match(stage2.className, /soon/);
    stage1.onclick();
    assert.deepEqual(started, ['dunnottar']);
  });
});

test('Battle Mode keeps the tutorial and the historical battles', async () => {
  await withPage((installMenus, byId) => {
    const menus = installMenus({ onMenu() {}, attract() {}, level() {}, tutorial() {} });
    menus.home();
    cardTitled(byId.home, 'Battle Mode').onclick();
    assert.equal(byId['levels-screen'].hidden, false);
    const titles = cards(byId['levels-screen']).map(titleOf);
    assert.equal(titles[0], 'Tutorial');
    assert.ok(titles.length > 5, titles.join());
    assert.match(byId['levels-screen'].text, /Battle Mode/);
  });
});

test('an unwired stage hook breaks nothing', async () => {
  await withPage((installMenus, byId) => {
    const menus = installMenus({ onMenu() {}, attract() {} });
    menus.stages();
    const stage1 = cardTitled(byId['stages-screen'], 'Stage 1 · Memories of Dunnottar');
    assert.doesNotThrow(() => stage1.onclick());
    assert.equal(byId['stages-screen'].hidden, false, 'the stage list stays up when nothing can start the stage');
  });
});
