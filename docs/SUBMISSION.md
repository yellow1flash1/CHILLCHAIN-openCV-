# Submitting ChillChain to the OpenCV AI Competition 2026

**Deadline: 26 October 2026, 11:59 PM Pacific = 27 October, 12:29 PM IST.** Submit an hour early;
Devpost slows down at the end.

## Before anything else (10 minutes)

- [ ] Read the **Rules** tab on opencv26.devpost.com: can a project also entered in Prompt-ae-thon
      be submitted, and can a team that did not send the grant proposal still enter? If either is
      "no", stop here.
- [ ] Team size: the rules mention both "1–5" and "no more than four". You are four, so you are fine either way.

## Order of work

| #   | Task                                                                                                   | Who             | Time                      |
| --- | ------------------------------------------------------------------------------------------------------ | --------------- | ------------------------- |
| 1   | Deploy the vision service (`vision/README.md` → Deploy)                                                | Rahul           | 30–45 min                 |
| 2   | Run `neon/013_opencv_vision.sql`, set `VISION_API_URL` / `VISION_API_KEY` secrets, `bun run deploy`    | Rahul / Parth   | 15 min                    |
| 3   | Buy strawberries (or the crop you'll demo). Take 40+ photos: good, bruised, unripe, plus a few "other" | Anmol / Anirudh | 1 h, in parallel with 1–2 |
| 4   | `python eval/evaluate.py` on those photos; put the numbers in `docs/OPENCV-AWS.md` §7                  | Parth           | 20 min                    |
| 5   | Record the video (script below)                                                                        | everyone        | 1 h                       |
| 6   | Fill in Devpost (text below), link repo + video + live URL                                             | Rahul           | 30 min                    |

If the AWS deploy fails and time runs out, the entry does **not** meet the AWS requirement. Ask
in the competition Slack early rather than late.

## Submission package (from the official overview)

- [ ] Technical report → `docs/OPENCV-AWS.md` (export to PDF if Devpost asks for a file)
- [ ] Code repository, judge-accessible → this repo
- [ ] Pinned dependencies + build, deploy and test instructions → `vision/requirements.txt`, `bun.lock`, `vision/README.md`, `docs/SETUP.md`
- [ ] Architecture diagram showing OpenCV 5 and AWS → `docs/OPENCV-AWS.md` §4 (screenshot the rendered Mermaid for Devpost)
- [ ] Working endpoint → https://chillchain.chillchain.workers.dev (give judges a test login if sign-in is required)
- [ ] Video ≤ 5 minutes, public or unlisted
- [ ] Evaluation evidence incl. failure cases → `eval-out/report.md` + 2–3 annotated mistakes
- [ ] Agentic Vision extras: agent workflow diagram (`vision/README.md`), a trace showing OpenCV output changing the next action (the "How the AI decided" panel and `traces/` in S3), task success, failure handling and human control (report §3, §7, §9)

## Devpost text

**Tagline:** An OpenCV 5 agent on AWS that grades a crate from one phone photo, tells the grower which berries to pull, and starts the sell-by clock.

**Inspiration.** Strawberries, litchi and dragon fruit earn a lot and spoil in days. Small Indian growers have no grading line, so the whole lot gets the grade of its worst berries, at the buyer's gate, after hours in the heat.

**What it does.** A grower photographs a lot in the ChillChain app. On AWS, an OpenCV 5 agent checks the photo, finds every piece, measures bruises, browning, mould and ripe colour on each, and grades the lot the way buyers do. It then acts: asks for a better photo with the exact fix, asks the grower to confirm an uncertain grade, or tells them to pull out the outlined bad pieces and rescan for a higher grade. The confirmed grade sets the lot's sell-by clock, price channel and next move: pre-cool, sell, share a reefer, ripen, or send to a processor.

**How we built it.** OpenCV 5.0.0 in Python: Laplacian focus check, neutral-pixel white balance and CLAHE, three segmenters (border background model with Otsu, crop-colour prior, GrabCut) that the agent switches between, distance-transform watershed to separate touching fruit, black-hat bruise detection, texture-based mould detection. It runs on AWS Lambda (arm64/Graviton) behind a throttled API Gateway, stores photos, annotated images and decision traces in an encrypted S3 bucket, and publishes metrics to a CloudWatch dashboard. The app (React 19, TanStack Start, Neon Postgres, 15 languages) calls it for every photo, with Gemini Vision as fallback.

**Challenges.** A crate full of red berries fooled our white balance (the photo _is_ red) and our background model (there is no background); the dark gaps between berries looked like bruises. Each fix became a decision the agent makes from what it measures.

**What we learned.** Classical OpenCV is fast, cheap and explainable enough for a grower to trust, if every decision is shown.

**What's next.** Fit the thresholds on hundreds of real photos per crop, add a trained piece detector, try COOL on Graviton EC2 for batch re-grading at pack-houses, and pilot with an FPO.

**Built with:** opencv, python, aws-lambda, amazon-api-gateway, amazon-s3, amazon-cloudwatch, aws-sam, graviton, react, typescript, tanstack, postgresql, neon, cloudflare-workers

## Video script (≤ 5:00)

| Time      | Show                                                                                 | Say                                                                                                                |
| --------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:25 | Team on camera, a crate of strawberries                                              | Who you are; "strawberries earn ₹300/kg and spoil in two days; a crate is graded by its worst berries".            |
| 0:25–0:50 | App home: pick role, crop                                                            | ChillChain gives every lot a sell-by clock. Everything depends on the grade.                                       |
| 0:50–1:50 | Scan a **good** punnet live → grade A, annotated photo, "How the AI decided"         | Walk through the steps on screen: photo check, segmentation, pieces, defects, decision. OpenCV 5 on Lambda, ~X ms. |
| 1:50–2:50 | Put 2 bruised berries in → scan → **sort and rescan**; pull them out → scan → A      | The key moment: the vision result changes what the grower does, and the lot's price.                               |
| 2:50–3:20 | Blurry or dark photo → retake with fix; wrong fruit → "doesn't look like strawberry" | Failure handling.                                                                                                  |
| 3:20–3:40 | Borderline photo → confirm dialog                                                    | Human in the loop: unsure grades are never saved silently.                                                         |
| 3:40–4:20 | Architecture diagram; AWS console: Lambda (arm64), S3 traces, CloudWatch dashboard   | The AWS part: Graviton Lambda, private S3 with expiry, metrics, throttling.                                        |
| 4:20–4:45 | `eval-out/report.md` + one annotated mistake                                         | Real numbers from your photos, and an honest failure case.                                                         |
| 4:45–5:00 | Sell-by clock + Best move on the A-grade lot                                         | Close: from one photo to the next right move.                                                                      |
