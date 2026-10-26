-- 003b: cold room owner role. Run after 003a, once.

ALTER TABLE cold_rooms
  ADD COLUMN owner_id text,
  ADD COLUMN verified boolean NOT NULL DEFAULT false,            -- you (the admin) flip this after checking the room is real
  ADD COLUMN accepting_bookings boolean NOT NULL DEFAULT true,   -- owner can pause bookings (power cut, maintenance)
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
UPDATE cold_rooms SET verified = true;                            -- the 6 demo rooms that already exist
CREATE UNIQUE INDEX cold_rooms_owner_key ON cold_rooms (owner_id) WHERE owner_id IS NOT NULL;

ALTER TABLE bookings
  ADD COLUMN checked_in_at timestamptz,   -- farmer arrived with the gate pass
  ADD COLUMN released_at timestamptz;     -- goods collected: frees the crates immediately
CREATE INDEX bookings_room_idx ON bookings (cold_room_id, created_at DESC);

-- Crates currently occupying a room (not released, term not over).
CREATE FUNCTION room_used_crates(_room uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(crates), 0)::int FROM bookings
  WHERE cold_room_id = _room AND released_at IS NULL AND created_at + make_interval(days => days) > now()
$$;

-- A paused room reports 0 free so farmers cannot book it.
CREATE OR REPLACE FUNCTION cold_room_free_slots() RETURNS TABLE (cold_room_id uuid, free integer) LANGUAGE sql STABLE AS $$
  SELECT c.id, CASE WHEN c.accepting_bookings THEN GREATEST(0, c.total_slots - room_used_crates(c.id)) ELSE 0 END
  FROM cold_rooms c
$$;

-- Same as before, but respects "paused" and released bookings.
CREATE OR REPLACE FUNCTION create_booking(_uid text, _cold_room_id uuid, _crop text, _crates integer, _days integer, _pay_mode text, _utr text DEFAULT NULL, _pay_method text DEFAULT NULL)
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

  SELECT * INTO room FROM cold_rooms WHERE id = _cold_room_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cold room not found'; END IF;
  IF NOT room.accepting_bookings THEN RAISE EXCEPTION 'this cold room is not accepting bookings right now'; END IF;

  used := room_used_crates(room.id);
  IF used + _crates > room.total_slots THEN
    RAISE EXCEPTION 'only % crate slots are free in this cold room', GREATEST(0, room.total_slots - used);
  END IF;

  INSERT INTO bookings (farmer_id, cold_room_id, pass_no, crop, crates, days, amount, pay_mode, paid, bay, utr, pay_method)
  VALUES (
    _uid, room.id, short_code('GP-'), trim(_crop), _crates, _days,
    _crates * _days * room.rate_per_crate_day,
    _pay_mode,
    _pay_mode = 'upi',
    chr(65 + floor(random() * 3)::int) || '-' || lpad((1 + floor(random() * 30))::int::text, 2, '0'),
    CASE WHEN _pay_mode = 'upi' THEN left(_utr, 40) END,
    COALESCE(left(_pay_method, 40), CASE WHEN _pay_mode = 'credit' THEN 'FPO Credit' END)
  )
  RETURNING * INTO result;
  RETURN result;
END $$;

-- ---------- owner actions (every one checks that the caller owns the room) ----------
CREATE FUNCTION owner_register_room(
  _uid text, _name text, _address text, _district text, _state text, _pin text,
  _lat double precision, _lng double precision, _rate integer, _slots integer, _temp numeric, _humidity integer,
  _phone text, _badges text[], _tags text[]
) RETURNS cold_rooms LANGUAGE plpgsql AS $$
DECLARE d districts; r cold_rooms;
BEGIN
  IF NOT has_role(_uid, 'owner') THEN RAISE EXCEPTION 'only cold room owners can register a room'; END IF;
  IF EXISTS (SELECT 1 FROM cold_rooms WHERE owner_id = _uid) THEN RAISE EXCEPTION 'you have already registered a cold room'; END IF;
  SELECT * INTO d FROM districts WHERE name = _district AND state = _state;
  IF NOT FOUND THEN RAISE EXCEPTION 'district not found'; END IF;
  IF _rate < 1 OR _rate > 500 THEN RAISE EXCEPTION 'rate must be between 1 and 500 per crate per day'; END IF;
  IF _slots < 1 OR _slots > 5000 THEN RAISE EXCEPTION 'crate capacity must be between 1 and 5000'; END IF;
  INSERT INTO cold_rooms (name, address, district, state, pin, lat, lng, rate_per_crate_day, total_slots, temp_c, humidity, phone, badges, tags, owner_id)
  VALUES (trim(_name), trim(_address), _district, _state, _pin, COALESCE(_lat, d.lat), COALESCE(_lng, d.lng), _rate, _slots, _temp, _humidity, _phone, COALESCE(_badges, '{}'), COALESCE(_tags, '{}'), _uid)
  RETURNING * INTO r;
  RETURN r;
END $$;

CREATE FUNCTION owner_update_room(_uid text, _rate integer, _slots integer, _temp numeric, _humidity integer, _phone text, _accepting boolean)
RETURNS cold_rooms LANGUAGE plpgsql AS $$
DECLARE r cold_rooms; used integer;
BEGIN
  SELECT * INTO r FROM cold_rooms WHERE owner_id = _uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'you do not own a cold room'; END IF;
  IF _rate < 1 OR _rate > 500 THEN RAISE EXCEPTION 'rate must be between 1 and 500 per crate per day'; END IF;
  IF _slots < 1 OR _slots > 5000 THEN RAISE EXCEPTION 'crate capacity must be between 1 and 5000'; END IF;
  used := room_used_crates(r.id);
  IF _slots < used THEN RAISE EXCEPTION 'capacity cannot be below the % crates stored right now', used; END IF;
  UPDATE cold_rooms SET rate_per_crate_day = _rate, total_slots = _slots, temp_c = _temp, humidity = _humidity, phone = _phone, accepting_bookings = _accepting, updated_at = now()
  WHERE id = r.id RETURNING * INTO r;
  RETURN r;
END $$;

CREATE FUNCTION owner_check_in(_uid text, _pass_no text) RETURNS bookings LANGUAGE plpgsql AS $$
DECLARE result bookings;
BEGIN
  UPDATE bookings b SET checked_in_at = COALESCE(b.checked_in_at, now())
  FROM cold_rooms c
  WHERE c.id = b.cold_room_id AND c.owner_id = _uid AND b.pass_no = upper(trim(_pass_no)) AND b.released_at IS NULL
  RETURNING b.* INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'no active booking with that pass number in your cold room'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION owner_release(_uid text, _booking_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bookings b SET released_at = now()
  FROM cold_rooms c
  WHERE c.id = b.cold_room_id AND c.owner_id = _uid AND b.id = _booking_id AND b.released_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'cannot release this booking'; END IF;
END $$;

CREATE FUNCTION owner_mark_paid(_uid text, _booking_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE bookings b SET paid = true, pay_method = COALESCE(b.pay_method, 'Cash at gate')
  FROM cold_rooms c
  WHERE c.id = b.cold_room_id AND c.owner_id = _uid AND b.id = _booking_id AND b.paid = false;
  IF NOT FOUND THEN RAISE EXCEPTION 'cannot mark this booking as paid'; END IF;
END $$;
