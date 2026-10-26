import { createContext, useContext, useState, useSyncExternalStore, type ReactNode } from "react";
import { BadgeCheck, CloudRain, EyeOff, Lock, MapPinned, Star, ThumbsUp } from "lucide-react";
import { api } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useInvalidate, useMe, usePendingReveal, useRateables, useReps } from "@/lib/data";
import {
  BAYES_C,
  BAYES_M,
  FLOWS,
  FLOWS_ABOUT,
  PEER_VALUE,
  TIERS,
  composite,
  starFinal,
  starRaw,
  tierOf,
  txScore,
  type FlowId,
  type FlowRep,
} from "@/lib/krishisaakh";
import type { Role } from "@/lib/types";
import { Badge, Btn, Label, Modal } from "./ui";

/* ---------- open the panel from anywhere (top bar menu, rate prompts) ---------- */
type KTab = "me" | "rate" | "sim";
let current: KTab | null = null;
const subs = new Set<() => void>();
export const openKrishiSaakh = (tab: KTab = "me") => {
  current = tab;
  subs.forEach((f) => f());
};
const close = () => {
  current = null;
  subs.forEach((f) => f());
};
const useKOpen = () =>
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => current,
    () => null,
  );

const fmtStars = (s: number) => s.toFixed(1);
const ROLE_NAME: Record<Role, [string, string]> = {
  farmer: ["farmer", "किसान"],
  transporter: ["transporter", "ट्रांसपोर्टर"],
  buyer: ["buyer", "खरीदार"],
  owner: ["cold storage owner", "कोल्ड स्टोर मालिक"],
};

/* ---------- one reputation request per list ---------- */
const RepsCtx = createContext<Record<string, Partial<Record<FlowId, FlowRep>>>>({});
export function RepsProvider({
  ids,
  children,
}: {
  ids: (string | null | undefined)[];
  children: ReactNode;
}) {
  const r = useReps(ids);
  return <RepsCtx.Provider value={r.data ?? {}}>{children}</RepsCtx.Provider>;
}
/** Counterpart badge for one flow, read from the nearest RepsProvider. */
export function UserRep({
  id,
  flow,
  showLabel,
}: {
  id: string | null | undefined;
  flow: FlowId;
  showLabel?: boolean;
}) {
  const { t } = useStore();
  const all = useContext(RepsCtx);
  return (
    <RepChip
      rep={id ? all[id]?.[flow] : undefined}
      label={t(FLOWS[flow].badgeEn, FLOWS[flow].badgeHi)}
      showLabel={showLabel}
    />
  );
}

/** Small "★ 4.3 · 12" chip for a counterpart's badge. */
export function RepChip({
  rep,
  label,
  showLabel,
}: {
  rep: FlowRep | undefined;
  label: string;
  showLabel?: boolean | undefined;
}) {
  const { t } = useStore();
  const n = rep?.n ?? 0;
  const stars = starFinal(rep?.r ?? null, n);
  const tier = tierOf(stars, n);
  return (
    <span
      title={`${label} · ChillScore`}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[0.68rem] font-medium ${tier === "gold" ? "bg-success/10 text-success" : tier === "probation" ? "bg-destructive/10 text-destructive" : "bg-secondary text-primary"}`}
    >
      <Star className="h-3 w-3 fill-current" />
      {fmtStars(stars)}
      <span className="font-normal opacity-80">{n ? `· ${n}` : `· ${t("new", "नया")}`}</span>
      <span className={`font-normal opacity-80 ${showLabel ? "" : "hidden sm:inline"}`}>
        · {label}
      </span>
    </span>
  );
}

/** Banner that appears when the user has finished transactions waiting for a rating. */
export function RatePrompt() {
  const { t } = useStore();
  const r = useRateables();
  const n = r.data?.length ?? 0;
  if (!n) return null;
  return (
    <button
      onClick={() => openKrishiSaakh("rate")}
      className="mb-4 flex w-full items-center gap-3 rounded-lg border border-primary/30 bg-accent p-3 text-left text-sm"
    >
      <ThumbsUp className="h-5 w-5 shrink-0 text-primary" />
      <span className="flex-1">
        <b className="text-foreground">
          {n === 1
            ? t("Rate 1 completed deal", "1 पूरा सौदा रेट करें")
            : t(`Rate ${n} completed deals`, `${n} पूरे सौदों को रेट करें`)}
        </b>
        <br />
        <span className="text-xs text-muted-foreground">
          {t(
            "ChillScore: 3 quick taps. Ratings stay hidden for 48 hours.",
            "चिलस्कोर: 3 टैप। रेटिंग 48 घंटे छिपी रहती है।",
          )}
        </span>
      </span>
      <span className="text-xs font-semibold text-primary">{t("Rate", "रेट करें")}</span>
    </button>
  );
}

/** Mounted once (in the top bar); shows the ChillScore rating panel when opened. */
export function KrishiSaakhHost() {
  const { t } = useStore();
  const shown = useKOpen();
  if (shown === null) return null;
  const go = (k: KTab) => openKrishiSaakh(k);
  return (
    <Modal open onClose={close} title="ChillScore" wide>
      <div className="mb-4 grid grid-cols-3 gap-0.5 rounded-[9px] bg-secondary p-0.5 text-sm">
        {(
          [
            ["me", t("My ChillScore", "मेरा चिलस्कोर")],
            ["rate", t("Rate partners", "रेटिंग दें")],
            ["sim", t("Simulator", "सिम्युलेटर")],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => go(k)}
            className={`rounded-md py-1.5 font-medium ${shown === k ? "bg-card font-semibold text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {shown === "me" && <MyReputation />}
      {shown === "rate" && <RateList />}
      {shown === "sim" && <Simulator />}
    </Modal>
  );
}

function Safeguards() {
  const { t } = useStore();
  const items = [
    [
      MapPinned,
      t("GPS & Gate-Pass Lock", "GPS व गेट-पास लॉक"),
      t(
        "Timing and attendance come from gate passes and trip timestamps. Nobody can type them in.",
        "समय और हाज़िरी गेट पास व ट्रिप रिकॉर्ड से आती है, कोई बदल नहीं सकता।",
      ),
    ],
    [
      EyeOff,
      t("48-Hour Double-Blind Reveal", "48 घंटे की गोपनीय रेटिंग"),
      t(
        "You cannot see a rating until both sides rate, or 48 hours pass, so nobody rates in revenge.",
        "दोनों के रेट करने या 48 घंटे बाद ही रेटिंग दिखती है, ताकि बदले की रेटिंग न हो।",
      ),
    ],
    [
      CloudRain,
      t("IMD Weather Delay Shield", "IMD मौसम देरी सुरक्षा"),
      t(
        "Delays caused by an IMD weather alert are not counted against anyone.",
        "IMD मौसम चेतावनी से हुई देरी किसी के ख़िलाफ़ नहीं गिनी जाती।",
      ),
    ],
  ] as const;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {items.map(([I, h, d]) => (
        <div key={h} className="rounded-lg border border-border p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <I className="h-3.5 w-3.5 text-primary" />
            {h}
          </p>
          <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">{d}</p>
        </div>
      ))}
    </div>
  );
}

function TierCard({ stars, n }: { stars: number; n: number }) {
  const { t } = useStore();
  const tier = TIERS[tierOf(stars, n)];
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="flex items-baseline gap-1 text-3xl font-semibold text-foreground">
            <Star className="h-6 w-6 self-center fill-current text-warning" />
            {fmtStars(stars)}
            <span className="text-sm font-normal text-muted-foreground">
              / 5 · {n} {t("deals", "सौदे")}
            </span>
          </p>
        </div>
        <Badge tone={tier.tone}>
          <BadgeCheck className="h-3.5 w-3.5" />
          {t(tier.en, tier.hi)}
        </Badge>
      </div>
      <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
        {tier.perksEn.map((p, i) => (
          <li key={p}>• {t(p, tier.perksHi[i]!)}</li>
        ))}
      </ul>
    </div>
  );
}

function MyReputation() {
  const { t, session } = useStore();
  const { data: me } = useMe();
  const role = (me?.role ?? "farmer") as Role;
  const uid = session?.user.id;
  const reps = useReps([uid]);
  const pend = usePendingReveal();
  const mine = (uid && reps.data?.[uid]) || {};
  const flows = FLOWS_ABOUT[role];
  const comp = composite(flows.map((f) => mine[f] ?? { r: null, n: 0 }));
  return (
    <div className="space-y-4">
      <div>
        <Label>
          {role === "farmer"
            ? t("Composite Farmer Trust Score", "किसान का कुल भरोसा स्कोर")
            : t(FLOWS[flows[0]!].en, FLOWS[flows[0]!].hi)}
        </Label>
        <TierCard stars={starFinal(comp.r, comp.n)} n={comp.n} />
        {!!pend.data?.n && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <EyeOff className="h-3.5 w-3.5" />
            {t(
              `${pend.data.n} new rating(s) unlock within 48 hours (double-blind).`,
              `${pend.data.n} नई रेटिंग 48 घंटे में खुलेंगी।`,
            )}
          </p>
        )}
      </div>
      {role === "farmer" && (
        <div>
          <Label>
            {t(
              "Role badges (each is shown to that partner)",
              "भूमिका बैज (हर साथी को उसका बैज दिखता है)",
            )}
          </Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {flows.map((f) => {
              const r = mine[f];
              const s = starFinal(r?.r ?? null, r?.n ?? 0);
              return (
                <div key={f} className="rounded-lg border border-border p-2.5">
                  <p className="text-xs font-semibold text-foreground">
                    {t(`${FLOWS[f].badgeEn} Badge`, `${FLOWS[f].badgeHi} बैज`)}
                  </p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {f === 1
                      ? t("Shown to cold storage owners", "कोल्ड स्टोर मालिकों को दिखता है")
                      : f === 2
                        ? t("Shown to buyers", "खरीदारों को दिखता है")
                        : t("Shown to transporters", "ट्रांसपोर्टरों को दिखता है")}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-lg font-semibold">
                    <Star className="h-4 w-4 fill-current text-warning" />
                    {fmtStars(s)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">· {r?.n ?? 0}</span>
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <div>
        <Label>{t("How your score is calculated", "आपका स्कोर कैसे बनता है")}</Label>
        <div className="space-y-2">
          {flows.map((f) => (
            <FlowFormula key={f} f={f} />
          ))}
        </div>
        <p className="mt-2 text-[0.68rem] text-muted-foreground">
          {t(
            `Each deal scores 0–100. Your running score R uses recency weighting (R = 0.25 × this deal + 0.75 × previous R). Stars = 1 + 4 × R/100, smoothed toward ${BAYES_C.toFixed(1)}★ until you have more deals: N/(N+${BAYES_M}) × stars + ${BAYES_M}/(N+${BAYES_M}) × ${BAYES_C.toFixed(1)}.`,
            `हर सौदे का स्कोर 0–100। चलता स्कोर R = 0.25 × यह सौदा + 0.75 × पिछला R। स्टार = 1 + 4 × R/100, कम सौदों पर ${BAYES_C.toFixed(1)}★ की ओर संतुलित।`,
          )}
        </p>
      </div>
      <Safeguards />
    </div>
  );
}

function FlowFormula({ f }: { f: FlowId }) {
  const { t } = useStore();
  const d = FLOWS[f];
  const sys = Math.round(txScore(f, {}).systemShare * 100);
  return (
    <details className="rounded-lg border border-border p-2.5 text-xs">
      <summary className="cursor-pointer font-medium text-foreground">
        {t(d.en, d.hi)}{" "}
        <span className="font-normal text-muted-foreground">
          · {t(`rated by the ${ROLE_NAME[d.from][0]}`, `${ROLE_NAME[d.from][1]} द्वारा`)} · {sys}%{" "}
          {t("system", "सिस्टम")} / {100 - sys}% {t("peer", "साथी")}
        </span>
      </summary>
      <ul className="mt-2 space-y-1">
        {d.comps.map((c) => (
          <li key={c.k} className="flex items-start justify-between gap-2">
            <span className="text-muted-foreground">{t(c.en, c.hi)}</span>
            <span className="shrink-0 text-foreground">
              {Math.round(c.w * 100)}% ·{" "}
              {c.src === "peer" ? (
                t("peer", "साथी")
              ) : c.src === "measured" ? (
                t("measured", "मापा")
              ) : (
                <Lock className="inline h-3 w-3" />
              )}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RateList() {
  const { t } = useStore();
  const r = useRateables();
  const [sel, setSel] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const items = r.data ?? [];
  const cur = items.find((x) => `${x.flow}:${x.tx_id}` === sel);
  if (cur)
    return (
      <RateForm
        item={cur}
        onBack={() => setSel(null)}
        onDone={(score) => {
          setSel(null);
          setDone(
            t(
              `Thanks! Rating saved (deal score ${score}/100). It will be revealed after the other side rates or in 48 hours.`,
              `धन्यवाद! रेटिंग सेव (स्कोर ${score}/100)। दूसरी ओर के रेट करने या 48 घंटे बाद दिखेगी।`,
            ),
          );
        }}
      />
    );
  return (
    <div className="space-y-2">
      {done && <p className="rounded-lg bg-success/10 p-2.5 text-xs text-success">{done}</p>}
      {r.isLoading && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t("Loading…", "लोड हो रहा है…")}
        </p>
      )}
      {!r.isLoading && items.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {t(
            "Nothing to rate right now. Finished deals appear here.",
            "अभी रेट करने को कुछ नहीं। पूरे सौदे यहाँ दिखेंगे।",
          )}
        </p>
      )}
      {items.map((x) => (
        <button
          key={`${x.flow}:${x.tx_id}`}
          onClick={() => setSel(`${x.flow}:${x.tx_id}`)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border p-3 text-left text-sm hover:border-primary/40"
        >
          <span>
            <b className="text-foreground">{x.ratee_name || t("Partner", "साथी")}</b>{" "}
            <span className="text-xs text-muted-foreground">
              · {t(FLOWS[x.flow as FlowId].en, FLOWS[x.flow as FlowId].hi)}
            </span>
            <br />
            <span className="text-xs text-muted-foreground">
              {x.title} · {x.detail}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-primary">
            {t("Rate", "रेट करें")}
          </span>
        </button>
      ))}
    </div>
  );
}

function RateForm({
  item,
  onBack,
  onDone,
}: {
  item: { flow: number; tx_id: string; title: string; detail: string; ratee_name: string | null };
  onBack: () => void;
  onDone: (score: number) => void;
}) {
  const { t } = useStore();
  const inv = useInvalidate();
  const f = FLOWS[item.flow as FlowId];
  const [ans, setAns] = useState<Record<string, 100 | 50 | 0>>({});
  const [shield, setShield] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const asks = f.comps.filter((c) => c.src !== "system");
  const submit = async () => {
    if (asks.some((c) => ans[c.k] === undefined))
      return setErr(t("Please answer every question", "हर सवाल का जवाब दें"));
    setBusy(true);
    setErr("");
    const r = await api.submitRating({
      flow: f.id,
      txId: item.tx_id,
      answers: ans,
      weatherShield: shield,
    });
    setBusy(false);
    if (r.error || !r.data) return setErr(r.error?.message ?? "Failed");
    inv("rateables", "rep", "reveal");
    onDone(r.data.score);
  };
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-foreground">
          {t(f.en, f.hi)} · {item.ratee_name}
        </p>
        <p className="text-xs text-muted-foreground">
          {item.title} · {item.detail}
        </p>
      </div>
      {asks.map((c) => (
        <div key={c.k}>
          <p className="mb-1.5 text-sm text-foreground">
            {t(c.q!.en, c.q!.hi)}{" "}
            {c.src === "measured" && (
              <span className="text-[0.65rem] text-muted-foreground">
                ({t("measurement", "माप")})
              </span>
            )}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {c.q!.opts.map((o, i) => {
              const v = PEER_VALUE[i]!;
              const on = ans[c.k] === v;
              return (
                <button
                  key={o}
                  type="button"
                  onClick={() => setAns((a) => ({ ...a, [c.k]: v }))}
                  className={`rounded-lg border-2 py-2 text-xs font-semibold ${on ? (i === 0 ? "border-success bg-success/10 text-success" : i === 1 ? "border-warning bg-warning/10 text-warning" : "border-destructive bg-destructive/10 text-destructive") : "border-border text-muted-foreground"}`}
                >
                  {t(o, c.q!.optsHi[i]!)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <div className="rounded-lg bg-secondary p-2.5 text-xs text-muted-foreground">
        <p className="mb-1 flex items-center gap-1 font-medium text-foreground">
          <Lock className="h-3.5 w-3.5" />
          {t("Filled in automatically from records", "रिकॉर्ड से अपने-आप")}
        </p>
        {f.comps
          .filter((c) => c.src === "system")
          .map((c) => (
            <p key={c.k}>
              • {t(c.en, c.hi)} ({Math.round(c.w * 100)}%)
            </p>
          ))}
      </div>
      {f.comps.some((c) => c.timed) && (
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={shield}
            onChange={(e) => setShield(e.target.checked)}
          />
          <span>
            <CloudRain className="mr-1 inline h-3.5 w-3.5" />
            {t(
              "There was an IMD weather alert that caused a delay (time-based parts will not count).",
              "IMD मौसम चेतावनी से देरी हुई (समय वाले हिस्से नहीं गिने जाएँगे)।",
            )}
          </span>
        </label>
      )}
      {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
      <div className="flex gap-2">
        <Btn v="outline" onClick={onBack}>
          {t("Back", "वापस")}
        </Btn>
        <Btn className="flex-1" disabled={busy} onClick={submit}>
          {busy ? "…" : t("Submit rating", "रेटिंग भेजें")}
        </Btn>
      </div>
    </div>
  );
}

function Simulator() {
  const { t } = useStore();
  const { data: me } = useMe();
  const role = (me?.role ?? "farmer") as Role;
  const [flow, setFlow] = useState<FlowId>(FLOWS_ABOUT[role][0]!);
  const [tele, setTele] = useState(90);
  const [peer, setPeer] = useState(80);
  const [n, setN] = useState(6);
  const share = txScore(flow, {}).systemShare;
  const s = share * tele + (1 - share) * peer; // one deal's score
  const raw = starRaw(s); // steady state: R converges to the deal score
  const fin = starFinal(s, n);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {([1, 2, 3, 4, 5, 6] as FlowId[]).map((f) => (
          <button
            key={f}
            onClick={() => setFlow(f)}
            className={`rounded-full border px-2.5 py-1 text-xs font-medium ${flow === f ? "border-primary bg-accent text-primary" : "border-border text-muted-foreground"}`}
          >
            {f}. {t(FLOWS[f].en, FLOWS[f].hi)}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          `This flow is ${Math.round(share * 100)}% system telemetry and ${Math.round((1 - share) * 100)}% peer review.`,
          `यह ${Math.round(share * 100)}% सिस्टम और ${Math.round((1 - share) * 100)}% साथी रेटिंग है।`,
        )}
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Range label={t("Telemetry %", "टेलीमेट्री %")} v={tele} set={setTele} max={100} />
        <Range label={t("Peer review %", "साथी रेटिंग %")} v={peer} set={setPeer} max={100} />
        <Range label={t("Completed deals (N)", "पूरे सौदे (N)")} v={n} set={setN} max={60} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-secondary p-2">
          <b className="block text-lg text-foreground">{s.toFixed(1)}</b>
          {t("deal score R", "सौदा स्कोर R")}
        </div>
        <div className="rounded-lg bg-secondary p-2">
          <b className="block text-lg text-foreground">{raw.toFixed(2)}★</b>
          {t("raw stars", "कच्चे स्टार")}
        </div>
        <div className="rounded-lg bg-secondary p-2">
          <b className="block text-lg text-foreground">{fin.toFixed(2)}★</b>
          {t("after smoothing", "संतुलित स्टार")}
        </div>
      </div>
      <TierCard stars={fin} n={n} />
      <p className="text-[0.68rem] text-muted-foreground">
        {t(
          `With few deals the rating stays close to ${BAYES_C.toFixed(1)}★; each new deal moves it more as N grows. Gold ≥ 4.5★ (after at least 3 ratings), Standard 3.2–4.4★, Probation < 3.2★.`,
          `कम सौदों पर रेटिंग ${BAYES_C.toFixed(1)}★ के पास रहती है। गोल्ड ≥ 4.5★, स्टैंडर्ड 3.2–4.4★, प्रोबेशन < 3.2★।`,
        )}
      </p>
    </div>
  );
}

function Range({
  label,
  v,
  set,
  max,
}: {
  label: string;
  v: number;
  set: (n: number) => void;
  max: number;
}) {
  return (
    <label className="block text-xs">
      <span className="mb-1 flex justify-between text-muted-foreground">
        {label}
        <b className="tabular-nums text-foreground">{v}</b>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        value={v}
        onChange={(e) => set(+e.target.value)}
        className="w-full accent-primary"
      />
    </label>
  );
}

/** Rating summary shown at the top of the profile menu; tapping it opens the full panel. */
export function MyRatingSummary({ onOpen }: { onOpen: () => void }) {
  const { t, session } = useStore();
  const { data: me } = useMe();
  const role = (me?.role ?? "farmer") as Role;
  const uid = session?.user.id;
  const reps = useReps([uid]);
  const mine = (uid && reps.data?.[uid]) || {};
  const comp = composite(FLOWS_ABOUT[role].map((f) => mine[f] ?? { r: null, n: 0 }));
  const stars = starFinal(comp.r, comp.n);
  const tier = TIERS[tierOf(stars, comp.n)];
  return (
    <button
      onClick={() => {
        onOpen();
        openKrishiSaakh("me");
      }}
      className="mt-2 flex w-full items-center gap-2 rounded-lg bg-secondary px-2.5 py-2 text-left hover:bg-accent"
    >
      <Star className="h-5 w-5 shrink-0 fill-current text-warning" />
      <span className="flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {reps.isLoading ? "…" : `${fmtStars(stars)} / 5`}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            · {comp.n} {t(comp.n === 1 ? "rating" : "ratings", "रेटिंग")}
          </span>
        </span>
        <span className="block text-[0.68rem] text-muted-foreground">
          {t(tier.en, tier.hi)} · ChillScore
        </span>
      </span>
      <span className="text-xs font-medium text-primary">{t("View", "देखें")}</span>
    </button>
  );
}
