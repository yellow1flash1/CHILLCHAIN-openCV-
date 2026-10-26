// Shared by the server and the scan screen: what the OpenCV 5 grading agent decided, and what the
// grower is shown. The request to the service itself lives in vision.server.ts.
import type { Grade } from "./shelf";

export type VisionActionType = "retake" | "confirm" | "sort_and_rescan" | "accept";
export type VisionRetakeCode = "blur" | "dark" | "glare" | "no_produce" | "not_crop";

export interface VisionAction {
  type: VisionActionType;
  code?: VisionRetakeCode;
  hint?: string;
  suggested_grade?: Grade;
  remove?: number;
  grade_if_sorted?: Grade;
  flagged?: number;
}

/** What the scan screen shows after an OpenCV grade. */
export interface VisionView {
  annotated: string | null;
  action: VisionAction;
  steps: { tool: string; decision: string; ms: number }[];
  ms: number;
  opencv: string;
}
