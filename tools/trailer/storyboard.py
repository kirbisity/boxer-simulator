"""The launch video's storyboard, for review before a final export: one numbered panel per entry of an edit (a frame from the middle
of its piece of the take, with its shot, its place on the cut, its in/out and the captions over it), and a light preview of the cut
(540x960, quick to send). Not part of the game.

    python3 tools/trailer/storyboard.py [edit.json]   ->  trailer-out/previews/<output>-board.jpg, <output>-preview.mp4
    (the preview from the assembled cut, trailer-out/<output>: run assemble.py first)
"""
import json
import os
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from assemble import HERE, OUT, load_edit  # noqa: E402

W, H, COLS = 270, 480, 6


def font(size):
    for path in ['/System/Library/Fonts/Hiragino Sans GB.ttc', '/System/Library/Fonts/STHeiti Medium.ttc', '/System/Library/Fonts/Helvetica.ttc', '/Library/Fonts/Arial Unicode.ttf']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def frame(path, at):
    out = os.path.join(OUT, 'previews', '_frame.png')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-ss', f'{at:.3f}', '-i', path, '-frames:v', '1', '-vf', f'scale={W}:{H}', out], check=True)
    return Image.open(out).convert('RGB')


def main():
    edit = load_edit(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'edit.json'))
    os.makedirs(os.path.join(OUT, 'previews'), exist_ok=True)
    name = os.path.splitext(edit['output'])[0]
    cut = os.path.join(OUT, edit['output'])
    dirs = ([os.path.join(OUT, f"shots-{edit['lang']}")] if edit.get('lang', 'en') != 'en' else []) + [os.path.join(OUT, 'shots')]
    small, big = font(15), font(22)
    panels, t = [], 0.0
    for n, entry in enumerate(edit['entries'], 1):
        length = entry['seconds'] if 'plate' in entry else entry['out'] - entry['in']
        if 'plate' in entry:
            image = Image.open(os.path.join(OUT, edit.get('cardsDir', 'cards'), f"{entry['plate']}.png")).convert('RGB').resize((W, H))
            label = f"plate {entry['plate']}"
        else:
            source = next(os.path.join(d, f"{entry['shot']}.mp4") for d in dirs if os.path.exists(os.path.join(d, f"{entry['shot']}.mp4")))
            image = frame(source, entry['in'] + length / 2)
            label = f"{entry['shot']}  {entry['in']:.1f}-{entry['out']:.1f}"
        draw = ImageDraw.Draw(image)
        draw.rectangle([0, 0, W, 58], fill=(0, 0, 0))
        draw.text((8, 4), f'{n}', font=big, fill=(228, 193, 114))
        draw.text((40, 6), label, font=small, fill=(236, 229, 211))
        draw.text((40, 30), f'{t:.1f}-{t + length:.1f} s  ({length:.1f})', font=small, fill=(180, 175, 160))
        cards = [edit['cards'][c['card']] for c in entry.get('cards', [])]
        if cards:
            text = ' / '.join(c['text'].replace('<br>', ' ') for c in cards)[:90]
            draw.rectangle([0, H - 40, W, H], fill=(0, 0, 0))
            draw.text((6, H - 34), text, font=font(12), fill=(236, 229, 211))
        panels.append(image)
        t += length
    rows = (len(panels) + COLS - 1) // COLS
    board = Image.new('RGB', (W * COLS, H * rows), (12, 11, 9))
    for k, panel in enumerate(panels):
        board.paste(panel, ((k % COLS) * W, (k // COLS) * H))
    board.save(os.path.join(OUT, 'previews', f'{name}-board.jpg'), quality=88)
    if os.path.exists(cut):
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', cut, '-vf', 'scale=540:960', '-c:v', 'libx264', '-crf', '26', '-preset', 'fast', '-c:a', 'aac', '-b:a', '128k',
                        os.path.join(OUT, 'previews', f'{name}-preview.mp4')], check=True)
    os.remove(os.path.join(OUT, 'previews', '_frame.png')) if os.path.exists(os.path.join(OUT, 'previews', '_frame.png')) else None
    print(os.path.join(OUT, 'previews', f'{name}-board.jpg'), f'{t:.1f} s')


if __name__ == '__main__':
    main()
