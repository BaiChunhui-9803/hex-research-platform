/** English display names. IDs, coordinates and the simulation are independent. */
export const DEFAULT_STATION_NAMES = [
  "Park Street",
  "Observatory",
  "Museum",
  "East Park",
  "Botanic Gardens",
  "North Square",
  "Central",
  "Theatre",
  "Arts District",
  "Market Street",
  "University",
  "Harbor",
];

/** Conventional landmark-based names for a fictional city, not a real network. */
export const GENERIC_STATION_NAMES = [
  "City Hall",
  "Union Station",
  "Airport",
  "Old Town",
  "West End",
  "East End",
  "North Station",
  "South Station",
  "Riverside",
  "Waterfront",
  "Library",
  "Stadium",
  "Hospital",
  "College",
  "Town Square",
  "Civic Center",
  "Hill Street",
  "Lake Street",
  "Main Street",
  "Church Street",
  "West Park",
  "Garden Avenue",
  "Science Park",
  "Exhibition Center",
];

/** Small, attributed examples; names alone do not reproduce operator maps. */
export const REAL_WORLD_NAME_EXAMPLES = [
  { name: "Baker Street", source: "tfl" },
  { name: "Victoria", source: "tfl" },
  { name: "Westminster", source: "tfl" },
  { name: "Waterloo", source: "tfl" },
  { name: "Green Park", source: "tfl" },
  { name: "Oxford Circus", source: "tfl" },
  { name: "Piccadilly Circus", source: "tfl" },
  { name: "Paddington", source: "tfl" },
  { name: "Liverpool Street", source: "tfl" },
  { name: "Bank", source: "tfl" },
  { name: "City Hall", source: "lta" },
  { name: "Botanic Gardens", source: "lta" },
  { name: "HarbourFront", source: "lta" },
  { name: "Orchard", source: "lta" },
  { name: "Chinatown", source: "lta" },
  { name: "Marina Bay", source: "lta" },
];

// Optional plain-language aliases. The game uses only Line A / B / C by default.
export const LINE_ALIAS_CANDIDATES = [
  "Central",
  "North",
  "South",
  "East",
  "West",
  "Airport",
  "Harbor",
  "Park",
];
export const NAME_SOURCES = {
  tfl: {
    authority: "Transport for London",
    title: "Standard Tube Map",
    url: "https://content.tfl.gov.uk/standard-tube-map.pdf",
  },
  lta: {
    authority: "Land Transport Authority, Singapore",
    title: "Rail network and system map",
    url: "https://www.lta.gov.sg/content/ltagov/en/getting_around/public_transport/rail_network.html",
  },
};

export const SHAPE_LABELS = {
  circle: "circle",
  triangle: "triangle",
  square: "square",
};
export function lineLabel(id, alias = null) {
  const label = `Line ${id}`;
  return alias && LINE_ALIAS_CANDIDATES.includes(alias)
    ? `${label} · ${alias}`
    : label;
}
export function stationNames(count) {
  const pool = [
    ...new Set([...DEFAULT_STATION_NAMES, ...GENERIC_STATION_NAMES]),
  ];
  return Array.from({ length: count }, (_, i) => pool[i] ?? `Station ${i + 1}`);
}
