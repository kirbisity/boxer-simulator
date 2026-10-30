# Recorded sound effects

Cut from the user's screen recordings (2026-10-29 and 2026-10-30), each labelled on screen; a series of footsteps or hoofbeats is cut into one file per footfall. Each clip: mono, the transient at its start (the leading
silence trimmed; `trim` is how much of the labelled event's window came before it), its tail cut where it falls 45 dB under its peak
with a short fade, peak-normalised to -1 dBFS, MP3 32 kHz 40 kb/s. The game picks one take of a set at random, at the event's instant;
src/audio/sfx/sampled.js sets its loudness, length and pitch from the event. tools/bundle.js embeds them in the single-file page.

113 files, 295 KB in all.

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
