-- 012: Live mandi prices. A copy of Agmarknet's daily market reports (data.gov.in) for the crops the
-- app knows, kept per market and day, so price screens load from the database, trends build up over
-- time, and the government API is called at most once every 30 minutes for everyone.

CREATE TABLE mandi_prices (
  day date NOT NULL,                 -- arrival date of the report
  crop text NOT NULL,                -- our crop key (src/lib/crops.ts)
  state text NOT NULL,
  district text NOT NULL DEFAULT '',
  market text NOT NULL,
  commodity text NOT NULL,           -- Agmarknet's name
  variety text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  min_kg numeric(10, 2) NOT NULL CHECK (min_kg >= 0),
  max_kg numeric(10, 2) NOT NULL CHECK (max_kg >= 0),
  modal_kg numeric(10, 2) NOT NULL CHECK (modal_kg > 0),
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (crop, day, state, market, variety, grade)
);
CREATE INDEX mandi_prices_day_idx ON mandi_prices (day);

-- One row: when the prices were last refreshed, so only one server instance calls the API at a time.
CREATE TABLE mandi_refresh (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  started_at timestamptz NOT NULL DEFAULT 'epoch',
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  note text
);
INSERT INTO mandi_refresh (id) VALUES (1);
