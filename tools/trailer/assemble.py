"""Assemble the launch video from its recordings (tools/trailer/render.mjs) as tools/trailer/edit.json cuts it: the shots trimmed and joined,
the text cards laid over them, and its sound: music (assets/music), ambience loops and, at the moment each physics event of a take happened,
the game's own sample for it (src/audio/samples), louder the nearer the camera and the played man's own. Levelled to the mix's loudness.

    python3 tools/trailer/assemble.py [edit.json]        ->  trailer-out/<output>
    python3 tools/trailer/assemble.py tools/trailer/edit-zh.json   the Chinese cut (its cards, its played shots from trailer-out/shots-zh)

Needs ffmpeg and numpy. Not part of the game."""

import glob
import hashlib
import json
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
OUT = os.environ.get('TRAILER_OUT', os.path.join(ROOT, 'trailer-out'))
SR = 48000


def decode(path, start=None, seconds=None):
    """A sound file as mono float32 at SR (a stretch of it: `start`, `seconds`)."""
    cmd = ['ffmpeg', '-loglevel', 'error']
    if start is not None:
        cmd += ['-ss', f'{start:.3f}']
    if seconds is not None:
        cmd += ['-t', f'{seconds:.3f}']
    cmd += ['-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-']
    return np.frombuffer(subprocess.run(cmd, check=True, capture_output=True).stdout, dtype=np.float32).copy()


def faded(sound, fade_in, fade_out):
    n_in, n_out = int(fade_in * SR), int(fade_out * SR)
    if n_in:
        sound[:n_in] *= np.linspace(0, 1, min(n_in, len(sound)))[: len(sound[:n_in])]
    if n_out:
        sound[-n_out:] *= np.linspace(1, 0, min(n_out, len(sound)))[-len(sound[-n_out:]):]
    return sound


def add(track, sound, at):
    start = int(at * SR)
    if start >= len(track):
        return
    end = min(len(track), start + len(sound))
    track[start:end] += sound[: end - start]


def load_edit(path):
    """An edit, or a language's cut of one: `base` (an edit beside it) with this one's keys over it (its cards, output, lang, cardsDir)."""
    edit = json.load(open(path))
    if 'base' in edit:
        base = load_edit(os.path.join(os.path.dirname(path), edit['base']))
        edit = {**base, **{k: v for k, v in edit.items() if k != 'base'}}
    return edit


def main():
    edit = load_edit(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'edit.json'))
    fps = edit.get('fps', 60)
    cards_dir = os.path.join(OUT, edit.get('cardsDir', 'cards'))
    # A language's own recordings (its HUD in that language: trailer-out/shots-<lang>) before the shared ones (no HUD).
    shot_dirs = ([os.path.join(OUT, f"shots-{edit['lang']}")] if edit.get('lang', 'en') != 'en' else []) + [os.path.join(OUT, 'shots')]

    def shot_file(shot, ext):
        for folder in shot_dirs:
            path = os.path.join(folder, f'{shot}.{ext}')
            if os.path.exists(path):
                return path
        raise FileNotFoundError(f'{shot}.{ext} in {shot_dirs}')

    # The timeline: each entry's start and length.
    timeline, t = [], 0.0
    for entry in edit['entries']:
        length = entry['seconds'] if 'plate' in entry else entry['out'] - entry['in']
        timeline.append((entry, t, length))
        t += length
    total = t

    # ---- Picture ------------------------------------------------------------------------------------------------------------------
    inputs, chains, labels = [], [], []
    for index, (entry, start, length) in enumerate(timeline):
        if 'plate' in entry:
            inputs += ['-loop', '1', '-framerate', str(fps), '-t', f'{length:.4f}', '-i', os.path.join(cards_dir, f"{entry['plate']}.png")]
            chains.append(f'[{index}:v]scale=1080:1920,format=yuv420p,setsar=1,fps={fps},setpts=PTS-STARTPTS[v{index}]')
        else:
            inputs += ['-ss', f"{entry['in']:.4f}", '-t', f'{length:.4f}', '-i', shot_file(entry['shot'], 'mp4')]
            chains.append(f'[{index}:v]scale=1080:1920,setsar=1,fps={fps},format=yuv420p,setpts=PTS-STARTPTS[v{index}]')
        labels.append(f'[v{index}]')
    chains.append(f"{''.join(labels)}concat=n={len(labels)}:v=1:a=0[base0]")
    base, n = 'base0', len(timeline)
    for entry, start, length in timeline:
        for over in entry.get('cards', []):
            a, b = start + over['from'], start + min(over['to'], length)
            fade = over.get('fade', 0.2)
            inputs += ['-loop', '1', '-framerate', str(fps), '-t', f'{b - a:.4f}', '-i', os.path.join(cards_dir, f"{over['card']}.png")]
            chains.append(f"[{n}:v]format=rgba,fade=in:st=0:d={fade}:alpha=1,fade=out:st={max(0, b - a - fade):.3f}:d={fade}:alpha=1,setpts=PTS-STARTPTS+{a:.4f}/TB[c{n}]")
            chains.append(f"[{base}][c{n}]overlay=0:0:enable='between(t,{a:.4f},{b:.4f})':eof_action=pass[base{n}]")
            base, n = f'base{n}', n + 1
    picture = os.path.join(OUT, 'picture.mp4')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', *inputs, '-filter_complex', ';'.join(chains), '-map', f'[{base}]',
                    '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-r', str(fps), picture], check=True)

    # ---- Sound --------------------------------------------------------------------------------------------------------------------
    mix = edit.get('mix', {})
    music, ambience, sfx = (np.zeros(int(total * SR) + SR, np.float32) for _ in range(3))
    for piece in edit.get('music', []):
        # Over a run of entries ([first, last]), or by timeline second (at, until).
        if 'entries' in piece:
            a, b = piece['entries']
            piece = {**piece, 'at': timeline[a][1], 'until': timeline[b][1] + timeline[b][2]}
        length = piece['until'] - piece['at']
        source = os.path.join(ROOT, piece['path']) if 'path' in piece else os.path.join(ROOT, 'assets/music', f"{piece['file']}.mp3")
        sound = decode(source, piece.get('in', 0), length) * piece.get('gain', 0.5)
        add(music, faded(sound, piece.get('fadeIn', 0.3), piece.get('fadeOut', 0.5)), piece['at'])

    samples = os.path.join(ROOT, 'src/audio/samples')
    cache = {}

    def sample(family, key):
        files = sorted(glob.glob(os.path.join(samples, f'{family}-*.mp3'))) or sorted(glob.glob(os.path.join(samples, f'{family}.mp3')))
        if not files:
            return None
        path = files[int(hashlib.md5(key.encode()).hexdigest(), 16) % len(files)]
        if path not in cache:
            cache[path] = decode(path)
        return cache[path]

    heard = []
    for index, (entry, start, length) in enumerate(timeline):
        if 'plate' in entry:
            continue
        for loop in entry.get('ambience', []):
            bed = sample(loop, loop)
            if bed is not None and len(bed):
                bed = np.tile(bed, int(np.ceil(length * SR / len(bed))) + 1)[: int(length * SR)]
                add(ambience, faded(bed * mix.get('ambienceGain', 0.2), 0.15, 0.15), start)
        log = json.load(open(shot_file(entry['shot'], 'events.json')))
        for k, event in enumerate(log['events']):
            family = edit['sfx'].get(event['kind'])
            if not family or not (entry['in'] <= event['t'] < entry['out']):
                continue
            gain = max(mix.get('minGain', {}).get(family, 0.0), min(1.0, 6.0 / (event.get('d', 20) + 3.0)) * (1.6 if event.get('mine') else 1.0))
            heard.append((start + event['t'] - entry['in'], family, gain, f"{entry['shot']}{k}"))
    # Thinned: one of a family in 60 ms, and in each half second only the loudest few.
    heard.sort()
    kept, last = [], {}
    for at, family, gain, key in heard:
        if at - last.get(family, -1) < 0.06:
            continue
        last[family] = at
        kept.append((at, family, gain, key))
    cap = mix.get('maxPerHalfSecond', 7)
    windows = {}
    for item in kept:
        windows.setdefault(int(item[0] / 0.5), []).append(item)
    for items in windows.values():
        for at, family, gain, key in sorted(items, key=lambda i: -i[2])[:cap]:
            sound = sample(family, key)
            if sound is not None:
                add(sfx, sound * gain * mix.get('sfxGain', 0.9), at)

    track = music + ambience + sfx
    track /= max(1.0, float(np.max(np.abs(track))) / 0.95)
    wav = os.path.join(OUT, 'sound.wav')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-ac', '2', wav],
                   input=track[: int(total * SR)].tobytes(), check=True)

    # ---- Together, levelled --------------------------------------------------------------------------------------------------------
    final = os.path.join(OUT, edit.get('output', 'trailer.mp4'))
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', picture, '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy',
                    '-af', f"loudnorm=I={mix.get('loudness', -14)}:TP=-1:LRA=11", '-c:a', 'aac', '-b:a', '256k', '-ar', str(SR),
                    '-shortest', '-movflags', '+faststart', final], check=True)
    print(f'{final}: {total:.1f} s, {len(timeline)} entries, {len(kept)} sounds of {len(heard)} events')


if __name__ == '__main__':
    main()
