import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Mic, RotateCcw, Send, Sprout, Square } from "lucide-react";
import { cropBy, useStore } from "@/lib/store";
import { langInfo } from "@/lib/i18n";
import {
  useBookings,
  useColdRooms,
  useLots,
  useMandi,
  useMe,
  usePreorders,
  useScans,
} from "@/lib/data";
import { fmtLeft, hoursLeft } from "@/lib/shelf";
import { SectionTitle, inputCls } from "./ui";

const CHIPS = [
  "How many hours do I have to sell my strawberries?",
  "Should I pre-cool before the truck comes?",
  "When should avocados go to a ripening chamber?",
  "Which buyer pays most for B-grade litchi?",
  "How does a shared reefer truck work?",
  "लीची को तोड़ने के बाद कैसे ठंडा रखें?",
];
type Msg = { role: "user" | "assistant"; content: string };
const KEY = "chillchain-chat-v1";

/** Grower assistant: grounded in the grower's own scans (with sell-by clocks), bookings, lots, pre-orders, storage and prices. */
export function AssistTab() {
  const { s, t } = useStore();
  const { data: me } = useMe();
  const scans = useScans();
  const bookings = useBookings();
  const lots = useLots();
  const rooms = useColdRooms();
  const mandi = useMandi(me?.profile?.state);
  const pre = usePreorders();
  const context = () => {
    const p = me?.profile;
    const L = lots.data ?? [];
    return [
      `LANGUAGE: ${langInfo(s.lang).name} (${langInfo(s.lang).native})`,
      `Grower: ${p?.full_name}, village ${p?.village}, ${p?.district}, ${p?.state}. UPI ${p?.upi_id}. Now ${new Date().toISOString()}.`,
      `Recent scans: ${
        (scans.data ?? [])
          .slice(0, 5)
          .map(
            (x) =>
              `${x.batch_code} ${cropBy(x.crop).en} grade ${x.grade}, ripeness ${x.ripeness ?? "?"}/5, ${x.cold_chain ? "cooled" : "not cooled"}, ${x.sell_by ? `sell within ${fmtLeft(hoursLeft(x.sell_by))}` : "no clock"}, suggested route ${x.route ?? "?"}`,
          )
          .join("; ") || "none"
      }.`,
      `Storage: ${(rooms.data ?? []).map((r) => `${r.name} [${r.facility}] (${r.district}) ₹${r.rate_per_crate_day}/crate/day${r.rate_per_crate_hour ? ` or ₹${r.rate_per_crate_hour}/crate/hour` : ""}, ${r.free} free slots, ${r.temp_c}°C`).join("; ")}.`,
      `Bookings: ${(bookings.data ?? []).map((b) => `${b.pass_no} ${b.crates} crates ${b.hours ? `${b.hours}h` : `${b.days}d`} ₹${b.amount} ${b.paid ? "paid" : "unpaid credit"}`).join("; ") || "none"}.`,
      `Open buyer pre-orders: ${
        (pre.data ?? [])
          .filter((x) => x.status === "open")
          .slice(0, 8)
          .map(
            (x) =>
              `${x.kg}kg ${cropBy(x.crop).en} grade ${x.min_grade}+ @ ₹${x.price_per_kg} by ${x.need_by} (${x.buyer_name})`,
          )
          .join("; ") || "none"
      }.`,
      `Lots: ${L.map((l) => `${l.lot_code} ${l.kg}kg ${cropBy(l.crop).en} net ₹${l.net_amount} status ${l.status}${l.buyer_name ? ` buyer ${l.buyer_name}` : ""}`).join("; ") || "none"}. Settled earnings ₹${L.filter((l) => l.status === "settled").reduce((a, l) => a + l.net_amount, 0)}, in escrow ₹${L.filter((l) => l.status === "escrow").reduce((a, l) => a + l.net_amount, 0)}.`,
      mandi.data?.available
        ? `Live Agmarknet prices (₹/kg modal): ${mandi.data.prices.map((m) => `${cropBy(m.crop).en} ₹${m.modalPerKg} at ${m.market} (${m.date})`).join("; ")}.`
        : "Live market prices: not available right now; the app shows indicative farm-gate rates.",
      `Lot pricing: full asking price while more than 50% of the sell-by window is left, then 90% (25–50%), 75% (10–25%), 60% (<10%), 50% after the deadline (processors only, up to 24 h later).`,
      `Income estimator model: without cold chain = 38% spoilage, 12% commission, ₹3.5/kg transport, ₹1.058/kg market fees. ChillChain = 8% loss, crates(20kg)×rate×days, ₹2.2/kg shared reefer, 8% FPO fee, ₹104 escrow fee.`,
    ].join("\n");
  };
  return (
    <ChatPanel
      storageKey={KEY}
      chips={CHIPS}
      context={context}
      title={t("Chill Sahayak", "चिल सहायक")}
      sub={t(
        "Ask about pre-cooling, ripening, grading, buyers and your sell-by clock",
        "प्री-कूलिंग, पकाई, ग्रेडिंग, खरीदार और बिक्री घड़ी के बारे में पूछें",
      )}
      greeting={t(
        `Namaste ${me?.profile?.full_name ?? ""} ji 🙏 I'm Chill Sahayak. Ask me how to keep your fruit, flowers or mushrooms fresh and sell them before the clock runs out, in your own language.`,
        `नमस्ते ${me?.profile?.full_name ?? ""} जी 🙏 मैं चिल सहायक हूँ। फल, फूल या मशरूम को ताज़ा रखने और घड़ी खत्म होने से पहले बेचने के बारे में अपनी भाषा में पूछें।`,
      )}
    />
  );
}

/** Chat UI shared by the farmer and transporter assistants. `context` is sent with every question. */
export function ChatPanel({
  title,
  sub,
  greeting,
  chips,
  storageKey,
  context,
}: {
  title: string;
  sub: string;
  greeting: string;
  chips: string[];
  storageKey: string;
  context: () => string;
}) {
  const { s, t } = useStore();
  const greet: Msg = { role: "assistant", content: greeting };
  const KEY = storageKey;
  const [msgs, setMsgs] = useState<Msg[]>([greet]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setMsgs(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    input.current?.focus();
  }, []);
  useEffect(() => {
    if (!busy) localStorage.setItem(KEY, JSON.stringify(msgs.slice(-40)));
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, busy]);

  const ask = async (text: string) => {
    const v = text.trim().slice(0, 1000);
    if (!v || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: v }];
    setMsgs([...history, { role: "assistant", content: "" }]);
    setQ("");
    setBusy(true);
    const ac = new AbortController();
    abort.current = ac;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        signal: ac.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.filter((m) => m.content), context: context() }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error ?? "The assistant is unavailable.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...history, { role: "assistant", content: acc }]);
      }
      if (!acc)
        setMsgs([
          ...history,
          { role: "assistant", content: "_(No answer received. Please try again.)_" },
        ]);
    } catch (e) {
      const stopped = (e as Error).name === "AbortError";
      setMsgs((m) => {
        const last = m[m.length - 1];
        const c = last?.content
          ? last.content + (stopped ? "\n\n_(stopped)_" : "")
          : stopped
            ? "_(stopped)_"
            : `⚠ ${(e as Error).message}`;
        return [...m.slice(0, -1), { role: "assistant", content: c }];
      });
    } finally {
      setBusy(false);
      abort.current = null;
      input.current?.focus();
    }
  };

  const voice = () => {
    type SR = {
      lang: string;
      onresult: (e: { results: { 0: { 0: { transcript: string } } } }) => void;
      onend: () => void;
      onerror: () => void;
      start: () => void;
    };
    const W = window as unknown as {
      SpeechRecognition?: new () => SR;
      webkitSpeechRecognition?: new () => SR;
    };
    const Ctor = W.SpeechRecognition ?? W.webkitSpeechRecognition;
    if (!Ctor) {
      setQ(
        t(
          "Voice input not supported in this browser — please type",
          "इस ब्राउज़र में आवाज़ समर्थित नहीं",
        ),
      );
      return;
    }
    const r = new Ctor();
    r.lang = langInfo(s.lang).speech;
    r.onresult = (e) => ask(e.results[0][0].transcript);
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    setListening(true);
    r.start();
  };

  return (
    <>
      <SectionTitle icon={Bot} title={title} sub={sub} />
      <div className="card-classic flex h-[calc(100vh-19rem)] min-h-[26rem] flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-3 py-2">
          <div className="rounded-full bg-secondary p-1.5 text-primary">
            <Sprout className="h-4 w-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{t("Chat", "बातचीत")}</p>
          </div>
          <button
            aria-label="New conversation"
            onClick={() => {
              setMsgs([greet]);
              localStorage.removeItem(KEY);
            }}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-3">
          {msgs.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                className="ml-auto max-w-[85%] whitespace-pre-line rounded-2xl bg-primary px-3 py-2 text-sm text-primary-foreground"
              >
                {m.content}
              </div>
            ) : (
              <div
                key={i}
                className="max-w-[92%] text-sm leading-relaxed [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2 [&_strong]:text-primary"
              >
                {m.content ? (
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                ) : (
                  <span className="animate-pulse text-muted-foreground">
                    {t("Thinking…", "सोच रहा हूँ…")}
                  </span>
                )}
              </div>
            ),
          )}
          <div ref={end} />
        </div>
        <div className="flex gap-2 overflow-x-auto px-3 pb-2">
          {chips.map((c) => (
            <button
              key={c}
              disabled={busy}
              onClick={() => ask(c)}
              className="shrink-0 rounded-full border border-border bg-popover px-3 py-1 text-xs font-semibold text-primary disabled:opacity-50"
            >
              {c}
            </button>
          ))}
        </div>
        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(q);
          }}
        >
          <button
            type="button"
            onClick={voice}
            aria-label="Voice"
            className={`flex shrink-0 items-center gap-1 rounded-lg border px-2 text-xs font-semibold ${listening ? "border-destructive text-destructive" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            <Mic className="h-4 w-4" />
            {listening ? "…" : "बोलकर पूछें"}
          </button>
          <input
            ref={input}
            className={inputCls}
            value={q}
            maxLength={1000}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("Type your question", "अपना सवाल लिखें")}
          />
          {busy ? (
            <button
              type="button"
              aria-label="Stop"
              onClick={() => abort.current?.abort()}
              className="shrink-0 rounded-lg bg-destructive px-3 text-destructive-foreground"
            >
              <Square className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="submit"
              aria-label="Send"
              className="shrink-0 rounded-lg bg-primary px-3 text-primary-foreground"
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </div>
    </>
  );
}
