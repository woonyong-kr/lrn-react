"""Serve just this checkout on loopback; Ctrl-C owns this server's lifetime."""

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from functools import partial
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--port", type=int, default=8766)
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(
    ("127.0.0.1", args.port), partial(SimpleHTTPRequestHandler, directory=str(root))
)
print(
    f"http://127.0.0.1:{args.port} (offline fixtures; ?data=remote opts into PokeAPI)",
    flush=True,
)
try:
    server.serve_forever()
except KeyboardInterrupt:
    pass
finally:
    server.server_close()
