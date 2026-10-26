import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, Marker, Popup, TileLayer, CircleMarker, useMap } from "react-leaflet";
import { useEffect, useState } from "react";
import type { ColdRoom } from "@/lib/data";
import { fetchRealPlaces, type PlaceKind, type RealPlace } from "@/lib/realPlaces";

const emoji = (e: string) =>
  L.divIcon({
    className: "",
    html: `<div style="font-size:24px;line-height:24px;filter:drop-shadow(0 1px 1px #0006)">${e}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
const icon = emoji("❄️");
const kindIcon: Record<PlaceKind, L.DivIcon> = {
  storage: emoji("🏬"),
  buyer: emoji("🛒"),
  seller: emoji("🌾"),
};
const kindLabel: Record<PlaceKind, string> = {
  storage: "Cold storage",
  buyer: "Buyer / Mandi",
  seller: "Seller / Agri shop",
};

function Fit({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30], maxZoom: 11 });
  }, [map, pts.length]);
  return null;
}

export default function ColdMap({
  rooms,
  me,
  onPick,
}: {
  rooms: (ColdRoom & { km: number })[];
  me: [number, number];
  onPick: (r: ColdRoom) => void;
}) {
  const [places, setPlaces] = useState<RealPlace[]>([]);
  const [status, setStatus] = useState("Loading real places nearby…");
  const [show, setShow] = useState<Record<PlaceKind, boolean>>({
    storage: true,
    buyer: true,
    seller: true,
  });

  useEffect(() => {
    let alive = true;
    setStatus("Loading real places nearby…");
    fetchRealPlaces(me)
      .then((p) => {
        if (alive) {
          setPlaces(p);
          setStatus(
            p.length
              ? `${p.length} real places within 30 km`
              : "No mapped places found within 30 km",
          );
        }
      })
      .catch(() => alive && setStatus("Couldn't load real places right now"));
    return () => {
      alive = false;
    };
  }, [me[0], me[1]]);

  const pts: [number, number][] = [me, ...rooms.map((r) => [r.lat, r.lng] as [number, number])];
  return (
    <div>
      <MapContainer center={me} zoom={9} className="h-64 w-full rounded-lg" scrollWheelZoom={false}>
        <TileLayer
          attribution="&copy; OpenStreetMap contributors"
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <CircleMarker
          center={me}
          radius={8}
          pathOptions={{ color: "#1B4332", fillColor: "#B08938", fillOpacity: 1 }}
        >
          <Popup>You are here</Popup>
        </CircleMarker>
        {rooms.map((r) => (
          <Marker key={r.id} position={[r.lat, r.lng]} icon={icon}>
            <Popup>
              <b>{r.name}</b>
              <br />₹{r.rate_per_crate_day}/crate/day · {r.free} slots · {r.km.toFixed(1)} km
              <br />
              <button
                style={{ color: "#1B4332", fontWeight: 700, textDecoration: "underline" }}
                onClick={() => onPick(r)}
              >
                Book slot
              </button>
            </Popup>
          </Marker>
        ))}
        {places
          .filter((p) => show[p.kind])
          .map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={kindIcon[p.kind]}>
              <Popup>
                <b>{p.name}</b>
                <br />
                {kindLabel[p.kind]}
                {p.address && (
                  <>
                    <br />
                    {p.address}
                  </>
                )}
                {p.phone && (
                  <>
                    <br />
                    <a href={`tel:${p.phone}`}>📞 {p.phone}</a>
                  </>
                )}
                <br />
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Directions
                </a>
              </Popup>
            </Marker>
          ))}
        <Fit pts={pts} />
      </MapContainer>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        {(Object.keys(kindLabel) as PlaceKind[]).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setShow((s) => ({ ...s, [k]: !s[k] }))}
            className={`rounded-full border px-2 py-1 ${show[k] ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}
          >
            {kindIcon[k].options.html && (k === "storage" ? "🏬" : k === "buyer" ? "🛒" : "🌾")}{" "}
            {kindLabel[k]} ({places.filter((p) => p.kind === k).length})
          </button>
        ))}
        <span className="text-muted-foreground">{status}</span>
      </div>
    </div>
  );
}
