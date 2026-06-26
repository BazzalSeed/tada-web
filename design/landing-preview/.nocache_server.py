import os
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

DIR = os.path.dirname(os.path.abspath(__file__))

class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

class Server(ThreadingHTTPServer):
    allow_reuse_address = True

# serve this directory regardless of the working directory; "/" -> index.html automatically
Server(("127.0.0.1", 8731), partial(H, directory=DIR)).serve_forever()
