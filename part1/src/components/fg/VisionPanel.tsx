// What the OpenCV 5 grading agent saw and decided: the annotated photo (each piece outlined in its
// grade's colour, defects tinted red), the action for the grower, and the agent's steps.
import type { VisionView } from "@/lib/vision";

type T = (en: string, hi: string) => string;

const TOOL: Record<string, [string, string]> = {
  assess_capture: ["Checked the photo (focus, light, glare)", "फ़ोटो जाँची (फ़ोकस, रोशनी, चमक)"],
  enhance: ["Corrected the lighting", "रोशनी ठीक की"],
  "segment[background]": ["Found the produce against the background", "पृष्ठभूमि से माल अलग किया"],
  "segment[colour_prior]": ["Found the produce by its colours", "रंगों से माल पहचाना"],
  "segment[grabcut]": ["Found the produce with GrabCut", "ग्रैबकट से माल पहचाना"],
  split_pieces: ["Separated touching pieces", "सटे हुए टुकड़े अलग किए"],
  analyse_pieces: ["Measured colour and defects on each piece", "हर टुकड़े का रंग और दाग मापा"],
  decide: ["Decided the next step", "अगला कदम तय किया"],
};

export function VisionPanel({ v, t }: { v: VisionView; t: T }) {
  const a = v.action;
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-baseline justify-between gap-2 px-4 pt-3">
        <p className="text-sm font-semibold">{t("What the camera saw", "कैमरे ने क्या देखा")}</p>
        <p className="text-[0.7rem] text-muted-foreground">
          OpenCV {v.opencv} · AWS · {Math.round(v.ms)} ms
        </p>
      </div>
      {v.annotated && (
        <img
          className="mt-2 w-full"
          src={`data:image/jpeg;base64,${v.annotated}`}
          alt={t(
            "Your photo with each piece outlined by grade: green A, amber B, red C",
            "आपकी फ़ोटो, हर टुकड़ा ग्रेड के रंग में: हरा A, पीला B, लाल C",
          )}
        />
      )}
      {a.type === "sort_and_rescan" && (
        <p className="mx-4 mt-3 rounded-xl bg-warning/10 p-3 text-sm font-medium text-warning">
          {t(
            `Pull out the ${a.remove} piece(s) outlined thick and send them to a processor. Scan the rest again: it should grade ${a.grade_if_sorted}.`,
            `मोटी रेखा वाले ${a.remove} टुकड़े निकालकर प्रोसेसर को भेजें। बाकी को दोबारा स्कैन करें: ग्रेड ${a.grade_if_sorted} आना चाहिए।`,
          )}
        </p>
      )}
      {a.type === "accept" && !!a.flagged && (
        <p className="mx-4 mt-3 rounded-xl bg-warning/10 p-3 text-sm font-medium text-warning">
          {t(
            `${a.flagged} piece(s) outlined thick look spoiled. Pull them out before packing.`,
            `मोटी रेखा वाले ${a.flagged} टुकड़े खराब दिखते हैं। पैकिंग से पहले निकाल दें।`,
          )}
        </p>
      )}
      <details className="px-4 py-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          {t(
            `How the AI decided (${v.steps.length} steps)`,
            `एआई ने कैसे तय किया (${v.steps.length} कदम)`,
          )}
        </summary>
        <ol className="mt-2 space-y-1">
          {v.steps.map((s, i) => {
            const label = TOOL[s.tool];
            return (
              <li key={i} className="flex gap-2">
                <span className="w-4 shrink-0 text-muted-foreground">{i + 1}.</span>
                <span>
                  <b>{label ? t(label[0], label[1]) : s.tool}</b>
                  <span className="text-muted-foreground"> → {s.decision}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}
