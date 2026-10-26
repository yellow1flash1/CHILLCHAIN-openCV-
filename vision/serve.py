"""Local development server with the same API as the Lambda function.

    VISION_API_KEY=dev python serve.py            # http://localhost:8787/grade
"""
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from chillvision.handler import lambda_handler


class H(BaseHTTPRequestHandler):
    def _go(self, method: str) -> None:
        n = int(self.headers.get("content-length") or 0)
        event = {
            "requestContext": {"http": {"method": method}},
            "rawPath": self.path,
            "headers": dict(self.headers),
            "body": self.rfile.read(n).decode() if n else None,
        }
        res = lambda_handler(event, None)
        self.send_response(res["statusCode"])
        for k, v in res["headers"].items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(res["body"].encode())

    def do_POST(self) -> None:  # noqa: N802
        self._go("POST")

    def do_GET(self) -> None:  # noqa: N802
        self._go("GET")


if __name__ == "__main__":
    os.environ.setdefault("VISION_API_KEY", "dev")
    port = int(os.environ.get("PORT", "8787"))
    print(json.dumps({"listening": f"http://localhost:{port}", "key": "x-chillchain-key"}))
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
