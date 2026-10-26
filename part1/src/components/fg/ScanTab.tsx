import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraOff,
  Factory,
  Handshake,
  ImagePlus,
  Loader2,
  PencilLine,
  ScanLine,
  Snowflake,
  Sun,
  Truck,
  Zap,
} from "lucide-react";
import type * as TM from "@teachablemachine/image";
import { api, uploadScanPhoto } from "@/lib/api";
import { isOnline } from "@/lib/net";
import { GRADING_MODELS } from "@/lib/offline";
import { dropScan, queueScan, usePendingScans } from "@/lib/outbox";
import { cropBy, rid, useStore } from "@/lib/store";
import { useInvalidate, useMe, useRate, useScans, type Scan } from "@/lib/data";
import { inr } from "@/lib/income";
import { RIPENESS, fmtLeft, sellWindowHours, type Grade, type Ripeness } from "@/lib/shelf";
import type { GradeSource } from "@/lib/types";
import type { VisionRetakeCode, VisionView } from "@/lib/vision";
import { VisionPanel } from "./VisionPanel";
import { Badge, Btn, Field, Label, Modal, SectionTitle, inputCls } from "./ui";
import { CropSelect } from "./CropSelect";
import { SellClock } from "./SellClock";
import { BestMove } from "./BestMove";
import { HeatLine } from "./Weather";

const HARVEST_AGO = [0, 2, 4, 8, 12, 24, 48] as const;
const MODEL_MIN = 0.75; // on-phone model: below this average certainty, ask for a retake
const FRAMES = 6; // camera frames averaged per on-phone scan

/** Who decided a grade, shown on certificates and to buyers. */
export const GRADE_SOURCE: Record<GradeSource, [string, string]> = {
  model: ["On-phone AI model", "फ़ोन पर एआई मॉडल"],
  opencv: ["OpenCV 5 vision (AWS)", "ओपनसीवी 5 विज़न (AWS)"],
  ai_vision: ["Gemini Vision AI", "जेमिनी विज़न एआई"],
  self: ["Graded by the grower", "उत्पादक ने ग्रेड किया"],
  simulated: ["Simulated (older scan)", "सिमुलेटेड (पुराना स्कैन)"],
};

// Class names of our two Teachable Machine models → crop and grade. "others" and the potato classes
// are not crops we grade, so they ask for a retake.
function readLabel(label: string): {
  crop: string | null;
  grade: Grade | null;
} {
  const L = label.toLowerCase().trim();
  if (L === "grade a apple") return { crop: "apple", grade: "A" };
  if (L === "grade b or c apple") return { crop: "apple", grade: "B" };
  if (L === "grade a tomato") return { crop: "cherry_tomato", grade: "A" };
  if (L === "grade b tomato") return { crop: "cherry_tomato", grade: "B" };
  if (L === "grade c tomato" || L === "class 3") return { crop: "cherry_tomato", grade: "C" };
  return { crop: null, grade: null };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function ScanTab() {
  const { s, set, t, session } = useStore();
  const pending = usePendingScans(session?.user.id);
  const { data: me } = useMe();
  const scans = useScans();
  const rate = useRate();
  const inv = useInvalidate();
  const [crop, setCrop] = useState("strawberry");
  const [ago, setAgo] = useState<(typeof HARVEST_AGO)[number]>(2);
  const [cooled, setCooled] = useState(false);
  const [ripeIn, setRipeIn] = useState<Ripeness | 0>(0); // 0 = let the scan estimate it
  const [cam, setCam] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null); // an uploaded photo (data URL)
  const [msg, setMsg] = useState("");
  const [phase, setPhase] = useState("");
  const [scanning, setScanning] = useState(false);
  const [selfOpen, setSelfOpen] = useState(false);
  const [cert, setCert] = useState<Scan | null>(null);
  const [vision, setVision] = useState<VisionView | null>(null); // what the OpenCV agent saw
  const [listOpen, setListOpen] = useState(false);
  const [listPreset, setListPreset] = useState<{
    kg: number;
    price: number;
    transport: number;
  }>();
  const [listed, setListed] = useState(false);
  const [predLabel, setPredLabel] = useState("");
  const vid = useRef<HTMLVideoElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const tmModels = useRef<TM.CustomMobileNet[]>([]);
  const tmLoading = useRef<Promise<TM.CustomMobileNet[]> | null>(null);
  // Two trained models: apple grader + tomato/potato grader (used for polyhouse cherry tomatoes).
  const TM_URLS = GRADING_MODELS;
  const loadModels = () => {
    if (tmModels.current.length) return Promise.resolve(tmModels.current);
    if (!tmLoading.current) {
      // The grading library is large, so it is downloaded only when a scan starts.
      tmLoading.current = import("@teachablemachine/image")
        .then((tm) =>
          Promise.all(TM_URLS.map((u) => tm.load(u + "model.json", u + "metadata.json"))),
        )
        .then((ms) => {
          tmModels.current = ms;
          return ms;
        });
    }
    return tmLoading.current;
  };
  const stop = () => {
    stream.current?.getTracks().forEach((x) => x.stop());
    stream.current = null;
    setCam(false);
  };
  useEffect(() => stop, []);
  const startCam = async () => {
    setMsg("");
    setPhoto(null);
    try {
      const st = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      stream.current = st;
      setCam(true);
      setTimeout(() => {
        if (vid.current) {
          vid.current.srcObject = st;
          vid.current.play().catch(() => {});
        }
      }, 50);
    } catch {
      setMsg(
        t(
          "Camera unavailable. Add a photo instead, or grade it yourself.",
          "कैमरा उपलब्ध नहीं। फ़ोटो जोड़ें या खुद ग्रेड करें।",
        ),
      );
    }
  };
  const onPhoto = (f: File | undefined) => {
    if (!f) return;
    stop();
    setMsg("");
    const r = new FileReader();
    r.onload = () => setPhoto(String(r.result));
    r.readAsDataURL(f);
  };
  /** The current camera frame or photo as a JPEG, at most 768 px on its longer side. */
  const frame = async () => {
    const src = cam ? vid.current : img.current;
    if (!src) return null;
    const w = src instanceof HTMLVideoElement ? src.videoWidth : src.naturalWidth;
    const h = src instanceof HTMLVideoElement ? src.videoHeight : src.naturalHeight;
    if (!w || !h) return null;
    const k = Math.min(1, 768 / Math.max(w, h));
    const cv = document.createElement("canvas");
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    cv.getContext("2d")?.drawImage(src, 0, 0, cv.width, cv.height);
    const url = cv.toDataURL("image/jpeg", 0.85);
    const blob = await new Promise<Blob | null>((res) => cv.toBlob(res, "image/jpeg", 0.85));
    return { b64: url.slice(url.indexOf(",") + 1), blob };
  };

  /** Save a scan (or show why a retake is needed). The sell-by clock is worked out on the server.
   *  Without a network the scan waits on the phone and is sent when the app is back online. */
  const save = async (
    p:
      | { source: "model"; crop: string; grade: Grade; confidence: number }
      | { source: "ai_vision"; image: string }
      | { source: "self"; grade: Grade },
    photo: Blob | null = null,
  ) => {
    const input = {
      batch_code: rid("#CC-"),
      crop,
      harvested_at: new Date(Date.now() - ago * 3_600_000).toISOString(),
      cold_chain: cooled,
      lang: s.lang,
      ...(ripeIn ? { ripeness: ripeIn } : {}),
      ...p,
    };
    const res = isOnline() ? await sendNow(input, photo) : null;
    if (!res || res.error?.offline) {
      if (!session) return;
      await queueScan(session.user.id, input, photo);
      setSelfOpen(false);
      return setMsg(
        t(
          "No network, so this scan is saved on the phone. It is sent and gets its sell-by clock as soon as you're back online.",
          "नेटवर्क नहीं है, इसलिए यह स्कैन फ़ोन में सेव है। ऑनलाइन होते ही यह भेजा जाएगा और इसकी बिक्री घड़ी शुरू होगी।",
        ),
      );
    }
    const { data, error } = res;
    if (error || !data) return setMsg(error?.message ?? "Scan failed");
    const r = data as {
      scan?: Scan;
      retake?: "not_crop" | "unsure" | "ai_limit" | "ai_busy" | "vision" | "confirm";
      retryAt?: number | null;
      code?: VisionRetakeCode;
      suggested?: Grade | null;
      vision?: VisionView | null;
    };
    setVision(r.vision ?? null);
    if (r.retake === "vision") {
      const fix: Record<string, [string, string]> = {
        blur: [
          "The photo is blurry. Hold the phone still for a second, tap to focus, and try again.",
          "फ़ोटो धुंधली है। फ़ोन एक पल स्थिर रखें, फ़ोकस के लिए टैप करें और दोबारा कोशिश करें।",
        ],
        dark: [
          "The photo is too dark. Move into daylight or turn on a light, and try again.",
          "फ़ोटो बहुत अंधेरी है। दिन की रोशनी में जाएँ या लाइट जलाएँ और दोबारा कोशिश करें।",
        ],
        glare: [
          "Strong glare hides the skin. Tilt the phone or move out of direct sun, and try again.",
          "तेज़ चमक से छिलका नहीं दिखता। फ़ोन तिरछा करें या सीधी धूप से हटें और दोबारा कोशिश करें।",
        ],
        no_produce: [
          "Couldn't find the produce. Move closer so it fills most of the frame, on a plain surface if you can.",
          "माल नहीं दिखा। पास आएँ ताकि माल फ़्रेम में भरा हो, हो सके तो सादी सतह पर रखें।",
        ],
      };
      return setMsg(t(...(fix[r.code ?? "no_produce"] ?? fix["no_produce"]!)));
    }
    if (r.retake === "confirm") {
      // Human in the loop: the agent is unsure, so the grower confirms or changes its suggestion.
      setSelfOpen(true);
      return setMsg(
        r.suggested
          ? t(
              `The AI isn't fully sure from this photo. It looks like grade ${r.suggested}: confirm it below, or pick another grade.`,
              `एआई इस फ़ोटो से पूरी तरह पक्का नहीं है। यह ग्रेड ${r.suggested} जैसा लगता है: नीचे पक्का करें या दूसरा ग्रेड चुनें।`,
            )
          : t(
              "The AI isn't sure from this photo. Grade it yourself below, or take a clearer photo.",
              "एआई इस फ़ोटो से पक्का नहीं है। नीचे खुद ग्रेड करें या साफ़ फ़ोटो लें।",
            ),
      );
    }
    if (r.retake === "ai_limit" || r.retake === "ai_busy") {
      // AI grading is unavailable for now: let the grower carry on with their own grade.
      setSelfOpen(true);
      const at = r.retryAt
        ? new Date(r.retryAt).toLocaleTimeString("en-IN", {
            hour: "numeric",
            minute: "2-digit",
          })
        : null;
      return setMsg(
        r.retake === "ai_limit"
          ? at
            ? t(
                `AI grading has used today's free limit (back at about ${at}). Grade this lot yourself below; buyers will see it as self-graded.`,
                `एआई ग्रेडिंग की आज की मुफ़्त सीमा पूरी हो गई (लगभग ${at} बजे फिर चालू)। नीचे खुद ग्रेड करें; खरीदार इसे "खुद ग्रेड किया" देखेंगे।`,
              )
            : t(
                "AI grading has used today's free limit. Grade this lot yourself below; buyers will see it as self-graded.",
                `एआई ग्रेडिंग की आज की मुफ़्त सीमा पूरी हो गई। नीचे खुद ग्रेड करें; खरीदार इसे "खुद ग्रेड किया" देखेंगे।`,
              )
          : t(
              "The AI is very busy right now. Try again in a minute, or grade it yourself below.",
              "एआई अभी बहुत व्यस्त है। एक मिनट बाद कोशिश करें या नीचे खुद ग्रेड करें।",
            ),
      );
    }
    if (r.retake === "not_crop")
      return setMsg(
        t(
          `This photo doesn't look like ${cropBy(crop).en}. Fill the frame with the produce and try again.`,
          `यह फ़ोटो ${cropBy(crop).hi} जैसी नहीं लगती। माल को फ़्रेम में भरकर दोबारा कोशिश करें।`,
        ),
      );
    if (r.retake === "unsure")
      return setMsg(
        t(
          "Not sure about the grade from this photo. Move closer, use daylight and show 5–10 pieces clearly.",
          "इस फ़ोटो से ग्रेड पक्का नहीं। पास आएँ, दिन की रोशनी में 5–10 टुकड़े साफ़ दिखाएँ।",
        ),
      );
    setCert(r.scan ?? null);
    setSelfOpen(false);
    inv("scans");
  };

  const sendNow = async (input: Parameters<typeof api.createScan>[0], photo: Blob | null) => {
    const key = photo ? await uploadScanPhoto(photo) : null; // optional: saves even if upload fails
    return api.createScan({ ...input, ...(key ? { photo_key: key } : {}) });
  };

  const scan = async () => {
    setCert(null);
    setVision(null);
    setListed(false);
    setMsg("");
    setPredLabel("");
    setScanning(true);
    try {
      if (cam && cropBy(crop).trained && vid.current) {
        // On-phone model: average several frames so one blurry frame cannot decide the grade.
        setPhase(t("Checking with the on-phone AI model…", "फ़ोन के एआई मॉडल से जाँच…"));
        const models = await loadModels().catch(() => null);
        if (!models) {
          tmLoading.current = null;
          setSelfOpen(true);
          return setMsg(
            t(
              "The on-phone model isn't saved on this phone yet. Open Scan once with internet, or grade this lot yourself below.",
              "फ़ोन वाला मॉडल अभी इस फ़ोन में सेव नहीं है। एक बार इंटरनेट के साथ स्कैन खोलें, या नीचे खुद ग्रेड करें।",
            ),
          );
        }
        const sums = new Map<string, number>();
        for (let f = 0; f < FRAMES; f++) {
          for (const m of models)
            for (const p of await m.predict(vid.current))
              sums.set(p.className, (sums.get(p.className) ?? 0) + p.probability / FRAMES);
          await sleep(200);
        }
        const [label, prob] = [...sums.entries()].sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
        setPredLabel(`${label} · ${Math.round(prob * 100)}%`);
        const r = readLabel(label);
        if (!r.grade || !r.crop)
          return setMsg(
            t(
              "The model doesn't see an apple or cherry tomato. Fill the frame with the fruit and try again.",
              "मॉडल को सेब या चेरी टमाटर नहीं दिखा। फल को फ़्रेम में भरकर दोबारा कोशिश करें।",
            ),
          );
        if (prob < MODEL_MIN)
          return setMsg(
            t(
              `The model is only ${Math.round(prob * 100)}% sure. Hold steady, use daylight and try again.`,
              `मॉडल केवल ${Math.round(prob * 100)}% पक्का है। फ़ोन स्थिर रखें, रोशनी में दोबारा कोशिश करें।`,
            ),
          );
        // The apple model has one class for B and C: only a confident answer counts as B.
        const grade: Grade = label.toLowerCase().includes("b or c") && prob < 0.85 ? "C" : r.grade;
        if (r.crop !== crop) setCrop(r.crop);
        const f = await frame();
        await save(
          {
            source: "model",
            crop: r.crop,
            grade,
            confidence: Math.round(prob * 100),
          },
          f?.blob ?? null,
        );
      } else {
        // Any crop: the photo goes to the OpenCV 5 grading agent on AWS (Gemini Vision as fallback).
        const f = await frame();
        if (!f)
          return setMsg(
            t("Use the camera or add a photo first.", "पहले कैमरा चालू करें या फ़ोटो जोड़ें।"),
          );
        setPhase(
          isOnline()
            ? t(
                "The vision AI is checking colour, size, bruises and ripeness…",
                "विज़न एआई रंग, आकार, दाग और पकाव जाँच रहा है…",
              )
            : t("Saving the photo on the phone…", "फ़ोटो फ़ोन में सेव हो रही है…"),
        );
        await save({ source: "ai_vision", image: f.b64 }, f.blob);
      }
    } finally {
      setScanning(false);
      setPhase("");
    }
  };
  const selfGrade = async (g: Grade) => {
    setCert(null);
    setListed(false);
    setMsg("");
    setScanning(true);
    try {
      await save({ source: "self", grade: g });
    } finally {
      setScanning(false);
    }
  };
  const correct = async (g: Grade) => {
    if (!cert || g === cert.grade) return;
    const { data, error } = await api.correctScanGrade(cert.id, g);
    if (error) return setMsg(error.message);
    setCert(data as unknown as Scan);
    inv("scans");
  };

  const goStore = (facility: "precool" | "ripening" | "cold_room") =>
    cert &&
    set((x) => ({
      ...x,
      prefillCrop: cert.crop,
      prefillFacility: facility,
      tab: "cold",
    }));
  const goTruck = () =>
    cert &&
    set((x) => ({
      ...x,
      prefillCrop: cert.crop,
      prefillSellBy: cert.sell_by,
      tab: "transport",
    }));

  const c = cropBy(crop);
  const r = rate(c.key, c.rate);
  const canScan = !scanning && (cam || !!photo);
  return (
    <div>
      <SectionTitle
        icon={ScanLine}
        title={t("Scan & sell-by clock", "स्कैन व बिक्री घड़ी")}
        sub={t(
          "AI grade, ripeness and how many hours you have left to sell",
          "एआई ग्रेड, पकाव और बेचने के लिए बचे घंटे",
        )}
      />
      <Label>{t("What are you scanning?", "क्या स्कैन कर रहे हैं?")}</Label>
      <CropSelect value={crop} onChange={setCrop} />
      <div className="mb-4 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-secondary/60 px-3 py-2 text-xs">
        <span className="font-semibold text-success">
          ₹{r.rate}/kg{r.live ? ` · ${r.market}` : "*"}
        </span>
        <span className="text-muted-foreground">❄ {c.temp}</span>
        <span className="text-muted-foreground">
          {t("Lasts", "टिकाऊ")} ~{fmtLeft(c.shelfH)} {t("open", "बाहर")} / {fmtLeft(c.shelfColdH)}{" "}
          {t("cold", "ठंडे में")}
        </span>
        <span className="text-muted-foreground">
          {c.trained
            ? t("On-phone model + Gemini Vision", "फ़ोन मॉडल + जेमिनी विज़न")
            : t("Graded by Gemini Vision AI", "जेमिनी विज़न एआई से ग्रेड")}
        </span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <Field label={t("Harvested", "तोड़ा गया")}>
          <select
            className={inputCls}
            value={ago}
            onChange={(e) => setAgo(+e.target.value as (typeof HARVEST_AGO)[number])}
          >
            {HARVEST_AGO.map((h) => (
              <option key={h} value={h}>
                {h === 0 ? t("Just now", "अभी") : t(`${h} hours ago`, `${h} घंटे पहले`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t("Kept since harvest", "तोड़ने के बाद से")}>
          <div className="grid grid-cols-2 gap-0.5 rounded-[9px] bg-secondary p-0.5">
            {(
              [
                [false, Sun, t("Open air", "खुले में")],
                [true, Snowflake, t("Cooled", "ठंडे में")],
              ] as const
            ).map(([v, I, l]) => (
              <button
                key={String(v)}
                type="button"
                onClick={() => setCooled(v)}
                className={`flex min-h-9 items-center justify-center gap-1 rounded-md text-xs font-medium ${cooled === v ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <I className="h-3.5 w-3.5" />
                {l}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <HeatLine cooled={cooled} />
      <Label>{t("Ripeness", "पकाव")}</Label>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {([0, 1, 2, 3, 4, 5] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setRipeIn(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${ripeIn === k ? "border-primary/40 bg-accent text-primary" : "border-border text-muted-foreground"}`}
          >
            {k === 0 ? t("AI estimate", "एआई अनुमान") : t(RIPENESS[k].en, RIPENESS[k].hi)}
          </button>
        ))}
      </div>

      <div className="card-classic overflow-hidden p-3">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-black">
          {photo ? (
            <img ref={img} src={photo} alt="" className="h-full w-full object-cover" />
          ) : cam ? (
            <video ref={vid} muted playsInline className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-white">
              <span className="text-7xl opacity-90">{c.emoji}</span>
              <span className="rounded bg-background/90 px-2 py-0.5 text-xs font-medium text-primary">
                {t(
                  "Use the camera or add a photo of the lot",
                  "कैमरा चालू करें या लॉट की फ़ोटो जोड़ें",
                )}
              </span>
            </div>
          )}
          <div className="pointer-events-none absolute inset-5 rounded border border-dashed border-white/40">
            {[
              "left-0 top-0 border-l-4 border-t-4",
              "right-0 top-0 border-r-4 border-t-4",
              "left-0 bottom-0 border-l-4 border-b-4",
              "right-0 bottom-0 border-r-4 border-b-4",
            ].map((p) => (
              <span key={p} className={`absolute h-6 w-6 border-white/80 ${p}`} />
            ))}
            {scanning && (
              <span className="animate-laser absolute inset-x-0 h-0.5 bg-white shadow-[0_0_8px_1px] shadow-white/70" />
            )}
          </div>
          {(cam || photo) && (
            <span className="absolute left-2 top-2 rounded bg-background/90 px-2 py-0.5 text-[0.65rem] font-bold text-primary">
              {cam ? t("● Live camera", "● लाइव कैमरा") : t("Photo", "फ़ोटो")}
            </span>
          )}
          {predLabel && (
            <span className="absolute right-2 top-2 rounded bg-background/90 px-2 py-0.5 text-[0.65rem] font-bold text-success">
              AI: {predLabel}
            </span>
          )}
          {scanning && phase && (
            <span className="absolute bottom-2 left-1/2 w-[90%] -translate-x-1/2 rounded bg-background/90 px-3 py-1 text-center text-xs font-bold text-primary">
              {phase}
            </span>
          )}
        </div>
        {msg && <p className="mt-2 text-xs font-medium text-warning">{msg}</p>}
        {vision && <VisionPanel v={vision} t={t} />}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {cam ? (
            <Btn v="outline" onClick={stop}>
              <CameraOff className="h-4 w-4" />
              {t("Stop camera", "कैमरा बंद")}
            </Btn>
          ) : (
            <Btn v="outline" onClick={startCam}>
              <Camera className="h-4 w-4" />
              {t("Use camera", "कैमरा")}
            </Btn>
          )}
          <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-primary hover:bg-secondary">
            <ImagePlus className="h-4 w-4" />
            {t("Add photo", "फ़ोटो जोड़ें")}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
        </div>
        <Btn className="mt-2 w-full" onClick={scan} disabled={!canScan}>
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanLine className="h-4 w-4" />
          )}
          {scanning
            ? t("Grading…", "ग्रेड हो रहा है…")
            : t("Scan & grade", "स्कैन करें, ग्रेड करें")}
        </Btn>
        <button
          type="button"
          onClick={() => setSelfOpen((o) => !o)}
          className="mt-2 flex w-full items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <PencilLine className="h-3.5 w-3.5" />
          {t("No photo? Grade it myself", "फ़ोटो नहीं? खुद ग्रेड करें")}
        </button>
        {selfOpen && (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                ["A", t("Premium / export", "प्रीमियम / निर्यात")],
                ["B", t("Local retail", "स्थानीय रिटेल")],
                ["C", t("Processing", "प्रोसेसिंग")],
              ] as const
            ).map(([g, l]) => (
              <Btn key={g} v="outline" disabled={scanning} onClick={() => selfGrade(g)}>
                <span>
                  <b className="block">
                    {t("Grade", "ग्रेड")} {g}
                  </b>
                  <span className="block text-[0.65rem] font-normal text-muted-foreground">
                    {l}
                  </span>
                </span>
              </Btn>
            ))}
          </div>
        )}
      </div>

      {cert && cert.sell_by && (
        <div className="certificate relative mt-5 overflow-hidden">
          <div className="p-5">
            <div className="text-center">
              <p className="text-xs text-muted-foreground">
                {t("ChillChain quality & freshness check", "ChillChain गुणवत्ता व ताज़गी जाँच")}
              </p>
              <h3 className="text-xl font-semibold text-primary">
                {cropBy(cert.crop).emoji} {t(cropBy(cert.crop).en, cropBy(cert.crop).hi)}
              </h3>
              <p className="text-xs text-muted-foreground">
                {t("Batch", "बैच")} <b>{cert.batch_code}</b> · {cert.created_at.slice(0, 10)} ·{" "}
                {me?.profile?.full_name}
              </p>
            </div>
            <span
              className={`stamp absolute right-4 top-5 px-2 py-1 ${cert.grade === "C" ? "!bg-destructive/10 !text-destructive" : cert.grade === "B" ? "!bg-warning/10 !text-warning" : ""}`}
            >
              {t("Grade", "ग्रेड")} {cert.grade}
            </span>

            <SellClock
              className="mt-4"
              size="lg"
              sellBy={cert.sell_by}
              from={cert.harvested_at ?? cert.created_at}
            />
            {!cert.cold_chain && cert.ambient_c != null && (
              <p className="mt-1 text-[0.7rem] text-muted-foreground">
                {t(
                  `Clock set for ${Math.round(cert.ambient_c)}°C average air temperature in your district.`,
                  `घड़ी आपके ज़िले के औसत ${Math.round(cert.ambient_c)}°C तापमान के हिसाब से है।`,
                )}
              </p>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Row
                k={t("Grade", "ग्रेड")}
                v={`${cert.grade} ${cert.grade === "A" ? "(premium / export)" : cert.grade === "B" ? "(local retail)" : "(processing)"}`}
              />
              <Row
                k={t("Ripeness", "पकाव")}
                v={
                  cert.ripeness
                    ? t(
                        RIPENESS[cert.ripeness as Ripeness].en,
                        RIPENESS[cert.ripeness as Ripeness].hi,
                      )
                    : "—"
                }
              />
              <Row
                k={t("Graded by", "ग्रेड किसने किया")}
                v={`${t(...GRADE_SOURCE[cert.grade_source])}${cert.confidence ? ` · ${cert.confidence}%` : ""}`}
              />
              <Row k={t("Uniformity", "एकरूपता")} v={`${cert.uniformity}%`} />
              <Row k={t("Spoilage risk", "सड़न जोखिम")} v={cert.spoilage} />
              <Row
                k={t("If kept cold", "ठंडे में रखें तो")}
                v={fmtLeft(
                  sellWindowHours(
                    cropBy(cert.crop),
                    cert.grade as Grade,
                    (cert.ripeness ?? 3) as Ripeness,
                    true,
                  ),
                )}
                green
              />
            </dl>
            {cert.ai_notes && (
              <p className="mt-3 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground">
                {cert.ai_notes}
              </p>
            )}
            {cert.ai_grade && cert.ai_grade !== cert.grade && (
              <p className="mt-2 text-xs text-warning">
                {t(
                  `AI said grade ${cert.ai_grade}; you changed it to ${cert.grade}. Buyers see that you graded it.`,
                  `एआई ने ग्रेड ${cert.ai_grade} बताया; आपने ${cert.grade} किया। खरीदार देखेंगे कि ग्रेड आपने तय किया।`,
                )}
              </p>
            )}
            {!listed && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-muted-foreground">
                  {t("Grade looks wrong? Change it:", "ग्रेड गलत लगता है? बदलें:")}
                </span>
                {(["A", "B", "C"] as const).map((g) => (
                  <button
                    key={g}
                    onClick={() => correct(g)}
                    className={`rounded-full border px-2.5 py-0.5 font-semibold ${cert.grade === g ? "border-primary/40 bg-accent text-primary" : "border-border text-muted-foreground"}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
            )}

            <BestMove
              scan={cert}
              onList={(p) => {
                setListPreset(p);
                setListOpen(true);
              }}
              onStore={goStore}
              onDemand={() => set((x) => ({ ...x, tab: "demand" }))}
            />

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {cert.route === "ripen" ? (
                <Btn v="gold" onClick={() => goStore("ripening")}>
                  <Zap className="h-4 w-4" />
                  {t("Book ripening chamber", "पकाई कक्ष बुक करें")}
                </Btn>
              ) : (
                <Btn
                  v="gold"
                  onClick={() => {
                    setListPreset(undefined);
                    setListOpen(true);
                  }}
                  disabled={listed}
                >
                  {cert.route === "processor" ? (
                    <Factory className="h-4 w-4" />
                  ) : (
                    <Handshake className="h-4 w-4" />
                  )}
                  {listed
                    ? t("Listed for buyers", "सूचीबद्ध")
                    : cert.route === "processor"
                      ? t("List for processors", "प्रोसेसर के लिए डालें")
                      : t("List for buyers", "खरीदारों के लिए डालें")}
                </Btn>
              )}
              {!cert.cold_chain && (
                <Btn v="outline" onClick={() => goStore("precool")}>
                  <Snowflake className="h-4 w-4" />
                  {t("Pre-cool now (by the hour)", "अभी प्री-कूल करें (घंटे से)")}
                </Btn>
              )}
              <Btn v="outline" onClick={goTruck}>
                <Truck className="h-4 w-4" />
                {t("Book reefer before deadline", "समय से पहले रीफ़र बुक करें")}
              </Btn>
            </div>
            {listed && (
              <button
                onClick={() => set((x) => ({ ...x, tab: "pay" }))}
                className="mt-2 w-full text-center text-xs font-semibold text-primary underline"
              >
                {t("Open Money & khata →", "पैसा व खाता देखें →")}
              </button>
            )}
          </div>
        </div>
      )}
      {cert && (
        <ListLotModal
          key={`${cert.id}-${listPreset?.kg ?? ""}-${listPreset?.price ?? ""}`}
          open={listOpen}
          onClose={() => setListOpen(false)}
          crop={cert.crop}
          grade={cert.grade}
          scan={cert}
          {...(listPreset ? { preset: { ...listPreset, cold: 0 } } : {})}
          onDone={() => {
            setListOpen(false);
            setListed(true);
          }}
        />
      )}
      <div className="mt-6">
        <Label>{t("Recent scans", "हाल के स्कैन")}</Label>
        {scans.data?.length === 0 && !pending.length && (
          <p className="text-xs text-muted-foreground">
            {t("No scans yet.", "अभी कोई स्कैन नहीं।")}
          </p>
        )}
        <div className="space-y-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="card-classic flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span>
                {cropBy(p.input.crop).emoji} {p.input.batch_code} ·{" "}
                <span className="text-xs text-muted-foreground">
                  {p.createdAt.slice(0, 10)} · {t(...GRADE_SOURCE[p.input.source])}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {p.failed ? (
                  <Badge tone="red">{t("Not accepted", "स्वीकार नहीं हुआ")}</Badge>
                ) : (
                  <Badge tone="amber">{t("Waiting for network", "नेटवर्क का इंतज़ार")}</Badge>
                )}
                {p.input.grade && (
                  <Badge tone="muted">
                    {t("Grade", "ग्रेड")} {p.input.grade}
                  </Badge>
                )}
              </span>
              {p.failed && (
                <span className="flex w-full items-center justify-between gap-2 text-xs text-destructive">
                  {p.failed}
                  <button
                    className="font-semibold text-primary"
                    onClick={() => void dropScan(p.id)}
                  >
                    {t("Remove", "हटाएँ")}
                  </button>
                </span>
              )}
            </div>
          ))}
          {scans.data?.slice(0, 6).map((x) => (
            <button
              key={x.id}
              onClick={() => {
                setCert(x);
                setListed(false);
              }}
              className="card-classic flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left text-sm"
            >
              <span>
                {cropBy(x.crop).emoji} {x.batch_code} ·{" "}
                <span className="text-xs text-muted-foreground">
                  {x.created_at.slice(0, 10)} · {t(...GRADE_SOURCE[x.grade_source])}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {x.sell_by && (
                  <SellClock sellBy={x.sell_by} from={x.harvested_at ?? x.created_at} />
                )}
                <Badge tone={x.grade === "A" ? "green" : x.grade === "B" ? "amber" : "red"}>
                  {t("Grade", "ग्रेड")} {x.grade}
                </Badge>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ListLotModal({
  open,
  onClose,
  crop,
  grade,
  onDone,
  preset,
  scan,
}: {
  open: boolean;
  onClose: () => void;
  crop: string;
  grade: string;
  onDone: () => void;
  preset?: { kg: number; price: number; cold: number; transport: number };
  scan?: Scan;
}) {
  const { t } = useStore();
  const rate = useRate();
  const inv = useInvalidate();
  const [kg, setKg] = useState(preset?.kg ?? 100);
  const [price, setPrice] = useState(preset?.price ?? rate(crop, cropBy(crop).rate).rate);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const gross = Math.round(kg * price);
  const cold = preset?.cold ?? 0;
  const transport = preset?.transport ?? Math.round(kg * 2.2);
  const net = gross - cold - transport;
  const submit = async () => {
    if (kg < 1 || kg > 100000 || price <= 0 || price > 5000)
      return setErr(t("Enter a valid quantity and price", "सही मात्रा और भाव डालें"));
    setBusy(true);
    const { error } = await api.createLot({
      crop,
      kg,
      grade: grade as Grade,
      price,
      cold,
      transport,
      ...(scan ? { scanId: scan.id } : {}),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    inv("lots");
    onDone();
  };
  return (
    <Modal open={open} onClose={onClose} title={t("List lot for buyers", "खरीदारों के लिए लॉट")}>
      <div className="space-y-3">
        <p className="text-sm">
          {cropBy(crop).emoji} {t(cropBy(crop).en, cropBy(crop).hi)} · {t("Grade", "ग्रेड")} {grade}
        </p>
        {scan?.sell_by && (
          <SellClock sellBy={scan.sell_by} from={scan.harvested_at ?? scan.created_at} />
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("Quantity (kg)", "मात्रा (किग्रा)")}>
            <input
              type="number"
              className={inputCls}
              value={kg}
              onChange={(e) => setKg(Math.max(0, +e.target.value))}
            />
          </Field>
          <Field label={t("Asking price ₹/kg", "भाव ₹/किग्रा")}>
            <input
              type="number"
              className={inputCls}
              value={price}
              onChange={(e) => setPrice(Math.max(0, +e.target.value))}
            />
          </Field>
        </div>
        <div className="rounded-lg bg-popover p-3 text-xs">
          <div className="flex justify-between">
            <span>{t("Gross", "कुल")}</span>
            <b>{inr(gross)}</b>
          </div>
          <div className="flex justify-between">
            <span>{t("Storage deduction", "भंडारण कटौती")}</span>
            <span>− {inr(cold)}</span>
          </div>
          <div className="flex justify-between">
            <span>
              {preset
                ? t("Shared reefer (estimate)", "साझा रीफ़र (अनुमान)")
                : t("Shared reefer (₹2.2/kg)", "साझा रीफ़र (₹2.2/किग्रा)")}
            </span>
            <span>− {inr(transport)}</span>
          </div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 text-sm">
            <span>{t("Your net payout", "आपको मिलेगा")}</span>
            <b className="text-success">{inr(net)}</b>
          </div>
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          {t(
            "Full price while more than half the sell-by window is left, then 90%, 75% and 60%. After the deadline only processors can buy, at 50%.",
            "आधे से ज़्यादा समय बचा हो तो पूरा भाव, फिर 90%, 75% और 60%। समय निकलने पर केवल प्रोसेसर 50% पर खरीद सकते हैं।",
          )}
        </p>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <Btn className="w-full" onClick={submit} disabled={busy}>
          {t("Publish to buyer market", "बाज़ार में डालें")}
        </Btn>
      </div>
    </Modal>
  );
}

function Row({ k, v, green }: { k: string; v: string; green?: boolean }) {
  return (
    <div className="border-b border-dotted border-border pb-1">
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className={`font-bold ${green ? "text-success" : "text-primary"}`}>{v}</dd>
    </div>
  );
}
