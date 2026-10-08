// Inline the modules and stylesheet into one page for the hosted review copy.
// Usage: node tools/bundle.js [out.html]

import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

// In load order: a module's top-level code may use only what comes before it.
const MODULES = ['aging', 'outfits', 'physiology', 'body', 'pose', 'weapons', 'moves', 'life', 'physics/config', 'formation', 'handling', 'physics', 'physics/ranged', 'physics/grappling', 'physics/net', 'physics/whip', 'cast', 'ai', 'rig', 'bodymesh', 'loftbody', 'toon', 'netcloth', 'arenaview', 'soft', 'dangle', 'bones', 'face', 'wardrobe', 'crowdview', 'render', 'weaponview', 'drama', 'scenarios', 'ratings', 'roster', 'menu', 'main'];
const out = process.argv[2] ?? 'dist/gladiator.html';

const html = readFileSync('index.html', 'utf8');
const css = readFileSync('boxer.css', 'utf8');
const code = MODULES.map((name) => {
  const source = readFileSync(`src/${name}.js`, 'utf8');
  const stripped = source
    .replace(/^import [^;]+;\n/gm, '')
    // Re-exports (export { x } from './y.js') name what is already in the shared scope.
    .replace(/^export \{[^}]*\} from [^;]+;\n/gm, '')
    .replace(/^export (const|function|class|let) /gm, '$1 ');
  if (/^(import|export) /m.test(stripped)) throw new Error(`src/${name}.js: an import or export survived the bundling`);
  // Every local module imported must be on the list, or the page dies at load.
  for (const [, path] of source.matchAll(/from '(\.{1,2}\/[\w/-]+)\.js'/g)) {
    const imported = new URL(`${path}.js`, `file:///src/${name}.js`).pathname.replace(/^\/src\//, '').replace(/\.js$/, '');
    if (!MODULES.includes(imported)) throw new Error(`src/${name}.js imports ${imported}.js, which is not in MODULES`);
  }
  return `// ---- src/${name}.js ----\n${stripped}`;
}).join('\n');

// One shared scope: two modules declaring the same top-level name would
// stop the page with a SyntaxError, so refuse to write it.
const seen = new Map();
for (const name of MODULES) {
  const source = readFileSync(`src/${name}.js`, 'utf8');
  for (const [, identifier] of source.matchAll(/^(?:export )?(?:const|let|function|class) ([A-Za-z_$][\w$]*)/gm)) {
    if (seen.has(identifier)) throw new Error(`${identifier} is declared in both ${seen.get(identifier)} and ${name}`);
    seen.set(identifier, name);
  }
}

// The whole page must at least compile: a name declared twice inside a
// function stops it as surely as one at the top.
try {
  new vm.Script(code);
} catch (error) {
  throw new Error(`the bundled page does not compile: ${error.message}`);
}

const title = html.match(/<title>.*<\/title>/)[0];
const fonts = html.match(/<link rel="stylesheet" href="https:\/\/fonts[^>]+>/)[0];
const markup = html.match(/<main[\s\S]*<\/main>/)[0];
const three = html.match(/<script src="https:\/\/cdnjs[^>]+><\/script>/)[0];
const page = `${title}\n${fonts}\n<style>\n${css}</style>\n${markup}\n${three}\n<script type="module">\n${code}</script>\n`;
writeFileSync(out, page);
console.log(`${out}: ${(page.length / 1024).toFixed(0)} KB`);
