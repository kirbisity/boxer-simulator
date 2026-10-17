# Dev server that forbids caching: ES modules are otherwise cached by the
# browser on their Last-Modified date, and an edit can go unseen.
#
# It also takes the screenshots of the looks harness (src/looks.js): a page
# POSTs a PNG (a data URL or the raw bytes) to /__shot?name=<file> and it is
# written to shots/<file>.png. Only the machine itself may post.
# Usage: python3 tools/serve.py [port]
import base64
import http.server
import os
import re
import sys
from urllib.parse import parse_qs, urlparse

SHOTS_DIRECTORY = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'shots')
# A shot is at most this big (a 4K PNG is a few MB).
LARGEST_SHOT_BYTES = 32 * 1024 * 1024


def shot_filename(raw_name):
    """A file name made only of letters, digits, dots, dashes and underscores, ending in .png; None if nothing is left."""
    stem = re.sub(r'[^A-Za-z0-9._-]', '-', os.path.basename(raw_name or '')).strip('.-')
    stem = re.sub(r'\.png$', '', stem, flags=re.IGNORECASE)
    return f'{stem}.png' if stem else None


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def reply(self, status, text):
        body = text.encode()
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != '/__shot':
            return self.reply(404, 'only /__shot takes a POST')
        if self.client_address[0] != '127.0.0.1':
            return self.reply(403, 'shots are taken from this machine only')
        filename = shot_filename(parse_qs(parsed.query).get('name', [''])[0])
        if not filename:
            return self.reply(400, 'name= is required')
        length = int(self.headers.get('Content-Length') or 0)
        if length <= 0 or length > LARGEST_SHOT_BYTES:
            return self.reply(413, 'the body is empty or too big')
        body = self.rfile.read(length)
        # A data URL ("data:image/png;base64,...") or the PNG bytes themselves.
        if body.startswith(b'data:'):
            body = base64.b64decode(body.split(b',', 1)[1])
        if not body.startswith(b'\x89PNG'):
            return self.reply(400, 'the body is not a PNG')
        os.makedirs(SHOTS_DIRECTORY, exist_ok=True)
        with open(os.path.join(SHOTS_DIRECTORY, filename), 'wb') as file:
            file.write(body)
        self.reply(200, f'shots/{filename} {len(body)} bytes')


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8934
    http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
