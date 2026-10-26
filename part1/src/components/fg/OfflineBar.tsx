import { useEffect, useState } from "react";
import { CloudOff, CloudUpload } from "lucide-react";
import { useStore } from "@/lib/store";
import { useInvalidate, useMe } from "@/lib/data";
import { useOnline } from "@/lib/net";
import { saveGradingModels } from "@/lib/offline";
import { usePendingScans, useScanSync, type SyncResult } from "@/lib/outbox";

/** Under the navigation bar: says when the app is offline, counts scans waiting to be sent, sends
 *  them once the network is back, and (for growers) keeps the grading models saved on the phone. */
export function OfflineBar() {
  const { t, session, signedIn } = useStore();
  const { data: me } = useMe();
  const online = useOnline();
  const inv = useInvalidate();
  const uid = session?.user.id;
  const waiting = usePendingScans(uid).filter((p) => !p.failed).length;
  const [result, setResult] = useState<SyncResult | null>(null);

  useScanSync(uid, signedIn, (r) => {
    if (r.sent + r.retake + r.failed === 0) return;
    inv("scans");
    setResult(r);
  });
  useEffect(() => {
    if (!result) return;
    const h = setTimeout(() => setResult(null), result.retake || result.failed ? 15_000 : 6_000);
    return () => clearTimeout(h);
  }, [result]);
  useEffect(() => {
    if (online && signedIn && me?.role === "farmer") saveGradingModels();
  }, [online, signedIn, me?.role]);

  let text: string | null = null;
  if (!online)
    text = t(
      "You're offline. Showing what was last saved on this phone. Scans are kept and sent later; other changes need internet.",
      "आप ऑफ़लाइन हैं। फ़ोन में आख़िरी बार सेव जानकारी दिख रही है। स्कैन सेव रहेंगे और बाद में भेजे जाएँगे; बाकी बदलावों के लिए इंटरनेट चाहिए।",
    );
  else if (waiting)
    text = t(`Sending ${waiting} saved scans…`, `${waiting} सेव स्कैन भेजे जा रहे हैं…`);
  else if (result)
    text = [
      result.sent ? t(`${result.sent} saved scans sent.`, `${result.sent} सेव स्कैन भेजे गए।`) : "",
      result.retake
        ? t(
            `${result.retake} photos could not be graded by the AI: scan them again or grade them yourself.`,
            `${result.retake} फ़ोटो एआई ग्रेड नहीं कर सका: दोबारा स्कैन करें या खुद ग्रेड करें।`,
          )
        : "",
      result.failed
        ? t(
            `${result.failed} scans were not accepted; see Scan.`,
            `${result.failed} स्कैन स्वीकार नहीं हुए; स्कैन में देखें।`,
          )
        : "",
    ]
      .filter(Boolean)
      .join(" ");
  if (!text) return null;

  const Icon = online ? CloudUpload : CloudOff;
  return (
    <div
      role="status"
      className={`flex items-start justify-center gap-2 px-4 py-2 text-[13px] leading-snug ${online ? "bg-primary/10 text-primary" : "bg-warning/15 text-foreground"}`}
    >
      <Icon className="mt-[1px] h-4 w-4 shrink-0" />
      <span className="max-w-[640px]">
        {text}
        {!online && waiting > 0 && (
          <b className="ml-1 font-semibold">
            {t(`${waiting} scans waiting to send.`, `${waiting} स्कैन भेजे जाने बाकी।`)}
          </b>
        )}
      </span>
    </div>
  );
}
