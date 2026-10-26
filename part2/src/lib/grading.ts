// Grading guide sent to Gemini Vision with each photo, and the shape of its answer.
// Pure, so the server and tests share it.
import type { Crop } from "./crops";
import type { Grade } from "./shelf";

/** What Gemini returns for one photo. */
export interface AIGrade {
  is_crop: boolean;
  grade: Grade;
  ripeness: number;
  uniformity: number;
  confidence: number;
  defects: string[];
  reason: string;
}

/** Below this, the app asks for a better photo instead of guessing. */
export const AI_MIN_CONFIDENCE = 0.6;

/** JSON schema Gemini must answer in (Gemini API `responseSchema`). */
export const GRADE_SCHEMA = {
  type: "OBJECT",
  properties: {
    is_crop: { type: "BOOLEAN" },
    grade: { type: "STRING", enum: ["A", "B", "C"] },
    ripeness: { type: "INTEGER" },
    uniformity: { type: "INTEGER" },
    confidence: { type: "NUMBER" },
    defects: { type: "ARRAY", items: { type: "STRING" } },
    reason: { type: "STRING" },
  },
  required: ["is_crop", "grade", "ripeness", "uniformity", "confidence", "defects", "reason"],
} as const;

// What A, B and C mean for crops where the general rule is not enough.
const NOTES: Record<string, string> = {
  strawberry:
    "A: at least 90% red, glossy, firm, fresh green cap, even size, no white tips, no mould. B: some white or pink shoulders, small soft spots, uneven size. C: bruised, leaking, grey mould, misshapen, dull or dark.",
  litchi:
    "A: bright red or pink shell with no browning, large and even, fresh. B: browning or small cracks on a few fruit. C: dark brown shells, cracked, leaking or mouldy fruit.",
  dragon:
    "A: bright, even pink or red skin, green fresh bracts (leaf tips), firm, no bruises. B: yellowing bract tips or small marks. C: shrivelled skin, soft dark patches, sunburn or cracks.",
  avocado:
    "A: smooth even skin with no sunburn or blemish, even size. B: minor skin marks. C: dark sunken spots, cracks, soft decay. Ripeness from skin: bright green and firm-looking is unripe (1–2).",
  mango:
    "A: typical shape and colour, no sap burn, no black spots, firm. B: minor sap burn or a few small spots. C: many black spots, soft or wrinkled skin.",
  grapes:
    "A: full bunches, even berry size and colour, green stems, no split or loose berries. B: some uneven berries or browning stems. C: shrivelled, split, mouldy or many loose berries.",
  pomegranate:
    "A: deep even red, smooth, no cracks or sunburn. B: minor sunburn or scars. C: cracked, bruised or decaying.",
  cherry:
    "A: dark, glossy, firm, green stems, no cracks. B: small cracks or slightly soft. C: split, bruised or mouldy.",
  fig: "A: whole, plump, even colour, no splits or souring. B: small splits or slightly soft. C: burst, leaking, sour or mouldy.",
  kiwi: "A: even shape and size, firm, no bruises or shrivelling. B: small marks or slight shape defects. C: soft, shrivelled or bruised.",
  blueberry:
    "A: deep blue with natural white bloom, firm, dry, even size. B: some red or green berries, a few soft ones. C: leaking, wrinkled or mouldy berries.",
  apple:
    "A: full typical colour, firm, smooth, no bruises or scab. B: minor marks or less colour. C: bruised, scabbed, rotten or shrivelled.",
  cherry_tomato:
    "A: even colour for the variety, firm, glossy, no cracks. B: uneven colour or small marks. C: cracked, soft, split or rotten.",
  jamun:
    "A: deep purple-black, plump, firm, glossy. B: some soft or uneven fruit. C: crushed, leaking or fermented fruit.",
};
const GROUP_NOTES: Partial<Record<Crop["group"], string>> = {
  flower:
    "Grade the stems: A: long straight stems, even length, buds at the right opening stage, no bent necks, no petal damage. B: shorter or uneven stems, small petal marks. C: wilted, bent necks, browning or damaged petals. Ripeness here means bud opening: 1 tight bud to 5 fully open or fading.",
  mushroom:
    "A: clean white or typical colour, closed caps (veil intact), firm, even size. B: slightly opened veils, light browning. C: open caps, brown spots, slimy or dried out. Ripeness here means cap opening: 1 tight closed to 5 flat open.",
  greens:
    "A: fresh, upright, even colour and size, no yellowing, no rot. B: some wilting or yellowing. C: slimy, rotten or badly wilted.",
};

/** The instruction sent with the photo. */
export function gradingPrompt(crop: Crop, language = "English") {
  const notes = NOTES[crop.key] ?? GROUP_NOTES[crop.group] ?? "";
  return [
    `You are a strict fresh-produce quality inspector for Indian buyers (quick-commerce, premium retail, exporters). Look at the photo, which should show ${crop.en}.`,
    `is_crop: true only if the photo clearly shows real ${crop.en} (not a drawing, a screen, or a different produce). If false, still fill the other fields with grade C and confidence 0.`,
    `grade: A = premium or export quality. B = good for local retail, with minor faults. C = processing only (juice, pulp, jam, drying).`,
    notes ? `For ${crop.en}: ${notes}` : "",
    `When pieces differ, grade the lot by its worst 10%, as buyers do.`,
    `ripeness: 1 unripe, 2 turning, 3 ripe, 4 fully ripe, 5 overripe.`,
    `uniformity: 0–100, how alike the pieces are in size and colour.`,
    `confidence: 0–1, how sure you are of the grade from this photo; low if it is blurry, dark, too far away, or shows only one piece.`,
    `defects: up to 5 short phrases, with counts where you can see them, for example "3 of about 30 berries bruised".`,
    `reason: one plain sentence for the grower explaining the grade.`,
    language === "English"
      ? ""
      : `Write "defects" and "reason" in ${language}, in its own script. Keep all other fields as specified.`,
  ]
    .filter(Boolean)
    .join("\n");
}
