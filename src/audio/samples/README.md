# Recorded sound effects

Cut from the user's screen recordings (2026-10-29 and 2026-10-30), each labelled on screen; a series of footsteps or hoofbeats is cut into one file per footfall. Each clip: mono, the transient at its start (the leading
silence trimmed; `trim` is how much of the labelled event's window came before it), its tail cut where it falls 45 dB under its peak
with a short fade, peak-normalised to -1 dBFS, MP3 32 kHz 40 kb/s. The game picks one take of a set at random, at the event's instant;
src/audio/sfx/sampled.js sets its loudness, length and pitch from the event. tools/bundle.js embeds them in the single-file page.

113 files, 295 KB in all.

139 files, 426 KB in all (the cries and the charge: 35 files, 170 KB).

174 files, 746 KB in all, the three ambience loops among them (the fifth batch and its derived variants: 23 files, 56 KB).

198 files, 817 KB in all (the sixth batch: 24 files, 72 KB).

| File | Source recording | Time (s) | On-screen label | Trim (s) | Bytes | Used for |
|---|---|---|---|---|---|---|
| slice-1.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 0.359-1.109 | SLICE | 0.029 | 4140 | hit: a blade or point on flesh, padding or leather |
| slice-2.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 1.670-2.270 | SLICE | 0.050 | 3420 | hit: a blade or point on flesh, padding or leather |
| gore-1.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 3.615-4.465 | GOREY SLICE | 0.065 | 4680 | wound: cut |
| gore-2.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 4.974-5.824 | GOREY SLICE | 0.044 | 4680 | wound: cut |
| gore-3.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 6.156-6.906 | GOREY SLICE | 0.046 | 4140 | wound: cut |
| gore-4.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 7.335-8.035 | GOREY SLICE | 0.045 | 3960 | wound: cut |
| clash-1.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 9.858-10.240 | SWORD FIGHT | 0.058 | 2340 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| clash-2.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 10.273-10.873 | SWORD FIGHT | 0.033 | 3420 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| clash-3.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 11.190-11.540 | SWORD FIGHT | 0.040 | 2160 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| clash-4.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 11.754-12.354 | SWORD FIGHT | 0.034 | 3420 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| clash-5.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 12.719-13.080 | SWORD FIGHT | 0.039 | 2340 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| clash-6.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 13.119-13.619 | SWORD FIGHT | 0.039 | 2880 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| clash-7.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 13.757-14.357 | SWORD FIGHT | 0.037 | 3420 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| clash-8.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 14.555-15.355 | SWORD FIGHT | 0.035 | 4500 | clash: steel on steel (blade or weight; not a haft or wooden shield) |
| bonehit-1.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 16.588-17.188 | IMPACT WITH BONE | 0.038 | 3420 | hit: a blunt weapon on flesh, padding or leather |
| bonehit-2.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 17.962-18.562 | IMPACT WITH BONE | 0.042 | 3420 | hit: a blunt weapon on flesh, padding or leather |
| bonehit-3.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 19.154-19.654 | IMPACT WITH BONE | 0.034 | 2880 | hit: a blunt weapon on flesh, padding or leather |
| bonehit-4.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 20.350-21.050 | IMPACT WITH BONE | 0.030 | 3960 | hit: a blunt weapon on flesh, padding or leather |
| break-1.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 22.812-23.412 | SWORD BREAKING | 0.042 | 3420 | hit: any weapon on plate or a steel shield |
| break-2.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 23.764-24.164 | SWORD BREAKING | 0.034 | 2520 | hit: any weapon on plate or a steel shield |
| break-3.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 24.634-25.234 | SWORD BREAKING | 0.034 | 3420 | hit: any weapon on plate or a steel shield |
| clatter-1.mp3 | ScreenRecording_10-29-2026_20-52-57_1.mov | 34.854-35.854 | CLATTERING TO THE GROUND | 0.054 | 5400 | clatter: a dropped weapon hitting the floor; fall: a man in plate or mail going down |
| bones-1.mp3 | ScreenRecording_10-29-2026_20-55-14_1.mov | 0.473-0.973 | Breaking Bones | 0.053 | 2880 | wound: bone (a break), crush (lower, slower) |
| bones-2.mp3 | ScreenRecording_10-29-2026_20-55-14_1.mov | 1.542-1.942 | Breaking Bones | 0.042 | 2520 | wound: bone (a break), crush (lower, slower) |
| bones-3.mp3 | ScreenRecording_10-29-2026_20-55-14_1.mov | 2.441-2.691 | Breaking Bones | 0.041 | 1620 | wound: bone (a break), crush (lower, slower) |
| bones-4.mp3 | ScreenRecording_10-29-2026_20-55-14_1.mov | 3.114-3.434 | Breaking Bones | 0.034 | 1980 | wound: bone (a break), crush (lower, slower) |
| bones-5.mp3 | ScreenRecording_10-29-2026_20-55-14_1.mov | 3.916-4.256 | Breaking Bones | 0.036 | 2160 | wound: bone (a break), crush (lower, slower) |
| bones-6.mp3 | ScreenRecording_10-29-2026_20-55-14_1.mov | 4.767-4.987 | Breaking Bones | 0.047 | 1620 | wound: bone (a break), crush (lower, slower) |
| armourstep-1.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 0.663-0.983 | Walking In Suit Of Armour | 0.043 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-2.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 1.358-1.678 | Walking In Suit Of Armour | 0.118 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-3.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 2.604-2.924 | Walking In Suit Of Armour | 0.054 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-4.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 3.791-4.111 | Walking In Suit Of Armour | 0.041 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-5.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 4.358-4.678 | Walking In Suit Of Armour | 0.028 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-6.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 6.664-6.984 | Walking In Suit Of Armour | 0.044 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-7.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 7.313-7.633 | Walking In Suit Of Armour | 0.093 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-8.mp3 | ScreenRecording_10-29-2026_20-56-33_1.mov | 9.574-9.894 | Walking In Suit Of Armour | 0.044 | 1980 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-9.mp3 | ScreenRecording_10-29-2026_20-57-56_1.mov | 1.084-1.344 | Armor Walking | 0.034 | 1800 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-10.mp3 | ScreenRecording_10-29-2026_20-57-56_1.mov | 1.634-1.894 | Armor Walking | 0.034 | 1800 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-11.mp3 | ScreenRecording_10-29-2026_20-57-56_1.mov | 4.146-4.406 | Armor Walking | 0.046 | 1800 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-12.mp3 | ScreenRecording_10-29-2026_20-57-56_1.mov | 5.181-5.441 | Armor Walking | 0.041 | 1800 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-13.mp3 | ScreenRecording_10-29-2026_20-57-56_1.mov | 6.741-7.001 | Armor Walking | 0.041 | 1800 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| armourstep-14.mp3 | ScreenRecording_10-29-2026_20-57-56_1.mov | 7.787-8.040 | Armor Walking | 0.037 | 1800 | step / land: a man in plate or mail (mail lighter, higher); the ground under it still synthesised |
| maceswing-1.mp3 | ScreenRecording_10-29-2026_20-59-22_1.mov | 0.163-0.813 | Mace swing sound | 0.063 | 3780 | swing: a weapon led by a weight (mace, club, axe head) |
| gunshot-1.mp3 | ScreenRecording_10-29-2026_20-50-56_1.mov | 0.250-1.400 | Blackpowder Flintlock Pistol | 0.050 | 6120 | shot: matchlock (with the synth's low boom under it) |
| gunshot-2.mp3 | ScreenRecording_10-29-2026_20-51-21_1.mov | 0.163-1.363 | pistol sound effect | 0.063 | 6480 | shot: matchlock (with the synth's low boom under it) |
| step-stone-run-1.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 0.083-0.273 | Walk On Concrete | 0.038 | 1440 | step on stone or tile, running (from 2.8 m/s: the harder strikes) |
| step-stone-walk-1.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 0.607-0.887 | Walk On Concrete | 0.042 | 1800 | step on stone or tile (tile higher), walking pace (the softer strikes of the series) |
| step-stone-walk-2.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 1.146-1.396 | Walk On Concrete | 0.041 | 1620 | step on stone or tile (tile higher), walking pace (the softer strikes of the series) |
| step-stone-walk-3.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 1.685-1.895 | Walk On Concrete | 0.040 | 1440 | step on stone or tile (tile higher), walking pace (the softer strikes of the series) |
| step-stone-run-2.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 2.184-2.384 | Walk On Concrete | 0.039 | 1440 | step on stone or tile, running (from 2.8 m/s: the harder strikes) |
| step-stone-walk-4.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 2.716-2.916 | Walk On Concrete | 0.041 | 1440 | step on stone or tile (tile higher), walking pace (the softer strikes of the series) |
| step-stone-run-3.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 3.249-3.439 | Walk On Concrete | 0.039 | 1440 | step on stone or tile, running (from 2.8 m/s: the harder strikes) |
| step-stone-run-4.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 3.814-4.004 | Walk On Concrete | 0.039 | 1440 | step on stone or tile, running (from 2.8 m/s: the harder strikes) |
| step-stone-walk-5.mp3 | ScreenRecording_10-29-2026_21-17-39_1.mov | 4.330-4.462 | Walk On Concrete | 0.040 | 1080 | step on stone or tile (tile higher), walking pace (the softer strikes of the series) |
| step-grass-walk-1.mp3 | ScreenRecording_10-29-2026_21-19-03_1.mov | 0.835-1.235 | Footsteps on the grass | 0.040 | 2520 | step on grass, walking; on earth lower and quieter with the synth thud under it |
| step-grass-walk-2.mp3 | ScreenRecording_10-29-2026_21-19-03_1.mov | 1.607-2.007 | Footsteps on the grass | 0.042 | 2520 | step on grass, walking; on earth lower and quieter with the synth thud under it |
| step-grass-run-1.mp3 | ScreenRecording_10-29-2026_21-19-03_1.mov | 2.370-2.770 | Footsteps on the grass | 0.040 | 2520 | step on grass or earth, running |
| step-grass-run-2.mp3 | ScreenRecording_10-29-2026_21-19-03_1.mov | 3.137-3.537 | Footsteps on the grass | 0.037 | 2520 | step on grass or earth, running |
| step-grass-walk-3.mp3 | ScreenRecording_10-29-2026_21-19-03_1.mov | 3.904-4.304 | Footsteps on the grass | 0.039 | 2520 | step on grass, walking; on earth lower and quieter with the synth thud under it |
| step-mud-1.mp3 | ScreenRecording_10-29-2026_21-16-01_1.mov | 0.191-0.641 | Footsteps in the mud | 0.021 | 2700 | step in mud, any pace |
| step-mud-2.mp3 | ScreenRecording_10-29-2026_21-16-01_1.mov | 0.965-1.415 | Footsteps in the mud | 0.000 | 2700 | step in mud, any pace |
| step-mud-3.mp3 | ScreenRecording_10-29-2026_21-16-01_1.mov | 1.720-2.170 | Footsteps in the mud | 0.000 | 2700 | step in mud, any pace |
| step-water-1.mp3 | ScreenRecording_10-29-2026_21-17-04_1.mov | 0.126-0.626 | Water walk | 0.041 | 2880 | step in water, any pace |
| step-water-2.mp3 | ScreenRecording_10-29-2026_21-17-04_1.mov | 0.836-1.336 | Water walk | 0.036 | 2880 | step in water, any pace |
| step-water-3.mp3 | ScreenRecording_10-29-2026_21-17-04_1.mov | 1.485-1.985 | Water walk | 0.055 | 2880 | step in water, any pace |
| step-water-4.mp3 | ScreenRecording_10-29-2026_21-17-04_1.mov | 2.153-2.653 | Water walk | 0.038 | 2880 | step in water, any pace |
| step-water-5.mp3 | ScreenRecording_10-29-2026_21-17-04_1.mov | 2.838-3.338 | Water walk | 0.033 | 2880 | step in water, any pace |
| step-water-6.mp3 | ScreenRecording_10-29-2026_21-17-04_1.mov | 3.502-3.807 | Water walk | 0.037 | 1980 | step in water, any pace |
| hoof-soft-1.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 1.194-1.270 | Horse Gallop | 0.054 | 900 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-2.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 1.294-1.390 | Horse Gallop | 0.034 | 900 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-3.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 1.418-1.528 | Horse Gallop | 0.038 | 1080 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-4.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 1.741-1.851 | Horse Gallop | 0.041 | 1080 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-5.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 1.962-2.072 | Horse Gallop | 0.042 | 1080 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-6.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 2.280-2.350 | Horse Gallop | 0.040 | 720 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-7.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 2.382-2.492 | Horse Gallop | 0.042 | 1080 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-8.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 2.837-2.947 | Horse Gallop | 0.037 | 1080 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-soft-9.mp3 | ScreenRecording_10-29-2026_21-13-56_1.mov | 3.416-3.470 | Horse Gallop | 0.036 | 720 | horse hoof on earth, grass, sand or snow, every gait (softer and slower at a walk) |
| hoof-stone-1.mp3 | ScreenRecording_10-29-2026_21-14-10_1.mov | 2.320-2.450 | Horse Hooves On Stone And Whinnies | 0.000 | 1080 | horse hoof on stone, tile or boards, every gait |
| hoof-stone-2.mp3 | ScreenRecording_10-29-2026_21-14-10_1.mov | 2.707-2.837 | Horse Hooves On Stone And Whinnies | 0.027 | 1080 | horse hoof on stone, tile or boards, every gait |
| hoof-stone-3.mp3 | ScreenRecording_10-29-2026_21-14-10_1.mov | 3.039-3.169 | Horse Hooves On Stone And Whinnies | 0.029 | 1080 | horse hoof on stone, tile or boards, every gait |
| hoof-stone-4.mp3 | ScreenRecording_10-29-2026_21-14-10_1.mov | 3.370-3.500 | Horse Hooves On Stone And Whinnies | 0.030 | 1080 | horse hoof on stone, tile or boards, every gait |
| neigh-1.mp3 | ScreenRecording_10-29-2026_21-14-10_1.mov | 0.885-2.100 | Horse Hooves On Stone And Whinnies | 0.035 | 6480 | horse neigh (a wounded or falling horse) |
| step-heel-1.mp3 | ScreenRecording_10-30-2026_13-32-50_1.mov | 0.404-0.554 | sound of woman's footsteps in heels | 0.039 | 1260 | step in heels (a heeled boot) on stone, tile or boards, any pace (on boards with the synth's knock under it) |
| step-heel-2.mp3 | ScreenRecording_10-30-2026_13-32-50_1.mov | 0.976-1.236 | sound of woman's footsteps in heels | 0.041 | 1800 | step in heels (a heeled boot) on stone, tile or boards, any pace (on boards with the synth's knock under it) |
| step-heel-3.mp3 | ScreenRecording_10-30-2026_13-32-50_1.mov | 1.593-1.833 | sound of woman's footsteps in heels | 0.038 | 1620 | step in heels (a heeled boot) on stone, tile or boards, any pace (on boards with the synth's knock under it) |
| step-heel-4.mp3 | ScreenRecording_10-30-2026_13-32-50_1.mov | 2.234-2.414 | sound of woman's footsteps in heels | 0.039 | 1260 | step in heels (a heeled boot) on stone, tile or boards, any pace (on boards with the synth's knock under it) |
| step-heel-5.mp3 | ScreenRecording_10-30-2026_13-32-50_1.mov | 2.857-3.027 | sound of woman's footsteps in heels | 0.042 | 1260 | step in heels (a heeled boot) on stone, tile or boards, any pace (on boards with the synth's knock under it) |
| step-heel-6.mp3 | ScreenRecording_10-30-2026_13-32-50_1.mov | 3.481-3.661 | sound of woman's footsteps in heels | 0.041 | 1260 | step in heels (a heeled boot) on stone, tile or boards, any pace (on boards with the synth's knock under it) |
| helmet-1.mp3 | ScreenRecording_10-30-2026_13-34-21_1.mov | 0.169-0.859 | Sword Fight Helmet Impact | 0.069 | 3960 | hit: anything but a body's crash on a helmet (plate on the head) |
| woodshield-1.mp3 | ScreenRecording_10-30-2026_13-35-34_1.mov | 0.207-0.507 | (Axe?)…ke Hit on Dull Hollow Wooden Shie(ld) | 0.067 | 1980 | hit: anything on a wooden shield; clash: steel on a wooden shield or a haft (higher, shorter) |
| punch-1.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 0.470-0.680 | Fist swings and punches (Sound 3-6) | 0.025 | 1440 | hit: a fist, foot, knee, elbow, head or shoulder on flesh, padding or leather (a kick lower, a shoulder dull) |
| punch-2.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 1.453-1.713 | Fist swings and punches (Sound 3-6) | 0.023 | 1800 | hit: a fist, foot, knee, elbow, head or shoulder on flesh, padding or leather (a kick lower, a shoulder dull) |
| punch-3.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 2.710-2.970 | Fist swings and punches (Sound 3-6) | 0.025 | 1800 | hit: a fist, foot, knee, elbow, head or shoulder on flesh, padding or leather (a kick lower, a shoulder dull) |
| punch-4.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 3.837-4.097 | Fist swings and punches (Sound 3-6) | 0.007 | 1800 | hit: a fist, foot, knee, elbow, head or shoulder on flesh, padding or leather (a kick lower, a shoulder dull) |
| punch-5.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 5.001-5.261 | Fist swings and punches (Sound 3-6) | 0.001 | 1800 | hit: a fist, foot, knee, elbow, head or shoulder on flesh, padding or leather (a kick lower, a shoulder dull) |
| punch-6.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 6.067-6.327 | Fist swings and punches (Sound 3-6) | 0.002 | 1800 | hit: a fist, foot, knee, elbow, head or shoulder on flesh, padding or leather (a kick lower, a shoulder dull) |
| punch-7.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 7.569-7.733 | Fist swings and punches (Sound 3-6) | 0.044 | 1260 | hit: a fist, foot, knee, elbow, head or shoulder on flesh, padding or leather (a kick lower, a shoulder dull) |
| fistswing-1.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 1.100-1.450 | Fist swings and punches (Sound 3-6) | 0.000 | 2160 | swing: a punch or kick on its way in (its rising end, as long as the drive; a kick lower) |
| fistswing-2.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 2.300-2.700 | Fist swings and punches (Sound 3-6) | 0.000 | 2520 | swing: a punch or kick on its way in (its rising end, as long as the drive; a kick lower) |
| fistswing-3.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 3.560-3.850 | Fist swings and punches (Sound 3-6) | 0.000 | 1980 | swing: a punch or kick on its way in (its rising end, as long as the drive; a kick lower) |
| fistswing-4.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 4.760-5.020 | Fist swings and punches (Sound 3-6) | 0.000 | 1800 | swing: a punch or kick on its way in (its rising end, as long as the drive; a kick lower) |
| fistswing-5.mp3 | ScreenRecording_10-30-2026_13-37-13_1.mov | 5.820-6.085 | Fist swings and punches (Sound 3-6) | 0.000 | 1800 | swing: a punch or kick on its way in (its rising end, as long as the drive; a kick lower) |
| thunder-1.mp3 | ScreenRecording_10-30-2026_13-40-40_1.mov | 0.373-2.973 | LOUD & SCARY THUNDERSTORM LIGHTNIN(G) | 0.043 | 13500 | thunder: near, the whole crack and roar; far, the rumble only, lower, the synth's long rumble under it |
| thunder-2.mp3 | ScreenRecording_10-30-2026_13-40-40_1.mov | 3.085-4.885 | LOUD & SCARY THUNDERSTORM LIGHTNIN(G) | 0.000 | 9360 | thunder: near, the whole crack and roar; far, the rumble only, lower, the synth's long rumble under it |
| bodyfall-1.mp3 | ScreenRecording_10-30-2026_13-53-57_1.mov | 0.285-0.873 | Body Fall Sound Effects | 0.085 | 3240 | fall: a man going down on stone, tile, boards, earth, grass, sand or snow (under the clatter in plate or mail; water and mud the synth's) |
| bodyfall-2.mp3 | ScreenRecording_10-30-2026_13-53-57_1.mov | 2.240-3.318 | Body Fall Sound Effects | 0.140 | 5580 | fall: a man going down on stone, tile, boards, earth, grass, sand or snow (under the clatter in plate or mail; water and mud the synth's) |
| bodyfall-3.mp3 | ScreenRecording_10-30-2026_13-53-57_1.mov | 4.461-4.717 | Body Fall Sound Effects | 0.111 | 1620 | fall: a man going down on stone, tile, boards, earth, grass, sand or snow (under the clatter in plate or mail; water and mud the synth's) |
| bodyfall-4.mp3 | ScreenRecording_10-30-2026_13-53-57_1.mov | 6.245-6.803 | Body Fall Sound Effects | 0.145 | 3060 | fall: a man going down on stone, tile, boards, earth, grass, sand or snow (under the clatter in plate or mail; water and mud the synth's) |
| bodyfall-5.mp3 | ScreenRecording_10-30-2026_13-53-57_1.mov | 8.007-9.022 | Body Fall Sound Effects | 0.057 | 5400 | fall: a man going down on stone, tile, boards, earth, grass, sand or snow (under the clatter in plate or mail; water and mud the synth's) |
| whip-1.mp3 | ScreenRecording_10-30-2026_13-55-14_1.mov | 0.509-1.038 | Whip Hit Sound Effect | 0.029 | 2880 | hit: a whip's tip on anything (on armour or a shield shorter and higher, the synth's knock beside it) |
| door-creak-1.mp3 | ScreenRecording_10-30-2026_13-52-06_1.mov | 0.900-1.880 | Medieval Castle Wood Door (7 Version) | 0.000 | 5220 | mech: a wooden door (or a chest's lid, higher and shorter) swinging open, or the start of its shutting |
| door-creak-2.mp3 | ScreenRecording_10-30-2026_13-52-06_1.mov | 1.880-2.850 | Medieval Castle Wood Door (7 Version) | 0.000 | 5040 | mech: a wooden door (or a chest's lid, higher and shorter) swinging open, or the start of its shutting |
| door-slam-1.mp3 | ScreenRecording_10-30-2026_13-52-06_1.mov | 2.855-4.297 | Medieval Castle Wood Door (7 Version) | 0.000 | 7560 | mech: a wooden door (or a chest's lid) shut, into the creak |
| bow-1.mp3 | ScreenRecording_10-30-2026_14-41-05_1.mov | 1.882-2.107 | Bow and Arrow Sound Effect | 0.082 | 1440 | shot: a bow loosed (the synth's thrum of the string under it); the recording ends 0.23 s into the release, faded there |
| crossbow-1.mp3 | ScreenRecording_10-30-2026_14-42-23_1.mov | 4.272-4.795 | Crossbow | 0.072 | 2880 | shot: a crossbow loosed (the synth's knock and thrum under it, quieter) |
| crossbow-latch-1.mp3 | ScreenRecording_10-30-2026_14-42-23_1.mov | 2.745-2.847 | Crossbow | 0.065 | 720 | mech: a lock (the key's click high, the bolt going over low, 0.3 s later) |
| crossbow-crank-1.mp3 | ScreenRecording_10-30-2026_14-42-23_1.mov | 1.020-1.800 | Crossbow | 0.000 | 4140 | mech: a lever's ratchet (the synth's clunk of the arm beside it); the window as is |
| portcullis-chain-1.mp3 | ScreenRecording_10-30-2026_14-44-06_1.mov | 0.220-1.250 | (no text: a picture of a portcullis) | 0.000 | 5400 | mech: a portcullis's chain running (raised a little slower and lower); a drawbridge's (slower, lower, the synth's beside it); the window as is |
| portcullis-slam-1.mp3 | ScreenRecording_10-30-2026_14-44-06_1.mov | 1.235-4.015 | (no text: a picture of a portcullis) | 0.000 | 14220 | mech: a portcullis let down (1 s into the chain) slamming and rumbling; a gate of bars clanging shut (higher, shorter) |
| mail-1.mp3 | ScreenRecording_10-30-2026_14-47-18_1.mov | 0.267-0.715 | (Swor)d Impact On Chain Mail A(rmor) | 0.047 | 2520 | hit: a blade, point or weight on mail (a weight lower); a fist on mail (quieter, under the punch); an arrow on mail (higher, shorter) |
| stab-1.mp3 | ScreenRecording_10-30-2026_14-47-58_1.mov | 0.074-0.291 | (Swor)d Stab Into Leather Armor So(und) | 0.044 | 1440 | hit: a point on flesh, padding or leather, a blade's edge on leather; wound: stab; an arrow into the body (higher, shorter) |
| stab-2.mp3 | ScreenRecording_10-30-2026_14-47-58_1.mov | 0.484-0.857 | (Swor)d Stab Into Leather Armor So(und) | 0.044 | 2160 | hit: a point on flesh, padding or leather, a blade's edge on leather; wound: stab; an arrow into the body (higher, shorter) |
| stab-3.mp3 | ScreenRecording_10-30-2026_14-47-58_1.mov | 0.898-1.205 | (Swor)d Stab Into Leather Armor So(und) | 0.038 | 1800 | hit: a point on flesh, padding or leather, a blade's edge on leather; wound: stab; an arrow into the body (higher, shorter) |
| platepunch-1.mp3 | punch-2.mp3 (low-passed 1.8 kHz) + break-1.mp3 (x1.12 pitch, low-passed 4000 Hz, at 0.9), 0.3 s | 0-0.300 | (derived) | 0.000 | 1800 | hit: a fist, foot, knee, elbow, head, shoulder or shield rim on plate or a steel shield (on a helmet: the helmet's take) |
| platepunch-2.mp3 | punch-4.mp3 (low-passed 1.8 kHz) + helmet-1.mp3 (x1.18 pitch, low-passed 4500 Hz, at 0.85), 0.34 s | 0-0.334 | (derived) | 0.000 | 1980 | hit: a fist, foot, knee, elbow, head, shoulder or shield rim on plate or a steel shield (on a helmet: the helmet's take) |
| platepunch-3.mp3 | punch-6.mp3 (low-passed 1.8 kHz) + break-3.mp3 (x1.08 pitch, low-passed 3500 Hz, at 0.95), 0.28 s | 0-0.280 | (derived) | 0.000 | 1620 | hit: a fist, foot, knee, elbow, head, shoulder or shield rim on plate or a steel shield (on a helmet: the helmet's take) |
| platepunch-4.mp3 | punch-3.mp3 (low-passed 1.8 kHz) + clash-6.mp3 (x0.92 pitch, low-passed 3000 Hz, at 0.7), 0.3 s | 0-0.300 | (derived) | 0.000 | 1800 | hit: a fist, foot, knee, elbow, head, shoulder or shield rim on plate or a steel shield (on a helmet: the helmet's take) |
| lamellar-1.mp3 | mail-1.mp3 (x0.8 pitch, low-passed 4500 Hz) + break-2.mp3 (x0.8 pitch, low-passed 1.5 kHz, at 0.5), 0.32 s | 0-0.304 | (derived) | 0.000 | 1800 | hit: a weapon on lamellar or scale (scale higher), a fist under the punch, an arrow |
| lamellar-2.mp3 | mail-1.mp3 (x0.74 pitch, low-passed 3800 Hz) + break-1.mp3 (x0.8 pitch, low-passed 1.5 kHz, at 0.6), 0.36 s | 0-0.360 | (derived) | 0.000 | 1980 | hit: a weapon on lamellar or scale (scale higher), a fist under the punch, an arrow |
| lamellar-3.mp3 | mail-1.mp3 (x0.86 pitch, low-passed 5000 Hz) + helmet-1.mp3 (x0.8 pitch, low-passed 1.5 kHz, at 0.4), 0.3 s | 0-0.300 | (derived) | 0.000 | 1800 | hit: a weapon on lamellar or scale (scale higher), a fist under the punch, an arrow |
| mail-2.mp3 | mail-1.mp3 (x0.9 pitch, low-passed 7 kHz) | 0-0.272 | (derived) | 0.000 | 1620 | hit: a blade, point or weight on mail (a weight lower); a fist on mail (quieter, under the punch); an arrow on mail (higher, shorter) |
| mail-3.mp3 | mail-1.mp3 (x1.1 pitch), 0.32 s | 0-0.249 | (derived) | 0.000 | 1440 | hit: a blade, point or weight on mail (a weight lower); a fist on mail (quieter, under the punch); an arrow on mail (higher, shorter) |
| bladeswing-1.mp3 | maceswing-1.mp3 (x1.55 pitch, high-passed 700 Hz) | 0-0.249 | (derived) | 0.000 | 1440 | swing: a blade (a sword, a spear's head), a faster stroke louder and higher |
| bladeswing-2.mp3 | fistswing-1.mp3 (x1.7 pitch, high-passed 900 Hz, its rise mirrored after it) | 0-0.195 | (derived) | 0.000 | 1260 | swing: a blade (a sword, a spear's head), a faster stroke louder and higher |
| bladeswing-3.mp3 | fistswing-2.mp3 (x1.6 pitch, high-passed 800 Hz, its rise mirrored after it) | 0-0.245 | (derived) | 0.000 | 1440 | swing: a blade (a sword, a spear's head), a faster stroke louder and higher |
| bladeswing-4.mp3 | fistswing-4.mp3 (x1.8 pitch, high-passed 1000 Hz, its rise mirrored after it) | 0-0.135 | (derived) | 0.000 | 900 | swing: a blade (a sword, a spear's head), a faster stroke louder and higher |

| voice-female-hurt-1.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 1.08-1.56 | Woman sobbing and crying | 0.022 | 2520 | a short rising cry; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (woman) |
| voice-female-hurt-2.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 2.02-2.62 | Woman sobbing and crying | 0.002 | 3240 | a cry, up and broken off; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (woman) |
| voice-female-hurt-3.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 3.45-4.08 | Woman sobbing and crying | 0.012 | 3420 | an arched cry; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (woman) |
| voice-female-hurt-4.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 7.35-7.80 | Woman sobbing and crying | 0.000 | 2520 | a gasped cry; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (woman) |
| voice-female-scream-1.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 8.28-8.92 | Woman sobbing and crying | 0.032 | 3240 | a scream; cry: a severe wound, a limb lost, a blow past pain 0.85 (woman) |
| voice-female-scream-2.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 8.28-9.88 | Woman sobbing and crying | 0.032 | 8100 | a scream breaking into a wavering cry; cry: a severe wound, a limb lost, a blow past pain 0.85 (woman) |
| voice-female-scream-3.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 1.70-2.70 | Woman sobbing and crying | 0.022 | 5220 | a gasp, then a rising cry; cry: a severe wound, a limb lost, a blow past pain 0.85 (woman) |
| voice-female-moan-1.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 5.38-7.12 | Woman sobbing and crying | 0.000 | 9000 | a long wavering wail; cry: now and then, lying down or crawling hurt (woman) |
| voice-female-moan-2.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 0.20-0.72 | Woman sobbing and crying | 0.012 | 2880 | a whimper; cry: now and then, lying down or crawling hurt (woman) |
| voice-female-moan-3.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 0.20-0.72 + 3.45-4.08 | Woman sobbing and crying | 0.012 + 0.012 | 5580 | composed: a whimper, then a sobbing cry; cry: now and then, lying down or crawling hurt (woman) |
| voice-female-fear-1.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 8.90-9.88 | Woman sobbing and crying | 0.000 | 5220 | a high wavering cry; cry: breaking (panic), and now and then while running (woman) |
| voice-female-fear-2.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 7.35-7.80 + 8.90-9.88 | Woman sobbing and crying | 0.000 + 0.000 | 7200 | composed: a gasp, then the wavering cry; cry: breaking (panic), and now and then while running (woman) |
| voice-female-dying-1.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 8.28-8.80 + 6.10-7.12 | Woman sobbing and crying | 0.032 + 0.000 | 7380 | composed: a scream falling into the wail's end; cry: a death (not a knockout) (woman) |
| voice-female-dying-2.mp3 | ScreenRecording_10-30-2026_13-58-29_1.mov | 2.02-2.62 + 0.20-0.72 | Woman sobbing and crying | 0.002 + 0.012 | 5400 | composed: a cry, then a whimper fading; cry: a death (not a knockout) (woman) |
| voice-male-hurt-1.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 0.17-0.60 | Sounds of a man crying | 0.032 | 2340 | a cry; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (man) |
| voice-male-hurt-2.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 0.97-1.20 | Sounds of a man crying | 0.022 | 1260 | a short grunt of pain; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (man) |
| voice-male-hurt-3.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 4.11-4.38 | Sounds of a man crying | 0.000 | 1620 | a short sob; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (man) |
| voice-male-hurt-4.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 4.44-4.72 | Sounds of a man crying | 0.022 | 1620 | a short sob, higher; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (man) |
| voice-male-hurt-5.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 5.86-6.04 | Sounds of a man crying | 0.022 | 1080 | a short catch of the breath; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (man) |
| voice-male-hurt-6.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 6.18-6.51 | Sounds of a man crying | 0.022 | 1800 | a sob; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (man) |
| voice-male-hurt-7.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 15.21-15.49 | Sounds of a man crying | 0.000 | 1620 | a short sob, low; cry: a blow that hurt him (pain by his body, masked by adrenaline; cries.js), a knockdown groan (man) |
| voice-male-scream-1.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 13.51-14.45 | Sounds of a man crying | 0.022 | 4860 | a loud low cry; cry: a severe wound, a limb lost, a blow past pain 0.85 (man) |
| voice-male-scream-2.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 9.18-10.10 | Sounds of a man crying | 0.032 | 4680 | a loud cry; cry: a severe wound, a limb lost, a blow past pain 0.85 (man) |
| voice-male-scream-3.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 13.51-15.16 | Sounds of a man crying | 0.022 | 8460 | a loud low cry, held and broken; cry: a severe wound, a limb lost, a blow past pain 0.85 (man) |
| voice-male-moan-1.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 2.62-4.03 | Sounds of a man crying | 0.012 | 7200 | sobbing; cry: now and then, lying down or crawling hurt (man) |
| voice-male-moan-2.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 10.83-12.10 | Sounds of a man crying | 0.000 | 6660 | sobs; cry: now and then, lying down or crawling hurt (man) |
| voice-male-moan-3.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 15.21-16.22 | Sounds of a man crying | 0.000 | 5400 | low sobs; cry: now and then, lying down or crawling hurt (man) |
| voice-male-moan-4.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 1.48-1.90 | Sounds of a man crying | 0.000 | 2340 | a quiet sob; cry: now and then, lying down or crawling hurt (man) |
| voice-male-fear-1.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 6.75-7.26 | Sounds of a man crying | 0.032 | 2700 | a high whimper; cry: breaking (panic), and now and then while running (man) |
| voice-male-fear-2.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 16.26-16.75 | Sounds of a man crying | 0.012 | 2700 | a high whimper; cry: breaking (panic), and now and then while running (man) |
| voice-male-fear-3.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 11.60-12.10 | Sounds of a man crying | 0.000 | 2700 | a high cry; cry: breaking (panic), and now and then while running (man) |
| voice-male-fear-4.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 5.86-6.04 + 6.75-7.26 | Sounds of a man crying | 0.022 + 0.032 | 3240 | composed: a catch of the breath, then the whimper; cry: breaking (panic), and now and then while running (man) |
| voice-male-dying-1.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 13.51-14.45 + 15.54-16.22 | Sounds of a man crying | 0.022 + 0.000 | 7920 | composed: a loud cry falling into low sobs; cry: a death (not a knockout) (man) |
| voice-male-dying-2.mp3 | ScreenRecording_10-30-2026_14-00-47_1.mov | 9.18-10.10 + 11.20-12.10 | Sounds of a man crying | 0.032 + 0.022 | 8640 | composed: a cry, then sobs fading; cry: a death (not a knockout) (man) |
| charge-1.mp3 | ScreenRecording_10-30-2026_14-05-21_1.mov | 0.55-7.55 | Army Charge | 0.000 | 24192 | a loop: the roar's last 1.0 s crossfaded into its head; the army's charge (charge.js): looped under a side of 20+ with 10+ men (a third of it) running at the enemy; by their number and distance; fades as the lines meet |
| shock-1.mp3 | ScreenRecording_10-31-2026_10-41-53_1.mov | 0.308-1.695 | Electric SHOCK | 0.068 | 7200 | the whole zap; robotSpark: a robot shorting out (machinefx.js), at its death the whole take, at a cut stump shorter, higher, quieter |
| shock-2.mp3 | ScreenRecording_10-31-2026_10-41-53_1.mov | 0.640-1.130 | Electric SHOCK | 0.000 | 2700 | its middle (faded in); robotSpark: a robot shorting out (machinefx.js), at its death the whole take, at a cut stump shorter, higher, quieter |
| shock-3.mp3 | ScreenRecording_10-31-2026_10-41-53_1.mov | 0.960-1.700 | Electric SHOCK | 0.000 | 3960 | its second half to its end (faded in); robotSpark: a robot shorting out (machinefx.js), at its death the whole take, at a cut stump shorter, higher, quieter |
| chain-1.mp3 | ScreenRecording_10-31-2026_10-46-56_1.mov | 0.965-2.265 | Heavy Chain Sound Effect | 0.000 | 5472 | a run of the chain; mech: a portcullis raised (slower, lower: wound up); a drawbridge (two runs, slower and lower, the synth's beside it) |
| chain-2.mp3 | ScreenRecording_10-31-2026_10-46-56_1.mov | 3.950-5.210 | Heavy Chain Sound Effect | 0.000 | 5184 | a run; mech: a portcullis raised (slower, lower: wound up); a drawbridge (two runs, slower and lower, the synth's beside it) |
| chain-3.mp3 | ScreenRecording_10-31-2026_10-46-56_1.mov | 5.955-7.175 | Heavy Chain Sound Effect | 0.000 | 5040 | a run, denser; mech: a portcullis raised (slower, lower: wound up); a drawbridge (two runs, slower and lower, the synth's beside it) |
| shackle-1.mp3 | ScreenRecording_10-31-2026_10-46-56_1.mov | 9.032-9.640 | Heavy Chain Sound Effect | 0.032 | 3240 | a short shake; mech: a chained prisoner's shackles shaken as he sobs (Dunnottar's vault); under a lash on a prisoner chained at the wall |
| shackle-2.mp3 | ScreenRecording_10-31-2026_10-46-56_1.mov | 10.476-10.820 | Heavy Chain Sound Effect | 0.016 | 1980 | a short shake; mech: a chained prisoner's shackles shaken as he sobs (Dunnottar's vault); under a lash on a prisoner chained at the wall |
| shackle-3.mp3 | ScreenRecording_10-31-2026_10-46-56_1.mov | 10.970-11.270 | Heavy Chain Sound Effect | 0.000 | 1800 | the last shake, quieter; mech: a chained prisoner's shackles shaken as he sobs (Dunnottar's vault); under a lash on a prisoner chained at the wall |
| breath-male-in-1.mp3 | ScreenRecording_10-31-2026_10-50-02_1.mov | 1.665-2.165 | Breathing Male | 0.000 | 2160 | a breath in; breath drawn in (a man), only when all but spent (the stamina's last tenth, the overdraft), at his voice's pitch |
| breath-male-in-2.mp3 | ScreenRecording_10-31-2026_10-50-02_1.mov | 2.830-3.340 | Breathing Male | 0.000 | 2304 | a breath in; breath drawn in (a man), only when all but spent (the stamina's last tenth, the overdraft), at his voice's pitch |
| breath-male-in-3.mp3 | ScreenRecording_10-31-2026_10-50-02_1.mov | 3.960-4.510 | Breathing Male | 0.000 | 2448 | a breath in; breath drawn in (a man), only when all but spent (the stamina's last tenth, the overdraft), at his voice's pitch |
| breath-male-out-1.mp3 | ScreenRecording_10-31-2026_10-50-02_1.mov | 0.925-1.595 | Breathing Male | 0.000 | 2880 | a breath out; breath let out (a man), only when all but spent, at his voice's pitch |
| breath-male-out-2.mp3 | ScreenRecording_10-31-2026_10-50-02_1.mov | 2.170-2.735 | Breathing Male | 0.000 | 2448 | a breath out; breath let out (a man), only when all but spent, at his voice's pitch |
| breath-male-out-3.mp3 | ScreenRecording_10-31-2026_10-50-02_1.mov | 3.340-3.880 | Breathing Male | 0.000 | 2448 | a breath out; breath let out (a man), only when all but spent, at his voice's pitch |
| breath-female-in-1.mp3 | ScreenRecording_10-31-2026_10-50-45_1.mov | 1.380-1.825 | Female Breathing | 0.000 | 2016 | a breath in; breath drawn in (a woman), only when all but spent, at her voice's pitch |
| breath-female-in-2.mp3 | ScreenRecording_10-31-2026_10-50-45_1.mov | 2.245-2.560 | Female Breathing | 0.000 | 1440 | a breath in; breath drawn in (a woman), only when all but spent, at her voice's pitch |
| breath-female-in-3.mp3 | ScreenRecording_10-31-2026_10-50-45_1.mov | 4.960-5.525 | Female Breathing | 0.000 | 2448 | a breath in; breath drawn in (a woman), only when all but spent, at her voice's pitch |
| breath-female-out-1.mp3 | ScreenRecording_10-31-2026_10-50-45_1.mov | 1.825-2.245 | Female Breathing | 0.000 | 1872 | a breath out; breath let out (a woman), only when all but spent, at her voice's pitch |
| breath-female-out-2.mp3 | ScreenRecording_10-31-2026_10-50-45_1.mov | 2.735-3.295 | Female Breathing | 0.000 | 2448 | a breath out; breath let out (a woman), only when all but spent, at her voice's pitch |
| breath-female-out-3.mp3 | ScreenRecording_10-31-2026_10-50-45_1.mov | 5.525-6.340 | Female Breathing | 0.000 | 3456 | a breath out; breath let out (a woman), only when all but spent, at her voice's pitch |
| ui-tap-1.mp3 | copy_94989AD7-55CF-415D-897D-98CE9548B813.mov | 1.982-2.210 | Menu sounds | 0.022 | 1440 | a soft low tap; menu: a click (the tap), a back (lower), a confirm (higher, the chime under it) |
| ui-tap-2.mp3 | copy_94989AD7-55CF-415D-897D-98CE9548B813.mov | 2.344-2.565 | Menu sounds | 0.014 | 1440 | the same tap, again; menu: a click (the tap), a back (lower), a confirm (higher, the chime under it) |
| ui-chime-1.mp3 | copy_94989AD7-55CF-415D-897D-98CE9548B813.mov | 0.358-1.400 | Menu sounds | 0.028 | 5400 | a low swelling tone, decaying; menu: under a confirm's tap (its first 0.7 s, faded) |
Not used: SWORD UNSHEATHE, SHARPENING BLADE (no such event in the game). The recordings have no sand or snow footsteps and none of a flat sole on boards (the ring's canvas is boards) and no snort: those stay synthesised. The fist's whooshes (fistswing) are the air before each punch of the 10-30 recording, cut from 0.25-0.4 s before its blow to the blow (no onset: the window as it is, faded in over its first quarter); the punches start at the blow. The thunder takes are capped at 2.6 and 1.8 s with a 0.7 s fade.

The fourth batch (10-30): the body falls are the five falls of one recording; the whip's recording has one lash (the low knock before it, at 0.31 s, is not the whip: left out); the door's recording is the first of its seven versions only: a creak swelling as it opens (its first part at a lower quality: cut at 1.88 s into two takes, each the window as it is, faded in over 0.06 s and out over 0.15 s) and the slam that ends it, its ring cut where the recording ends.

## Ambience loops

Three beds (samples.js `AMBIENCE_LOOPS`, played by ambience.js), from the user's screen recordings of 2026-10-30, each one labelled on screen and one sound throughout. Each: the stereo mixed to mono, high-passed at 25 Hz, resampled to 32 kHz; a steady section chosen by search (the length and start whose two ends, the 1-1.5 s crossfaded into each other, match best in level and in eight bands of spectrum, the levels 2 s either side of the seam too, and, for the market, no lone shout or clatter well over the rest); its tail crossfaded into its head at equal power (the ends are uncorrelated noise); the DC taken out; the RMS set to -20 dBFS (the peak held under -1.5 dBFS). The file is the period with 0.25 s of its own tail before it and of its head after it, so the MP3's priming and padding fall outside the period whether a decoder trims them or not: looped from 0.25 s to 0.25 s + the period. The period is a whole number of samples at 32, 44.1 and 48 kHz. The game plays the mono period twice, half a period apart, to the left and the right.

Checked decoded (as the encoder left it, and again with the encoder's 1105-sample delay kept in front), resampled to 48 kHz and looped four times: the step across each seam is under the median sample-to-sample step of the rest, and the change of spectrum across it (10 ms either side) is at the median of the rest.

| File | Source recording | Time (s) | On-screen label | Period (s) | Crossfade (s) | Bytes | Used for |
|---|---|---|---|---|---|---|---|
| loop-rain.mp3 | ScreenRecording_10-30-2026_13-46-20_1.mov | 0.45-10.44 | Relaxing Rain Sounds | 9.24 | 0.75 | 58968 | rain in the open, wherever it falls (Dunnottar's storm; a place's own weather: the port); 48 kb/s |
| loop-wind.mp3 | ScreenRecording_10-30-2026_13-47-23_1.mov | 7.00-21.00 | Wind Sound | 12.5 | 1.5 | 65520 | the wind of every outdoor place at its place's level, muffled through walls; 40 kb/s |
| loop-market.mp3 | ScreenRecording_10-30-2026_13-49-57_1.mov | 3.30-21.80 | Medieval city market sound effect | 17.0 | 1.5 | 105624 | a town's market square by day (places tagged `market`: Maidstone, the Jiangnan water town); thinned by rain, none at night; 48 kb/s |

The cries (2026-10-30, three recordings: a woman sobbing and crying, whose second half ("#2", from 16.47 s) repeats the first exactly and was not used; a man crying; an army's charge) are cut one vocalisation at a time: the onset the first 10 ms frame within 30 dB of the piece's peak, from 8 ms before it; the end the last frame within 38 dB, plus 30 ms; a 4 ms fade in and the fade out given; -1 dBFS. Times are the piece's in the recording; a `+` joins pieces composed into one take with an equal-power crossfade (30-80 ms), the second at 0.85 of the first's peak; `trim` is each piece's lead cut. The man's recording at 2.13-2.6 s (a broadband rush, no voice in it) is not used. The charge is one loop: 0.55-7.55 s of the roar, its last 1 s crossfaded into its head, 6.0 s, at 32 kb/s; engine.js loops it from its first sound for 6 s (the decoder's padding left out).

The fifth batch (10-30, five recordings): a bow (its draw's creak, 0.15-1.27 s, is not used: no event draws a bow; the release at 1.88 s
runs to the recording's end, 0.23 s of it, faded there); a crossbow (its winding, 0-1.8 s: one stretch of it, the window as it is, is the
ratchet of a lever; the click at 2.75 s, the latch, is a lock's; its shot at 4.27 s); a portcullis (no text on screen, a picture of one:
its chain rattling, 0.22-1.25 s, cut as it is, and the grate slamming down at 1.24 s and rumbling for 2.8 s); a sword on mail (one
blow: the tail of an earlier one at 0 s left out); a sword stabbed into leather (three stabs). A video's on-screen text describes it only.

Derived variants (the Source column says from what; made with ffmpeg from the takes here, then cut and normalised as the rest):
`platepunch` is a fist or a gauntlet on plate: the punch's thud (low-passed at 1.8 kHz) under a plate's ring from the sword-on-plate,
helmet or clash takes, pitched up a little (a smaller struck area), low-passed at 3-4.5 kHz (no edge, so no bright first instant) and
cut at 0.28-0.34 s (a fist does not drive the plate to ring out). `lamellar` is the mail's take lower and duller over a plate's knock
low-passed hard. `mail-2` and `mail-3` are the mail's take lower and duller, and higher and shorter. `bladeswing` is the mace's and the
fist's whooshes pitched up 1.55-1.8 times and high-passed (a thin edge sheds the air higher); the fist's whooshes, which rise into the
blow and stop, have their rise mirrored after them, so the edge passes and dies away. `shieldclang` (steel on a steel shield) is a set of
takes already here: helmet-1, break-1, break-3.

Every blow (sfx/sampled.js BLOW_TAIL) is played a little longer than before (x1.15 at the lightest), the heaviest longest (x1.8, its fade
x2.4): a take is never played past its own end, where it was cut 45 dB under its peak.

The sixth batch (10-31, five recordings, cut with numpy and ffmpeg from their audio, mono 44.1 kHz): an electric shock (one zap,
0.31-1.70 s: the whole of it, and two windows of its buzz, each faded in over 5 ms and out over 0.08-0.15 s); a heavy chain (10 s of it
rattling: three runs of 1.2-1.3 s for a wheel's chain, their ends at the quietest 5 ms within 50 ms, faded in 20 ms and out 0.1 s,
normalised together, at 32 kb/s; and its three last short shakes, 9.0-11.3 s, between silences, for a prisoner's shackles); a man's and
a woman's breathing, fast and hard (a man panting about once in 1.2 s, a woman faster): each breath in and each out its own take (cut at
the quietest 5 ms between them), faded in 30-40 ms and out 60-200 ms, the sex's six takes normalised together so a breath drawn in stays
as much quieter than one let out as recorded (6-12 dB), at 32 kb/s; a menu's sounds (13 s: a low swelling tone at 0.36 s, four soft taps
at 1.98, 2.34, 2.62 and 2.81 s, the same tap each time (two kept), then from 3.05 s to the end a bed of music with a low thump inside it
at 8.4 s, not used: not a button's sound, and nothing clean to cut). The portcullis of the fifth batch keeps its own chain when let down
(it leads into its slam, as recorded); raised, it runs on the heavy chain.

## Explosions (10-31): a frag grenade, a flashbang, the cannon

Cut from two of the user's recordings of 10-31 (as WAV, mono 44.1 kHz): "Grenade explosion" (12.8 s: four blasts, each from
silence, the fourth cut off by the recording's end and not used) and "Big Explosion" (9 s: one long roar, 1.5-7.6 s). Each cut
from its transient (the first sample within 24 dB of its peak, 1 ms before it), faded out squared over its last second or so,
peak-normalised to -1 dBFS, MP3 32 kHz 32 kb/s (the rumble 16 kHz 24 kb/s: it has nothing above 300 Hz). 8 files, 58 KB.

| File | Source recording | Time (s) | On-screen label | Trim (s) | Bytes | Used for |
|---|---|---|---|---|---|---|
| grenade-1.mp3 | eef9aeab.wav | 0.354-3.154 | Grenade explosion | 0.104 | 11376 | the first blast, capped at 2.8 s (fade 1.1 s); shot `frag`: a frag grenade going off (physics/throwable.js), the rumble under it |
| grenade-2.mp3 | eef9aeab.wav | 5.543-8.343 | Grenade explosion | 0.093 | 11376 | the second blast, the same; shot `frag` |
| grenade-3.mp3 | eef9aeab.wav | 10.541-11.750 | Grenade explosion | 0.091 | 5040 | the third, shorter (its tail cut in the recording, faded 0.25 s); shot `frag` |
| flashbang-1.mp3 | eef9aeab.wav | 0.354-0.754 | Grenade explosion | 0.104 | 1872 | the first blast's head, high-passed at 900 Hz (4th order: its boom gone), 0.4 s, faded 0.3 s; shot `flashbang`: a stun grenade's crack |
| flashbang-2.mp3 | eef9aeab.wav | 5.543-5.943 | Grenade explosion | 0.093 | 1872 | the second's head, the same; shot `flashbang` |
| flashbang-3.mp3 | eef9aeab.wav | 10.541-10.941 | Grenade explosion | 0.091 | 1872 | the third's head, the same; shot `flashbang` |
| explosion-big-1.mp3 | f18560c8.wav | 1.582-4.782 | Big Explosion | 0.182 | 12960 | the roar's first 3.2 s (fade 1.4 s); shot `cannon` (its first 3 s, a little lower, the pistol's report slowed to half over its head) |
| explosion-rumble-1.mp3 | f18560c8.wav | 1.592-5.592 | Big Explosion | 0.192 | 12312 | the roar low-passed at 280 Hz (4th order), 4 s (fade 1.8 s); under a frag's blast (its weight: what a phone's recording of one has little of) |

The cannon was the pistol's report slowed to half under the synth's boom; it is now the recorded big explosion, a far bigger
report than any gun's and a recorded one, with the slowed report kept over its head for the crack and the synth's boom quieter.
A flashbang's ringing in the ears of the man played (near it, looking) is the engine's own (engine.js `deafen`: a high tone
fading, the mix low-passed and ducked for a few seconds), not a recording.
