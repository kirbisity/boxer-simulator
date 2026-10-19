# Credits: skyball-photo scenery variant

Panoramas by Poly Haven (https://polyhaven.com/hdris), licence CC0 (public domain; https://polyhaven.com/license). The tonemapped 8K JPEGs were fetched from dl.polyhaven.org and cut by tools/skyball-photo-convert.py into a 4096-wide horizon band (−12° to +24°) and a 1024-wide sky cap (+20° to +90°), stored as base64 JPEG in src/scenery/skyball-photo-data.js.

| Asset | Source | Author | Licence | Used for |
|---|---|---|---|---|
| golden_gate_hills | https://polyhaven.com/a/golden_gate_hills | Dimitrios Savva, Jarod Guest | CC0 | meadow, field |
| drakensberg_solitary_mountain | https://polyhaven.com/a/drakensberg_solitary_mountain | Dimitrios Savva, Jarod Guest | CC0 | plain (far ranges; the volcanoes in front are generated) |
| alps_field | https://polyhaven.com/a/alps_field | Andreas Mischok | CC0 | sengoku |

# Credits: the photographic skies of Stage 1 (Dunnottar)

The sky of every look of the Dunnottar stage (src/levelmode/stagelooks.js `sky.photo`) is a real photograph, from Poly Haven HDRIs (https://polyhaven.com/hdris), licence CC0 (public domain; https://polyhaven.com/license). The 4K (storm) and 2K (fair weather) `.hdr` files were fetched from dl.polyhaven.org, tone-mapped and cut to the upper hemisphere (2048 x 512, equirectangular, JPEG) by tools/skyball-storm-convert.py, with the skyline of the two bridge panoramas (trees, roofs and cranes up to about 12 degrees) taken out by stretching the sky over it; the result is stored as base64 JPEG in src/levelmode/stormsky-data.js (about 380 KB all together). The looks then turn each picture so its bright break stands where the look's sun does and grade it (darker overhead, tinted); nothing is drawn onto it but the sun's glow.

| Id in the game | Asset | Source | Author | Licence | Used for |
|---|---|---|---|---|---|
| stormA | cedar_bridge_sunset_1 | https://polyhaven.com/a/cedar_bridge_sunset_1 | Dario Barresi | CC0 | Storm breaking (default), Supercell base (mirrored), Sun hole |
| stormB | cedar_bridge | https://polyhaven.com/a/cedar_bridge | Greg Zaal | CC0 | Squall line |
| dayClear | rustig_koppie_puresky | https://polyhaven.com/a/rustig_koppie_puresky | Greg Zaal (original), Jarod Guest (sky edits) | CC0 | Clear morning |
| dayNoon | kloofendal_43d_clear_puresky | https://polyhaven.com/a/kloofendal_43d_clear_puresky | Greg Zaal | CC0 | Bright noon |
| dayHaze | kloofendal_28d_misty_puresky | https://polyhaven.com/a/kloofendal_28d_misty_puresky | Greg Zaal (processing), Jenelle van Heerden (photography) | CC0 | Hazy summer morning |
| dayCloud | kloofendal_48d_partly_cloudy_puresky | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Greg Zaal (original), Jarod Guest (sky edits) | CC0 | Fair clouds |

To regenerate: download the `.hdr` files named above (4k for the two storm skies, 2k for the others) and run `python3 -I tools/skyball-storm-convert.py src/levelmode/stormsky-data.js stormA=... stormB=... dayClear=... dayNoon=... dayHaze=... dayCloud=...` from any other directory. The horizon colour of each look (`sky.horizon`, also its fog) is the graded picture's own horizon band: `photoHorizon` in src/levelmode/stagesky.js gives it and test/stagelooks.test.js checks it.
