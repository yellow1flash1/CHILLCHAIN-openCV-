-- 013: grades made by the OpenCV 5 vision service on AWS (vision/), and what it saw.
-- Run once, after 012.

-- 'opencv' = graded by the OpenCV 5 agent on AWS Lambda. Gemini Vision ('ai_vision') stays as the fallback.
ALTER TABLE scans DROP CONSTRAINT IF EXISTS scans_grade_source_check;
ALTER TABLE scans ADD CONSTRAINT scans_grade_source_check
  CHECK (grade_source IN ('model', 'ai_vision', 'opencv', 'self', 'simulated'));

-- Compact record of the vision run: pieces found, per-piece grades, defect share, the agent's action,
-- its decision steps, timing, the OpenCV version and where the photo, annotated image and trace are in S3.
ALTER TABLE scans ADD COLUMN IF NOT EXISTS vision jsonb;
