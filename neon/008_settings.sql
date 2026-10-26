-- 008: Settings, privacy consent, rating disputes, transporter online/offline, cold room palledari.
-- Run once, after 007. Additive only.

ALTER TABLE profiles
  ADD COLUMN settings jsonb NOT NULL DEFAULT '{}'::jsonb,  -- notifications, crops, price alerts, buyer/transporter preferences
  ADD COLUMN consent_at timestamptz,                      -- accepted the privacy policy
  ADD COLUMN deleted_at timestamptz;                      -- account deleted: personal details were wiped

ALTER TABLE transporters ADD COLUMN available boolean NOT NULL DEFAULT true; -- "online" switch
ALTER TABLE cold_rooms ADD COLUMN palledari_per_crate integer CHECK (palledari_per_crate BETWEEN 0 AND 500); -- loading/unloading charge

-- KrishiSaakh disputes: a user can challenge a rating they received; an admin upholds (removes it) or dismisses.
ALTER TABLE ks_ratings ADD COLUMN excluded boolean NOT NULL DEFAULT false;
CREATE TABLE ks_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id uuid NOT NULL REFERENCES ks_ratings(id),
  user_id text NOT NULL,
  reason text NOT NULL CHECK (length(reason) BETWEEN 5 AND 500),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'upheld', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (rating_id, user_id)
);

-- Offline drivers see no new loads.
CREATE OR REPLACE FUNCTION transporter_nearby(_uid text, _radius integer DEFAULT NULL)
RETURNS TABLE (id uuid, trip_code text, from_district text, to_label text, distance_km integer, pickup_km integer,
               vehicle_key text, kg integer, crop text, reefer boolean, pickup_date text, amount integer, notes text, created_at timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT b.id, b.trip_code, b.from_district, b.to_label, b.distance_km,
         road_km(home.lat, home.lng, f.lat, f.lng) AS pickup_km,
         b.vehicle_key, b.kg, b.crop, b.reefer, b.pickup_date::text, b.amount, b.notes, b.created_at
  FROM transporters t
  JOIN districts home ON home.name = t.base_district
  JOIN transport_bookings b ON b.status = 'requested' AND b.pickup_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  JOIN districts f ON f.name = b.from_district
  WHERE t.user_id = _uid
    AND t.available
    AND b.kg <= t.capacity_kg
    AND (NOT b.reefer OR t.has_reefer)
    AND road_km(home.lat, home.lng, f.lat, f.lng) <= COALESCE(_radius, t.radius_km)
  ORDER BY b.pickup_date, pickup_km
  LIMIT 50
$$;
