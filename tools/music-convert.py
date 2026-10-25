#!/usr/bin/env python3
"""Turn the ACE-Step 1.5 renders of the music cues into the game's embedded data modules.

Usage: python3 tools/music-convert.py [--raw DIR] [--report]

For each cue in tools/music-prompts.json it reads every take (<raw>/<cue>-<seed>.wav, rendered by mugen-lab's
scripts/gen.py with the cue's prompt), picks the best one and writes src/audio/music/data/<cue>.js, then the
MUSIC_CUES block of src/audio/music/manifest.js.

- Loops: a window of about `loop` seconds is cut where the level is steady and the audio at its end matches the audio
  at its start (normalised cross-correlation over the cross-fade). The first CROSSFADE seconds of the loop are an
  equal-power blend of the start with what follows the end, so the last sample runs into the first. The file is then
  the loop with PAD seconds of its own end before it and of its start after it: loopStart/loopEnd mark the loop, and
  an MP3 encoder delay smaller than PAD only shifts the phase of a periodic signal.
- Stings: from the first sound, at most `sting` seconds (or to where the take falls silent), faded out.
- Loudness: each cue is set to TARGET_LUFS integrated (ffmpeg ebur128); where that would push the peak past PEAK, the
  file is kept lower and the manifest gain makes up the rest.
- Encoding: mono MP3, CBR BITRATE kb/s at RATE Hz (lame), base64.
"""
import argparse, base64, datetime, json, re, subprocess, tempfile, wave
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
# mugen-lab sits beside the repo (or beside the checkout that holds this worktree).
RAW = next((base / 'mugen-lab' / 'out' / 'gladiator' for base in (ROOT.parent, ROOT.parents[3])
            if (base / 'mugen-lab').exists()), ROOT.parent / 'mugen-lab' / 'out' / 'gladiator')
PROMPTS = ROOT / 'tools' / 'music-prompts.json'
DATA_DIR = ROOT / 'src' / 'audio' / 'music' / 'data'
MANIFEST = ROOT / 'src' / 'audio' / 'music' / 'manifest.js'

RATE = 32000
BITRATE = 48
CROSSFADE = 1.5
PAD = 0.2
SEARCH = 0.25
HEAD = 4.0
TARGET_LUFS = -18.0
PEAK = 10 ** (-1.0 / 20)
STING_FADE = 1.5
QUIET_DB = -45.0
WINDOW = 0.5


def decode(path):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'],
                         check=True, capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)


def write_wav(path, x):
    pcm = (np.clip(x, -1, 1) * 32767).round().astype('<i2')
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())


def lufs(x):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / 'm.wav'
        write_wav(path, x / max(1.0, np.abs(x).max()))
        log = subprocess.run(['ffmpeg', '-nostats', '-i', str(path), '-af', 'ebur128', '-f', 'null', '-'],
                             capture_output=True, text=True).stderr
    value = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', log)[-1])
    return value + 20 * np.log10(max(1.0, np.abs(x).max()))


def window_db(x):
    n = int(WINDOW * RATE)
    frames = x[:len(x) // n * n].reshape(-1, n)
    return 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)


def longest_quiet(db):
    run = best = 0
    for v in db:
        run = run + 1 if v < QUIET_DB else 0
        best = max(best, run)
    return best * WINDOW


def ncc_lags(a, b):
    """Normalised correlation of a against every placement of len(a) samples inside b."""
    n = len(a)
    size = 1 << int(np.ceil(np.log2(len(b) + n)))
    corr = np.fft.irfft(np.fft.rfft(b, size) * np.conj(np.fft.rfft(a, size)), size)[:len(b) - n + 1]
    energy = np.sqrt(np.convolve(b ** 2, np.ones(n), 'valid')) * np.sqrt((a ** 2).sum()) + 1e-12
    return corr / energy


def find_loop(x, seconds):
    length, fade, search = int(seconds * RATE), int(CROSSFADE * RATE), int(SEARCH * RATE)
    db = window_db(x)
    best = None
    for start in range(int(HEAD * RATE), len(x) - length - search - fade - RATE // 2, RATE // 2):
        segment = db[start // int(WINDOW * RATE):(start + length) // int(WINDOW * RATE)]
        steadiness = segment.std()
        quiet = longest_quiet(segment)
        lo = start + length - search
        scores = ncc_lags(x[start:start + fade], x[lo:lo + 2 * search + fade])
        lag = int(scores.argmax())
        score = scores[lag] - 0.03 * steadiness - 0.2 * quiet
        if best is None or score > best[0]:
            best = (score, start, lo + lag, scores[lag], steadiness, quiet)
    return best


def make_loop(x, start, end):
    fade = int(CROSSFADE * RATE)
    body = x[start:end].copy()
    t = np.linspace(0, np.pi / 2, fade)
    body[:fade] = x[start:start + fade] * np.sin(t) + x[end:end + fade] * np.cos(t)
    pad = int(PAD * RATE)
    return np.concatenate([body[-pad:], body, body[:pad]]), pad / RATE, (pad + len(body)) / RATE


def make_sting(x, seconds):
    db = window_db(x)
    loud = np.nonzero(db > QUIET_DB + 5)[0]
    first = int(loud[0] * WINDOW * RATE) if len(loud) else 0
    last = int((loud[-1] + 1) * WINDOW * RATE) if len(loud) else len(x)
    y = x[first:min(last, first + int(seconds * RATE))].copy()
    y[:int(0.01 * RATE)] *= np.linspace(0, 1, int(0.01 * RATE))
    fade = int(STING_FADE * RATE)
    y[-fade:] *= np.cos(np.linspace(0, np.pi / 2, fade)) ** 2
    return y, 0.0, len(y) / RATE


def judge(cue, spec, path):
    x = decode(path)
    db = window_db(x)
    clipped = float((np.abs(x) > 0.999).mean())
    inner = db[int(HEAD / WINDOW):-int(2 / WINDOW)] if len(db) > (HEAD + 2) / WINDOW else db
    quiet = longest_quiet(inner)
    if spec.get('loop'):
        score, start, end, match, steadiness, loop_quiet = find_loop(x, spec['loop'])
        audio, loop_start, loop_end = make_loop(x, start, end)
        detail = f'match {match:.2f} steadiness {steadiness:.1f} dB, cut {start / RATE:.2f}-{end / RATE:.2f} s'
    else:
        audio, loop_start, loop_end = make_sting(x, spec['sting'])
        score = -0.03 * window_db(audio).std() - 0.2 * quiet
        detail = f'length {len(audio) / RATE:.1f} s'
    score -= 50 * clipped
    return dict(path=path, score=score, audio=audio, loop_start=loop_start, loop_end=loop_end, clipped=clipped,
                quiet=quiet, raw_seconds=len(x) / RATE, detail=detail)


def level(audio):
    loudness = lufs(audio)
    want = 10 ** ((TARGET_LUFS - loudness) / 20)
    peak = np.abs(audio).max()
    file_gain = min(want, PEAK / peak)
    return audio * file_gain, want / file_gain, loudness


def encode(audio):
    with tempfile.TemporaryDirectory() as tmp:
        wav, mp3 = Path(tmp) / 'a.wav', Path(tmp) / 'a.mp3'
        write_wav(wav, audio)
        subprocess.run(['lame', '--silent', '-q', '2', '--cbr', '-b', str(BITRATE), '-m', 'm', str(wav), str(mp3)],
                       check=True)
        return mp3.read_bytes()


def const_name(cue):
    return f'MUSIC_DATA_{cue.upper()}'


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--raw', type=Path, default=RAW)
    p.add_argument('--report', action='store_true', help='judge the takes and print, write nothing')
    p.add_argument('--only', nargs='*', help='with --report: just these cues')
    a = p.parse_args()
    prompts = json.loads(PROMPTS.read_text())
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    entries, total = [], 0
    for cue, spec in prompts['cues'].items():
        if a.report and a.only and cue not in a.only:
            continue
        takes = [judge(cue, spec, path) for seed in spec['seeds'] for path in sorted(a.raw.glob(f'{cue}-{seed}.wav'))]
        if not takes:
            raise SystemExit(f'{cue}: no takes in {a.raw}')
        for take in takes:
            print(f'{cue:9} {take["path"].name:18} score {take["score"]:+.3f}  {take["detail"]}  '
                  f'clipped {take["clipped"] * 100:.3f}%  longest quiet {take["quiet"]:.1f} s  raw {take["raw_seconds"]:.1f} s')
        pick = max(takes, key=lambda t: t['score'])
        audio, gain, loudness = level(pick['audio'])
        mp3 = encode(audio)
        data = base64.b64encode(mp3).decode()
        total += len(data)
        print(f'  -> {pick["path"].name}: {len(audio) / RATE:.2f} s, {loudness:.1f} LUFS, gain {gain:.2f}, '
              f'{len(mp3) / 1024:.0f} KB mp3, {len(data) / 1024:.0f} KB base64')
        if a.report:
            continue
        seed = pick['path'].stem.rsplit('-', 1)[1]
        prompt = (spec['prompt'] + prompts['common']['suffix']).replace('*/', '* /')
        (DATA_DIR / f'{cue}.js').write_text(
            f'// Generated by tools/music-convert.py from ACE-Step 1.5 renders ({pick["path"].name}, seed {seed}) '
            f'on {datetime.date.today().isoformat()}. Do not edit.\n'
            f'// Prompt: "{prompt}"; {spec["bpm"]} bpm, {spec["key"]}, lyrics [Instrumental].\n'
            f'// Mono MP3 {BITRATE} kb/s at {RATE} Hz, base64.\n'
            f"export const {const_name(cue)} = '{data}';\n")
        entries.append(f"  {cue}: {{ data: {const_name(cue)}, mime: 'audio/mpeg', loop: {'true' if spec.get('loop') else 'false'}, "
                       f"loopStart: {pick['loop_start']:.4f}, loopEnd: {pick['loop_end']:.4f}, gain: {gain:.3f} }},")
    print(f'total base64 {total / 1e6:.2f} MB')
    if a.report:
        return
    imports = '\n'.join(f"import {{ {const_name(cue)} }} from './data/{cue}.js';" for cue in prompts['cues'])
    source = MANIFEST.read_text()
    source = re.sub(r'(// <generated imports>\n).*?(// </generated imports>)', lambda m: m[1] + imports + '\n' + m[2], source, flags=re.S)
    source = re.sub(r'(  // <generated cues>\n).*?(  // </generated cues>)', lambda m: m[1] + '\n'.join(entries) + '\n' + m[2], source, flags=re.S)
    MANIFEST.write_text(source)


main()
