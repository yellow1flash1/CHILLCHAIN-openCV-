-- 007: the farmer's own farm details for FasalNiti (land, budget, water, soil, previous crop).
-- Stored as one JSON object; the server validates it before saving. Run once, after 006.
ALTER TABLE profiles ADD COLUMN farm jsonb;
