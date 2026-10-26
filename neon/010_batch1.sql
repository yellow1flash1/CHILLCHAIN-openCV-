-- 010: real grading record, weather-adjusted clock, partial pre-orders, partial delivery acceptance.
-- Run once, after 009. Replaced functions keep their old arguments first and give the new ones
-- defaults, so the deployed app keeps working between running this file and deploying the new code.

-- ---------- scans: how the grade was made, and the temperature the clock used ----------
ALTER TABLE scans
  ADD COLUMN grade_source text NOT NULL DEFAULT 'simulated'
    CHECK (grade_source IN ('model', 'ai_vision', 'self', 'simulated')),  -- on-phone model, Gemini Vision, grower's own call
  ADD COLUMN ai_grade text CHECK (ai_grade IN ('A', 'B', 'C')),            -- the AI's grade, kept if the grower corrects it
  ADD COLUMN ai_notes text,                                               -- defects and reason the AI gave
  ADD COLUMN ambient_c numeric(4, 1);                                     -- air temperature used for an open-air clock

-- ---------- pre-orders: several growers can each take part of one ----------
ALTER TABLE preorders ADD COLUMN kg_remaining integer;
UPDATE preorders SET kg_remaining = CASE WHEN status = 'open' THEN kg ELSE 0 END;
ALTER TABLE preorders ALTER COLUMN kg_remaining SET NOT NULL;
ALTER TABLE preorders ADD CONSTRAINT preorders_kg_remaining_check CHECK (kg_remaining BETWEEN 0 AND kg);

CREATE OR REPLACE FUNCTION create_preorder(_uid text, _crop text, _grade text, _kg integer, _price numeric, _need_by date, _district text, _notes text)
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
  INSERT INTO preorders (code, buyer_id, buyer_name, buyer_type, crop, min_grade, kg, kg_remaining, price_per_kg, need_by, deliver_district, notes)
  VALUES (short_code('PO-', 6), _uid, COALESCE(NULLIF(p.org_name, ''), NULLIF(p.full_name, ''), 'Buyer'), p.buyer_type, trim(_crop), _grade, _kg, _kg, _price, _need_by, _district, left(_notes, 200))
  RETURNING * INTO result;
  RETURN result;
END $$;

-- A grower takes all or part of a pre-order (_kg NULL = everything still open). The share becomes a lot
-- in the buyer's escrow at the agreed price; the rest stays open for other growers. One share per grower.
DROP FUNCTION accept_preorder(text, uuid);
CREATE FUNCTION accept_preorder(_uid text, _id uuid, _kg integer DEFAULT NULL) RETURNS lots LANGUAGE plpgsql AS $$
DECLARE po preorders; p profiles; take integer; g integer; result lots; today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF NOT has_role(_uid, 'farmer') THEN RAISE EXCEPTION 'only growers can take pre-orders'; END IF;
  SELECT * INTO po FROM preorders WHERE id = _id FOR UPDATE;
  IF NOT FOUND OR po.status <> 'open' OR po.kg_remaining < 1 THEN RAISE EXCEPTION 'this pre-order was already taken or cancelled'; END IF;
  IF po.need_by < today THEN RAISE EXCEPTION 'this pre-order has expired'; END IF;
  IF po.buyer_id = _uid THEN RAISE EXCEPTION 'you cannot take your own pre-order'; END IF;
  IF EXISTS (SELECT 1 FROM lots WHERE preorder_id = po.id AND farmer_id = _uid AND status <> 'cancelled') THEN
    RAISE EXCEPTION 'you already took part of this pre-order';
  END IF;
  take := COALESCE(_kg, po.kg_remaining);
  IF take < 1 OR take > po.kg_remaining THEN RAISE EXCEPTION 'you can take between 1 and % kg of this pre-order', po.kg_remaining; END IF;
  SELECT * INTO p FROM profiles WHERE id = _uid;
  g := round(take * po.price_per_kg)::integer;
  INSERT INTO lots (lot_code, farmer_id, farmer_name, farmer_district, crop, kg, grade, price_per_kg, base_price, gross, net_amount,
                    status, buyer_id, buyer_name, ordered_at, preorder_id)
  VALUES (short_code('LOT-'), _uid, COALESCE(NULLIF(p.full_name, ''), 'Grower'), p.district, po.crop, take, po.min_grade, po.price_per_kg, po.price_per_kg, g, g,
          'escrow', po.buyer_id, po.buyer_name, now(), po.id)
  RETURNING * INTO result;
  INSERT INTO lot_handover (lot_id, farmer_id, code) VALUES (result.id, _uid, six_digit_code());
  UPDATE preorders SET
    kg_remaining = kg_remaining - take,
    status = CASE WHEN kg_remaining - take = 0 THEN 'matched' ELSE 'open' END,
    matched_at = CASE WHEN kg_remaining - take = 0 THEN now() ELSE matched_at END,
    farmer_id = COALESCE(farmer_id, _uid),        -- first grower, kept for older screens
    lot_id = COALESCE(lot_id, result.id)
  WHERE id = po.id;
  RETURN result;
END $$;

-- ---------- lots: the buyer may accept part of a delivery ----------
ALTER TABLE lots
  ADD COLUMN accepted_kg integer,
  ADD COLUMN rejected_kg integer NOT NULL DEFAULT 0,
  ADD COLUMN reject_reason text;
ALTER TABLE lots DROP CONSTRAINT lots_status_check;
ALTER TABLE lots ADD CONSTRAINT lots_status_check CHECK (status IN ('open', 'escrow', 'settled', 'cancelled', 'rejected'));

-- Same code check as before. _accepted_kg NULL = the whole lot. Payment is released only for the accepted
-- weight; the rest goes back to the buyer (test mode) and the reason is kept for the grower and ratings.
-- Returns {"status":"ok", ...} | {"status":"wrong_code","attempts_left":n} | {"status":"locked"}.
DROP FUNCTION confirm_delivery(text, uuid, text);
CREATE FUNCTION confirm_delivery(_uid text, _lot_id uuid, _code text, _accepted_kg integer DEFAULT NULL, _reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE l lots; h lot_handover; ref text; acc integer; rej integer; g integer; net integer;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not signed in'; END IF;
  SELECT * INTO l FROM lots WHERE id = _lot_id AND buyer_id = _uid AND status = 'escrow' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cannot confirm this lot'; END IF;
  acc := COALESCE(_accepted_kg, l.kg);
  IF acc < 0 OR acc > l.kg THEN RAISE EXCEPTION 'accepted weight must be between 0 and % kg', l.kg; END IF;
  rej := l.kg - acc;
  IF rej > 0 AND length(trim(COALESCE(_reason, ''))) < 3 THEN RAISE EXCEPTION 'say why part of the lot was rejected'; END IF;

  SELECT * INTO h FROM lot_handover WHERE lot_id = _lot_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'no handover code for this lot — ask the grower to generate a new one'; END IF;
  IF h.attempts >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;
  IF h.code <> regexp_replace(COALESCE(_code, ''), '\s', '', 'g') THEN
    UPDATE lot_handover SET attempts = attempts + 1 WHERE lot_id = _lot_id;
    IF h.attempts + 1 >= 5 THEN RETURN jsonb_build_object('status', 'locked'); END IF;
    RETURN jsonb_build_object('status', 'wrong_code', 'attempts_left', 5 - (h.attempts + 1));
  END IF;

  ref := test_utr();   -- TEST MODE: real UTR will come from a payout provider later
  g := round(acc * l.price_per_kg)::integer;
  net := CASE WHEN acc = 0 THEN 0 ELSE GREATEST(0, g - l.cold_deduction - l.transport_deduction) END;
  UPDATE lots SET status = CASE WHEN acc = 0 THEN 'rejected' ELSE 'settled' END,
         accepted_kg = acc, rejected_kg = rej, reject_reason = CASE WHEN rej > 0 THEN left(trim(_reason), 200) END,
         gross = g, net_amount = net, utr = ref, settled_at = now()
  WHERE id = _lot_id;
  DELETE FROM lot_handover WHERE lot_id = _lot_id;   -- code is single-use
  RETURN jsonb_build_object('status', 'ok', 'utr', ref, 'lot_id', _lot_id, 'accepted_kg', acc, 'rejected_kg', rej,
                            'released', net, 'refund', round(rej * l.price_per_kg)::integer);
END $$;
