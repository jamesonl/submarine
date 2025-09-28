export const crew = [
  {
    id: 'captain',
    name: 'Captain Mira Chen',
    role: 'Mission Command',
    units: 1,
    defaultInstructions:
      'Authorize route changes and prioritise stealth when approaching chokepoints or heavily trafficked cables.',
    alliances: ['navigator', 'intel'],
  },
  {
    id: 'navigator',
    name: 'Lieutenant Theo Park',
    role: 'Navigation',
    units: 4,
    defaultInstructions:
      'Maintain geodesic progress and adjust ballast to trace cable bathymetry without exceeding hull strain.',
    alliances: ['captain', 'engineer'],
  },
  {
    id: 'engineer',
    name: 'Chief Ava Rahman',
    role: 'Engineering',
    units: 6,
    defaultInstructions:
      'Distribute reactor output to propulsion pods and heat exchangers while monitoring vibration signatures.',
    alliances: ['navigator', 'operations'],
  },
  {
    id: 'operations',
    name: 'Warrant Jorge Ibarra',
    role: 'Operations Control',
    units: 3,
    defaultInstructions:
      'Coordinate damage control parties, sensor calibration crews, and cable interface specialists.',
    alliances: ['engineer', 'intel'],
  },
  {
    id: 'intel',
    name: 'Analyst Priya N\'Dour',
    role: 'Intelligence',
    units: 2,
    defaultInstructions:
      'Fuse maritime intelligence, weather overlays, and network outage telemetry to predict hazards.',
    alliances: ['captain', 'operations'],
  },
]
