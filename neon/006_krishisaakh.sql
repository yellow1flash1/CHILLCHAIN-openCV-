-- 006: KrishiSaakh ratings. Run once, after 005.
-- One row per rating. Scores are computed by the server from app records (system telemetry) plus the
-- rater's 3-tap answers; reputations (EMA + Bayesian stars) are calculated when read.

CREATE TABLE ks_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flow smallint NOT NULL CHECK (flow BETWEEN 1 AND 6),
  tx_kind text NOT NULL CHECK (tx_kind IN ('booking', 'lot', 'trip')),
  tx_id uuid NOT NULL,
  rater_id text NOT NULL,
  ratee_id text NOT NULL CHECK (ratee_id <> rater_id),
  score numeric(5,2) NOT NULL CHECK (score BETWEEN 0 AND 100),
  system_score numeric(5,2) NOT NULL,
  peer_score numeric(5,2) NOT NULL,
  components jsonb NOT NULL,                 -- every component value used, for the breakdown
  weather_shield boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  reveal_at timestamptz NOT NULL DEFAULT now() + interval '48 hours',
  UNIQUE (flow, tx_id, rater_id)           -- one rating per transaction per side
);
CREATE INDEX ks_ratee_idx ON ks_ratings (ratee_id, flow, created_at);

-- Save a rating. Double-blind: hidden for 48 hours, or revealed at once when the other side of the
-- same transaction has also rated (flows 1<->6, 2<->5, 3<->4).
CREATE FUNCTION ks_record(
  _flow smallint, _kind text, _tx uuid, _rater text, _ratee text,
  _score numeric, _system numeric, _peer numeric, _components jsonb, _shield boolean
) RETURNS ks_ratings LANGUAGE plpgsql AS $$
DECLARE r ks_ratings; other smallint := CASE _flow WHEN 1 THEN 6 WHEN 6 THEN 1 WHEN 2 THEN 5 WHEN 5 THEN 2 WHEN 3 THEN 4 ELSE 3 END;
BEGIN
  INSERT INTO ks_ratings (flow, tx_kind, tx_id, rater_id, ratee_id, score, system_score, peer_score, components, weather_shield)
  VALUES (_flow, _kind, _tx, _rater, _ratee, round(_score, 2), round(_system, 2), round(_peer, 2), _components, COALESCE(_shield, false))
  ON CONFLICT (flow, tx_id, rater_id) DO NOTHING
  RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'you have already rated this transaction'; END IF;
  IF EXISTS (SELECT 1 FROM ks_ratings WHERE flow = other AND tx_id = _tx) THEN
    UPDATE ks_ratings SET reveal_at = now() WHERE tx_id = _tx AND flow IN (_flow, other) AND reveal_at > now();
    SELECT * INTO r FROM ks_ratings WHERE id = r.id;
  END IF;
  RETURN r;
END $$;
