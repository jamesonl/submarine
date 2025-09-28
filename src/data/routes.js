import { ports } from './ports.js'

const portLookup = new Map(ports.map((port) => [port.id, port]))

function path(points) {
  return points.map(([latitude, longitude]) => ({ latitude, longitude }))
}

export const routes = [
  {
    id: 'ac-2-nyc-bude',
    name: 'AC-2 Transatlantic',
    origin: 'new-york',
    destination: 'london',
    travelMinutes: 12,
    cable: 'Atlantic Crossing 2',
    path: path([
      [40.5807, -73.8371],
      [43.5, -60.1],
      [46.3, -40.4],
      [48.9, -25.6],
      [50.833, -4.55],
    ]),
    milestones: [
      {
        id: 'nyc-shelf-drop',
        label: 'Newfoundland Shelf Drop',
        ratio: 0.18,
        description: 'Cross the continental shelf break while swell and fishing activity clutter sonar returns.',
        focusRoles: ['navigator', 'intel'],
      },
      {
        id: 'mid-atlantic-ridge',
        label: 'Mid-Atlantic Ridge',
        ratio: 0.52,
        description: 'Hydrothermal plumes and volcanic relief distort magnetics around the ridge crossing.',
        focusRoles: ['engineer', 'navigator'],
      },
      {
        id: 'celtic-approach',
        label: 'Celtic Sea Approach',
        ratio: 0.81,
        description: 'Dense fishing fleets and naval patrols intersect the approach lanes into Cornwall.',
        focusRoles: ['captain', 'operations'],
      },
    ],
  },
  {
    id: 'ellan-apollo',
    name: 'EllaLink & MainOne Interconnect',
    origin: 'lisbon',
    destination: 'lagos',
    travelMinutes: 15,
    cable: 'EllaLink / MainOne',
    path: path([
      [38.6886, -9.3387],
      [33.7, -17.6],
      [18.8, -21.3],
      [10.2, -16.4],
      [6.4281, 3.4219],
    ]),
    milestones: [
      {
        id: 'macaronesia-eddies',
        label: 'Macaronesia Eddies',
        ratio: 0.24,
        description: 'Warm eddies spun from the Canary Current shear across the cable bank.',
        focusRoles: ['intel', 'navigator'],
      },
      {
        id: 'equatorial-upwelling',
        label: 'Equatorial Upwelling',
        ratio: 0.55,
        description: 'Nutrient-rich upwelling disturbs thermal layers and reduces acoustic range.',
        focusRoles: ['engineer', 'operations'],
      },
      {
        id: 'gulf-of-guinea',
        label: 'Gulf of Guinea Shelf',
        ratio: 0.78,
        description: 'Piracy alerts and heavy cable maintenance traffic crowd the Lagos landing corridor.',
        focusRoles: ['captain', 'operations'],
      },
    ],
  },
  {
    id: 'sea-we-me',
    name: 'SEA-ME-WE Extension',
    origin: 'marseilles',
    destination: 'mumbai',
    travelMinutes: 13,
    cable: 'SEA-ME-WE 5',
    path: path([
      [43.2672, 5.383],
      [36.7, 12.4],
      [33.2, 22.8],
      [27.5, 34.1],
      [24.4, 40.8],
      [19.134, 72.795],
    ]),
    milestones: [
      {
        id: 'sicily-channel',
        label: 'Sicily Channel',
        ratio: 0.17,
        description: 'Busy merchant corridors and shallow banks require precision ballast control.',
        focusRoles: ['navigator', 'engineer'],
      },
      {
        id: 'suez-traffic',
        label: 'Suez Approaches',
        ratio: 0.46,
        description: 'Convoys transiting to the Red Sea compress maneuvering space near cable junctions.',
        focusRoles: ['captain', 'operations'],
      },
      {
        id: 'arabian-sea-monsoon',
        label: 'Arabian Sea Monsoon',
        ratio: 0.73,
        description: 'Seasonal monsoon layers kick up turbidity and erratic cross-currents.',
        focusRoles: ['intel', 'engineer'],
      },
    ],
  },
  {
    id: 'aag-extension',
    name: 'Asia-America Gateway Spur',
    origin: 'singapore',
    destination: 'tokyo',
    travelMinutes: 14,
    cable: 'AAG / JUPITER Handshake',
    path: path([
      [1.3345, 103.635],
      [7.1, 120.3],
      [21.7, 127.4],
      [31.8, 138.8],
      [35.05, 139.8667],
    ]),
    milestones: [
      {
        id: 'sulu-trench',
        label: 'Sulu Trench',
        ratio: 0.33,
        description: 'Volcanic arcs and fishing traffic weave around the trench ridges.',
        focusRoles: ['navigator', 'intel'],
      },
      {
        id: 'philippine-plate-shift',
        label: 'Philippine Plate Shift',
        ratio: 0.58,
        description: 'Microseisms from plate shifts jitter the guidance gyros.',
        focusRoles: ['engineer', 'operations'],
      },
      {
        id: 'kuroshio-approach',
        label: 'Kuroshio Approach',
        ratio: 0.82,
        description: 'Fast-moving currents and sensor buoys shield Tokyo\'s landing lanes.',
        focusRoles: ['captain', 'navigator'],
      },
    ],
  },
  {
    id: 'southern-cross',
    name: 'Southern Cross Pacific',
    origin: 'singapore',
    destination: 'sydney',
    travelMinutes: 15,
    cable: 'Southern Cross NEXT',
    path: path([
      [1.3345, 103.635],
      [-6.5, 129.2],
      [-14.2, 150.8],
      [-22.8, 160.1],
      [-33.9211, 151.2574],
    ]),
    milestones: [
      {
        id: 'banda-deep',
        label: 'Banda Sea Deep',
        ratio: 0.29,
        description: 'Steep bathymetry requires synchronous ballast and thruster adjustments.',
        focusRoles: ['engineer', 'navigator'],
      },
      {
        id: 'coral-sea-storm',
        label: 'Coral Sea Storm Line',
        ratio: 0.63,
        description: 'Tropical storm cells threaten to obscure satellite relay and seabed beacons.',
        focusRoles: ['intel', 'operations'],
      },
      {
        id: 'tasman-shelf',
        label: 'Tasman Shelf Arrival',
        ratio: 0.87,
        description: 'Shallow banks and marine preserves near Sydney demand minimum wake signatures.',
        focusRoles: ['captain', 'navigator'],
      },
    ],
  },
]

export function resolvePort(id) {
  return portLookup.get(id)
}
