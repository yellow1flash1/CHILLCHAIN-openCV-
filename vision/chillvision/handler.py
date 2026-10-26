"""AWS Lambda entry point (API Gateway HTTP API, payload v2) for ChillChain Vision.

POST /grade   {"image": "<base64 JPEG/PNG>", "crop": "strawberry", "scan_ref": "optional id"}
GET  /health

Each graded photo, its annotated copy and the agent's full trace are written to S3 (bucket
SCANS_BUCKET), and one CloudWatch Embedded Metric Format line is logged per request, so latency,
grades and retake rates are on a CloudWatch dashboard without extra code.
"""

from __future__ import annotations

import base64
import hmac
import json
import os
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

import cv2

from .agent import grade_image
from .tools import Thresholds, decode, encode_jpeg

MAX_IMAGE_BYTES = 6 * 1024 * 1024
_s3 = None


def _thresholds() -> Thresholds:
    """thresholds.json (written by eval/evaluate.py --calibrate) overrides the defaults."""
    p = Path(os.environ.get("THRESHOLDS_FILE", Path(__file__).with_name("thresholds.json")))
    if p.exists():
        return Thresholds.from_dict(json.loads(p.read_text()))
    return Thresholds()


THRESHOLDS = _thresholds()


def _bucket():
    global _s3
    name = os.environ.get("SCANS_BUCKET")
    if not name:
        return None, None
    if _s3 is None:
        import boto3  # in the Lambda runtime; not needed for local runs

        _s3 = boto3.client("s3")
    return _s3, name


def _json(status: int, body: dict) -> dict:
    return {"statusCode": status, "headers": {"content-type": "application/json"}, "body": json.dumps(body)}


def _authorised(headers: dict) -> bool:
    want = os.environ.get("VISION_API_KEY", "")
    got = headers.get("x-chillchain-key", "")
    return bool(want) and hmac.compare_digest(want, got)


def grade_request(payload: dict) -> dict:
    """Grade one photo. Shared by Lambda and the local server."""
    crop = str(payload.get("crop", ""))[:40]
    if not crop:
        raise ValueError("crop is required")
    raw = base64.b64decode(payload.get("image", ""), validate=False)
    if not raw or len(raw) > MAX_IMAGE_BYTES:
        raise ValueError("image must be a base64 JPEG or PNG under 6 MB")
    img = decode(raw)
    out = grade_image(img, crop, THRESHOLDS)
    ann = out.pop("annotated", None)
    out["annotated_jpeg"] = base64.b64encode(encode_jpeg(ann)).decode() if ann is not None else None
    out["scan_id"] = str(payload.get("scan_ref") or uuid.uuid4())[:64]

    s3, bucket = _bucket()
    if s3:
        day = datetime.now(timezone.utc).strftime("%Y/%m/%d")
        base = f"{day}/{crop}/{out['scan_id']}"
        s3.put_object(Bucket=bucket, Key=f"photos/{base}.jpg", Body=raw, ContentType="image/jpeg")
        if ann is not None:
            s3.put_object(Bucket=bucket, Key=f"annotated/{base}.jpg", Body=encode_jpeg(ann, side=1024),
                          ContentType="image/jpeg")
        record = {k: v for k, v in out.items() if k != "annotated_jpeg"}
        s3.put_object(Bucket=bucket, Key=f"traces/{base}.json", Body=json.dumps(record).encode(),
                      ContentType="application/json")
        out["s3"] = {"bucket": bucket, "photo": f"photos/{base}.jpg", "annotated": f"annotated/{base}.jpg",
                     "trace": f"traces/{base}.json"}
    return out


def _metrics(out: dict, ms: float) -> None:
    """CloudWatch Embedded Metric Format: printed JSON becomes metrics, no API calls needed."""
    action = out.get("next_action", {}).get("type", "error")
    grade = (out.get("result") or {}).get("grade", "none")
    print(json.dumps({
        "_aws": {"Timestamp": int(time.time() * 1000), "CloudWatchMetrics": [{
            "Namespace": "ChillChain/Vision",
            "Dimensions": [["Action"], ["Grade"]],
            "Metrics": [{"Name": "LatencyMs", "Unit": "Milliseconds"}, {"Name": "Scans", "Unit": "Count"}],
        }]},
        "Action": action, "Grade": grade, "Crop": out.get("crop"), "LatencyMs": ms, "Scans": 1,
        "OpenCV": cv2.__version__,
    }))


def lambda_handler(event: dict, context) -> dict:  # noqa: ANN001 - Lambda signature
    method = event.get("requestContext", {}).get("http", {}).get("method", "POST")
    path = event.get("rawPath", "/grade")
    if method == "GET" and path.endswith("/health"):
        return _json(200, {"ok": True, "opencv": cv2.__version__})
    headers = {k.lower(): v for k, v in (event.get("headers") or {}).items()}
    if not _authorised(headers):
        return _json(401, {"error": "unauthorised"})
    t0 = time.perf_counter()
    try:
        body = event.get("body") or "{}"
        if event.get("isBase64Encoded"):
            body = base64.b64decode(body).decode()
        out = grade_request(json.loads(body))
    except (ValueError, json.JSONDecodeError) as e:
        return _json(400, {"error": str(e)})
    _metrics(out, round((time.perf_counter() - t0) * 1000, 1))
    return _json(200, out)
