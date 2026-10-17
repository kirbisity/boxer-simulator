import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// GitHub Pages serves only what the workflow copies into _site. A stylesheet
// or script the page links to but the copy leaves out is a 404 on the live
// site and nowhere else (fightui.css was, in October 2026).
test('every local file index.html links to is copied by the Pages workflow', () => {
  const page = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const workflow = readFileSync(new URL('../.github/workflows/pages.yml', import.meta.url), 'utf8');
  const copy = workflow.match(/cp -R ([^\n]+) _site\//)?.[1].split(/\s+/) ?? [];
  assert.ok(copy.length, 'the workflow copies files into _site');
  const linked = [...page.matchAll(/(?:href|src)="([^"]+)"/g)].map((match) => match[1]).filter((path) => !/^(https?:|data:|#|\/\/)/.test(path));
  assert.ok(linked.length, 'the page links local files');
  for (const path of linked) {
    const top = path.replace(/^\.\//, '').split('/')[0];
    assert.ok(copy.includes(top), `${path} is linked from index.html but the Pages workflow does not copy ${top}`);
  }
});
