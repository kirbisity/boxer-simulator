#!/bin/bash
# (tools/uikit/: droppable.) The interface tests: the ones that read the markup, the style sheets or the interface modules.
# On main at 30ec269 two of these fail already (test/overdraft.test.js, tests 96 and 109): 124 tests, 122 pass.
cd "$(dirname "$0")/../.." || exit 1
node --test test/deploy.test.js test/i18n.test.js test/jumpcrawlui.test.js test/attempts.test.js test/camtuner.test.js test/controls.test.js test/fightui.test.js test/i18n-names.test.js test/intro.test.js test/lastgateposter.test.js test/levelflow.test.js test/levelmode-ui.test.js test/overdraft.test.js test/pickgroups.test.js test/tapdirection.test.js test/ui.test.js test/banners.test.js test/drama.test.js 2>&1
