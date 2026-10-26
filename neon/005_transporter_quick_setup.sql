-- 005: quick transporter onboarding. Run once, after 004b.
-- Basic vehicle details are enough to start browsing loads; documents can be added later
-- ("Verify Later"), but a driver must submit them before accepting a trip.

-- More vehicle types for the setup dropdown (existing keys are kept so old bookings stay valid).
UPDATE vehicle_types SET name = '6-wheeler Canter (6 t)', name_hi = '6-पहिया कैंटर (6 टन)' WHERE key = 'truck';
UPDATE vehicle_types SET name = 'Mini truck / Tata Ace', name_hi = 'मिनी ट्रक / टाटा एस' WHERE key = 'mini';
UPDATE vehicle_types SET name = 'Bolero pickup', name_hi = 'बोलेरो पिकअप' WHERE key = 'pickup';
INSERT INTO vehicle_types (key, name, name_hi, capacity_kg, base_fare, per_km, sort) VALUES
  ('tractor', 'Tractor-trolley',          'ट्रैक्टर-ट्रॉली',          4000,  500, 18, 3),
  ('truck12', '10/12-wheeler truck (16 t)', '10/12-पहिया ट्रक (16 टन)', 16000, 2000, 45, 6),
  ('reefer',  'Insulated / reefer van',   'इंसुलेटेड / रीफ़र वैन',     3000, 1500, 35, 7)
ON CONFLICT (key) DO NOTHING;
UPDATE vehicle_types SET sort = 4 WHERE key = 'tempo';
UPDATE vehicle_types SET sort = 5 WHERE key = 'truck';

ALTER TABLE transporters
  ADD COLUMN radius_km integer NOT NULL DEFAULT 150,       -- how far the driver will go for a pickup
  ADD COLUMN insurance_number text,
  ADD COLUMN fitness_number text,
  ADD COLUMN docs_submitted_at timestamptz,                -- NULL = "verify later" chosen, documents not sent yet
  ADD COLUMN handbacks integer NOT NULL DEFAULT 0;         -- trips accepted and then given back (used by KrishiSaakh)
UPDATE transporters SET docs_submitted_at = created_at WHERE user_id IS NOT NULL AND rc_number IS NOT NULL;

-- Basic registration: no documents needed.
DROP FUNCTION transporter_register(text, text, text, text, text, text, text, text, text, integer, boolean);
CREATE FUNCTION transporter_register(
  _uid text, _name text, _phone text, _vehicle text, _vehicle_no text, _district text,
  _capacity integer, _reefer boolean, _radius integer
) RETURNS transporters LANGUAGE plpgsql AS $$
DECLARE v vehicle_types; r transporters;
BEGIN
  IF NOT has_role(_uid, 'transporter') THEN RAISE EXCEPTION 'only transporters can register a vehicle'; END IF;
  SELECT * INTO v FROM vehicle_types WHERE key = _vehicle;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid vehicle type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM districts WHERE name = _district) THEN RAISE EXCEPTION 'district not found'; END IF;
  IF _phone !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'enter a valid 10-digit mobile number'; END IF;
  IF _capacity IS NULL OR _capacity < 100 OR _capacity > 40000 THEN RAISE EXCEPTION 'capacity must be between 1 and 400 quintals'; END IF;
  IF _radius IS NULL OR _radius < 10 OR _radius > 500 THEN RAISE EXCEPTION 'operating radius must be between 10 and 500 km'; END IF;

  INSERT INTO transporters (user_id, name, phone, vehicle_key, vehicle_no, base_district, capacity_kg, has_reefer, radius_km, active, verified)
  VALUES (_uid, trim(_name), _phone, _vehicle, upper(trim(_vehicle_no)), _district, _capacity, COALESCE(_reefer, false) OR _vehicle = 'reefer', _radius, false, false)
  ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone, vehicle_key = EXCLUDED.vehicle_key, base_district = EXCLUDED.base_district,
    capacity_kg = EXCLUDED.capacity_kg, has_reefer = EXCLUDED.has_reefer, radius_km = EXCLUDED.radius_km,
    -- a different vehicle number means a different truck, so it must be verified again
    verified = transporters.verified AND transporters.vehicle_no = EXCLUDED.vehicle_no,
    vehicle_no = EXCLUDED.vehicle_no
  RETURNING * INTO r;
  RETURN r;
END $$;

-- Documents step ("Verify now", or later from the booking gate). Sends the vehicle for review.
CREATE FUNCTION transporter_submit_docs(
  _uid text, _rc text, _licence text, _insurance text, _fitness text, _aadhaar_last4 text
) RETURNS transporters LANGUAGE plpgsql AS $$
DECLARE r transporters;
BEGIN
  IF _aadhaar_last4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'invalid Aadhaar'; END IF;
  UPDATE transporters SET rc_number = upper(trim(_rc)), licence_number = upper(trim(_licence)),
         insurance_number = upper(trim(_insurance)), fitness_number = upper(trim(_fitness)),
         aadhaar_last4 = _aadhaar_last4, docs_submitted_at = now(), verified = false
  WHERE user_id = _uid RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'register your vehicle first'; END IF;
  RETURN r;
END $$;

-- Nearby loads now use the driver's own operating radius.
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
    AND b.kg <= t.capacity_kg
    AND (NOT b.reefer OR t.has_reefer)
    AND road_km(home.lat, home.lng, f.lat, f.lng) <= COALESCE(_radius, t.radius_km)
  ORDER BY b.pickup_date, pickup_km
  LIMIT 50
$$;

-- Booking gate: documents must be submitted before a trip can be accepted.
CREATE OR REPLACE FUNCTION transporter_accept(_uid text, _id uuid) RETURNS transport_bookings LANGUAGE plpgsql AS $$
DECLARE t transporters; result transport_bookings;
BEGIN
  SELECT * INTO t FROM transporters WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'register your vehicle first'; END IF;
  IF t.docs_submitted_at IS NULL THEN RAISE EXCEPTION 'complete document verification before accepting a trip'; END IF;
  IF (SELECT count(*) FROM transport_bookings WHERE transporter_id = t.id AND status IN ('assigned','in_transit')) >= 5 THEN
    RAISE EXCEPTION 'finish your current trips before accepting more (limit 5)';
  END IF;
  UPDATE transport_bookings b SET status = 'assigned', transporter_id = t.id, driver_name = t.name, driver_phone = t.phone,
         vehicle_no = t.vehicle_no, accepted_at = now()
  WHERE b.id = _id AND b.status = 'requested' AND b.kg <= t.capacity_kg AND (NOT b.reefer OR t.has_reefer)
  RETURNING b.* INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'this trip was already taken or does not fit your vehicle'; END IF;
  RETURN result;
END $$;

-- Same as 004b, plus counting trips given back.
CREATE OR REPLACE FUNCTION transporter_set_status(_uid text, _id uuid, _status text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE tid uuid;
BEGIN
  IF _status NOT IN ('requested','in_transit','delivered') THEN RAISE EXCEPTION 'invalid status'; END IF;
  UPDATE transport_bookings b SET
    status = _status,
    picked_at = CASE WHEN _status = 'in_transit' THEN now() ELSE b.picked_at END,
    delivered_at = CASE WHEN _status = 'delivered' THEN now() ELSE b.delivered_at END,
    transporter_id = CASE WHEN _status = 'requested' THEN NULL ELSE b.transporter_id END,
    driver_name = CASE WHEN _status = 'requested' THEN NULL ELSE b.driver_name END,
    driver_phone = CASE WHEN _status = 'requested' THEN NULL ELSE b.driver_phone END,
    vehicle_no = CASE WHEN _status = 'requested' THEN NULL ELSE b.vehicle_no END,
    accepted_at = CASE WHEN _status = 'requested' THEN NULL ELSE b.accepted_at END
  FROM transporters t
  WHERE t.user_id = _uid AND b.transporter_id = t.id AND b.id = _id AND (
    (_status = 'requested' AND b.status = 'assigned') OR
    (_status = 'in_transit' AND b.status = 'assigned') OR
    (_status = 'delivered' AND b.status = 'in_transit'))
  RETURNING t.id INTO tid;
  IF tid IS NULL THEN RAISE EXCEPTION 'this trip cannot be changed now'; END IF;
  IF _status = 'requested' THEN UPDATE transporters SET handbacks = handbacks + 1 WHERE id = tid; END IF;
END $$;
