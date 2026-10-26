import { useState } from "react";
import { LogOut, ScanLine } from "lucide-react";
import { useStore } from "@/lib/store";
import { useSaveProfile, type Profile, type Role } from "@/lib/data";
import { Btn, Crest, Field, inputCls } from "./ui";
import { BUYER_TYPES, ROLES, getPickedRole } from "./roles";
import type { BuyerType } from "@/lib/types";

// Must match the districts table (neon/002 and neon/009).
export const DISTRICTS: Record<string, string[]> = {
  Maharashtra: ["Satara", "Pune", "Nashik", "Solapur", "Mumbai", "Nagpur"],
  Karnataka: ["Kodagu", "Bengaluru Urban"],
  Kerala: ["Wayanad", "Ernakulam"],
  Bihar: ["Muzaffarpur"],
  "Jammu and Kashmir": ["Shopian", "Srinagar"],
  "Himachal Pradesh": ["Shimla"],
  "Arunachal Pradesh": ["Lower Subansiri"],
  Gujarat: ["Kutch"],
  "Tamil Nadu": ["Krishnagiri"],
  Telangana: ["Hyderabad"],
  "West Bengal": ["Kolkata"],
  Delhi: ["North West Delhi", "North Delhi"],
  Haryana: ["Sonipat", "Karnal", "Panipat", "Hisar", "Kurukshetra"],
  Punjab: ["Ludhiana", "Amritsar", "Patiala", "Jalandhar"],
  "Uttar Pradesh": ["Meerut", "Agra", "Lucknow", "Saharanpur"],
  Rajasthan: ["Jaipur", "Alwar", "Kota"],
};
const BANKS: Record<string, string> = {
  sbi: "State Bank of India",
  okaxis: "Axis Bank",
  ybl: "Yes Bank (PhonePe)",
  paytm: "Paytm Payments Bank",
  okhdfcbank: "HDFC Bank",
  okicici: "ICICI Bank",
  pnb: "Punjab National Bank",
  oksbi: "State Bank of India",
};

export function Onboarding({ profile, role }: { profile: Profile | null; role: Role | null }) {
  const { t, signOut } = useStore();
  const save = useSaveProfile();
  const [r, setR] = useState<Role>(role ?? getPickedRole() ?? "farmer");
  const [f, setF] = useState({
    full_name: profile?.full_name ?? "",
    phone: profile?.phone ?? "",
    state: profile?.state ?? "Maharashtra",
    district: profile?.district ?? "Satara",
    village: profile?.village ?? "",
    org_name: profile?.org_name ?? "",
    id_type: profile?.id_type ?? "Aadhaar",
    id_number: profile?.id_number ?? "",
    upi_id: profile?.upi_id ?? "",
  });
  const [buyerType, setBuyerType] = useState<BuyerType>(profile?.buyer_type ?? "quick_commerce");
  const [idOk, setIdOk] = useState(!!profile?.id_number);
  const [upiOk, setUpiOk] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [consent, setConsent] = useState(false);
  const u = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));
  const verifyUpi = () => {
    if (!/^[\w.-]{3,}@[a-z]{2,}$/i.test(f.upi_id))
      return setErr(t("Enter a valid UPI ID like name@sbi", "सही UPI ID डालें"));
    const bank = BANKS[(f.upi_id.split("@")[1] ?? "").toLowerCase()];
    setErr("");
    setUpiOk(
      t(
        `UPI ID format looks right${bank ? ` · ${bank} (from the handle)` : ""}. The name is confirmed on your first payment.`,
        `UPI ID सही लगती है${bank ? ` · ${bank}` : ""}। नाम पहले भुगतान पर पक्का होगा।`,
      ),
    );
  };
  const submit = () => {
    if (f.full_name.trim().length < 2) return setErr(t("Enter your full name", "पूरा नाम डालें"));
    if (!/^[6-9]\d{9}$/.test(f.phone))
      return setErr(t("Enter a valid 10-digit mobile", "सही मोबाइल नंबर डालें"));
    if (r === "farmer") {
      if (!f.village.trim()) return setErr(t("Enter your village", "गाँव का नाम डालें"));
      if (!idOk || f.id_number.trim().length < 4)
        return setErr(t("Enter and verify your ID number", "पहचान संख्या सत्यापित करें"));
      if (!upiOk && f.upi_id !== profile?.upi_id)
        return setErr(t("Please check your UPI ID", "UPI ID जाँचें"));
    } else if (r === "transporter") {
      if (!upiOk && f.upi_id !== profile?.upi_id)
        return setErr(
          t(
            "Add and check the UPI ID where farmers will pay you",
            "वह UPI ID डालें जिस पर किसान भुगतान करेंगे",
          ),
        );
    } else if (f.org_name.trim().length < 2)
      return setErr(t("Enter your business name", "व्यवसाय का नाम डालें"));
    if (!consent)
      return setErr(
        t(
          "Please accept the privacy policy to continue",
          "आगे बढ़ने के लिए गोपनीयता नीति स्वीकार करें",
        ),
      );
    setErr("");
    const fpo =
      profile?.fpo_id ??
      `#${f.state.slice(0, 2).toUpperCase()}-${f.district.slice(0, 3).toUpperCase()}-${Math.floor(1000 + Math.random() * 8999)}`;
    save.mutate(
      {
        ...(role ? {} : { role: r }),
        consent: true,
        full_name: f.full_name.trim(),
        phone: f.phone,
        state: f.state,
        district: f.district,
        village: f.village.trim() || null,
        org_name: f.org_name.trim() || null,
        id_type: r === "farmer" ? f.id_type : null,
        id_number: r === "farmer" ? f.id_number.trim() : null,
        upi_id: f.upi_id || null,
        fpo_id: r === "farmer" ? fpo : null,
        ...(r === "buyer" ? { buyer_type: buyerType } : {}),
      },
      { onError: (e) => setErr((e as Error).message) },
    );
  };
  return (
    <div className="mx-auto max-w-md px-5 py-8">
      <div className="mb-4 flex items-center gap-3">
        <Crest size={36} />
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">
            {t("Complete your profile", "प्रोफ़ाइल पूरी करें")}
          </h1>
          <p className="text-xs text-muted-foreground">
            {t("One time setup", "एक बार की जानकारी")}
          </p>
        </div>
        <button aria-label="Logout" onClick={signOut}>
          <LogOut className="h-5 w-5 text-primary" />
        </button>
      </div>
      <div className="card-classic space-y-3 p-5">
        {!role && (
          <div className="grid grid-cols-2 gap-2">
            {ROLES.map(({ k, I, en, hi }) => (
              <button
                key={k}
                onClick={() => setR(k)}
                className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-center text-xs font-bold ${r === k ? "border-primary bg-accent text-primary" : "border-border"}`}
              >
                <I className="h-6 w-6" />
                {t(en, hi)}
              </button>
            ))}
          </div>
        )}
        <Field label={t("Full Name", "पूरा नाम")}>
          <input
            className={inputCls}
            maxLength={60}
            value={f.full_name}
            onChange={(e) => u("full_name", e.target.value)}
          />
        </Field>
        <Field label={t("Mobile Number", "मोबाइल नंबर")}>
          <input
            className={inputCls}
            inputMode="numeric"
            maxLength={10}
            value={f.phone}
            onChange={(e) => u("phone", e.target.value.replace(/\D/g, ""))}
            placeholder="98123 45678"
          />
        </Field>
        {(r === "buyer" || r === "owner") && (
          <Field
            label={
              r === "owner"
                ? t("Storage / company name", "स्टोरेज / कंपनी का नाम")
                : t("Business / Store Name", "व्यवसाय का नाम")
            }
          >
            <input
              className={inputCls}
              maxLength={80}
              value={f.org_name}
              onChange={(e) => u("org_name", e.target.value)}
              placeholder="Sharma Fresh Traders"
            />
          </Field>
        )}
        {r === "buyer" && (
          <Field label={t("What kind of buyer are you?", "आप किस तरह के खरीदार हैं?")}>
            <select
              className={inputCls}
              value={buyerType}
              onChange={(e) => setBuyerType(e.target.value as BuyerType)}
            >
              {BUYER_TYPES.map((b) => (
                <option key={b.k} value={b.k}>
                  {t(b.en, b.hi)}
                </option>
              ))}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t("State", "राज्य")}>
            <select
              className={inputCls}
              value={f.state}
              onChange={(e) =>
                setF((p) => ({
                  ...p,
                  state: e.target.value,
                  district: DISTRICTS[e.target.value]?.[0] ?? "",
                }))
              }
            >
              {Object.keys(DISTRICTS).map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label={t("District", "ज़िला")}>
            <select
              className={inputCls}
              value={f.district}
              onChange={(e) => u("district", e.target.value)}
            >
              {(DISTRICTS[f.state] ?? []).map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
          </Field>
        </div>
        {r === "farmer" && (
          <>
            <Field label={t("Village", "गाँव")}>
              <input
                className={inputCls}
                maxLength={40}
                value={f.village}
                onChange={(e) => u("village", e.target.value)}
              />
            </Field>
            <div className="rounded-lg border border-dashed border-border p-3">
              <div className="mb-2 flex gap-1">
                {["Aadhaar", "KCC", "PM-Kisan"].map((x) => (
                  <button
                    key={x}
                    onClick={() => {
                      u("id_type", x);
                      setIdOk(false);
                    }}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${f.id_type === x ? "border-primary/30 bg-accent text-primary" : "border-border"}`}
                  >
                    {x}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className={inputCls}
                  maxLength={20}
                  value={f.id_number}
                  onChange={(e) => {
                    u("id_number", e.target.value);
                    setIdOk(false);
                  }}
                  placeholder={`${f.id_type} number`}
                />
                <Btn
                  v="outline"
                  className="shrink-0"
                  onClick={() => {
                    if (f.id_number.trim().length < 4)
                      return setErr(t("Type your ID number first", "पहले ID नंबर डालें"));
                    setIdOk(true);
                    setErr("");
                  }}
                >
                  <ScanLine className="h-4 w-4" />
                  {t("Add", "जोड़ें")}
                </Btn>
              </div>
              {idOk && (
                <div className="mt-3 flex items-center gap-3">
                  <span className="stamp px-3 py-1 text-sm">{t("ADDED ✔", "जोड़ा ✔")}</span>
                  <span className="text-[0.7rem] text-muted-foreground">
                    {t(
                      "Saved with your profile. Your FPO verifies it later.",
                      "प्रोफ़ाइल के साथ सेव। आपका FPO बाद में जाँचेगा।",
                    )}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
        <Field label={t("Payout UPI ID", "भुगतान UPI ID")}>
          <div className="flex gap-2">
            <input
              className={inputCls}
              maxLength={50}
              value={f.upi_id}
              onChange={(e) => {
                u("upi_id", e.target.value.trim());
                setUpiOk(null);
              }}
              placeholder="kishanlal@sbi"
            />
            <Btn v="outline" className="shrink-0" onClick={verifyUpi}>
              {t("Check", "जाँचें")}
            </Btn>
          </div>
        </Field>
        {upiOk && (
          <p className="rounded-md bg-success/10 px-3 py-2 text-xs font-semibold text-success">
            ✔ {upiOk}
          </p>
        )}
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
          />
          <span>
            {t(
              "I agree to ChillChain storing my details to run bookings, trips and payments, as described in the ",
              "मैं सहमत हूँ कि ChillChain बुकिंग, ट्रिप और भुगतान के लिए मेरी जानकारी रखे, जैसा ",
            )}
            <a
              href="/privacy"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-navy underline"
            >
              {t("privacy policy", "गोपनीयता नीति")}
            </a>
            {t(".", " में लिखा है।")}
          </span>
        </label>
        {err && <p className="text-xs font-semibold text-destructive">{err}</p>}
        <Btn className="w-full" onClick={submit} disabled={save.isPending}>
          {t("Save & Continue", "सेव करें")}
        </Btn>
      </div>
    </div>
  );
}
