import { openTab } from './cdp.mjs';
const tab = await openTab(9336, 'http://127.0.0.1:8989/index.html');
const code = process.argv[2];
console.log(JSON.stringify(await tab.evaluate(code)));
console.log('ERRS', JSON.stringify(tab.errs));
await tab.close();
