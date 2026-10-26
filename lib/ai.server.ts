// Server-only: Chill Sahayak / Safar Sahayak chat (streamed). Uses Google Gemini directly via GEMINI_API_KEY,
// so it works on any host (Cloudflare, Vercel, Node).
import { auth } from "@clerk/tanstack-react-start/server";

// `||`, not `??`: an empty GEMINI_MODEL= line in .env must fall back to the default too.
const MODEL = process.env["GEMINI_MODEL"] || "gemini-flash-latest";
// Tried in order. Google's free tier gives every model its own daily request limit (20 a day for the
// flash models when this was written), so the lighter "flash-lite" models at the end keep grading and
// the assistant working after the others run out for the day.
const MODELS = [
  ...new Set([
    MODEL,
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash-preview",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
  ]),
];
/** Models that hit a limit (or are retired for this key), and when to try them again. Kept per server
 *  instance, so a used-up model is not asked again on every scan. */
const resting = new Map<string, number>();
const ready = () => MODELS.filter((m) => (resting.get(m) ?? 0) <= Date.now());
/** Google says how long a limit lasts (`retryDelay`, e.g. "50360s"); rest that model until then. */
async function restFrom(model: string, res: Response) {
  let secs = 60;
  try {
    const j = (await res.json()) as { error?: { details?: { retryDelay?: string }[] } };
    const d = j.error?.details?.find((x) => x.retryDelay)?.retryDelay;
    if (d) secs = parseFloat(d) || 60;
  } catch {
    /* keep the default */
  }
  resting.set(model, Date.now() + Math.max(30, secs) * 1000);
}
/** When the first resting model can be asked again (null if none is resting). */
function nextReady() {
  const t = [...resting.values()].filter((x) => x > Date.now());
  return t.length ? Math.min(...t) : null;
}

/** No model could answer: `limit` = free-tier limit used up (until `retryAt`), `busy` = overloaded. */
export class AIUnavailable extends Error {
  kind: "limit" | "busy";
  retryAt: number | null;
  constructor(kind: "limit" | "busy", retryAt: number | null) {
    super(
      kind === "limit"
        ? "The AI has used its free limit for now."
        : "The AI is very busy right now.",
    );
    this.kind = kind;
    this.retryAt = retryAt;
  }
}

/** One JSON answer from Gemini (not streamed) for text and/or image parts, moving on to the next model
 *  when one is busy or out of quota. Used for photo grading. */
export async function geminiJSON<T>(parts: unknown[], schema: unknown): Promise<T> {
  const apiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
  if (!apiKey) throw new Error("AI grading is not set up yet: add GEMINI_API_KEY to the server.");
  const body = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0.2,
    },
  });
  // Each model is tried once. A slow one is skipped after 20 s, and the grower never waits more than
  // about 45 s in all.
  const deadline = Date.now() + 45_000;
  let limited = false;
  for (const model of ready()) {
    const left = deadline - Date.now();
    if (left < 3000) break;
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(Math.min(20_000, left)),
        },
      );
    } catch (e) {
      if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) continue;
      throw e;
    }
    if (res.status === 404) {
      resting.set(model, Date.now() + 86_400_000); // retired for this key
      continue;
    }
    if (res.status === 503) continue; // busy right now
    if (res.status === 429) {
      limited = true;
      await restFrom(model, res);
      continue;
    }
    if (!res.ok) {
      const j = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(`AI error: ${j?.error?.message ?? res.status}`);
    }
    const j = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
    };
    const text = (j.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("");
    return JSON.parse(text) as T;
  }
  const out = limited || ready().length === 0;
  throw new AIUnavailable(out ? "limit" : "busy", out ? nextReady() : null);
}

async function verifyUser() {
  const { isAuthenticated } = await auth();
  return isAuthenticated;
}

const SYSTEM = `You are "Chill Sahayak", the ChillChain cold-chain assistant for Indian growers and FPOs of short-shelf-life, high-value produce: exotic fruit (dragon fruit, avocado, kiwi, blueberry, passion fruit, rambutan), short-window fruit (litchi, strawberry, cherry, fig, jamun), export fruit (grapes, pomegranate, mango), cut flowers, mushrooms and polyhouse greens.
- Reply in the app language given as LANGUAGE in the context, in that language's own script (Urdu in Urdu script). If the user clearly writes in a different language, reply in the language they write. In English replies, add key terms in Hindi in brackets.
- Be practical and short (under 180 words) with bullet points. Use ₹, kg and hours.
- You know field-heat removal and pre-cooling, cold-chain temperatures and humidity, chill injury, ethylene and ripening chambers, packaging (punnets, ventilated crates), grading (A premium/export, B local retail or flash sale, C processing), buyer channels (quick-commerce, premium retail, HoReCa, exporters, florists, processors), MIDH/NHB horticulture support, UPI and escrow.
- The sell-by clock matters most: tell the grower what to do in the next few hours (pre-cool, list, take a pre-order, book a shared reefer, send to a processor).
- Use the GROWER CONTEXT below (their scans with sell-by clocks, bookings, lots, buyer pre-orders, nearby storage, prices) when relevant. Never invent numbers not in the context; say when data is unavailable.
- ChillChain payments in this app are test payments (no real money moves yet) — say so if asked about real payouts.
- If the context says the user is a TRANSPORTER (truck driver), act as "Safar Sahayak": help with trips, routes, loading and covering produce, reefer temperatures, fuel and toll costs, vehicle documents (RC, DL, permit, insurance, PUC, FASTag), collecting fares by UPI or cash, and road safety. Use their trips and earnings from the context.`;

export async function handleChat(request: Request) {
  if (!(await verifyUser()))
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  const apiKey = process.env["GEMINI_API_KEY"] || process.env["GOOGLE_API_KEY"];
  if (!apiKey)
    return Response.json(
      { error: "Chill Sahayak is not set up yet: add GEMINI_API_KEY to the server settings." },
      { status: 500 },
    );
  return geminiChat(request, apiKey);
}

async function geminiChat(request: Request, apiKey: string) {
  let body: { messages?: { role: string; content: string }[]; context?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }
  const msgs = (body.messages ?? [])
    .filter(
      (m) =>
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim(),
    )
    .slice(-20)
    .map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content.slice(0, 2000) }],
    }));
  while (msgs.length && msgs[0]?.role !== "user") msgs.shift(); // Gemini needs the first turn to be the user
  if (!msgs.length || msgs[msgs.length - 1]?.role !== "user")
    return Response.json({ error: "Empty message" }, { status: 400 });

  const payload = JSON.stringify({
    systemInstruction: {
      parts: [{ text: `${SYSTEM}\n\nGROWER CONTEXT:\n${(body.context ?? "").slice(0, 6000)}` }],
    },
    contents: msgs,
  });
  let upstream: Response | null = null;
  let limited = false;
  try {
    for (const model of ready()) {
      upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: payload,
        },
      );
      // retired, out of quota or busy: rest it if Google says so, and try the next model
      if (upstream.status === 404) resting.set(model, Date.now() + 86_400_000);
      else if (upstream.status === 429) {
        limited = true;
        await restFrom(model, upstream);
      } else if (upstream.status !== 503) break;
      upstream = null;
    }
  } catch (e) {
    // Client disconnected or network hiccup before Gemini answered — not a server error.
    if (e instanceof Error && (e.name === "AbortError" || e.message === "aborted"))
      return new Response(null, { status: 499 });
    throw e;
  }
  if (!upstream) {
    const at = nextReady();
    const when = at
      ? new Date(at).toLocaleTimeString("en-IN", {
          timeZone: "Asia/Kolkata",
          hour: "numeric",
          minute: "2-digit",
        })
      : null;
    return Response.json(
      {
        error: limited
          ? `Chill Sahayak has used today's free AI limit${when ? `; it is back at about ${when} IST` : ""}.`
          : "Gemini is very busy right now — please try again in a minute.",
      },
      { status: limited ? 429 : 503 },
    );
  }
  if (!upstream.ok || !upstream.body) {
    let msg = "The assistant is unavailable right now.";
    if (upstream.status === 429)
      msg = "Too many requests (Gemini free-tier limit) — please wait a moment and try again.";
    if (upstream.status === 503)
      msg = "Gemini is very busy right now — please try again in a minute.";
    try {
      const j = (await upstream.json()) as { error?: { message?: string } };
      if (upstream.status === 400 || upstream.status === 401 || upstream.status === 403)
        msg = `Gemini error: ${j.error?.message ?? "the API key was rejected."}`;
    } catch {
      /* ignore */
    }
    return Response.json({ error: msg }, { status: upstream.status });
  }
  // Convert Gemini SSE into a plain text stream of answer deltas.
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  const handle = (line: string, ctrl: TransformStreamDefaultController<Uint8Array>) => {
    if (!line.startsWith("data:")) return;
    const d = line.slice(5).trim();
    if (!d) return;
    try {
      const ev = JSON.parse(d) as {
        candidates?: {
          content?: { parts?: { text?: string; thought?: boolean }[] };
          finishReason?: string;
        }[];
        promptFeedback?: { blockReason?: string };
      };
      const c = ev.candidates?.[0];
      const send = (t: string) => {
        try {
          ctrl.enqueue(enc.encode(t));
        } catch {
          /* client gone */
        }
      };
      for (const part of c?.content?.parts ?? []) if (part.text && !part.thought) send(part.text);
      if (ev.promptFeedback?.blockReason || c?.finishReason === "SAFETY")
        send("\n\n⚠ The assistant could not answer this question.");
    } catch {
      /* partial */
    }
  };
  const out = upstream.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        buf += dec.decode(chunk, { stream: true }).replace(/\r\n/g, "\n");
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          handle(line, ctrl);
        }
      },
      flush(ctrl) {
        if (buf) handle(buf, ctrl);
      },
    }),
  );
  return new Response(out, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
