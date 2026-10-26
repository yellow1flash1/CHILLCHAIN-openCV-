-- 004a: run this ALONE first (Postgres needs a new enum value committed before it can be used).
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'transporter';
