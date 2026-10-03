# Dev server that forbids caching: ES modules are otherwise cached by the
# browser on their Last-Modified date, and an edit can go unseen.
# Usage: python3 tools/serve.py [port]
import http.server
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8934
    http.server.ThreadingHTTPServer(('127.0.0.1', port), NoCacheHandler).serve_forever()
