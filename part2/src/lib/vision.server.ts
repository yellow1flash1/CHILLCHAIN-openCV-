// Server-only: the OpenCV 5 grading agent running on AWS Lambda (see vision/ and docs/OPENCV-AWS.md).
// The photo goes to the service with the crop; the agent answers with a grade, ripeness and defects, plus
// the next action for the grower (retake with a fix, confirm an unsure grade, sort out bad pieces, or
// accept). If the service is not configured or not reachable, the caller falls back to Gemini Vision.
import type { Grade } from "./shelf";
import type { VisionAction, VisionView } from "./vision";

export type { VisionAction, VisionView } from "./vision";

export interface VisionStep {
  step: number;
  tool: string;
  observed: Record<string, unknown>;
  decision: string;
  ms: number;
}

export interface VisionResult {
  is_crop: boolean;
  grade: Grade;
  confidence: number; // 0–1
  ripeness: number | null; // 1–5, null when the crop has no colour-ripeness rule
  uniformity: number; // 0–100
  pieces: number;
  piece_grades: Record<Grade, number>;
  defect_share: number;
  colour_match: number;
  segmentation: string;
  defects: string[];
  reason: string;
}

export interface VisionResponse {
  ok: boolean;
  crop: string;
  next_action: VisionAction;
  result?: VisionResult;
  trace: VisionStep[];
  total_ms: number;
  opencv_version: string;
  annotated_jpeg: string | null;
  scan_id: string;
  s3?: { bucket: string; photo: string; annotated: string; trace: string };
}

/** The service could not answer (not set up, network, timeout or a server error). */
export class VisionUnavailable extends Error {}

export const visionEnabled = () =>
  Boolean(process.env["VISION_API_URL"] && process.env["VISION_API_KEY"]);

export async function opencvGrade(image: string, crop: string): Promise<VisionResponse> {
  const url = process.env["VISION_API_URL"];
  const key = process.env["VISION_API_KEY"];
  if (!url || !key) throw new VisionUnavailable("Vision service is not configured");
  let res: Response;
  try {
    res = await fetch(`${url.replace(/\/$/, "")}/grade`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-chillchain-key": key },
      body: JSON.stringify({ image, crop }),
      signal: AbortSignal.timeout(28_000),
    });
  } catch (e) {
    throw new VisionUnavailable(e instanceof Error ? e.message : "Vision service unreachable");
  }
  if (res.status >= 500 || res.status === 429 || res.status === 401 || res.status === 403)
    throw new VisionUnavailable(`Vision service answered ${res.status}`);
  const j = (await res.json()) as VisionResponse | { error: string };
  if (!res.ok || "error" in j) throw new Error(`Vision: ${"error" in j ? j.error : res.status}`);
  return j;
}

/** What is kept in scans.vision: no images, just the evidence behind the grade. */
export function visionRecord(v: VisionResponse) {
  return {
    opencv: v.opencv_version,
    action: v.next_action,
    ms: v.total_ms,
    pieces: v.result?.pieces ?? 0,
    piece_grades: v.result?.piece_grades ?? null,
    defect_share: v.result?.defect_share ?? null,
    colour_match: v.result?.colour_match ?? null,
    segmentation: v.result?.segmentation ?? null,
    steps: v.trace.map((s) => ({
      tool: s.tool,
      decision: s.decision,
      ms: s.ms,
    })),
    s3: v.s3 ?? null,
  };
}

export const visionView = (v: VisionResponse): VisionView => ({
  annotated: v.annotated_jpeg,
  action: v.next_action,
  steps: v.trace.map((s) => ({ tool: s.tool, decision: s.decision, ms: s.ms })),
  ms: v.total_ms,
  opencv: v.opencv_version,
});
