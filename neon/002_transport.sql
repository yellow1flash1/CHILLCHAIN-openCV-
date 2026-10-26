-- 002: transport booking. Run once in the Neon SQL Editor (after schema.sql).
-- Fares are ESTIMATES: base fare + per-km rate x road distance (straight-line x 1.25 between district centres).
-- Edit the numbers in vehicle_types any time; nothing in the app code needs to change.

CREATE TABLE districts (
  name text PRIMARY KEY,
  state text NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL
);
INSERT INTO districts (name, state, lat, lng) VALUES
('Sonipat','Haryana',28.9931,77.0151),('Karnal','Haryana',29.6857,76.9905),('Panipat','Haryana',29.3909,76.9635),
('Hisar','Haryana',29.1492,75.7217),('Kurukshetra','Haryana',29.9695,76.8783),
('Ludhiana','Punjab',30.901,75.8573),('Amritsar','Punjab',31.634,74.8723),('Patiala','Punjab',30.3398,76.3869),('Jalandhar','Punjab',31.326,75.5762),
('Meerut','Uttar Pradesh',28.9845,77.7064),('Agra','Uttar Pradesh',27.1767,78.0081),('Lucknow','Uttar Pradesh',26.8467,80.9462),('Saharanpur','Uttar Pradesh',29.968,77.5552),
('Nashik','Maharashtra',19.9975,73.7898),('Pune','Maharashtra',18.5204,73.8567),('Nagpur','Maharashtra',21.1458,79.0882),('Satara','Maharashtra',17.6805,74.0183),
('North West Delhi','Delhi',28.7,77.1),('North Delhi','Delhi',28.68,77.22),
('Jaipur','Rajasthan',26.9124,75.7873),('Alwar','Rajasthan',27.553,76.6346),('Kota','Rajasthan',25.2138,75.8648);

CREATE TABLE vehicle_types (
  key text PRIMARY KEY,
  name text NOT NULL,
  name_hi text,
  capacity_kg integer NOT NULL,
  base_fare integer NOT NULL,   -- rupees
  per_km integer NOT NULL,      -- rupees per km
  sort integer NOT NULL
);
INSERT INTO vehicle_types (key, name, name_hi, capacity_kg, base_fare, per_km, sort) VALUES
('mini',   'Mini truck (Tata Ace)', 'मिनी ट्रक (टाटा एस)', 750,  250, 13, 1),
('pickup', 'Pickup (Bolero)',       'पिकअप (बोलेरो)',     1500, 400, 17, 2),
('tempo',  'Tata 407',              'टाटा 407',           2500, 600, 22, 3),
('truck',  'Truck (6 tonne)',       'ट्रक (6 टन)',        6000, 1200, 32, 4);

-- Real drivers/transporters you onboard. Empty at first: until you add some, requests stay "requested".
CREATE TABLE transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  vehicle_key text NOT NULL REFERENCES vehicle_types(key),
  vehicle_no text,
  base_district text REFERENCES districts(name),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE transport_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_code text NOT NULL UNIQUE,
  farmer_id text NOT NULL,
  lot_id uuid REFERENCES lots(id),
  from_district text NOT NULL REFERENCES districts(name),
  to_label text NOT NULL,
  to_room_id uuid REFERENCES cold_rooms(id),
  to_district text REFERENCES districts(name),
  distance_km integer NOT NULL,
  vehicle_key text NOT NULL REFERENCES vehicle_types(key),
  kg integer NOT NULL CHECK (kg > 0),
  crop text NOT NULL,
  reefer boolean NOT NULL DEFAULT false,
  pickup_date date NOT NULL,
  amount integer NOT NULL,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','assigned','in_transit','delivered','cancelled')),
  transporter_id uuid REFERENCES transporters(id),
  driver_name text,
  driver_phone text,
  vehicle_no text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((to_room_id IS NULL) <> (to_district IS NULL))
);
CREATE INDEX transport_farmer_idx ON transport_bookings (farmer_id, created_at DESC);
CREATE INDEX transport_driver_day_idx ON transport_bookings (transporter_id, pickup_date);

-- Road distance estimate in km (straight line x 1.25, minimum 5 km).
CREATE FUNCTION road_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(5, round(1.25 * 2 * 6371 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))))::int
$$;

-- Price comes from the database only. Destination is either a cold room or a district (mandi / buyer area).
CREATE FUNCTION transport_quote(_from text, _to_room uuid, _to_district text, _vehicle text, _kg integer, _reefer boolean)
RETURNS TABLE (distance_km integer, amount integer, to_label text) LANGUAGE plpgsql STABLE AS $$
DECLARE
  f districts; v vehicle_types;
  tlat double precision; tlng double precision; tname text; dist integer;
BEGIN
  SELECT * INTO f FROM districts WHERE name = _from;
  IF NOT FOUND THEN RAISE EXCEPTION 'pickup district not found'; END IF;
  SELECT * INTO v FROM vehicle_types WHERE key = _vehicle;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid vehicle'; END IF;
  IF _kg IS NULL OR _kg < 1 THEN RAISE EXCEPTION 'enter the weight in kg'; END IF;
  IF _kg > v.capacity_kg THEN RAISE EXCEPTION '% can carry up to % kg', v.name, v.capacity_kg; END IF;
  IF (_to_room IS NULL) = (_to_district IS NULL) THEN RAISE EXCEPTION 'choose one destination'; END IF;

  IF _to_room IS NOT NULL THEN
    SELECT c.lat, c.lng, c.name INTO tlat, tlng, tname FROM cold_rooms c WHERE c.id = _to_room;
  ELSE
    SELECT d.lat, d.lng, d.name INTO tlat, tlng, tname FROM districts d WHERE d.name = _to_district;
  END IF;
  IF tname IS NULL THEN RAISE EXCEPTION 'destination not found'; END IF;

  dist := road_km(f.lat, f.lng, tlat, tlng);
  IF dist > 2500 THEN RAISE EXCEPTION 'distance is too long for a road booking'; END IF;
  RETURN QUERY SELECT dist, round((v.base_fare + v.per_km * dist) * CASE WHEN _reefer THEN 1.35 ELSE 1 END)::int, tname;
END $$;

CREATE FUNCTION create_transport(
  _uid text, _lot_id uuid, _from text, _to_room uuid, _to_district text, _vehicle text,
  _kg integer, _crop text, _reefer boolean, _date date, _notes text
) RETURNS transport_bookings LANGUAGE plpgsql AS $$
DECLARE
  qt record; tr transporters; result transport_bookings;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only farmers can book transport'; END IF;
  IF _date IS NULL OR _date < today OR _date > today + 30 THEN RAISE EXCEPTION 'pick a pickup date within the next 30 days'; END IF;
  IF _crop IS NULL OR length(trim(_crop)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid crop'; END IF;
  IF (SELECT count(*) FROM transport_bookings WHERE farmer_id = _uid AND status IN ('requested','assigned','in_transit')) >= 10 THEN
    RAISE EXCEPTION 'you already have 10 active transport bookings';
  END IF;
  IF _lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lots WHERE id = _lot_id AND farmer_id = _uid) THEN
    RAISE EXCEPTION 'that lot is not yours';
  END IF;

  SELECT * INTO qt FROM transport_quote(_from, _to_room, _to_district, _vehicle, _kg, COALESCE(_reefer, false));

  -- Give the trip to a free driver with this vehicle (same district first). A driver already booked that day is skipped.
  SELECT * INTO tr FROM transporters t
  WHERE t.active AND t.vehicle_key = _vehicle
    AND NOT EXISTS (SELECT 1 FROM transport_bookings b WHERE b.transporter_id = t.id AND b.pickup_date = _date AND b.status IN ('assigned','in_transit'))
  ORDER BY (t.base_district = _from) DESC NULLS LAST, random()
  LIMIT 1
  FOR UPDATE OF t SKIP LOCKED;

  INSERT INTO transport_bookings (trip_code, farmer_id, lot_id, from_district, to_label, to_room_id, to_district, distance_km, vehicle_key, kg, crop, reefer, pickup_date, amount, status, transporter_id, driver_name, driver_phone, vehicle_no, notes)
  VALUES (short_code('TR-'), _uid, _lot_id, _from, qt.to_label, _to_room, _to_district, qt.distance_km, _vehicle, _kg, trim(_crop), COALESCE(_reefer, false), _date, qt.amount,
          CASE WHEN tr.id IS NULL THEN 'requested' ELSE 'assigned' END, tr.id, tr.name, tr.phone, tr.vehicle_no, left(_notes, 200))
  RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION set_transport_status(_uid text, _id uuid, _status text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _status NOT IN ('cancelled','in_transit','delivered') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE transport_bookings SET status = _status
  WHERE id = _id AND farmer_id = _uid AND (
    (_status = 'cancelled' AND status IN ('requested','assigned')) OR
    (_status = 'in_transit' AND status = 'assigned') OR
    (_status = 'delivered' AND status = 'in_transit'));
  IF NOT FOUND THEN RAISE EXCEPTION 'this trip cannot be changed now'; END IF;
END $$;
