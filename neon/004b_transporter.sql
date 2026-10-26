-- 004b: transporter (driver) accounts. Run after 004a, once.
-- Drivers sign up in the app, register their vehicle and documents, pick nearby trip requests,
-- update the trip as they go, and mark the fare as received.

ALTER TABLE transporters
  ADD COLUMN user_id text,                                   -- Clerk user id; NULL for drivers the admin adds by hand
  ADD COLUMN rc_number text,                                 -- vehicle registration certificate
  ADD COLUMN licence_number text,                            -- driving licence
  ADD COLUMN aadhaar_last4 text,                             -- only the last 4 digits are stored
  ADD COLUMN capacity_kg integer,                            -- what this truck can carry (defaults to the vehicle type)
  ADD COLUMN has_reefer boolean NOT NULL DEFAULT false,      -- refrigerated body
  ADD COLUMN verified boolean NOT NULL DEFAULT false,        -- you (the admin) flip this after checking the documents
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX transporters_user_key ON transporters (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE transport_bookings
  ADD COLUMN accepted_at timestamptz,
  ADD COLUMN picked_at timestamptz,
  ADD COLUMN delivered_at timestamptz,
  ADD COLUMN paid boolean NOT NULL DEFAULT false,
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN pay_method text;
CREATE INDEX transport_open_idx ON transport_bookings (status, pickup_date) WHERE status = 'requested';

-- Register or update the caller's vehicle. App drivers are created with active = false so the
-- automatic assignment in create_transport() keeps using admin-added drivers only; app drivers
-- choose trips themselves from the nearby list.
CREATE FUNCTION transporter_register(
  _uid text, _name text, _phone text, _vehicle text, _vehicle_no text, _rc text, _licence text,
  _aadhaar_last4 text, _district text, _capacity integer, _reefer boolean
) RETURNS transporters LANGUAGE plpgsql AS $$
DECLARE v vehicle_types; r transporters;
BEGIN
  IF NOT has_role(_uid, 'transporter') THEN RAISE EXCEPTION 'only transporters can register a vehicle'; END IF;
  SELECT * INTO v FROM vehicle_types WHERE key = _vehicle;
  IF NOT FOUND THEN RAISE EXCEPTION 'invalid vehicle type'; END IF;
  IF NOT EXISTS (SELECT 1 FROM districts WHERE name = _district) THEN RAISE EXCEPTION 'district not found'; END IF;
  IF _phone !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'enter a valid 10-digit mobile number'; END IF;
  IF _aadhaar_last4 !~ '^[0-9]{4}$' THEN RAISE EXCEPTION 'invalid Aadhaar'; END IF;
  IF _capacity IS NOT NULL AND (_capacity < 100 OR _capacity > 40000) THEN RAISE EXCEPTION 'capacity must be between 100 and 40000 kg'; END IF;

  -- Re-submitting documents puts the vehicle back into review.
  INSERT INTO transporters (user_id, name, phone, vehicle_key, vehicle_no, rc_number, licence_number, aadhaar_last4, base_district, capacity_kg, has_reefer, active, verified)
  VALUES (_uid, trim(_name), _phone, _vehicle, upper(trim(_vehicle_no)), upper(trim(_rc)), upper(trim(_licence)), _aadhaar_last4, _district,
          COALESCE(_capacity, v.capacity_kg), COALESCE(_reefer, false), false, false)
  ON CONFLICT (user_id) WHERE user_id IS NOT NULL DO UPDATE SET
    name = EXCLUDED.name, phone = EXCLUDED.phone, vehicle_key = EXCLUDED.vehicle_key, vehicle_no = EXCLUDED.vehicle_no,
    rc_number = EXCLUDED.rc_number, licence_number = EXCLUDED.licence_number, aadhaar_last4 = EXCLUDED.aadhaar_last4,
    base_district = EXCLUDED.base_district, capacity_kg = EXCLUDED.capacity_kg, has_reefer = EXCLUDED.has_reefer, verified = false
  RETURNING * INTO r;
  RETURN r;
END $$;

-- Open requests within _radius km of the driver's base district that the truck can carry.
CREATE FUNCTION transporter_nearby(_uid text, _radius integer DEFAULT 150)
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
    AND road_km(home.lat, home.lng, f.lat, f.lng) <= _radius
  ORDER BY b.pickup_date, pickup_km
  LIMIT 50
$$;

CREATE FUNCTION transporter_accept(_uid text, _id uuid) RETURNS transport_bookings LANGUAGE plpgsql AS $$
DECLARE t transporters; result transport_bookings;
BEGIN
  SELECT * INTO t FROM transporters WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'register your vehicle first'; END IF;
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

-- Driver moves a trip along: assigned -> in_transit -> delivered, or hands it back (assigned -> requested).
CREATE FUNCTION transporter_set_status(_uid text, _id uuid, _status text) RETURNS void LANGUAGE plpgsql AS $$
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
    (_status = 'delivered' AND b.status = 'in_transit'));
  IF NOT FOUND THEN RAISE EXCEPTION 'this trip cannot be changed now'; END IF;
END $$;

CREATE FUNCTION transporter_mark_paid(_uid text, _id uuid, _method text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _method NOT IN ('Cash', 'UPI') THEN RAISE EXCEPTION 'invalid payment method'; END IF;
  UPDATE transport_bookings b SET paid = true, paid_at = now(), pay_method = _method
  FROM transporters t
  WHERE t.user_id = _uid AND b.transporter_id = t.id AND b.id = _id AND b.status = 'delivered' AND NOT b.paid;
  IF NOT FOUND THEN RAISE EXCEPTION 'cannot mark this trip as paid'; END IF;
END $$;
