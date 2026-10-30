# Recorded sound effects

Cut from the user's screen recordings (2026-10-29), each labelled on screen. Each clip: mono, the transient at its start (the leading
silence trimmed; `trim` is how much of the labelled event's window came before it), its tail cut where it falls 45 dB under its peak
with a short fade, peak-normalised to -1 dBFS, MP3 32 kHz 40 kb/s. The game picks one take of a set at random, at the event's instant;
src/audio/sfx/sampled.js sets its loudness, length and pitch from the event. tools/bundle.js embeds them in the single-file page.

45 files, 131 KB in all.

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

Not used: SWORD UNSHEATHE, SHARPENING BLADE (no such event in the game).
