// Server-only. Resend over plain fetch (no SDK needed). Email must never break a booking or an order, so errors are logged and swallowed.
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export async function sendEmail(
  to: string | null,
  subject: string,
  lines: string[],
): Promise<void> {
  const key = process.env["RESEND_API_KEY"];
  if (!to || !key) return;
  const from = process.env["RESEND_FROM"] ?? "ChillChain <onboarding@resend.dev>";
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:16px"><h2 style="color:#1B4332;margin:0 0 12px">ChillChain</h2>${lines.map((l) => `<p style="margin:6px 0">${esc(l)}</p>`).join("")}</div>`;
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!r.ok) console.error("resend failed", r.status, await r.text());
  } catch (e) {
    console.error("resend error", e);
  }
}
