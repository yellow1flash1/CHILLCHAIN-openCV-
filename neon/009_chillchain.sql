-- 009: ChillChain. Run once, after 008. Additive, plus new versions of a few functions.
-- Moves the app from staple crops to short-shelf-life, high-value produce:
--   * scans: ripeness stage, harvest time and a "sell by" deadline
--   * storage: pre-cooling rooms and ripening chambers next to cold rooms, booking by the hour
--   * trucks: shared (pooled) reefer loads and a delivery deadline
--   * selling: price that steps down as a lot ages, grade-based channels, buyer pre-orders before harvest

-- ---------- places where exotic and short-life produce is grown and sold ----------
INSERT INTO districts (name, state, lat, lng) VALUES
('Muzaffarpur','Bihar',26.1209,85.3647),('Kodagu','Karnataka',12.4244,75.7382),('Wayanad','Kerala',11.6854,76.1320),
('Ernakulam','Kerala',9.9816,76.2999),('Shopian','Jammu and Kashmir',33.7200,74.8300),('Srinagar','Jammu and Kashmir',34.0837,74.7973),
('Kutch','Gujarat',23.2420,69.6669),('Solapur','Maharashtra',17.6599,75.9064),('Mumbai','Maharashtra',19.0760,72.8777),
('Krishnagiri','Tamil Nadu',12.5186,78.2137),('Bengaluru Urban','Karnataka',12.9716,77.5946),('Hyderabad','Telangana',17.3850,78.4867),
('Shimla','Himachal Pradesh',31.1048,77.1734),('Lower Subansiri','Arunachal Pradesh',27.5900,93.8300),('Kolkata','West Bengal',22.5726,88.3639)
ON CONFLICT (name) DO NOTHING;

-- ---------- vehicles ----------
INSERT INTO vehicle_types (key, name, name_hi, capacity_kg, base_fare, per_km, sort) VALUES
  ('reefer_s', 'Reefer mini van (1 t)', 'रीफ़र मिनी वैन (1 टन)', 1000, 900, 24, 7)
ON CONFLICT (key) DO NOTHING;
UPDATE vehicle_types SET sort = 8 WHERE key = 'reefer';

-- ---------- storage: facility type and hourly rate ----------
ALTER TABLE cold_rooms
  ADD COLUMN facility text NOT NULL DEFAULT 'cold_room' CHECK (facility IN ('cold_room', 'precool', 'ripening')),
  ADD COLUMN rate_per_crate_hour integer CHECK (rate_per_crate_hour BETWEEN 1 AND 100);
UPDATE cold_rooms SET rate_per_crate_hour = GREATEST(1, ceil(rate_per_crate_day / 12.0))::int;

INSERT INTO cold_rooms (name, name_hi, address, district, state, pin, lat, lng, rate_per_crate_day, rate_per_crate_hour, total_slots, temp_c, humidity, badges, tags, facility, verified) VALUES
('Mahabaleshwar Berry Pre-cool Hub', 'महाबलेश्वर बेरी प्री-कूल हब', 'Panchgani Road', 'Satara', 'Maharashtra', '412806', 17.9237, 73.6586, 30, 3, 150, 2.0, 92, ARRAY['Pre-cooling','Solar'], ARRAY['precool','solar'], 'precool', true),
('Muzaffarpur Litchi Pack-house', 'मुज़फ़्फ़रपुर लीची पैक-हाउस', 'Mushahari Block', 'Muzaffarpur', 'Bihar', '842002', 26.1209, 85.3647, 25, 3, 400, 3.0, 92, ARRAY['Pre-cooling','Pack-house','Bulk'], ARRAY['precool','bulk'], 'precool', true),
('Kutch Kamalam Cold Hub', 'कच्छ कमलम कोल्ड हब', 'Bhuj-Mundra Road', 'Kutch', 'Gujarat', '370001', 23.2420, 69.6669, 18, 2, 300, 8.0, 88, ARRAY['Solar','24/7'], ARRAY['solar','247'], 'cold_room', true),
('Coorg Avocado Ripening Centre', 'कुर्ग एवोकाडो पकाई केंद्र', 'Madikeri-Kushalnagar Road', 'Kodagu', 'Karnataka', '571201', 12.4244, 75.7382, 35, 3, 120, 18.0, 90, ARRAY['Ethylene ripening','24/7'], ARRAY['ripening','247'], 'ripening', true),
('Hosur Flower Cold Chain', 'होसुर फ्लावर कोल्ड चेन', 'Bagalur Road', 'Krishnagiri', 'Tamil Nadu', '635109', 12.7409, 77.8253, 28, 3, 250, 4.0, 92, ARRAY['Flowers','24/7'], ARRAY['247'], 'cold_room', true),
('Bengaluru Quick-Commerce Cross-dock', 'बेंगलुरु क्विक-कॉमर्स क्रॉस-डॉक', 'Hoskote Industrial Area', 'Bengaluru Urban', 'Karnataka', '562114', 12.9716, 77.5946, 40, 4, 500, 4.0, 90, ARRAY['Cross-dock','24/7','Bulk'], ARRAY['precool','247','bulk'], 'precool', true),
('Nashik Grape Export Pack-house', 'नाशिक अंगूर निर्यात पैक-हाउस', 'Dindori Road', 'Nashik', 'Maharashtra', '422004', 20.0110, 73.7903, 22, 2, 600, 1.0, 92, ARRAY['Export pack-house','Pre-cooling','Bulk'], ARRAY['precool','bulk'], 'precool', true),
('Shopian Cherry Pre-cooler', 'शोपियां चेरी प्री-कूलर', 'Shopian-Pulwama Road', 'Shopian', 'Jammu and Kashmir', '192303', 33.7200, 74.8300, 32, 3, 150, 1.0, 92, ARRAY['Pre-cooling'], ARRAY['precool'], 'precool', true),
('Pune Mango & Banana Ripening Chamber', 'पुणे आम व केला पकाई कक्ष', 'Gultekdi Market Yard', 'Pune', 'Maharashtra', '411037', 18.4900, 73.8650, 30, 3, 200, 18.0, 92, ARRAY['Ethylene ripening','Loading Dock'], ARRAY['ripening'], 'ripening', true),
('Ziro Kiwi Cold Store', 'ज़ीरो कीवी कोल्ड स्टोर', 'Hapoli', 'Lower Subansiri', 'Arunachal Pradesh', '791120', 27.5900, 93.8300, 15, 2, 100, 1.0, 90, ARRAY['Community'], ARRAY[]::text[], 'cold_room', true);

-- ---------- bookings: by the day or by the hour ----------
ALTER TABLE bookings
  ADD COLUMN hours integer CHECK (hours BETWEEN 1 AND 72),   -- NULL = booked by the day
  ADD COLUMN ends_at timestamptz;
UPDATE bookings SET ends_at = created_at + make_interval(days => days);
ALTER TABLE bookings ALTER COLUMN ends_at SET NOT NULL;

CREATE OR REPLACE FUNCTION room_used_crates(_room uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(crates), 0)::int FROM bookings
  WHERE cold_room_id = _room AND released_at IS NULL AND ends_at > now()
$$;

DROP FUNCTION create_booking(text, uuid, text, integer, integer, text, text, text);
CREATE FUNCTION create_booking(_uid text, _cold_room_id uuid, _crop text, _crates integer, _days integer, _hours integer, _pay_mode text, _utr text DEFAULT NULL, _pay_method text DEFAULT NULL)
RETURNS bookings LANGUAGE plpgsql AS $$
DECLARE
  room cold_rooms;
  used integer;
  per_hour integer;
  result bookings;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only growers can book storage'; END IF;
  IF _pay_mode IS NULL OR _pay_mode NOT IN ('upi', 'credit') THEN RAISE EXCEPTION 'invalid payment mode'; END IF;
  IF _crates IS NULL OR _crates < 1 OR _crates > 500 THEN RAISE EXCEPTION 'crates must be between 1 and 500'; END IF;
  IF _hours IS NOT NULL AND (_hours < 1 OR _hours > 72) THEN RAISE EXCEPTION 'hours must be between 1 and 72'; END IF;
  IF _hours IS NULL AND (_days IS NULL OR _days < 1 OR _days > 60) THEN RAISE EXCEPTION 'days must be between 1 and 60'; END IF;
  IF _crop IS NULL OR length(trim(_crop)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid crop'; END IF;

  SELECT * INTO room FROM cold_rooms WHERE id = _cold_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'storage not found'; END IF;
  IF NOT room.accepting_bookings THEN RAISE EXCEPTION 'this storage is not accepting bookings right now'; END IF;

  used := room_used_crates(room.id);
  IF used + _crates > room.total_slots THEN
    RAISE EXCEPTION 'only % crate slots are free here', GREATEST(0, room.total_slots - used);
  END IF;
  per_hour := COALESCE(room.rate_per_crate_hour, GREATEST(1, ceil(room.rate_per_crate_day / 12.0))::int);

  INSERT INTO bookings (farmer_id, cold_room_id, pass_no, crop, crates, days, hours, ends_at, amount, pay_mode, paid, bay, utr, pay_method)
  VALUES (
    _uid, room.id, short_code('GP-'), trim(_crop), _crates,
    CASE WHEN _hours IS NULL THEN _days ELSE GREATEST(1, ceil(_hours / 24.0))::int END,
    _hours,
    now() + CASE WHEN _hours IS NULL THEN make_interval(days => _days) ELSE make_interval(hours => _hours) END,
    CASE WHEN _hours IS NULL THEN _crates * _days * room.rate_per_crate_day ELSE _crates * _hours * per_hour END,  -- price from the database
    _pay_mode,
    _pay_mode = 'upi',                                                                                         -- TEST MODE
    chr(65 + floor(random() * 3)::int) || '-' || lpad((1 + floor(random() * 30))::int::text, 2, '0'),
    CASE WHEN _pay_mode = 'upi' THEN left(_utr, 40) END,
    COALESCE(left(_pay_method, 40), CASE WHEN _pay_mode = 'credit' THEN 'FPO Credit' END)
  )
  RETURNING * INTO result;
  RETURN result;
END $$;

-- Owners can now say what kind of facility they run and set an hourly rate.
DROP FUNCTION owner_register_room(text, text, text, text, text, text, double precision, double precision, integer, integer, numeric, integer, text, text[], text[]);
CREATE FUNCTION owner_register_room(
  _uid text, _name text, _address text, _district text, _state text, _pin text,
  _lat double precision, _lng double precision, _rate integer, _slots integer, _temp numeric, _humidity integer,
  _phone text, _badges text[], _tags text[], _facility text, _rate_hour integer
) RETURNS cold_rooms LANGUAGE plpgsql AS $$
DECLARE d districts; r cold_rooms;
BEGIN
  IF NOT has_role(_uid, 'owner') THEN RAISE EXCEPTION 'only storage owners can register a facility'; END IF;
  IF EXISTS (SELECT 1 FROM cold_rooms WHERE owner_id = _uid) THEN RAISE EXCEPTION 'you have already registered a facility'; END IF;
  SELECT * INTO d FROM districts WHERE name = _district AND state = _state;
  IF NOT FOUND THEN RAISE EXCEPTION 'district not found'; END IF;
  IF _rate < 1 OR _rate > 500 THEN RAISE EXCEPTION 'rate must be between 1 and 500 per crate per day'; END IF;
  IF _rate_hour IS NOT NULL AND (_rate_hour < 1 OR _rate_hour > 100) THEN RAISE EXCEPTION 'hourly rate must be between 1 and 100 per crate'; END IF;
  IF _slots < 1 OR _slots > 5000 THEN RAISE EXCEPTION 'crate capacity must be between 1 and 5000'; END IF;
  IF _facility NOT IN ('cold_room', 'precool', 'ripening') THEN RAISE EXCEPTION 'invalid facility type'; END IF;
  INSERT INTO cold_rooms (name, address, district, state, pin, lat, lng, rate_per_crate_day, rate_per_crate_hour, total_slots, temp_c, humidity, phone, badges, tags, owner_id, facility)
  VALUES (trim(_name), trim(_address), _district, _state, _pin, COALESCE(_lat, d.lat), COALESCE(_lng, d.lng), _rate,
          COALESCE(_rate_hour, GREATEST(1, ceil(_rate / 12.0))::int), _slots, _temp, _humidity, _phone,
          COALESCE(_badges, '{}'), COALESCE(_tags, '{}'), _uid, _facility)
  RETURNING * INTO r;
  RETURN r;
END $$;

-- ---------- scans: ripeness and the sell-by clock ----------
ALTER TABLE scans
  ADD COLUMN ripeness smallint CHECK (ripeness BETWEEN 1 AND 5),   -- 1 unripe … 5 overripe
  ADD COLUMN harvested_at timestamptz,
  ADD COLUMN sell_by timestamptz,                                  -- deadline worked out from crop, grade, ripeness and cold chain
  ADD COLUMN cold_chain boolean NOT NULL DEFAULT false,
  ADD COLUMN route text CHECK (route IN ('retail', 'flash', 'processor', 'ripen'));

-- ---------- lots: price steps down as the lot ages ----------
ALTER TABLE lots
  ADD COLUMN base_price numeric,          -- the grower's asking price; price_per_kg is fixed when a buyer orders
  ADD COLUMN sell_by timestamptz,
  ADD COLUMN scan_id uuid REFERENCES scans(id),
  ADD COLUMN preorder_id uuid;
UPDATE lots SET base_price = price_per_kg;
ALTER TABLE lots ALTER COLUMN base_price SET NOT NULL;

-- Share of the asking price a lot fetches at time _at. Same steps as priceFactor() in src/lib/shelf.ts.
CREATE FUNCTION lot_price_factor(_created timestamptz, _sell_by timestamptz, _at timestamptz DEFAULT now())
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN _sell_by IS NULL THEN 1
    WHEN _at >= _sell_by THEN 0.5
    ELSE (SELECT CASE WHEN f >= 0.5 THEN 1 WHEN f >= 0.25 THEN 0.9 WHEN f >= 0.1 THEN 0.75 ELSE 0.6 END
          FROM (SELECT extract(epoch FROM _sell_by - _at) / GREATEST(1, extract(epoch FROM _sell_by - _created)) AS f) x)
  END
$$;

DROP FUNCTION create_lot(text, text, integer, text, numeric, integer, integer);
CREATE FUNCTION create_lot(_uid text, _crop text, _kg integer, _grade text, _price numeric, _cold integer, _transport integer, _scan_id uuid DEFAULT NULL, _sell_by timestamptz DEFAULT NULL)
RETURNS lots LANGUAGE plpgsql AS $$
DECLARE p profiles; g integer; sb timestamptz := _sell_by; result lots;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only growers can list lots'; END IF;
  SELECT * INTO p FROM profiles WHERE id = _uid;
  IF _kg IS NULL OR _kg < 1 OR _kg > 100000 THEN RAISE EXCEPTION 'quantity must be between 1 and 100000 kg'; END IF;
  IF _price IS NULL OR _price <= 0 OR _price > 5000 THEN RAISE EXCEPTION 'price must be between ₹0 and ₹5000 per kg'; END IF;
  IF _grade NOT IN ('A', 'B', 'C') THEN RAISE EXCEPTION 'invalid grade'; END IF;
  IF _crop IS NULL OR length(trim(_crop)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid crop'; END IF;
  -- A lot listed from a scan takes the scan's sell-by time, not one sent by the browser.
  IF _scan_id IS NOT NULL THEN
    SELECT s.sell_by INTO sb FROM scans s WHERE s.id = _scan_id AND s.farmer_id = _uid;
    IF NOT FOUND THEN RAISE EXCEPTION 'that scan is not yours'; END IF;
  END IF;
  IF sb IS NOT NULL AND (sb < now() OR sb > now() + interval '180 days') THEN RAISE EXCEPTION 'sell-by time must be in the future'; END IF;
  _cold := COALESCE(_cold, 0); _transport := COALESCE(_transport, 0);
  IF _cold < 0 OR _transport < 0 THEN RAISE EXCEPTION 'deductions cannot be negative'; END IF;
  g := round(_kg * _price)::integer;
  IF g - _cold - _transport < 0 THEN RAISE EXCEPTION 'deductions are larger than the sale value'; END IF;

  INSERT INTO lots (lot_code, farmer_id, farmer_name, farmer_district, crop, kg, grade, price_per_kg, base_price, gross, cold_deduction, transport_deduction, net_amount, sell_by, scan_id)
  VALUES (short_code('LOT-'), _uid, COALESCE(NULLIF(p.full_name, ''), 'Grower'), p.district, trim(_crop), _kg, _grade, _price, _price, g, _cold, _transport, g - _cold - _transport, sb, _scan_id)
  RETURNING * INTO result;

  INSERT INTO lot_handover (lot_id, farmer_id, code) VALUES (result.id, _uid, six_digit_code());
  RETURN result;
END $$;

-- The price is fixed at the moment of ordering, using the sell-by clock. Lots more than a day past
-- sell-by can no longer be ordered.
CREATE OR REPLACE FUNCTION place_order(_uid text, _lot_id uuid) RETURNS lots LANGUAGE plpgsql AS $$
DECLARE bname text; l lots; price numeric; g integer; result lots;
BEGIN
  IF NOT has_role(_uid, 'buyer') THEN RAISE EXCEPTION 'only buyers can order'; END IF;
  SELECT COALESCE(NULLIF(org_name, ''), full_name) INTO bname FROM profiles WHERE id = _uid;
  SELECT * INTO l FROM lots WHERE id = _lot_id AND status = 'open' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'lot is no longer available'; END IF;
  IF l.sell_by IS NOT NULL AND l.sell_by + interval '1 day' < now() THEN RAISE EXCEPTION 'this lot is past its sell-by time'; END IF;
  price := round(l.base_price * lot_price_factor(l.created_at, l.sell_by), 2);
  g := round(l.kg * price)::integer;
  UPDATE lots SET status = 'escrow', buyer_id = _uid, buyer_name = bname, ordered_at = now(),
         price_per_kg = price, gross = g, net_amount = GREATEST(0, g - cold_deduction - transport_deduction)
  WHERE id = _lot_id
  RETURNING * INTO result;
  RETURN result;
END $$;

-- ---------- pre-orders: buyers post demand before harvest ----------
ALTER TABLE profiles
  ADD COLUMN buyer_type text CHECK (buyer_type IN ('quick_commerce', 'retail', 'horeca', 'exporter', 'processor', 'florist', 'other'));

CREATE TABLE preorders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  buyer_id text NOT NULL,
  buyer_name text NOT NULL,
  buyer_type text,
  crop text NOT NULL,
  min_grade text NOT NULL DEFAULT 'A' CHECK (min_grade IN ('A', 'B', 'C')),
  kg integer NOT NULL CHECK (kg BETWEEN 1 AND 100000),
  price_per_kg numeric NOT NULL CHECK (price_per_kg > 0 AND price_per_kg <= 5000),
  need_by date NOT NULL,
  deliver_district text REFERENCES districts(name),
  notes text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'cancelled')),
  farmer_id text,
  lot_id uuid REFERENCES lots(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  matched_at timestamptz
);
CREATE INDEX preorders_open_idx ON preorders (status, need_by);
CREATE INDEX preorders_buyer_idx ON preorders (buyer_id, created_at DESC);
ALTER TABLE lots ADD CONSTRAINT lots_preorder_fk FOREIGN KEY (preorder_id) REFERENCES preorders(id);

CREATE FUNCTION create_preorder(_uid text, _crop text, _grade text, _kg integer, _price numeric, _need_by date, _district text, _notes text)
RETURNS preorders LANGUAGE plpgsql AS $$
DECLARE p profiles; result preorders; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT has_role(_uid, 'buyer') THEN RAISE EXCEPTION 'only buyers can post pre-orders'; END IF;
  SELECT * INTO p FROM profiles WHERE id = _uid;
  IF _crop IS NULL OR length(trim(_crop)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid crop'; END IF;
  IF _grade NOT IN ('A', 'B', 'C') THEN RAISE EXCEPTION 'invalid grade'; END IF;
  IF _kg IS NULL OR _kg < 1 OR _kg > 100000 THEN RAISE EXCEPTION 'quantity must be between 1 and 100000 kg'; END IF;
  IF _price IS NULL OR _price <= 0 OR _price > 5000 THEN RAISE EXCEPTION 'price must be between ₹0 and ₹5000 per kg'; END IF;
  IF _need_by IS NULL OR _need_by < today OR _need_by > today + 120 THEN RAISE EXCEPTION 'pick a date within the next 120 days'; END IF;
  IF _district IS NOT NULL AND NOT EXISTS (SELECT 1 FROM districts WHERE name = _district) THEN RAISE EXCEPTION 'district not found'; END IF;
  IF (SELECT count(*) FROM preorders WHERE buyer_id = _uid AND status = 'open') >= 30 THEN RAISE EXCEPTION 'you already have 30 open pre-orders'; END IF;
  INSERT INTO preorders (code, buyer_id, buyer_name, buyer_type, crop, min_grade, kg, price_per_kg, need_by, deliver_district, notes)
  VALUES (short_code('PO-', 6), _uid, COALESCE(NULLIF(p.org_name, ''), NULLIF(p.full_name, ''), 'Buyer'), p.buyer_type, trim(_crop), _grade, _kg, _price, _need_by, _district, left(_notes, 200))
  RETURNING * INTO result;
  RETURN result;
END $$;

CREATE FUNCTION cancel_preorder(_uid text, _id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE preorders SET status = 'cancelled' WHERE id = _id AND buyer_id = _uid AND status = 'open';
  IF NOT FOUND THEN RAISE EXCEPTION 'only your own open pre-orders can be cancelled'; END IF;
END $$;

-- A grower takes a pre-order: a lot is created at the agreed price and goes straight into the buyer's
-- escrow. The usual 6-digit handover code settles it on delivery.
CREATE FUNCTION accept_preorder(_uid text, _id uuid) RETURNS lots LANGUAGE plpgsql AS $$
DECLARE po preorders; p profiles; g integer; result lots; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only growers can take pre-orders'; END IF;
  SELECT * INTO po FROM preorders WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR po.status <> 'open' THEN RAISE EXCEPTION 'this pre-order was already taken or cancelled'; END IF;
  IF po.need_by < today THEN RAISE EXCEPTION 'this pre-order has expired'; END IF;
  IF po.buyer_id = _uid THEN RAISE EXCEPTION 'you cannot take your own pre-order'; END IF;
  SELECT * INTO p FROM profiles WHERE id = _uid;
  g := round(po.kg * po.price_per_kg)::integer;
  INSERT INTO lots (lot_code, farmer_id, farmer_name, farmer_district, crop, kg, grade, price_per_kg, base_price, gross, net_amount,
                    status, buyer_id, buyer_name, ordered_at, preorder_id)
  VALUES (short_code('LOT-'), _uid, COALESCE(NULLIF(p.full_name, ''), 'Grower'), p.district, po.crop, po.kg, po.min_grade, po.price_per_kg, po.price_per_kg, g, g,
          'escrow', po.buyer_id, po.buyer_name, now(), po.id)
  RETURNING * INTO result;
  INSERT INTO lot_handover (lot_id, farmer_id, code) VALUES (result.id, _uid, six_digit_code());
  UPDATE preorders SET status = 'matched', farmer_id = _uid, lot_id = result.id, matched_at = now() WHERE id = po.id;
  RETURN result;
END $$;

-- ---------- trucks: shared reefer loads and a delivery deadline ----------
ALTER TABLE transport_bookings
  ADD COLUMN shared boolean NOT NULL DEFAULT false,   -- grower pays only for their share of a pooled truck
  ADD COLUMN pool_code text,                          -- bookings with the same code ride in one truck
  ADD COLUMN deliver_by timestamptz;                  -- produce must arrive before this
CREATE INDEX transport_pool_idx ON transport_bookings (pool_code) WHERE pool_code IS NOT NULL;

DROP FUNCTION transport_quote(text, uuid, text, text, integer, boolean);
CREATE FUNCTION transport_quote(_from text, _to_room uuid, _to_district text, _vehicle text, _kg integer, _reefer boolean, _shared boolean DEFAULT false)
RETURNS TABLE (distance_km integer, amount integer, to_label text) LANGUAGE plpgsql STABLE AS $$
DECLARE
  f districts; v vehicle_types;
  tlat double precision; tlng double precision; tname text; dist integer; full_fare numeric;
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
  full_fare := (v.base_fare + v.per_km * dist) * CASE WHEN _reefer THEN 1.35 ELSE 1 END;
  -- Shared load: pay for your share of the truck's capacity, plus 15% for the extra stops (minimum ₹150).
  RETURN QUERY SELECT dist,
    CASE WHEN COALESCE(_shared, false) THEN GREATEST(150, round(full_fare * _kg / v.capacity_kg * 1.15)) ELSE round(full_fare) END::int,
    tname;
END $$;

DROP FUNCTION create_transport(text, uuid, text, uuid, text, text, integer, text, boolean, date, text);
CREATE FUNCTION create_transport(
  _uid text, _lot_id uuid, _from text, _to_room uuid, _to_district text, _vehicle text,
  _kg integer, _crop text, _reefer boolean, _date date, _notes text, _shared boolean, _deliver_by timestamptz
) RETURNS transport_bookings LANGUAGE plpgsql AS $$
DECLARE
  qt record; tr transporters; result transport_bookings;
  pool text; cap integer;
  today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only growers can book transport'; END IF;
  IF _date IS NULL OR _date < today OR _date > today + 30 THEN RAISE EXCEPTION 'pick a pickup date within the next 30 days'; END IF;
  IF _deliver_by IS NOT NULL AND (_deliver_by < now() OR (_deliver_by AT TIME ZONE 'Asia/Kolkata')::date < _date OR (_deliver_by AT TIME ZONE 'Asia/Kolkata')::date > _date + 7) THEN
    RAISE EXCEPTION 'the delivery deadline must be after pickup and within 7 days of it';
  END IF;
  IF _crop IS NULL OR length(trim(_crop)) NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION 'invalid crop'; END IF;
  IF (SELECT count(*) FROM transport_bookings WHERE farmer_id = _uid AND status IN ('requested','assigned','in_transit')) >= 10 THEN
    RAISE EXCEPTION 'you already have 10 active transport bookings';
  END IF;
  IF _lot_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM lots WHERE id = _lot_id AND farmer_id = _uid) THEN
    RAISE EXCEPTION 'that lot is not yours';
  END IF;

  SELECT * INTO qt FROM transport_quote(_from, _to_room, _to_district, _vehicle, _kg, COALESCE(_reefer, false), COALESCE(_shared, false));

  IF COALESCE(_shared, false) THEN
    -- Join a pool going the same way on the same day that still has room; otherwise start a new one.
    SELECT capacity_kg INTO cap FROM vehicle_types WHERE key = _vehicle;
    SELECT b.pool_code INTO pool FROM transport_bookings b
    WHERE b.shared AND b.status IN ('requested', 'assigned') AND b.from_district = _from
      AND b.to_room_id IS NOT DISTINCT FROM _to_room AND b.to_district IS NOT DISTINCT FROM _to_district
      AND b.vehicle_key = _vehicle AND b.reefer = COALESCE(_reefer, false) AND b.pickup_date = _date
    GROUP BY b.pool_code
    HAVING SUM(b.kg) + _kg <= cap
    ORDER BY SUM(b.kg) DESC
    LIMIT 1;
    IF pool IS NOT NULL THEN
      SELECT t.* INTO tr FROM transporters t
      WHERE t.id = (SELECT b.transporter_id FROM transport_bookings b WHERE b.pool_code = pool AND b.transporter_id IS NOT NULL LIMIT 1);
    ELSE
      pool := short_code('POOL-', 6);
    END IF;
  ELSE
    -- Give the trip to a free driver with this vehicle (same district first). A driver already booked that day is skipped.
    SELECT * INTO tr FROM transporters t
    WHERE t.active AND t.vehicle_key = _vehicle
      AND NOT EXISTS (SELECT 1 FROM transport_bookings b WHERE b.transporter_id = t.id AND b.pickup_date = _date AND b.status IN ('assigned','in_transit'))
    ORDER BY (t.base_district = _from) DESC NULLS LAST, random()
    LIMIT 1
    FOR UPDATE OF t SKIP LOCKED;
  END IF;

  INSERT INTO transport_bookings (trip_code, farmer_id, lot_id, from_district, to_label, to_room_id, to_district, distance_km, vehicle_key, kg, crop, reefer, pickup_date, amount, status,
                                  transporter_id, driver_name, driver_phone, vehicle_no, notes, shared, pool_code, deliver_by, accepted_at)
  VALUES (short_code('TR-'), _uid, _lot_id, _from, qt.to_label, _to_room, _to_district, qt.distance_km, _vehicle, _kg, trim(_crop), COALESCE(_reefer, false), _date, qt.amount,
          CASE WHEN tr.id IS NULL THEN 'requested' ELSE 'assigned' END, tr.id, tr.name, tr.phone, tr.vehicle_no, left(_notes, 200),
          COALESCE(_shared, false), pool, _deliver_by, CASE WHEN tr.id IS NULL THEN NULL ELSE now() END)
  RETURNING * INTO result;
  RETURN result;
END $$;

DROP FUNCTION transporter_nearby(text, integer);
CREATE FUNCTION transporter_nearby(_uid text, _radius integer DEFAULT NULL)
RETURNS TABLE (id uuid, trip_code text, from_district text, to_label text, distance_km integer, pickup_km integer,
               vehicle_key text, kg integer, crop text, reefer boolean, pickup_date text, amount integer, notes text, created_at timestamptz,
               shared boolean, pool_code text, deliver_by timestamptz)
LANGUAGE sql STABLE AS $$
  SELECT b.id, b.trip_code, b.from_district, b.to_label, b.distance_km,
         road_km(home.lat, home.lng, f.lat, f.lng) AS pickup_km,
         b.vehicle_key, b.kg, b.crop, b.reefer, b.pickup_date::text, b.amount, b.notes, b.created_at,
         b.shared, b.pool_code, b.deliver_by
  FROM transporters t
  JOIN districts home ON home.name = t.base_district
  JOIN transport_bookings b ON b.status = 'requested' AND b.pickup_date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
  JOIN districts f ON f.name = b.from_district
  WHERE t.user_id = _uid
    AND t.available
    AND b.kg <= t.capacity_kg
    AND (NOT b.reefer OR t.has_reefer)
    AND road_km(home.lat, home.lng, f.lat, f.lng) <= COALESCE(_radius, t.radius_km)
  ORDER BY b.deliver_by NULLS LAST, b.pickup_date, pickup_km
  LIMIT 50
$$;

-- Accepting one booking of a shared load takes the whole pool (if it fits the truck).
CREATE OR REPLACE FUNCTION transporter_accept(_uid text, _id uuid) RETURNS transport_bookings LANGUAGE plpgsql AS $$
DECLARE t transporters; result transport_bookings; pc text; total integer;
BEGIN
  SELECT * INTO t FROM transporters WHERE user_id = _uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'register your vehicle first'; END IF;
  IF t.docs_submitted_at IS NULL THEN RAISE EXCEPTION 'complete document verification before accepting a trip'; END IF;
  IF (SELECT count(DISTINCT COALESCE(pool_code, id::text)) FROM transport_bookings WHERE transporter_id = t.id AND status IN ('assigned','in_transit')) >= 5 THEN
    RAISE EXCEPTION 'finish your current trips before accepting more (limit 5)';
  END IF;
  SELECT pool_code INTO pc FROM transport_bookings WHERE id = _id AND status = 'requested';
  IF pc IS NOT NULL THEN
    SELECT COALESCE(SUM(kg), 0) INTO total FROM transport_bookings WHERE pool_code = pc AND status IN ('requested', 'assigned');
    IF total > t.capacity_kg THEN RAISE EXCEPTION 'this shared load (% kg) is more than your vehicle can carry', total; END IF;
    UPDATE transport_bookings b SET status = 'assigned', transporter_id = t.id, driver_name = t.name, driver_phone = t.phone,
           vehicle_no = t.vehicle_no, accepted_at = now()
    WHERE b.pool_code = pc AND b.status = 'requested' AND (NOT b.reefer OR t.has_reefer);
    SELECT * INTO result FROM transport_bookings WHERE id = _id AND transporter_id = t.id;
  ELSE
    UPDATE transport_bookings b SET status = 'assigned', transporter_id = t.id, driver_name = t.name, driver_phone = t.phone,
           vehicle_no = t.vehicle_no, accepted_at = now()
    WHERE b.id = _id AND b.status = 'requested' AND b.kg <= t.capacity_kg AND (NOT b.reefer OR t.has_reefer)
    RETURNING b.* INTO result;
  END IF;
  IF result.id IS NULL THEN RAISE EXCEPTION 'this trip was already taken or does not fit your vehicle'; END IF;
  RETURN result;
END $$;
