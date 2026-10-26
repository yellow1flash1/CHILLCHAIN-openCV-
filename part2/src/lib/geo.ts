// District centres (must match the districts table) and road-distance estimates, shared by the
// storage map and the "Best move now" engine. Same estimate as road_km() in neon/002_transport.sql.

export const DISTRICT_LL: Record<string, [number, number]> = {
  Muzaffarpur: [26.1209, 85.3647],
  Kodagu: [12.4244, 75.7382],
  Wayanad: [11.6854, 76.132],
  Ernakulam: [9.9816, 76.2999],
  Shopian: [33.72, 74.83],
  Srinagar: [34.0837, 74.7973],
  Kutch: [23.242, 69.6669],
  Solapur: [17.6599, 75.9064],
  Mumbai: [19.076, 72.8777],
  Krishnagiri: [12.5186, 78.2137],
  "Bengaluru Urban": [12.9716, 77.5946],
  Hyderabad: [17.385, 78.4867],
  Shimla: [31.1048, 77.1734],
  "Lower Subansiri": [27.59, 93.83],
  Kolkata: [22.5726, 88.3639],
  Sonipat: [28.9931, 77.0151],
  Karnal: [29.6857, 76.9905],
  Panipat: [29.3909, 76.9635],
  Hisar: [29.1492, 75.7217],
  Kurukshetra: [29.9695, 76.8783],
  Ludhiana: [30.901, 75.8573],
  Amritsar: [31.634, 74.8723],
  Patiala: [30.3398, 76.3869],
  Jalandhar: [31.326, 75.5762],
  Meerut: [28.9845, 77.7064],
  Agra: [27.1767, 78.0081],
  Lucknow: [26.8467, 80.9462],
  Saharanpur: [29.968, 77.5552],
  Nashik: [19.9975, 73.7898],
  Pune: [18.5204, 73.8567],
  Nagpur: [21.1458, 79.0882],
  Satara: [17.6805, 74.0183],
  "North West Delhi": [28.7, 77.1],
  "North Delhi": [28.68, 77.22],
  Jaipur: [26.9124, 75.7873],
  Alwar: [27.553, 76.6346],
  Kota: [25.2138, 75.8648],
};

/** Straight-line distance in km. */
export const km = (a: [number, number], b: [number, number]) => {
  const R = 6371,
    dLat = ((b[0] - a[0]) * Math.PI) / 180,
    dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/** Road distance estimate: straight line × 1.25, at least 5 km (as road_km() in the database). */
export const roadKm = (a: [number, number], b: [number, number]) =>
  Math.max(5, Math.round(1.25 * km(a, b)));

/** Big buyer cities (quick-commerce hubs, terminal markets, processors). */
export const BUYER_CITIES = [
  "Mumbai",
  "Pune",
  "Bengaluru Urban",
  "Hyderabad",
  "North West Delhi",
  "Kolkata",
] as const;
