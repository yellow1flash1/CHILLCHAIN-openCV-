"""Behaviour tests for the grading agent on synthetic scenes (see synth.py).

These check the agent's decisions and the OpenCV pipeline's logic. Accuracy on real photos is
measured separately with eval/evaluate.py on the team's labelled photo set."""
import base64
import json
import os
import sys

import cv2
import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(__file__))
from synth import GREEN, scene  # noqa: E402

from chillvision.agent import grade_image  # noqa: E402
from chillvision import handler  # noqa: E402


def run(img, crop="strawberry"):
    return grade_image(img, crop)


def test_uses_opencv_5():
    assert cv2.__version__.startswith("5.")


def test_clean_lot_is_grade_a_and_accepted():
    r = run(scene())
    assert r["next_action"]["type"] == "accept"
    assert r["result"]["grade"] == "A"
    assert r["result"]["pieces"] == 9
    assert r["result"]["ripeness"] == 3
    assert r["result"]["confidence"] >= 0.9


def test_a_few_bruised_pieces_trigger_sort_and_rescan():
    r = run(scene(n=12, bad=(3, 7)))
    a = r["next_action"]
    assert r["result"]["grade"] == "C"  # worst 10% of 12 pieces = the 2 bruised ones
    assert a["type"] == "sort_and_rescan"
    assert a["remove"] == 2 and a["grade_if_sorted"] == "A"
    # the vision result changed what the agent does next, and the trace shows why
    assert "sort and rescan" in r["trace"][-1]["decision"]


def test_mould_is_detected():
    r = run(scene(n=6, mould=(2,)))
    assert r["result"]["piece_grades"]["C"] == 1
    assert r["next_action"]["type"] == "sort_and_rescan"


def test_widespread_damage_is_grade_c_without_sorting():
    r = run(scene(n=8, bad=(0, 1, 2, 3)))
    assert r["result"]["grade"] == "C"
    assert r["next_action"]["type"] == "accept"  # sorting half the lot is not a fix


def test_unripe_strawberries_are_b_and_stage_1():
    r = run(scene(colour=GREEN))
    assert r["result"]["grade"] == "B"
    assert r["result"]["ripeness"] == 1


@pytest.mark.parametrize(
    "img,code",
    [
        (cv2.GaussianBlur(scene(), (41, 41), 0), "blur"),
        ((scene() * 0.12).astype(np.uint8), "dark"),
        (scene(colour=(200, 80, 30)), "not_crop"),  # blue objects are not strawberries
    ],
)
def test_retakes_with_a_specific_fix(img, code):
    r = run(img)
    assert r["next_action"]["type"] == "retake"
    assert r["next_action"]["code"] == code
    assert r["next_action"]["hint"]


def test_photo_without_produce_asks_for_a_retake():
    noise = np.random.default_rng(0).integers(90, 170, (600, 800, 3), dtype=np.uint8)
    r = run(cv2.GaussianBlur(noise, (3, 3), 0))
    assert r["next_action"]["type"] == "retake"
    assert r["next_action"]["code"] in ("no_produce", "not_crop")


def test_dim_photo_is_enhanced_then_graded():
    r = run((scene() * 0.38).astype(np.uint8))
    tools = [s["tool"] for s in r["trace"]]
    assert tools[:2] == ["assess_capture", "enhance"]
    assert r["result"]["grade"] == "A"


def test_full_crate_switches_segmentation_method_and_splits_pieces():
    r = run(scene(n=20, bg=(30, 28, 35), radius=105, cols=5, bad=(6,)))
    tools = [s["tool"] for s in r["trace"]]
    assert "segment[background]" in tools and "segment[colour_prior]" in tools
    assert r["result"]["pieces"] == 20
    assert r["result"]["grade"] == "A"  # 1 bad of 20 is under the worst-10% rule...
    assert r["next_action"]["flagged"] == 1  # ...but it is still flagged for removal


def test_crop_without_colour_model_grades_on_defects():
    r = run(scene(colour=(60, 120, 150)), crop="kiwi")
    assert r["result"]["ripeness"] is None
    assert r["result"]["grade"] in ("A", "B")


def test_lambda_handler_end_to_end(monkeypatch):
    monkeypatch.setenv("VISION_API_KEY", "k" * 24)
    monkeypatch.delenv("SCANS_BUCKET", raising=False)
    ok, buf = cv2.imencode(".jpg", scene())
    body = json.dumps({"image": base64.b64encode(buf.tobytes()).decode(), "crop": "strawberry"})
    ev = {"requestContext": {"http": {"method": "POST"}}, "rawPath": "/grade",
          "headers": {"X-ChillChain-Key": "k" * 24}, "body": body}
    res = handler.lambda_handler(ev, None)
    assert res["statusCode"] == 200
    out = json.loads(res["body"])
    assert out["result"]["grade"] == "A" and out["annotated_jpeg"]
    ev["headers"] = {"x-chillchain-key": "wrong"}
    assert handler.lambda_handler(ev, None)["statusCode"] == 401
