# Recorded sound effects

Cut from the user's screen recordings (2026-10-29 and 2026-10-30), each labelled on screen; a series of footsteps or hoofbeats is cut into one file per footfall. Each clip: mono, the transient at its start (the leading
silence trimmed; `trim` is how much of the labelled event's window came before it), its tail cut where it falls 45 dB under its peak
with a short fade, peak-normalised to -1 dBFS, MP3 32 kHz 40 kb/s. The game picks one take of a set at random, at the event's instant;
src/audio/sfx/sampled.js sets its loudness, length and pitch from the event. tools/bundle.js embeds them in the single-file page.

139 files, 426 KB in all (the cries and the charge: 35 files, 170 KB).

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
Not used: SWORD UNSHEATHE, SHARPENING BLADE (no such event in the game). The recordings have no sand or snow footsteps and none of a flat sole on boards (the ring's canvas is boards) and no snort: those stay synthesised. The fist's whooshes (fistswing) are the air before each punch of the 10-30 recording, cut from 0.25-0.4 s before its blow to the blow (no onset: the window as it is, faded in over its first quarter); the punches start at the blow. The thunder takes are capped at 2.6 and 1.8 s with a 0.7 s fade.

The cries (2026-10-30, three recordings: a woman sobbing and crying, whose second half ("#2", from 16.47 s) repeats the first exactly and was not used; a man crying; an army's charge) are cut one vocalisation at a time: the onset the first 10 ms frame within 30 dB of the piece's peak, from 8 ms before it; the end the last frame within 38 dB, plus 30 ms; a 4 ms fade in and the fade out given; -1 dBFS. Times are the piece's in the recording; a `+` joins pieces composed into one take with an equal-power crossfade (30-80 ms), the second at 0.85 of the first's peak; `trim` is each piece's lead cut. The man's recording at 2.13-2.6 s (a broadband rush, no voice in it) is not used. The charge is one loop: 0.55-7.55 s of the roar, its last 1 s crossfaded into its head, 6.0 s, at 32 kb/s; engine.js loops it from its first sound for 6 s (the decoder's padding left out).
