import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { StoreProvider, useStore } from "@/lib/store";
import { SectionTitle } from "@/components/fg/ui";
import { LangPicker } from "@/components/fg/LangPicker";
import { langInfo } from "@/lib/i18n";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy and terms — ChillChain" },
      { name: "description", content: "What ChillChain collects, why, and your rights." },
    ],
  }),
  component: () => (
    <StoreProvider>
      <Privacy />
    </StoreProvider>
  ),
});

// Plain-language policy, written for India's Digital Personal Data Protection Act, 2023.
// Have it reviewed by a lawyer before public launch.
const SECTIONS: [string, string, string[], string[]][] = [
  [
    "What we collect",
    "हम क्या जानकारी लेते हैं",
    [
      "Name, mobile number, email (for login), state, district and village.",
      "Growers: farm details you enter in ProfitPlanter, scans (grade, ripeness, harvest time, sell-by), storage bookings, lots, pre-orders you take and trips.",
      "Transporters: vehicle number, licence, RC, insurance and fitness numbers, and only the last 4 digits of Aadhaar.",
      "Buyers and cold room owners: business name, GST number (optional) and room details.",
      "Your UPI ID, so partners can pay you. Ratings you give and receive (ChillScore).",
      "Location only when you tap a GPS button, to find nearby cold rooms.",
    ],
    [
      "नाम, मोबाइल, ईमेल (लॉगिन के लिए), राज्य, ज़िला और गाँव।",
      "उत्पादक: प्रॉफ़िटप्लांटर में खेत की जानकारी, स्कैन (ग्रेड, पकाव, तोड़ने का समय, बिक्री समय), भंडारण बुकिंग, लॉट, लिए गए प्री-ऑर्डर और ट्रिप।",
      "ट्रांसपोर्टर: गाड़ी नंबर, लाइसेंस, RC, बीमा व फिटनेस नंबर, और आधार के सिर्फ़ आखिरी 4 अंक।",
      "खरीदार व कोल्ड रूम मालिक: व्यवसाय का नाम, GST (वैकल्पिक) और कक्ष की जानकारी।",
      "आपकी UPI ID ताकि साथी भुगतान कर सकें। आपकी दी और मिली रेटिंग (चिलस्कोर)।",
      "लोकेशन सिर्फ़ तब, जब आप GPS बटन दबाएँ।",
    ],
  ],
  [
    "Why we use it",
    "हम इसका इस्तेमाल क्यों करते हैं",
    [
      "To run bookings, trips, sales and payments between you and your partners.",
      "To show your partners what they need: for example, your phone number only after a booking or trip is confirmed.",
      "To calculate fair ratings and crop advice. We do not sell your data or show you ads.",
    ],
    [
      "आपके और साथियों के बीच बुकिंग, ट्रिप, बिक्री और भुगतान चलाने के लिए।",
      "साथियों को ज़रूरी जानकारी दिखाने के लिए, जैसे पक्की बुकिंग के बाद ही आपका फ़ोन नंबर।",
      "सही रेटिंग और प्रॉफ़िटप्लांटर सलाह के लिए। हम आपका डेटा बेचते नहीं, न विज्ञापन दिखाते हैं।",
    ],
  ],
  [
    "Who else processes it",
    "और कौन इसे संभालता है",
    [
      "Clerk (login), Neon (database), Resend (emails), Google Gemini (assistant answers) and, if switched on, Cloudflare R2 (crate photos). They only process data to provide their service to ChillChain.",
    ],
    [
      "Clerk (लॉगिन), Neon (डेटाबेस), Resend (ईमेल), Google Gemini (सहायक) और चालू होने पर Cloudflare R2 (क्रेट फ़ोटो)। ये सिर्फ़ ChillChain के लिए सेवा देने हेतु डेटा संभालते हैं।",
    ],
  ],
  [
    "Your rights",
    "आपके अधिकार",
    [
      "See and download everything we store: Settings → Privacy → Download my data.",
      "Correct your details any time in Settings → Account.",
      "Delete your account: Settings → Privacy → Delete my account. Past transactions stay without your name so your partners' records stay correct.",
      "Withdraw consent for location or emails in Settings.",
    ],
    [
      "हमारे पास आपकी सारी जानकारी देखें और डाउनलोड करें: सेटिंग → गोपनीयता → मेरा डेटा।",
      "सेटिंग → खाता में कभी भी जानकारी सुधारें।",
      "खाता हटाएँ: सेटिंग → गोपनीयता → खाता हटाएँ। पुराने सौदे आपके नाम के बिना रहेंगे।",
      "लोकेशन या ईमेल की अनुमति सेटिंग में वापस लें।",
    ],
  ],
  [
    "Terms of use",
    "उपयोग की शर्तें",
    [
      "Payments in this version are test payments; no real money moves.",
      "ProfitPlanter numbers, AI grades, ripeness and sell-by times are estimates. Check with your local KVK, horticulture office or FPO before acting.",
      "Give honest ratings. Fake or revenge ratings can be removed after review.",
    ],
    [
      "इस संस्करण में भुगतान टेस्ट मोड में हैं; असली पैसा नहीं जाता।",
      "प्रॉफ़िटप्लांटर के आँकड़े, एआई ग्रेड, पकाव और बिक्री समय अनुमान हैं। कदम उठाने से पहले KVK, बागवानी कार्यालय या FPO से पूछें।",
      "ईमानदार रेटिंग दें। झूठी रेटिंग जाँच के बाद हटाई जा सकती है।",
    ],
  ],
];

function Privacy() {
  const { t, s } = useStore();
  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-2 flex justify-end">
        <LangPicker />
      </div>
      <SectionTitle
        icon={ShieldCheck}
        title={t("Privacy policy and terms", "गोपनीयता नीति और शर्तें")}
        sub={t("Last updated October 2026", "अंतिम अपडेट अक्टूबर 2026")}
      />
      {s.lang !== "en" && !langInfo(s.lang).deva && (
        <p className="mb-3 text-xs text-muted-foreground">
          This policy is available in English and Hindi. / यह नीति अंग्रेज़ी और हिन्दी में उपलब्ध
          है।
        </p>
      )}
      <div className="space-y-4">
        {SECTIONS.map(([en, hi, pe, ph]) => (
          <section key={en} className="card-classic p-4">
            <h3 className="mb-2 font-semibold text-foreground">{t(en, hi)}</h3>
            <ul className="list-disc space-y-1 pl-5 text-sm text-foreground">
              {(langInfo(s.lang).deva ? ph : pe).map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </section>
        ))}
        <p className="text-xs text-muted-foreground">
          {t(
            "Questions or complaints: contact your FPO or the ChillChain team from Settings → Help.",
            "सवाल या शिकायत: सेटिंग → मदद से अपने FPO या ChillChain टीम से संपर्क करें।",
          )}
        </p>
      </div>
    </div>
  );
}
