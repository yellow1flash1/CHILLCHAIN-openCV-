export type Role = "farmer" | "buyer" | "owner" | "transporter";
export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  state: string | null;
  district: string | null;
  village: string | null;
  org_name: string | null;
  upi_id: string | null;
  id_type: string | null;
  id_number: string | null;
  fpo_id: string | null;
  buyer_type: BuyerType | null;
  created_at: string;
  updated_at: string;
}
export type BuyerType =
  "quick_commerce" | "retail" | "horeca" | "exporter" | "processor" | "florist" | "other";
export type Facility = "cold_room" | "precool" | "ripening";
export interface ColdRoomRow {
  id: string;
  owner_id: string | null;
  palledari_per_crate?: number | null;
  name: string;
  name_hi: string | null;
  address: string;
  district: string;
  state: string;
  pin: string | null;
  lat: number;
  lng: number;
  rate_per_crate_day: number;
  rate_per_crate_hour: number | null;
  facility: Facility;
  total_slots: number;
  temp_c: number;
  humidity: number;
  badges: string[];
  tags: string[];
  phone: string | null;
  verified: boolean;
  accepting_bookings: boolean;
}
export type ColdRoom = ColdRoomRow & { free: number };
export interface Scan {
  id: string;
  farmer_id: string;
  batch_code: string;
  crop: string;
  grade: string;
  confidence: number;
  uniformity: number;
  spoilage: string;
  shelf_no: number;
  shelf_cold: number;
  notes: string | null;
  photo_key: string | null;
  ripeness: number | null;
  harvested_at: string | null;
  sell_by: string | null;
  cold_chain: boolean;
  route: "retail" | "flash" | "processor" | "ripen" | null;
  grade_source: GradeSource;
  ai_grade: "A" | "B" | "C" | null;
  ai_notes: string | null;
  ambient_c: number | null;
  created_at: string;
}
/** model = on-phone AI model, opencv = OpenCV 5 grading agent on AWS, ai_vision = Gemini Vision on the
 *  server (fallback), self = the grower's own call. */
export type GradeSource = "model" | "ai_vision" | "opencv" | "self" | "simulated";
export interface Booking {
  id: string;
  farmer_id: string;
  cold_room_id: string;
  pass_no: string;
  crop: string;
  crates: number;
  days: number;
  hours: number | null;
  ends_at: string;
  amount: number;
  pay_mode: string;
  paid: boolean;
  bay: string;
  utr: string | null;
  pay_method: string | null;
  created_at: string;
}
export interface Lot {
  id: string;
  lot_code: string;
  farmer_id: string;
  farmer_name: string;
  farmer_district: string | null;
  crop: string;
  kg: number;
  grade: string;
  price_per_kg: number;
  base_price: number;
  sell_by: string | null;
  scan_id: string | null;
  preorder_id: string | null;
  gross: number;
  cold_deduction: number;
  transport_deduction: number;
  net_amount: number;
  status: "open" | "escrow" | "settled" | "cancelled" | "rejected";
  accepted_kg: number | null;
  rejected_kg: number;
  reject_reason: string | null;
  grade_source: GradeSource | null;
  buyer_id: string | null;
  buyer_name: string | null;
  utr: string | null;
  created_at: string;
  ordered_at: string | null;
  settled_at: string | null;
}
export interface Preorder {
  id: string;
  code: string;
  buyer_id: string;
  buyer_name: string;
  buyer_type: BuyerType | null;
  crop: string;
  min_grade: "A" | "B" | "C";
  kg: number;
  kg_remaining: number;
  /** For a grower: how much of this pre-order they took. */
  my_kg: number;
  price_per_kg: number;
  need_by: string;
  deliver_district: string | null;
  notes: string | null;
  status: "open" | "matched" | "cancelled";
  farmer_id: string | null;
  lot_id: string | null;
  created_at: string;
  matched_at: string | null;
}
export interface Vehicle {
  key: string;
  name: string;
  name_hi: string | null;
  capacity_kg: number;
  base_fare: number;
  per_km: number;
}
export interface District {
  name: string;
  state: string;
}
export interface TransportQuote {
  distance_km: number;
  amount: number;
  to_label: string;
}
export type TransportStatus = "requested" | "assigned" | "in_transit" | "delivered" | "cancelled";
export interface Transport {
  id: string;
  transporter_user_id?: string | null;
  trip_code: string;
  farmer_id: string;
  lot_id: string | null;
  from_district: string;
  to_label: string;
  to_room_id: string | null;
  to_district: string | null;
  distance_km: number;
  vehicle_key: string;
  kg: number;
  crop: string;
  reefer: boolean;
  pickup_date: string;
  amount: number;
  status: TransportStatus;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_no: string | null;
  notes: string | null;
  shared: boolean;
  pool_code: string | null;
  deliver_by: string | null;
  created_at: string;
}
export interface OwnerRoom extends ColdRoomRow {
  owner_id: string;
  updated_at: string;
}
export interface OwnerStats {
  total_slots: number;
  used: number;
  active_bookings: number;
  revenue_total: number;
  revenue_month: number;
  dues: number;
}
export interface OwnerBooking {
  id: string;
  farmer_id: string;
  pass_no: string;
  crop: string;
  crates: number;
  days: number;
  hours: number | null;
  amount: number;
  pay_mode: string;
  paid: boolean;
  bay: string;
  utr: string | null;
  pay_method: string | null;
  created_at: string;
  ends_at: string;
  checked_in_at: string | null;
  released_at: string | null;
  farmer_name: string | null;
  farmer_phone: string | null;
  farmer_village: string | null;
}
export interface ChartPoint {
  label: string;
  crates: number;
}
export interface OwnerDashboard {
  room: OwnerRoom | null;
  stats: OwnerStats | null;
  bookings: OwnerBooking[];
  chart: ChartPoint[];
}

export interface Transporter {
  id: string;
  name: string;
  phone: string;
  vehicle_key: string;
  vehicle_no: string | null;
  rc_number: string | null;
  licence_number: string | null;
  insurance_number: string | null;
  fitness_number: string | null;
  aadhaar_last4: string | null;
  base_district: string | null;
  radius_km: number;
  capacity_kg: number;
  has_reefer: boolean;
  verified: boolean;
  docs_submitted_at: string | null;
  created_at: string;
}
export interface NearbyTrip {
  id: string;
  farmer_id: string | null;
  trip_code: string;
  from_district: string;
  to_label: string;
  distance_km: number;
  pickup_km: number;
  vehicle_key: string;
  kg: number;
  crop: string;
  reefer: boolean;
  pickup_date: string;
  amount: number;
  notes: string | null;
  created_at: string;
  shared: boolean;
  pool_code: string | null;
  deliver_by: string | null;
}
export interface DriverTrip {
  id: string;
  farmer_id: string;
  trip_code: string;
  from_district: string;
  to_label: string;
  distance_km: number;
  vehicle_key: string;
  kg: number;
  crop: string;
  reefer: boolean;
  pickup_date: string;
  amount: number;
  status: TransportStatus;
  notes: string | null;
  shared: boolean;
  pool_code: string | null;
  deliver_by: string | null;
  created_at: string;
  accepted_at: string | null;
  picked_at: string | null;
  delivered_at: string | null;
  paid: boolean;
  paid_at: string | null;
  pay_method: string | null;
  farmer_name: string | null;
  farmer_phone: string | null;
  farmer_village: string | null;
}
export interface DriverStats {
  earned_total: number;
  earned_month: number;
  pending: number;
  trips_done: number;
  km_done: number;
  active: number;
}
export interface EarnPoint {
  label: string;
  amount: number;
}
export interface TransporterDashboard {
  vehicle: Transporter | null;
  nearby: NearbyTrip[];
  trips: DriverTrip[];
  stats: DriverStats | null;
  chart: EarnPoint[];
}
