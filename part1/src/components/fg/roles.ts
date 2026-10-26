import { Sprout, Store, Truck, Warehouse } from "lucide-react";
import type { BuyerType, Role } from "@/lib/types";

/** The four kinds of ChillChain account, in the order the welcome screen shows them. */
export const ROLES: {
  k: Role;
  I: typeof Sprout;
  en: string;
  hi: string;
  descEn: string;
  descHi: string;
}[] = [
  {
    k: "farmer",
    I: Sprout,
    en: "Grower / FPO",
    hi: "उत्पादक / FPO",
    descEn:
      "Exotic & short-life fruit, flowers, mushrooms: grade, cool, ship and sell before the clock runs out",
    descHi:
      "विदेशी व जल्दी खराब होने वाले फल, फूल, मशरूम: ग्रेड करें, ठंडा रखें, भेजें और समय रहते बेचें",
  },
  {
    k: "transporter",
    I: Truck,
    en: "Reefer / transporter",
    hi: "रीफ़र / ट्रांसपोर्टर",
    descEn:
      "Pick up shared and full cold-chain loads near you, deliver before the deadline, get paid",
    descHi: "पास के साझा और पूरे कोल्ड-चेन लोड लें, समय से पहुँचाएँ, भुगतान पाएँ",
  },
  {
    k: "buyer",
    I: Store,
    en: "Buyer",
    hi: "खरीदार",
    descEn:
      "Quick-commerce, retail, hotels, exporters, florists and processors: pre-order graded produce",
    descHi:
      "क्विक-कॉमर्स, रिटेल, होटल, निर्यातक, फूलवाले व प्रोसेसर: ग्रेड किया माल पहले से ऑर्डर करें",
  },
  {
    k: "owner",
    I: Warehouse,
    en: "Cold room / pre-cooler / ripening owner",
    hi: "कोल्ड रूम / प्री-कूलर / पकाई कक्ष मालिक",
    descEn: "Rent crate space by the hour or day, manage check-ins and earnings",
    descHi: "घंटे या दिन के हिसाब से जगह दें, चेक-इन और कमाई संभालें",
  },
];
export const roleInfo = (r: Role) => ROLES.find((x) => x.k === r) ?? ROLES[0]!;

/** Kinds of buyer. Processors see C-grade and expiring lots first; everyone else sees premium lots first. */
export const BUYER_TYPES: { k: BuyerType; en: string; hi: string }[] = [
  { k: "quick_commerce", en: "Quick-commerce / dark store", hi: "क्विक-कॉमर्स / डार्क स्टोर" },
  { k: "retail", en: "Premium retail / fruit shop", hi: "प्रीमियम रिटेल / फल दुकान" },
  { k: "horeca", en: "Hotel, restaurant, caterer", hi: "होटल, रेस्टोरेंट, कैटरर" },
  { k: "exporter", en: "Exporter", hi: "निर्यातक" },
  { k: "florist", en: "Florist / wedding decorator", hi: "फूलवाला / शादी डेकोरेटर" },
  {
    k: "processor",
    en: "Processor (juice, pulp, jam, drying)",
    hi: "प्रोसेसर (जूस, पल्प, जैम, सुखाना)",
  },
  { k: "other", en: "Other", hi: "अन्य" },
];

// The role picked on the welcome screen, kept for this browser tab only so it survives the
// sign-up / Google redirect but the welcome screen shows again next time the app is opened.
const KEY = "chillchain-picked-role";
export function getPickedRole(): Role | null {
  try {
    const v = sessionStorage.getItem(KEY);
    return ROLES.some((x) => x.k === v) ? (v as Role) : null;
  } catch {
    return null;
  }
}
export function setPickedRole(r: Role | null) {
  try {
    if (r) sessionStorage.setItem(KEY, r);
    else sessionStorage.removeItem(KEY);
  } catch {
    /* storage blocked */
  }
}
