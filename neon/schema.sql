-- FreshGrid schema for Neon (plain Postgres).
-- Differences from the old Supabase version:
--   * No auth schema, RLS or Supabase roles. Users come from Clerk, so user ids are TEXT (e.g. 'user_2abc...').
--   * Only the server talks to the database (via DATABASE_URL), so every function takes the caller's id as _uid.
--     Never expose DATABASE_URL to the browser.
-- Run once:  psql "$DATABASE_URL" -f neon/schema.sql   (or paste into the Neon SQL Editor)

CREATE TYPE app_role AS ENUM ('farmer', 'buyer');

CREATE TABLE profiles (
  id text PRIMARY KEY,
  full_name text NOT NULL DEFAULT '',
  phone text,
  state text,
  district text,
  village text,
  org_name text,
  upi_id text,
  id_type text,
  id_number text,
  fpo_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE FUNCTION has_role(_uid text, _role app_role) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid AND role = _role)
$$;

-- A user picks exactly one role (farmer or buyer) once.
CREATE FUNCTION claim_role(_uid text, _role app_role) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF EXISTS (SELECT 1 FROM user_roles WHERE user_id = _uid) THEN RETURN; END IF;
  INSERT INTO user_roles (user_id, role) VALUES (_uid, _role);
END $$;

CREATE TABLE cold_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_hi text,
  address text NOT NULL,
  district text NOT NULL,
  state text NOT NULL,
  pin text,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  rate_per_crate_day integer NOT NULL,
  total_slots integer NOT NULL,
  temp_c numeric NOT NULL,
  humidity integer NOT NULL,
  badges text[] NOT NULL DEFAULT '{}',
  tags text[] NOT NULL DEFAULT '{}',
  phone text
);

INSERT INTO cold_rooms (name, name_hi, address, district, state, pin, lat, lng, rate_per_crate_day, total_slots, temp_c, humidity, badges, tags) VALUES
('Sunrise Solar Cold Hub', 'सनराइज़ सोलर कोल्ड हब', 'GT Road, Ganaur', 'Sonipat', 'Haryana', '131101', 29.1339, 77.0167, 18, 120, 4.2, 88, ARRAY['Solar','24/7','FPO Certified'], ARRAY['solar','247']),
('Gram Seva Cold Room', 'ग्राम सेवा कोल्ड रूम', 'Rai Industrial Area', 'Sonipat', 'Haryana', '131029', 28.9541, 77.0928, 14, 200, 6.0, 85, ARRAY['Community','Back-up Power'], ARRAY['247']),
('Kisan FPO Chiller', 'किसान FPO चिलर', 'Sonipat Road, Kharkhoda', 'Sonipat', 'Haryana', '131402', 28.8711, 76.9132, 11, 300, 5.0, 90, ARRAY['Bulk','Loading Dock'], ARRAY['bulk']),
('Karnal Agri Cold Chain', 'करनाल एग्री कोल्ड चेन', 'Kunjpura Road', 'Karnal', 'Haryana', '132001', 29.7000, 76.9900, 15, 180, 4.8, 87, ARRAY['24/7','Bulk'], ARRAY['247','bulk']),
('Panipat Solar Chiller', 'पानीपत सोलर चिलर', 'Sanoli Road', 'Panipat', 'Haryana', '132103', 29.4050, 76.9900, 13, 90, 5.5, 86, ARRAY['Solar','Community'], ARRAY['solar']),
('Azadpur Mandi Cold Store', 'आज़ादपुर मंडी कोल्ड स्टोर', 'Azadpur Mandi', 'North West Delhi', 'Delhi', '110033', 28.7076, 77.1800, 22, 400, 3.8, 90, ARRAY['24/7','Loading Dock','Bulk'], ARRAY['247','bulk']);

CREATE TABLE scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id text NOT NULL,
  batch_code text NOT NULL,
  crop text NOT NULL,
  grade text NOT NULL,
  confidence integer NOT NULL,
  uniformity integer NOT NULL,
  spoilage text NOT NULL,
  shelf_no integer NOT NULL,
  shelf_cold integer NOT NULL,
  notes text,
  photo_key text,                       -- Cloudflare R2 object key of the crate photo (optional)
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scans_farmer_idx ON scans (farmer_id, created_at DESC);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  farmer_id text NOT NULL,
  cold_room_id uuid NOT NULL REFERENCES cold_rooms(id),
  pass_no text NOT NULL UNIQUE,
  crop text NOT NULL,
  crates integer NOT NULL CHECK (crates > 0 AND crates <= 500),
  days integer NOT NULL CHECK (days > 0 AND days <= 60),
  amount integer NOT NULL,
  pay_mode text NOT NULL CHECK (pay_mode IN ('upi','credit')),
  paid boolean NOT NULL DEFAULT false,
  bay text NOT NULL,
  utr text,
  pay_method text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_farmer_idx ON bookings (farmer_id, created_at DESC);

CREATE TABLE lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_code text NOT NULL UNIQUE,
  farmer_id text NOT NULL,
  farmer_name text NOT NULL,
  farmer_district text,
  crop text NOT NULL,
  kg integer NOT NULL CHECK (kg > 0),
  grade text NOT NULL DEFAULT 'A',
  price_per_kg numeric NOT NULL CHECK (price_per_kg > 0),
  gross integer NOT NULL,
  cold_deduction integer NOT NULL DEFAULT 0,
  transport_deduction integer NOT NULL DEFAULT 0,
  net_amount integer NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','escrow','settled','cancelled')),
  buyer_id text,
  buyer_name text,
  utr text,
  created_at timestamptz NOT NULL DEFAULT now(),
  ordered_at timestamptz,
  settled_at timestamptz
);
CREATE INDEX lots_status_idx ON lots (status, created_at DESC);
CREATE INDEX lots_farmer_idx ON lots (farmer_id);
CREATE INDEX lots_buyer_idx ON lots (buyer_id);

CREATE TABLE lot_handover (
  lot_id uuid PRIMARY KEY REFERENCES lots(id) ON DELETE CASCADE,
  farmer_id text NOT NULL,
  code text NOT NULL,
  attempts integer NOT NULL DEFAULT 0
);

-- ---------- helpers ----------
CREATE FUNCTION short_code(_prefix text, _len int DEFAULT 8) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT _prefix || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, _len))
$$;
CREATE FUNCTION six_digit_code() RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint) % 1000000)::text, 6, '0')
$$;
-- Fake 12-digit UTR for test-mode settlements (payments stay simulated for now).
CREATE FUNCTION test_utr() RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))::bit(48)::bigint) % 1000000000000)::text, 12, '0')
$$;

-- Free slots per cold room = total minus crates in bookings still active.
CREATE FUNCTION cold_room_free_slots() RETURNS TABLE (cold_room_id uuid, free integer) LANGUAGE sql STABLE AS $$
  SELECT c.id, GREATEST(0, c.total_slots - COALESCE(SUM(b.crates) FILTER (WHERE b.created_at + make_interval(days => b.days) > now()), 0))::int
  FROM cold_rooms c LEFT JOIN bookings b ON b.cold_room_id = c.id
  GROUP BY c.id
$$;

-- ---------- bookings ----------
CREATE FUNCTION create_booking(_uid text, _cold_room_id uuid, _crop text, _crates integer, _days integer, _pay_mode text, _utr text DEFAULT NULL, _pay_method text DEFAULT NULL)
RETURNS bookings LANGUAGE plpgsql AS $$
DECLARE
  room cold_rooms;
  used integer;
  result bookings;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only farmers can book cold rooms'; END IF;
  IF _pay_mode IS NULL OR _pay_mode NOT IN ('upi', 'credit') THEN RAISE EXCEPTION 'invalid payment mode'; END IF;
  IF _crates IS NULL OR _crates < 1 OR _crates > 500 THEN RAISE EXCEPTION 'crates must be between 1 and 500'; END IF;
  IF _days IS NULL OR _days < 1 OR _days > 60 THEN RAISE EXCEPTION 'days must be between 1 and 60'; END IF;
  IF _crop IS NULL OR length(trim(_crop)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid crop'; END IF;

  -- Lock the room row so two farmers can't both grab the last slots.
  SELECT * INTO room FROM cold_rooms WHERE id = _cold_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cold room not found'; END IF;

  SELECT COALESCE(SUM(bk.crates), 0) INTO used
  FROM bookings bk
  WHERE bk.cold_room_id = room.id AND bk.created_at + make_interval(days => bk.days) > now();

  IF used + _crates > room.total_slots THEN
    RAISE EXCEPTION 'only % crate slots are free in this cold room', GREATEST(0, room.total_slots - used);
  END IF;

  INSERT INTO bookings (farmer_id, cold_room_id, pass_no, crop, crates, days, amount, pay_mode, paid, bay, utr, pay_method)
  VALUES (
    _uid, room.id, short_code('GP-'), trim(_crop), _crates, _days,
    _crates * _days * room.rate_per_crate_day,          -- price comes from the database, not the browser
    _pay_mode,
    _pay_mode = 'upi',                                   -- TEST MODE: trusts the simulated UPI step
    chr(65 + floor(random() * 3)::int) || '-' || lpad((1 + floor(random() * 30))::int::text, 2, '0'),
    CASE WHEN _pay_mode = 'upi' THEN left(_utr, 40) END,
    COALESCE(left(_pay_method, 40), CASE WHEN _pay_mode = 'credit' THEN 'FPO Credit' END)
  )
  RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION pay_booking_dues(_uid text, _booking_ids uuid[], _utr text, _pay_method text) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE total integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF _booking_ids IS NULL OR cardinality(_booking_ids) = 0 THEN RETURN 0; END IF;
  WITH settled AS (
    UPDATE bookings SET paid = true, utr = left(_utr, 40), pay_method = left(_pay_method, 40)   -- TEST MODE
    WHERE id = ANY(_booking_ids) AND farmer_id = _uid AND paid = false
    RETURNING amount
  )
  SELECT COALESCE(SUM(amount), 0) INTO total FROM settled;
  RETURN total;
END $$;

-- ---------- lots ----------
-- Totals are computed here, never trusted from the browser.
CREATE FUNCTION create_lot(_uid text, _crop text, _kg integer, _grade text, _price numeric, _cold integer, _transport integer)
RETURNS lots LANGUAGE plpgsql AS $$
DECLARE p profiles; g integer; result lots;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only farmers can list lots'; END IF;
  SELECT * INTO p FROM profiles WHERE id = _uid;
  IF _kg IS NULL OR _kg < 1 OR _kg > 100000 THEN RAISE EXCEPTION 'quantity must be between 1 and 100000 kg'; END IF;
  IF _price IS NULL OR _price <= 0 OR _price > 1000 THEN RAISE EXCEPTION 'price must be between ₹0 and ₹1000 per kg'; END IF;
  IF _grade NOT IN ('A', 'B', 'C') THEN RAISE EXCEPTION 'invalid grade'; END IF;
  IF _crop IS NULL OR length(trim(_crop)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid crop'; END IF;
  _cold := COALESCE(_cold, 0); _transport := COALESCE(_transport, 0);
  IF _cold < 0 OR _transport < 0 THEN RAISE EXCEPTION 'deductions cannot be negative'; END IF;
  g := round(_kg * _price)::integer;
  IF g - _cold - _transport < 0 THEN RAISE EXCEPTION 'deductions are larger than the sale value'; END IF;

  INSERT INTO lots (lot_code, farmer_id, farmer_name, farmer_district, crop, kg, grade, price_per_kg, gross, cold_deduction, transport_deduction, net_amount)
  VALUES (short_code('LOT-'), _uid, COALESCE(NULLIF(p.full_name, ''), 'Farmer'), p.district, trim(_crop), _kg, _grade, _price, g, _cold, _transport, g - _cold - _transport)
  RETURNING * INTO result;

  INSERT INTO lot_handover (lot_id, farmer_id, code) VALUES (result.id, _uid, six_digit_code());
  RETURN result;
END $$;

CREATE FUNCTION cancel_lot(_uid text, _lot_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE lots SET status = 'cancelled' WHERE id = _lot_id AND farmer_id = _uid AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'only your own open lots can be cancelled'; END IF;
END $$;

CREATE FUNCTION place_order(_uid text, _lot_id uuid) RETURNS lots LANGUAGE plpgsql AS $$
DECLARE bname text; result lots;
BEGIN
  IF NOT has_role(_uid, 'buyer') THEN RAISE EXCEPTION 'only buyers can order'; END IF;
  SELECT COALESCE(NULLIF(org_name, ''), full_name) INTO bname FROM profiles WHERE id = _uid;
  UPDATE lots SET status = 'escrow', buyer_id = _uid, buyer_name = bname, ordered_at = now()
  WHERE id = _lot_id AND status = 'open'
  RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'lot is no longer available'; END IF;
  RETURN result;
END $$;

-- Returns {"status":"ok","utr":"...","lot_id":...} | {"status":"wrong_code","attempts_left":n} | {"status":"locked"}.
-- Wrong codes return (rather than raise) so the attempt counter is actually saved.
CREATE FUNCTION confirm_delivery(_uid text, _lot_id uuid, _code text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE h lot_handover; ref text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  PERFORM 1 FROM lots WHERE id = _lot_id AND buyer_id = _uid AND status = 'escrow' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cannot confirm this lot'; END IF;

  SELECT * INTO h FROM lot_handover WHERE lot_id = _lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no handover code for this lot — ask the farmer to generate a new one'; END IF;
  IF h.attempts >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;

  IF h.code <> regexp_replace(COALESCE(_code, ''), '\s', '', 'g') THEN
    UPDATE lot_handover SET attempts = attempts + 1 WHERE lot_id = _lot_id;
    IF h.attempts + 1 >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;
    RETURN jsonb_build_object('status', 'wrong_code', 'attempts_left', 5 - (h.attempts + 1));
  END IF;

  ref := test_utr();   -- TEST MODE: real UTR will come from a payout provider later
  UPDATE lots SET status = 'settled', utr = ref, settled_at = now() WHERE id = _lot_id;
  DELETE FROM lot_handover WHERE lot_id = _lot_id;   -- code is single-use
  RETURN jsonb_build_object('status', 'ok', 'utr', ref, 'lot_id', _lot_id);
END $$;

CREATE FUNCTION regenerate_handover_code(_uid text, _lot_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE new_code text := six_digit_code();
BEGIN
  PERFORM 1 FROM lots WHERE id = _lot_id AND farmer_id = _uid AND status IN ('open', 'escrow');
  IF NOT FOUND THEN RAISE EXCEPTION 'cannot reset the code for this lot'; END IF;
  INSERT INTO lot_handover (lot_id, farmer_id, code, attempts) VALUES (_lot_id, _uid, new_code, 0)
  ON CONFLICT (lot_id) DO UPDATE SET code = EXCLUDED.code, attempts = 0;
  RETURN new_code;
END $$;
