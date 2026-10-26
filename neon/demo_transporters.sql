-- OPTIONAL, for testing only. Fake drivers so you can see the "driver assigned" screen locally.
-- The phone numbers are NOT real. Delete them before real farmers use the app:  DELETE FROM transporters WHERE name LIKE 'DEMO%';
INSERT INTO transporters (name, phone, vehicle_key, vehicle_no, base_district) VALUES
('DEMO driver (test)', '0000000000', 'mini',   'HR-00-TEST-0001', 'Sonipat'),
('DEMO driver (test)', '0000000000', 'pickup', 'HR-00-TEST-0002', 'Sonipat'),
('DEMO driver (test)', '0000000000', 'tempo',  'HR-00-TEST-0003', 'Karnal'),
('DEMO driver (test)', '0000000000', 'truck',  'HR-00-TEST-0004', 'Panipat');
