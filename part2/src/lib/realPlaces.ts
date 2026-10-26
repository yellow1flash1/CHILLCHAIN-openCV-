// Real nearby places from OpenStreetMap (Overpass API). Free, no key — works on any host.
export type PlaceKind = "storage" | "buyer" | "seller";
export type RealPlace = {
  id: string;
  kind: PlaceKind;
  name: string;
  lat: number;
  lng: number;
  phone?: string | undefined;
  address?: string | undefined;
};

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

export async function fetchRealPlaces(
  [lat, lng]: [number, number],
  radiusM = 30000,
): Promise<RealPlace[]> {
  const a = `(around:${radiusM},${lat},${lng})`;
  const q = `[out:json][timeout:25];(
nwr["industrial"="cold_storage"]${a};
nwr["building"="cold_storage"]${a};
nwr["name"~"cold stor|कोल्ड",i]${a};
nwr["amenity"="marketplace"]${a};
nwr["shop"="wholesale"]${a};
nwr["name"~"mandi|मंडी|apmc|krishi upaj",i]${a};
nwr["shop"~"agrarian|farm|greengrocer"]${a};
);out center 150;`;
  let lastErr: unknown;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        body: "data=" + encodeURIComponent(q),
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      // Overpass API element: a node (lat/lon) or a way/relation with a computed centre.
      type OsmElement = {
        id: number;
        type: string;
        lat?: number;
        lon?: number;
        center?: { lat: number; lon: number };
        tags?: {
          name?: string;
          industrial?: string;
          building?: string;
          amenity?: string;
          shop?: string;
          phone?: string;
          [k: `${string}:${string}`]: string | undefined;
        };
      };
      const json = (await res.json()) as { elements: OsmElement[] };
      const seen = new Set<string>();
      return json.elements.flatMap((e) => {
        const t = e.tags ?? {};
        const plat = e.lat ?? e.center?.lat,
          plng = e.lon ?? e.center?.lon;
        if (plat == null || plng == null) return [];
        const name: string = t.name || t["name:en"] || "";
        const n = name.toLowerCase();
        let kind: PlaceKind;
        if (
          t.industrial === "cold_storage" ||
          t.building === "cold_storage" ||
          /cold stor|कोल्ड/.test(n)
        )
          kind = "storage";
        else if (
          t.amenity === "marketplace" ||
          t.shop === "wholesale" ||
          /mandi|मंडी|apmc|krishi upaj/.test(n)
        )
          kind = "buyer";
        else kind = "seller";
        const key = `${e.type}${e.id}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [
          {
            id: key,
            kind,
            name:
              name ||
              (kind === "storage"
                ? "Cold storage"
                : kind === "buyer"
                  ? "Market / Mandi"
                  : "Agri shop"),
            lat: plat,
            lng: plng,
            phone: t.phone || t["contact:phone"],
            address:
              [t["addr:street"], t["addr:city"] || t["addr:village"], t["addr:postcode"]]
                .filter(Boolean)
                .join(", ") || undefined,
          },
        ];
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}
