// node bench.mjs <url> <level>: a battle entered and watched, its frame cost measured (ms a frame, averaged) twice.
import { openTab } from './cdp.mjs';
const [url, level = 'sarhu'] = process.argv.slice(2);
const tab = await openTab(9336, url);
const out = await tab.evaluate(`(() => { boxer.skipIntro(); boxer.adaptiveResolution(false); boxer.enterLevel(${JSON.stringify(level)}, 'watch'); boxer.finishBuilding(); boxer.finishSkins?.(); boxer.playFrames(30); boxer.finishBuilding(); boxer.finishSkins?.(); boxer.bench(30); return [boxer.bench(120), boxer.bench(120)]; })()`);
console.log(url, level, JSON.stringify(out));
console.log('ERRS', JSON.stringify(tab.errs));
await tab.close();
