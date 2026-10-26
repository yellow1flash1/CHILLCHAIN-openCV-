-- 011: Razorpay (test mode) for buyer orders, storage bookings and storage dues.
-- One row per Razorpay order. The server quotes the amount from the helpers below, Razorpay collects it,
-- and the row is claimed exactly once when the signed payment comes back. Partial rejections at delivery
-- are refunded against the same payment.

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('lot', 'booking', 'dues')),
  details jsonb NOT NULL,                       -- what it pays for: lot id, booking request, or booking ids
  amount integer NOT NULL CHECK (amount > 0),   -- rupees
  rzp_order_id text NOT NULL UNIQUE,
  rzp_payment_id text UNIQUE,
  method text,
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'paid', 'refunded', 'partly_refunded')),
  refunded integer NOT NULL DEFAULT 0 CHECK (refunded >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX payments_user_idx ON payments (user_id, created_at DESC);

ALTER TABLE lots ADD COLUMN payment_id uuid REFERENCES payments(id);
ALTER TABLE bookings ADD COLUMN payment_id uuid REFERENCES payments(id);

-- What place_order will charge for a lot right now (same rounding as place_order).
CREATE FUNCTION lot_order_amount(_lot_id uuid) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT round(kg * round(base_price * lot_price_factor(created_at, sell_by), 2))::integer
  FROM lots
  WHERE id = _lot_id AND status = 'open'
    AND (sell_by IS NULL OR sell_by + interval '1 day' >= now())
$$;

-- What create_booking will charge (same formula as create_booking in 009), or NULL if it would refuse
-- for lack of space.
CREATE FUNCTION booking_amount(_cold_room_id uuid, _crates integer, _days integer, _hours integer)
RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN _hours IS NULL THEN _crates * _days * rate_per_crate_day
              ELSE _crates * _hours * COALESCE(rate_per_crate_hour, GREATEST(1, ceil(rate_per_crate_day / 12.0))::int)
         END
  FROM cold_rooms
  WHERE id = _cold_room_id AND accepting_bookings
    AND room_used_crates(id) + _crates <= total_slots
$$;

-- Unpaid storage dues the caller owes on the given bookings.
CREATE FUNCTION dues_amount(_uid text, _ids uuid[]) RETURNS integer LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(amount), 0)::integer
  FROM bookings WHERE id = ANY(_ids) AND farmer_id = _uid AND paid = false
$$;
