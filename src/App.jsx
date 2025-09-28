import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { crew as crewManifest } from './data/crew.js'
import { ports } from './data/ports.js'
import { routes, resolvePort } from './data/routes.js'
import { worldPolygons } from './data/world.js'
import { requestCrewThought } from './services/openaiResponses.js'

const MAP_WIDTH = 1280
const MAP_HEIGHT = 720
const TIME_SCALE = Number(import.meta.env.VITE_SIMULATION_TIME_SCALE ?? 1)

const SIMULATION_MINUTES_PER_MISSION_MINUTE = 120
const SHIFT_LENGTH_HOURS = 6
const FATIGUE_RATE_ON_DUTY = 3.2
const FATIGUE_RECOVERY_PER_HOUR = 2.6
const STRESS_RATE_ON_DUTY = 2.1
const STRESS_RECOVERY_PER_HOUR = 1.4
const STRESS_FROM_FATIGUE = 1.05

const FUEL_TANK_CAPACITY_LITERS = 720_000
const BASE_FUEL_BURN_PER_HOUR = 2_050
const ADDITIONAL_BURN_PER_CREW_UNIT = 18
const STRESS_FUEL_MULTIPLIER = 0.35

const OBSTACLE_TYPES = {
  battleship: {
    label: 'Battleship screen',
    description: 'Surface fleet interdiction detected ahead of the cable corridor.',
    iconColor: '#f78c6b',
    analystReport:
      'Surface contact designated as hostile destroyer screen. Recommend veer five degrees port and drop to 180m.',
    captainDirective:
      'Captain Mira Chen: Navigation, execute the port veer and keep ballast trimmed. Intel, maintain sonar picture every thirty seconds.',
    operationsFollowUp:
      'Operations: Combat systems shifting to passive sweep, all departments report ready to counter decoy drops.',
    navigatorAction: 'Navigation: Plotting a slow arc to port and pulsing lateral thrusters to skirt the destroyer screen.',
  },
  thermalVent: {
    label: 'Thermal vent surge',
    description: 'Unexpected hydrothermal vent activity threatens hull stability.',
    iconColor: '#ffd166',
    analystReport:
      "Intel: Thermal bloom rising fast — recommending we descend ten meters and throttle to seventy percent until turbulence subsides.",
    captainDirective:
      'Captain Mira Chen: Engineering, prioritize coolant to the starboard exchanger. Navigation, hold present course and depth change.',
    operationsFollowUp:
      'Operations: Damage control parties on standby, routing auxiliary power to trim pumps for rapid response.',
    navigatorAction: 'Navigation: Dropping ten meters and stabilizing pitch to ride out the thermal plume.',
  },
  debrisField: {
    label: 'Debris field',
    description: 'Fragmented cable sheathing and trawler debris crowd the channel.',
    iconColor: '#06d6a0',
    analystReport:
      'Intel: Identifying composite shards; advising micro-adjustments to avoid abrasion on the dorsal sensor mast.',
    captainDirective:
      'Captain Mira Chen: Navigator, plot a slalom along the safe nodes and keep comms tethered to maintenance crew.',
    operationsFollowUp:
      'Operations: Launching tether drones to mark the debris line; crews ready to secure any recovered sections.',
    navigatorAction: 'Navigation: Threading micro-waypoints through the debris corridor while safeguarding the dorsal array.',
  },
}

const HEARTBEAT_TASKS = [
  {
    crewId: 'intel',
    buildTranscript: ({ crewMember, metrics }) => {
      const efficiency = metrics ? Math.round(metrics.efficiency * 100) : 100
      const stress = describeStressLevel(metrics?.stress ?? 0)
      return `${crewMember.name}: Sensor fusion at ${efficiency}% efficiency — ${stress.label.toLowerCase()} posture maintained.`
    },
    buildThoughts: ({ telemetry, metrics }) => {
      const watchSummary = metrics
        ? `${metrics.awakeUnits} analysts on watch, ${metrics.restingUnits} recovering.`
        : 'Balancing analyst rotations.'
      return [
        'Refreshing maritime intelligence overlays with fresh satellite passes.',
        `Monitoring corridor at ${(telemetry.progress * 100).toFixed(0)}% completion.`,
        watchSummary,
      ]
    },
  },
  {
    crewId: 'captain',
    buildTranscript: ({ crewMember, metrics }) => {
      const stress = describeStressLevel(metrics?.stress ?? 0)
      return `${crewMember.name}: Maintain cadence; bridge remains ${stress.label.toLowerCase()} under current load.`
    },
    buildThoughts: ({ telemetry, metrics }) => {
      const efficiency = metrics ? Math.round(metrics.efficiency * 100) : 100
      const rest = metrics && metrics.restingUnits > 0 ? `${metrics.restingUnits} officers off-shift.` : 'Command deck fully engaged.'
      return [
        `Reviewing bridge status at T+${formatTime(telemetry.elapsedMs)}.`,
        `Mission efficiency projected at ${efficiency}% for the next watch.`,
        rest,
      ]
    },
  },
  {
    crewId: 'engineer',
    buildTranscript: ({ crewMember, metrics }) => {
      const stress = describeStressLevel(metrics?.stress ?? 0)
      return `${crewMember.name}: Thermal envelopes steady; engineering watch is ${stress.label.toLowerCase()}.`
    },
    buildThoughts: ({ metrics }) => {
      const fatigue = metrics ? Math.round(metrics.fatigue) : 0
      const rotation = metrics
        ? `${metrics.awakeUnits} specialists managing propulsion while ${metrics.restingUnits} recover.`
        : 'Propulsion teams managing standard rotations.'
      return [
        'Sweeping diagnostics across propulsion pods.',
        rotation,
        `Fatigue trending at ${fatigue}% — recalibrating coolant trims accordingly.`,
      ]
    },
  },
  {
    crewId: 'navigator',
    buildTranscript: ({ crewMember, metrics }) => {
      const stress = describeStressLevel(metrics?.stress ?? 0)
      return `${crewMember.name}: Waypoints locked — nav team ${stress.label.toLowerCase()} as we trace the grade.`
    },
    buildThoughts: ({ telemetry, metrics }) => {
      const efficiency = metrics ? Math.round(metrics.efficiency * 100) : 100
      return [
        `Interpolating bathymetry at ${(telemetry.progress * 100).toFixed(1)}% of route.`,
        `Current helm efficiency steady at ${efficiency}%.`,
        metrics
          ? `${metrics.awakeUnits} charting specialists awake, ${metrics.restingUnits} rotating to rest.`
          : 'Synchronizing updates with mission command.',
      ]
    },
  },
  {
    crewId: 'operations',
    buildTranscript: ({ crewMember, metrics }) => {
      const stress = describeStressLevel(metrics?.stress ?? 0)
      return `${crewMember.name}: Crew rotations steady; operations posture ${stress.label.toLowerCase()}.`
    },
    buildThoughts: ({ metrics }) => {
      const fatigue = metrics ? Math.round(metrics.fatigue) : 0
      const rest = metrics && metrics.restingUnits > 0
        ? `${metrics.restingUnits} coordinators off-shift to manage fatigue.`
        : 'No reserve teams remaining — monitoring morale closely.'
      return [
        'Auditing compartment readiness reports.',
        rest,
        `Tracking fatigue at ${fatigue}% to plan relief timings.`,
      ]
    },
  },
]

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function projectPoint({ latitude, longitude }) {
  const x = ((longitude + 180) / 360) * MAP_WIDTH
  const y = ((90 - latitude) / 180) * MAP_HEIGHT
  return [x, y]
}

function formatTime(totalMs) {
  const totalSeconds = Math.floor(totalMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min
  return Math.min(Math.max(value, min), max)
}

function degreesToRadians(value) {
  return (value * Math.PI) / 180
}

function computeRouteDistanceNauticalMiles(path) {
  if (!Array.isArray(path) || path.length < 2) return 0
  let totalKm = 0
  for (let index = 1; index < path.length; index += 1) {
    const start = path[index - 1]
    const end = path[index]
    const lat1 = degreesToRadians(start.latitude)
    const lon1 = degreesToRadians(start.longitude)
    const lat2 = degreesToRadians(end.latitude)
    const lon2 = degreesToRadians(end.longitude)
    const deltaLat = lat2 - lat1
    const deltaLon = lon2 - lon1
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
    const EARTH_RADIUS_KM = 6371
    totalKm += EARTH_RADIUS_KM * c
  }
  return totalKm * 0.539957
}

function formatNauticalMiles(value) {
  if (!Number.isFinite(value)) return '0 nm'
  if (value >= 100) return `${value.toFixed(0)} nm`
  return `${value.toFixed(1)} nm`
}

function formatLiters(value, fractionDigits = 0) {
  if (!Number.isFinite(value)) return '0 L'
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
  })} L`
}

function formatHours(hours) {
  if (!Number.isFinite(hours)) return '0h'
  const whole = Math.floor(hours)
  const minutes = Math.round((hours - whole) * 60)
  if (whole <= 0) {
    return `${minutes}m`
  }
  return `${whole}h ${minutes.toString().padStart(2, '0')}m`
}

function describeStressLevel(stressValue) {
  const value = clamp(stressValue, 0, 100)
  if (value < 25) {
    return { label: 'Composed', tone: 'calm', narrative: 'Crew responses remain steady with low stress signatures.' }
  }
  if (value < 50) {
    return {
      label: 'Steady',
      tone: 'steady',
      narrative: 'Teams are alert but comfortable with the workload.',
    }
  }
  if (value < 75) {
    return {
      label: 'Strained',
      tone: 'strained',
      narrative: 'Watch rotations are tightening; consider reinforcing support.',
    }
  }
  return {
    label: 'Critical',
    tone: 'critical',
    narrative: 'Stress spikes are compromising decision cadence.',
  }
}

function createInitialMetrics(member) {
  const teamSize = member.teamSize ?? (member.role === 'Mission Command' ? 1 : 2)
  const totalTeams = Math.max(1, Math.ceil(member.units / teamSize))
  const awakeUnits = Math.min(member.units, teamSize)
  return {
    stress: 22,
    fatigue: 18,
    efficiency: 0.94,
    awakeUnits,
    restingUnits: Math.max(0, member.units - awakeUnits),
    totalTeams,
    teamSize,
    clock: 0,
    shiftIndex: 0,
  }
}

function CrewSidebar({
  crewState,
  crewMetrics,
  aggregateStress,
  stressGrade,
  totalCrewUnits,
  rotationSummary,
  peakTeamStress,
  onOpenBriefing,
  isPaused,
  canResume,
  isCollapsed,
  onToggleCollapse,
}) {
  return (
    <aside
      className={isCollapsed ? 'crew-sidebar crew-sidebar--collapsed' : 'crew-sidebar'}
      aria-label="Crew summary sidebar"
    >
      <button
        type="button"
        className="crew-sidebar__collapse"
        onClick={onToggleCollapse}
        aria-expanded={!isCollapsed}
        aria-controls={isCollapsed ? undefined : 'crew-sidebar-content'}
      >
        {isCollapsed ? 'Expand' : 'Collapse'}
      </button>
      <div className="crew-sidebar__status">
        <span className={isPaused ? 'status-dot paused' : 'status-dot running'} aria-hidden="true" />
        <span>{isPaused ? (canResume ? 'Paused' : 'Awaiting launch') : 'Underway'}</span>
      </div>
        {isCollapsed ? (
          <div className="crew-sidebar__compact">
            <h1>Global Cable Traverse</h1>
            <div className={`crew-sidebar__aggregate crew-sidebar__aggregate--${stressGrade.tone}`}>
              <span className="crew-sidebar__aggregate-label">Team stress</span>
              <span className="crew-sidebar__aggregate-value">
                {stressGrade.label} ({Math.round(aggregateStress)}%)
              </span>
            </div>
            <div className="crew-sidebar__aggregate">
              <span className="crew-sidebar__aggregate-label">Crew complement</span>
              <span className="crew-sidebar__aggregate-value">{totalCrewUnits} specialists</span>
            </div>
            <div className="crew-sidebar__aggregate">
              <span className="crew-sidebar__aggregate-label">Peak stress</span>
              <span className="crew-sidebar__aggregate-value">{Math.round(peakTeamStress)}%</span>
            </div>
            <p className="crew-sidebar__rotation">{rotationSummary}</p>
            <button
            type="button"
            className="crew-sidebar__button crew-sidebar__button--icon"
            onClick={onOpenBriefing}
            aria-label="Open crew briefing"
          >
            Briefing
          </button>
        </div>
      ) : (
        <div id="crew-sidebar-content" className="crew-sidebar__content">
            <header className="crew-sidebar__header">
              <h1>Global Cable Traverse</h1>
              <p>{stressGrade.narrative}</p>
              <div className="crew-sidebar__summary-grid">
                <div>
                  <span className="crew-sidebar__aggregate-label">Team stress</span>
                  <strong className={`crew-sidebar__aggregate-value crew-sidebar__aggregate-value--${stressGrade.tone}`}>
                    {stressGrade.label} ({Math.round(aggregateStress)}%)
                  </strong>
                </div>
                <div>
                  <span className="crew-sidebar__aggregate-label">Crew complement</span>
                  <strong className="crew-sidebar__aggregate-value">{totalCrewUnits} specialists</strong>
                </div>
                <div>
                  <span className="crew-sidebar__aggregate-label">Rotation</span>
                  <strong className="crew-sidebar__aggregate-value">{rotationSummary}</strong>
                </div>
                <div>
                  <span className="crew-sidebar__aggregate-label">Peak stress</span>
                  <strong className="crew-sidebar__aggregate-value">{Math.round(peakTeamStress)}%</strong>
                </div>
              </div>
            </header>
          <ul className="crew-sidebar__list">
            {crewState.map((member) => {
              const metrics = crewMetrics[member.id]
              const stressValue = metrics ? Math.round(metrics.stress) : 0
              const fatigueValue = metrics ? Math.round(metrics.fatigue) : 0
              const efficiency = metrics ? Math.round(metrics.efficiency * 100) : 100
              const memberStress = describeStressLevel(stressValue)
              const rotationInfo = metrics
                ? `${metrics.awakeUnits} on watch / ${metrics.restingUnits} resting`
                : 'Establishing sleep cycles'
              return (
                <li key={member.id}>
                  <div className="crew-list__header">
                    <div>
                      <span className="crew-role">{member.role}</span>
                      <p className="crew-list__name">{member.name}</p>
                    </div>
                    <span className="crew-units">{member.units} units</span>
                  </div>
                  <div className="crew-metric" role="group" aria-label={`${member.name} stress level`}>
                    <span className="crew-metric__label">Stress</span>
                    <div
                      className="crew-metric__bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={stressValue}
                    >
                      <span
                        className={`crew-metric__fill crew-metric__fill--${memberStress.tone}`}
                        style={{ width: `${stressValue}%` }}
                      />
                    </div>
                    <span className="crew-metric__value">{stressValue}%</span>
                  </div>
                  <div className="crew-metric" role="group" aria-label={`${member.name} fatigue level`}>
                    <span className="crew-metric__label">Fatigue</span>
                    <div
                      className="crew-metric__bar"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={fatigueValue}
                    >
                      <span className="crew-metric__fill crew-metric__fill--fatigue" style={{ width: `${fatigueValue}%` }} />
                    </div>
                    <span className="crew-metric__value">{fatigueValue}%</span>
                  </div>
                  <div className="crew-metric crew-metric--inline" role="group" aria-label={`${member.name} efficiency`}>
                    <span className="crew-metric__label">Efficiency</span>
                    <strong className="crew-metric__value">{efficiency}%</strong>
                    <span className="crew-metric__subtle">{rotationInfo}</span>
                  </div>
                </li>
              )
            })}
          </ul>
          <button type="button" className="crew-sidebar__button" onClick={onOpenBriefing}>
            View crew instructions
          </button>
          <p className="crew-sidebar__hint">
            Expanding the crew briefing pauses the voyage so you can adjust directives, alliances, and staffing.
          </p>
        </div>
      )}
    </aside>
  )
}

function CrewBriefingOverlay({
  crewState,
  crewMetrics,
  onClose,
  onUpdateInstructions,
  onUpdateAlliances,
  onUpdateUnits,
  canModifyStaffing,
  resourceStats,
}) {
  return (
    <div className="crew-briefing" role="dialog" aria-modal="true">
      <div className="crew-briefing__panel">
        <header>
          <h2>Crew Instructions & Alliances</h2>
          <p>
            Adjust guidance, collaborative ties, and staffing for each specialist. Changes apply immediately once you resume
            the voyage.
          </p>
          <div className="crew-briefing__summary">
            <div>
              <span className="crew-briefing__summary-label">Fuel burn</span>
              <strong>{formatLiters(resourceStats.burnRate, 0)} / hr</strong>
            </div>
            <div>
              <span className="crew-briefing__summary-label">Fuel used</span>
              <strong>{resourceStats.fuelPercentage.toFixed(1)}%</strong>
            </div>
            <div>
              <span className="crew-briefing__summary-label">Endurance</span>
              <strong>{formatHours(resourceStats.enduranceHours)}</strong>
            </div>
          </div>
        </header>
        <div className="crew-briefing__content">
          {crewState.map((member) => {
            const metrics = crewMetrics[member.id]
            const stress = metrics ? Math.round(metrics.stress) : 0
            const fatigue = metrics ? Math.round(metrics.fatigue) : 0
            const efficiency = metrics ? Math.round(metrics.efficiency * 100) : 100
            const stressInfo = describeStressLevel(stress)
            const totalTeams = metrics?.totalTeams ?? Math.max(1, Math.ceil(member.units / (member.teamSize ?? 1)))
            const shiftProgress = metrics ? metrics.clock % SHIFT_LENGTH_HOURS : 0
            const timeToRotation = metrics
              ? shiftProgress === 0
                ? SHIFT_LENGTH_HOURS
                : SHIFT_LENGTH_HOURS - shiftProgress
              : SHIFT_LENGTH_HOURS

            return (
              <section key={member.id} className="crew-card">
                <header className="crew-card__header">
                  <div>
                    <h3>{member.name}</h3>
                    <p>{member.role}</p>
                  </div>
                  <span>{member.units} units</span>
                </header>
                <div className={`crew-card__stress crew-card__stress--${stressInfo.tone}`}>
                  <div>
                    <span className="crew-card__stress-label">Stress posture</span>
                    <strong>{stressInfo.label}</strong>
                  </div>
                  <p>
                    Stress {stress}% · Fatigue {fatigue}% · Efficiency {efficiency}% · Teams {totalTeams}
                  </p>
                  <p>Next rotation in {formatHours(timeToRotation)}</p>
                </div>
                <label className="crew-card__label" htmlFor={`units-${member.id}`}>
                  Staffing level
                </label>
                <input
                  id={`units-${member.id}`}
                  type="range"
                  min={member.minUnits}
                  max={member.maxUnits}
                  value={member.units}
                  onChange={(event) => onUpdateUnits(member.id, Number(event.target.value))}
                  disabled={!canModifyStaffing}
                />
                <div className="crew-card__staffing">
                  <span>{member.units} specialists</span>
                  <span>
                    Allowable range {member.minUnits}–{member.maxUnits}
                  </span>
                </div>
                <p className="crew-card__hint">
                  {canModifyStaffing
                    ? 'Increase teams for healthier sleep rotations at the cost of fuel and supplies.'
                    : 'Staffing locked while underway — adjustments resume once the vessel is docked.'}
                </p>
                <label className="crew-card__label" htmlFor={`instructions-${member.id}`}>
                  Directives
                </label>
                <textarea
                  id={`instructions-${member.id}`}
                  value={member.instructions}
                  onChange={(event) => onUpdateInstructions(member.id, event.target.value)}
                  rows={3}
                />
                <label className="crew-card__label" htmlFor={`alliances-${member.id}`}>
                  Collaborative alliances (comma separated)
                </label>
                <input
                  id={`alliances-${member.id}`}
                  value={member.alliances.join(', ')}
                  onChange={(event) =>
                    onUpdateAlliances(
                      member.id,
                      event.target.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    )
                  }
                />
              </section>
            )
          })}
        </div>
        <footer>
          <button type="button" onClick={onClose} className="crew-briefing__close">
            Close and resume voyage
          </button>
        </footer>
      </div>
    </div>
  )
}

function ShipLog({ entries }) {
  if (!entries.length) {
    return (
      <section className="ship-log" aria-label="Crew exchanges">
        <h2>Coordinated Thoughts</h2>
        <div className="ship-log__empty">Crew transcripts will populate once the mission begins.</div>
      </section>
    )
  }

  return (
    <section className="ship-log" aria-label="Crew exchanges">
      <h2>Coordinated Thoughts</h2>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id} className="ship-log__entry">
            <header>
              <span className="ship-log__author">{entry.author}</span>
              <time>{new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
            </header>
            {entry.chainOfThought?.length ? (
              <ul className="ship-log__thoughts">
                {entry.chainOfThought.map((thought, index) => (
                  <li key={`${entry.id}-thought-${index}`}>{thought}</li>
                ))}
              </ul>
            ) : null}
            <p>{entry.transcript}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function RouteSelector({
  origin,
  destination,
  onOriginChange,
  onDestinationChange,
  availableOrigins,
  availableDestinations,
  currentRoute,
  isLocked,
  isCollapsed,
  onToggleCollapse,
}) {
  return (
    <section className={isCollapsed ? 'route-selector route-selector--collapsed' : 'route-selector'} aria-label="Route selection">
      <header className="route-selector__header">
        <div>
          <h2>Route Configuration</h2>
          <p>Define the operational corridor and cable partner.</p>
        </div>
        <button type="button" onClick={onToggleCollapse} aria-expanded={!isCollapsed}>
          {isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>
      {isCollapsed ? null : (
        <div className="route-selector__body">
          <div className="route-selector__fields">
            <label htmlFor="origin-port">Origin port</label>
            <select
              id="origin-port"
              value={origin ?? ''}
              onChange={(event) => onOriginChange(event.target.value || null)}
              disabled={isLocked}
            >
              <option value="">Select origin</option>
              {availableOrigins.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name} — {port.country}
                </option>
              ))}
            </select>
          </div>
          <div className="route-selector__fields">
            <label htmlFor="destination-port">Destination port</label>
            <select
              id="destination-port"
              value={destination ?? ''}
              onChange={(event) => onDestinationChange(event.target.value || null)}
              disabled={!origin || isLocked}
            >
              <option value="">Select destination</option>
              {availableDestinations.map((port) => (
                <option key={port.id} value={port.id}>
                  {port.name} — {port.country}
                </option>
              ))}
            </select>
          </div>
          {currentRoute ? (
            <div className="route-selector__meta">
              <p>
                Cable system: <strong>{currentRoute.cable}</strong>
              </p>
              <p>
                Estimated traversal: <strong>{currentRoute.travelMinutes} minutes</strong>
              </p>
            </div>
          ) : (
            <p className="route-selector__hint">
              Select a supported origin and destination to review the submarine path.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function MissionControls({
  elapsedMs,
  onStart,
  onPauseToggle,
  onRestart,
  canStart,
  isRunning,
  isPaused,
  isCollapsed,
  onToggleCollapse,
}) {
  return (
    <section className={isCollapsed ? 'mission-controls mission-controls--collapsed' : 'mission-controls'}>
      <header className="mission-controls__header">
        <div>
          <h2>Mission Flow</h2>
          <p>Coordinate launch authority and voyage tempo.</p>
        </div>
        <button type="button" onClick={onToggleCollapse} aria-expanded={!isCollapsed}>
          {isCollapsed ? 'Expand' : 'Collapse'}
        </button>
      </header>
      {isCollapsed ? (
        <div className="mission-controls__summary">Elapsed {formatTime(elapsedMs)}</div>
      ) : (
        <div className="mission-controls__body">
          <div className="mission-status">
            <span>Elapsed</span>
            <strong>{formatTime(elapsedMs)}</strong>
          </div>
          <div className="mission-buttons">
            <button type="button" onClick={onStart} disabled={!canStart}>
              Launch voyage
            </button>
            <button type="button" onClick={onPauseToggle} disabled={!isRunning}>
              {isPaused ? 'Resume' : 'Pause'}
            </button>
            <button type="button" onClick={onRestart}>
              Restart
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

function MapViewport({
  route,
  progress,
  milestones,
  submarinePosition,
  obstacles,
  onAddObstacle,
  isRunning,
  isCollapsed,
  onToggleCollapse,
  telemetrySummary,
  resourceStats,
  aggregateStress,
  stressGrade,
}) {
  const projectedRoute = useMemo(() => {
    if (!route) return []
    return route.path.map((point) => projectPoint(point))
  }, [route])

  const projectedMilestones = useMemo(() => {
    if (!route) return []
    return milestones.map((milestone) => {
      if (!route.path.length) return null
      const totalSegments = route.path.length - 1
      const targetDistance = milestone.ratio * totalSegments
      const baseIndex = Math.min(Math.floor(targetDistance), totalSegments - 1)
      const segmentRatio = targetDistance - baseIndex
      const start = route.path[baseIndex]
      const end = route.path[baseIndex + 1]
      const latitude = start.latitude + (end.latitude - start.latitude) * segmentRatio
      const longitude = start.longitude + (end.longitude - start.longitude) * segmentRatio
      return {
        id: milestone.id,
        label: milestone.label,
        coordinates: projectPoint({ latitude, longitude }),
      }
    })
  }, [route, milestones])

  const projectedObstacles = useMemo(() => {
    if (!route) return []
    return obstacles.map((obstacle) => {
      if (!route.path.length) return null
      const totalSegments = route.path.length - 1
      const targetDistance = obstacle.ratio * totalSegments
      const baseIndex = Math.min(Math.floor(targetDistance), totalSegments - 1)
      const segmentRatio = targetDistance - baseIndex
      const start = route.path[baseIndex]
      const end = route.path[baseIndex + 1]
      const latitude = start.latitude + (end.latitude - start.latitude) * segmentRatio
      const longitude = start.longitude + (end.longitude - start.longitude) * segmentRatio
      return {
        id: obstacle.id,
        type: obstacle.type,
        coordinates: projectPoint({ latitude, longitude }),
        resolved: obstacle.resolved,
      }
    })
  }, [route, obstacles])

  return (
    <section className={isCollapsed ? 'map-panel map-panel--collapsed' : 'map-panel'} aria-label="Operational map">
      <header className="map-panel__header">
        <div>
          <h2>Operational Map</h2>
          <p>
            Team stress {stressGrade.label.toLowerCase()} ({Math.round(aggregateStress)}%) · Fuel used {resourceStats.fuelPercentage.toFixed(1)}%
          </p>
        </div>
        <button type="button" onClick={onToggleCollapse} aria-expanded={!isCollapsed}>
          {isCollapsed ? 'Expand map' : 'Collapse map'}
        </button>
      </header>
      {isCollapsed ? (
        <div className="map-panel__stats" role="list">
          <div className="map-panel__stat" role="listitem">
            <span>Elapsed</span>
            <strong>{telemetrySummary.elapsedLabel}</strong>
          </div>
          <div className="map-panel__stat" role="listitem">
            <span>Milestones</span>
            <strong>{telemetrySummary.milestonesLabel}</strong>
          </div>
          <div className="map-panel__stat" role="listitem">
            <span>Remaining distance</span>
            <strong>{telemetrySummary.remainingDistanceLabel}</strong>
          </div>
          <div className="map-panel__stat" role="listitem">
            <span>Depth</span>
            <strong>{telemetrySummary.depthLabel}</strong>
          </div>
          <div className="map-panel__stat" role="listitem">
            <span>Crew size</span>
            <strong>{telemetrySummary.crewLabel}</strong>
          </div>
        </div>
      ) : (
        <>
          <div className="map-wrapper">
            <svg
              className="map-viewport"
              role="img"
              aria-label="World map with submarine route"
              viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
            >
              <g className="world-outline">
                {worldPolygons.map((feature) => (
                  <polygon
                    key={feature.id}
                    points={feature.coordinates
                      .map(([lon, lat]) => projectPoint({ latitude: lat, longitude: lon }).join(','))
                      .join(' ')}
                  />
                ))}
              </g>
              {projectedRoute.length ? (
                <g className="route-path">
                  <polyline points={projectedRoute.map(([x, y]) => `${x},${y}`).join(' ')} />
                  {projectedMilestones.map((milestone) =>
                    milestone ? (
                      <g
                        key={milestone.id}
                        className="route-milestone"
                        transform={`translate(${milestone.coordinates[0]}, ${milestone.coordinates[1]})`}
                      >
                        <circle r="8" />
                        <text x="12" y="4">
                          {milestone.label}
                        </text>
                      </g>
                    ) : null,
                  )}
                </g>
              ) : null}
              {projectedObstacles.map((obstacle) => {
                if (!obstacle) return null
                const config = OBSTACLE_TYPES[obstacle.type] ?? {}
                return (
                  <g
                    key={obstacle.id}
                    className={obstacle.resolved ? 'map-obstacle map-obstacle--resolved' : 'map-obstacle'}
                    transform={`translate(${obstacle.coordinates[0]}, ${obstacle.coordinates[1]})`}
                  >
                    <circle r="14" fill={config.iconColor ?? '#ffffff'} />
                    <path d="M-10,0 L10,0 M0,-10 L0,10" stroke={config.iconColor ?? '#ffffff'} />
                    <text x="0" y="26" textAnchor="middle">
                      {config.label ?? 'Hazard'}
                    </text>
                  </g>
                )
              })}
              {submarinePosition ? (
                <g className="submarine" transform={`translate(${submarinePosition[0]}, ${submarinePosition[1]})`}>
                  <ellipse cx="0" cy="0" rx="26" ry="12" />
                  <rect x="-8" y="-14" width="16" height="10" rx="4" />
                  <polygon points="26,0 16,-8 16,8" />
                  <circle cx="-14" cy="0" r="4" />
                </g>
              ) : null}
              {route ? (
                <g className="port-labels">
                  <text {...anchorText(resolvePort(route.origin))}>{resolvePort(route.origin).name}</text>
                  <text {...anchorText(resolvePort(route.destination))}>{resolvePort(route.destination).name}</text>
                </g>
              ) : null}
              <text className="progress-indicator" x={MAP_WIDTH - 24} y={MAP_HEIGHT - 24} textAnchor="end">
                {Math.round(progress * 100)}% complete
              </text>
            </svg>
            <div className="map-overlay map-overlay--top">
              <div className={`map-overlay__chip map-overlay__chip--${stressGrade.tone}`}>
                <span>Team stress</span>
                <strong>
                  {stressGrade.label} ({Math.round(aggregateStress)}%)
                </strong>
              </div>
              <div className="map-overlay__chip">
                <span>Depth</span>
                <strong>{telemetrySummary.depthLabel}</strong>
              </div>
            </div>
            <div className="obstacle-console" aria-hidden={!isRunning}>
              <strong>Inject challenges</strong>
              {Object.entries(OBSTACLE_TYPES).map(([type, config]) => (
                <button key={type} type="button" onClick={() => onAddObstacle(type)} disabled={!route || !isRunning}>
                  {config.label}
                </button>
              ))}
            </div>
          </div>
          <div className="map-panel__footer">
            <div className="resource-grid">
              <div>
                <span>Fuel consumed</span>
                <strong>{resourceStats.fuelPercentage.toFixed(1)}%</strong>
                <p>
                  {formatLiters(resourceStats.fuelConsumedLiters, 0)} of {formatLiters(resourceStats.tankCapacity, 0)}
                </p>
              </div>
              <div>
                <span>Burn rate</span>
                <strong>{formatLiters(resourceStats.burnRate, 0)} / hr</strong>
                <p>Stress factor ×{resourceStats.stressFactor.toFixed(2)}</p>
              </div>
              <div>
                <span>Endurance</span>
                <strong>{formatHours(resourceStats.enduranceHours)}</strong>
                <p>Projected range {formatNauticalMiles(resourceStats.projectedRangeNm)}</p>
              </div>
              <div>
                <span>Crew load</span>
                <strong>{telemetrySummary.crewLabel}</strong>
                <p>{telemetrySummary.milestonesLabel}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function anchorText(port) {
  const [x, y] = projectPoint({ latitude: port.latitude, longitude: port.longitude })
  return {
    x,
    y: y - 16,
    textAnchor: 'middle',
  }
}

function App() {
  const [crewState, setCrewState] = useState(() =>
    crewManifest.map((member) => ({
      ...member,
      baseUnits: member.units,
      instructions: member.defaultInstructions.slice(),
    })),
  )
  const [crewMetrics, setCrewMetrics] = useState(() => {
    const initial = {}
    crewManifest.forEach((member) => {
      initial[member.id] = createInitialMetrics(member)
    })
    return initial
  })
  const crewMetricsRef = useRef(crewMetrics)
  const crewByIdRef = useRef(new Map())
  const [origin, setOrigin] = useState(null)
  const [destination, setDestination] = useState(null)
  const [progress, setProgress] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [isRunning, setIsRunning] = useState(false)
  const [isPaused, setIsPaused] = useState(true)
  const [isCrewExpanded, setIsCrewExpanded] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [isRouteCollapsed, setIsRouteCollapsed] = useState(false)
  const [isMissionCollapsed, setIsMissionCollapsed] = useState(false)
  const [isMapCollapsed, setIsMapCollapsed] = useState(false)
  const [hasLaunched, setHasLaunched] = useState(false)
  const resumeAfterOverlayRef = useRef(false)
  const [logEntries, setLogEntries] = useState([])
  const [triggeredMilestones, setTriggeredMilestones] = useState([])
  const [obstacles, setObstacles] = useState([])
  const previousRouteKeyRef = useRef('none')
  const [peakTeamStress, setPeakTeamStress] = useState(0)

  const animationFrameRef = useRef(null)
  const lastTickRef = useRef(null)
  const obstacleTimersRef = useRef(new Set())
  const heartbeatIntervalRef = useRef(null)
  const crewHeartbeatIndexRef = useRef(0)
  const latestTelemetryRef = useRef({ progress: 0, elapsedMs: 0 })
  const lastElapsedRef = useRef(0)

  const currentRoute = useMemo(() => {
    if (!origin || !destination) return null
    return routes.find((route) => route.origin === origin && route.destination === destination) ?? null
  }, [origin, destination])

  const routeKey = currentRoute ? `${currentRoute.origin}-${currentRoute.destination}` : 'none'

  const pushLogEntry = useCallback((entry) => {
    setLogEntries((entries) => [entry, ...entries])
  }, [])

  const scheduleLogEntry = useCallback(
    (delay, factory) => {
      const timeoutId = setTimeout(() => {
        obstacleTimersRef.current.delete(timeoutId)
        pushLogEntry(factory())
      }, delay)
      obstacleTimersRef.current.add(timeoutId)
    },
    [pushLogEntry],
  )

  useEffect(() => {
    crewMetricsRef.current = crewMetrics
  }, [crewMetrics])

  const crewById = useMemo(() => {
    const map = new Map()
    crewState.forEach((member) => map.set(member.id, member))
    return map
  }, [crewState])

  useEffect(() => {
    crewByIdRef.current = crewById
  }, [crewById])

  const adjustCrewStress = useCallback((crewIds, stressDelta, fatigueDelta = 0) => {
    setCrewMetrics((metrics) => {
      const next = { ...metrics }
      crewIds.forEach((id) => {
        const current = next[id]
        if (!current) return
        next[id] = {
          ...current,
          stress: clamp(current.stress + stressDelta, 0, 100),
          fatigue: clamp(current.fatigue + fatigueDelta, 0, 100),
        }
      })
      return next
    })
  }, [])

  useEffect(() => {
    if (previousRouteKeyRef.current !== routeKey) {
      setProgress(0)
      setElapsedMs(0)
      setIsRunning(false)
      setIsPaused(true)
      setTriggeredMilestones([])
      setLogEntries([])
      setHasLaunched(false)
      setObstacles([])
      setIsMapCollapsed(false)
      obstacleTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
      obstacleTimersRef.current.clear()
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
      crewHeartbeatIndexRef.current = 0
      lastElapsedRef.current = 0
      setCrewMetrics(() => {
        const initial = {}
        crewState.forEach((member) => {
          initial[member.id] = createInitialMetrics(member)
        })
        return initial
      })
      previousRouteKeyRef.current = routeKey
      setPeakTeamStress(0)
    }
  }, [routeKey, crewState])

  useEffect(
    () => () => {
      obstacleTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
      obstacleTimersRef.current.clear()
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
    },
    [],
  )

  useEffect(() => {
    setCrewMetrics((metrics) => {
      const next = { ...metrics }
      crewState.forEach((member) => {
        const existing = next[member.id] ?? createInitialMetrics(member)
        const teamSize = member.teamSize ?? existing.teamSize
        const totalTeams = Math.max(1, Math.ceil(member.units / teamSize))
        const awakeUnits = Math.min(member.units, teamSize)
        next[member.id] = {
          ...existing,
          teamSize,
          totalTeams,
          awakeUnits,
          restingUnits: Math.max(0, member.units - awakeUnits),
        }
      })
      return next
    })
  }, [crewState])

  const buildStressNotes = useCallback(
    (crewId) => {
      const metrics = crewMetricsRef.current[crewId]
      const crewMember = crewByIdRef.current.get(crewId)
      if (!metrics || !crewMember) return []
      const grade = describeStressLevel(metrics.stress)
      const efficiency = Math.round(metrics.efficiency * 100)
      const rotation = metrics.totalTeams > 1
        ? `${metrics.awakeUnits} on watch / ${metrics.restingUnits} resting`
        : 'Entire team on watch'
      return [
        `Stress posture: ${grade.label} (${Math.round(metrics.stress)}%).`,
        `Rotation: ${rotation}.`,
        `Efficiency holding at ${efficiency}% for ${crewMember.role}.`,
      ]
    },
    [],
  )

  const availableOrigins = useMemo(() => {
    const supportedOrigins = new Set(routes.map((route) => route.origin))
    return ports.filter((port) => supportedOrigins.has(port.id))
  }, [])

  const availableDestinations = useMemo(() => {
    if (!origin) return []
    const supportedDestinations = new Set(
      routes.filter((route) => route.origin === origin).map((route) => route.destination),
    )
    return ports.filter((port) => supportedDestinations.has(port.id))
  }, [origin])

  useEffect(() => {
    latestTelemetryRef.current = { progress, elapsedMs }
  }, [progress, elapsedMs])

  const submarinePosition = useMemo(() => {
    if (!currentRoute) return null
    if (!currentRoute.path.length) return null
    const totalSegments = currentRoute.path.length - 1
    if (totalSegments <= 0) return projectPoint(currentRoute.path[0])
    const targetDistance = progress * totalSegments
    const baseIndex = Math.min(Math.floor(targetDistance), totalSegments - 1)
    const segmentRatio = targetDistance - baseIndex
    const start = currentRoute.path[baseIndex]
    const end = currentRoute.path[baseIndex + 1]
    const latitude = start.latitude + (end.latitude - start.latitude) * segmentRatio
    const longitude = start.longitude + (end.longitude - start.longitude) * segmentRatio
    return projectPoint({ latitude, longitude })
  }, [currentRoute, progress])

  useEffect(() => {
    if (!isRunning || isPaused || !currentRoute) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      lastTickRef.current = null
      return undefined
    }

    const travelMs = currentRoute.travelMinutes * 60 * 1000

    const step = (timestamp) => {
      if (lastTickRef.current == null) {
        lastTickRef.current = timestamp
        animationFrameRef.current = requestAnimationFrame(step)
        return
      }
      const delta = (timestamp - lastTickRef.current) * TIME_SCALE
      lastTickRef.current = timestamp
      let completed = false
      setElapsedMs((previous) => {
        const next = Math.min(previous + delta, travelMs)
        const progressValue = next / travelMs
        setProgress(progressValue)
        if (next >= travelMs) {
          completed = true
        }
        return next
      })

      if (completed) {
        setIsRunning(false)
        setIsPaused(true)
        return
      }

      animationFrameRef.current = requestAnimationFrame(step)
    }

    animationFrameRef.current = requestAnimationFrame(step)
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [isRunning, isPaused, currentRoute])

  useEffect(() => {
    if (!obstacles.some((obstacle) => !obstacle.resolved)) return
    const resolvedNow = []
    setObstacles((current) => {
      let changed = false
      const next = current.map((obstacle) => {
        const clearanceThreshold = Math.min(obstacle.ratio + 0.04, 0.98)
        if (!obstacle.resolved && progress >= clearanceThreshold) {
          resolvedNow.push(obstacle)
          changed = true
          return { ...obstacle, resolved: true }
        }
        return obstacle
      })
      return changed ? next : current
    })

    resolvedNow.forEach((obstacle) => {
      const config = OBSTACLE_TYPES[obstacle.type]
      if (!config) return
      const crewIds = ['captain', 'navigator', 'operations', 'engineer', 'intel']
      adjustCrewStress(crewIds, -5, -3)
      pushLogEntry({
        id: createId('log'),
        type: 'crew',
        author: 'Chief Ava Rahman',
        role: 'Engineering',
        transcript: `${config.label} cleared. Engineering returning propulsion mix to cruise settings.`,
        chainOfThought: [
          'Confirming structural sensors back within norms.',
          'Rebalancing reactor output to standard cruise.',
          'Logging clearance with operations.',
          ...buildStressNotes('engineer'),
        ],
        timestamp: new Date().toISOString(),
      })
      const cleanupId = setTimeout(() => {
        setObstacles((current) => current.filter((item) => item.id !== obstacle.id))
        obstacleTimersRef.current.delete(cleanupId)
      }, 4500)
      obstacleTimersRef.current.add(cleanupId)
    })
  }, [progress, obstacles, pushLogEntry, adjustCrewStress])

  useEffect(() => {
    if (!currentRoute) return
    currentRoute.milestones.forEach((milestone) => {
      if (progress >= milestone.ratio && !triggeredMilestones.includes(milestone.id)) {
        setTriggeredMilestones((state) => [...state, milestone.id])
        const timestamp = new Date().toISOString()
        const systemEntry = {
          id: createId('log'),
          type: 'system',
          author: 'Mission Control',
          transcript: `${milestone.label}: ${milestone.description}`,
          chainOfThought: [],
          timestamp,
        }
        setLogEntries((entries) => [systemEntry, ...entries])

        milestone.focusRoles.forEach(async (crewId) => {
          const crewMember = crewState.find((member) => member.id === crewId)
          if (!crewMember) return
          adjustCrewStress([crewId], -6, -2)
          const thought = await requestCrewThought({
            crewMember,
            milestone,
            route: currentRoute,
            elapsedMinutes: (elapsedMs / 1000) / 60,
          })
          setLogEntries((entries) => [
            {
              id: createId('log'),
              type: 'crew',
              author: crewMember.name,
              role: crewMember.role,
              transcript: thought.transcript,
              chainOfThought: [...thought.chainOfThought, ...buildStressNotes(crewId)],
              provider: thought.provider,
              timestamp: new Date().toISOString(),
            },
            ...entries,
          ])
        })
      }
    })
  }, [progress, currentRoute, crewState, elapsedMs, triggeredMilestones, adjustCrewStress, buildStressNotes])

  useEffect(() => {
    if (progress >= 1 && isRunning) {
      setIsRunning(false)
      setIsPaused(true)
      setLogEntries((entries) => [
        {
          id: createId('log'),
          type: 'system',
          author: 'Mission Control',
          transcript: 'Destination secured. Cable landing verification complete.',
          chainOfThought: [],
          timestamp: new Date().toISOString(),
        },
        ...entries,
      ])
    }
  }, [progress, isRunning])

  const updateCrewMetrics = useCallback(
    (deltaMs) => {
      if (!isRunning || isPaused) return
      if (deltaMs <= 0) return
      const deltaMissionMinutes = deltaMs / 60000
      const deltaSimMinutes = deltaMissionMinutes * SIMULATION_MINUTES_PER_MISSION_MINUTE
      const deltaSimHours = deltaSimMinutes / 60
      setCrewMetrics((metrics) => {
        const next = { ...metrics }
        crewState.forEach((member) => {
          const entry = next[member.id] ?? createInitialMetrics(member)
          const teamSize = member.teamSize ?? entry.teamSize
          const totalTeams = Math.max(1, Math.ceil(member.units / teamSize))
          const cycleHours = SHIFT_LENGTH_HOURS * totalTeams
          const newClock = (entry.clock + deltaSimHours) % cycleHours
          const shiftIndex = Math.min(totalTeams - 1, Math.floor(newClock / SHIFT_LENGTH_HOURS))
          const awakeUnits = Math.min(member.units, teamSize)
          const restingUnits = Math.max(0, member.units - awakeUnits)
          const awakeRatio = member.units > 0 ? awakeUnits / member.units : 1
          const restRatio = member.units > 0 ? restingUnits / member.units : 0
          let fatigue = entry.fatigue + deltaSimHours * (FATIGUE_RATE_ON_DUTY * awakeRatio + (restRatio === 0 ? 1.1 : 0))
          fatigue -= deltaSimHours * FATIGUE_RECOVERY_PER_HOUR * restRatio * (1 + Math.max(0, totalTeams - 1) * 0.12)
          fatigue = clamp(fatigue, 0, 100)
          let stress = entry.stress + deltaSimHours * (STRESS_RATE_ON_DUTY * awakeRatio + (fatigue / 100) * STRESS_FROM_FATIGUE)
          stress -= deltaSimHours * STRESS_RECOVERY_PER_HOUR * restRatio
          stress = clamp(stress, 0, 100)
          const efficiencyPenalty = fatigue * 0.004 + stress * 0.0035
          const efficiency = clamp(1 - efficiencyPenalty, 0.35, 1)
          next[member.id] = {
            ...entry,
            stress,
            fatigue,
            efficiency,
            awakeUnits,
            restingUnits,
            totalTeams,
            teamSize,
            clock: newClock,
            shiftIndex,
          }
        })
        return next
      })
    },
    [crewState, isPaused, isRunning],
  )

  useEffect(() => {
    const delta = elapsedMs - lastElapsedRef.current
    lastElapsedRef.current = elapsedMs
    updateCrewMetrics(delta)
  }, [elapsedMs, updateCrewMetrics])

  useEffect(() => {
    if (!isRunning || isPaused) {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
      return undefined
    }

    const interval = setInterval(() => {
      const sequence = HEARTBEAT_TASKS[crewHeartbeatIndexRef.current % HEARTBEAT_TASKS.length]
      crewHeartbeatIndexRef.current += 1
      const crewMember = crewState.find((member) => member.id === sequence.crewId)
      if (!crewMember) return
      const telemetry = latestTelemetryRef.current
      const metrics = crewMetricsRef.current[crewMember.id]
      pushLogEntry({
        id: createId('log'),
        type: 'crew',
        author: crewMember.name,
        role: crewMember.role,
        transcript: sequence.buildTranscript({ crewMember, telemetry, metrics }),
        chainOfThought: [...sequence.buildThoughts({ crewMember, telemetry, metrics }), ...buildStressNotes(crewMember.id)],
        timestamp: new Date().toISOString(),
      })
    }, Math.max(4000, 12000 / Math.max(TIME_SCALE, 0.1)))

    heartbeatIntervalRef.current = interval

    return () => {
      clearInterval(interval)
      heartbeatIntervalRef.current = null
    }
  }, [isRunning, isPaused, crewState, pushLogEntry, buildStressNotes])

  const canStart = Boolean(currentRoute) && !isRunning

  const handleStart = () => {
    if (!currentRoute) return
    setProgress(0)
    setElapsedMs(0)
    setTriggeredMilestones([])
    setLogEntries([
      {
        id: createId('log'),
        type: 'system',
        author: 'Mission Control',
        transcript: `Voyage initiated from ${resolvePort(currentRoute.origin).name} to ${resolvePort(currentRoute.destination).name}.`,
        chainOfThought: [],
        timestamp: new Date().toISOString(),
      },
    ])
    setIsRunning(true)
    setIsPaused(false)
    setHasLaunched(true)
    setObstacles([])
    crewHeartbeatIndexRef.current = 0
    lastElapsedRef.current = 0
    setPeakTeamStress(aggregateTeamStress)
    setCrewMetrics(() => {
      const initial = {}
      crewState.forEach((member) => {
        initial[member.id] = createInitialMetrics(member)
      })
      return initial
    })
  }

  const handlePauseToggle = () => {
    if (!isRunning) return
    setIsPaused((state) => !state)
  }

  const handleRestart = () => {
    setProgress(0)
    setElapsedMs(0)
    setIsRunning(false)
    setIsPaused(true)
    setTriggeredMilestones([])
    setLogEntries([])
    setHasLaunched(false)
    setObstacles([])
    setIsMapCollapsed(false)
    obstacleTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
    obstacleTimersRef.current.clear()
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    crewHeartbeatIndexRef.current = 0
    lastElapsedRef.current = 0
    setPeakTeamStress(0)
    setCrewMetrics(() => {
      const initial = {}
      crewState.forEach((member) => {
        initial[member.id] = createInitialMetrics(member)
      })
      return initial
    })
  }

  const openCrewBriefing = () => {
    resumeAfterOverlayRef.current = isRunning && !isPaused
    setIsPaused(true)
    setIsCrewExpanded(true)
  }

  const closeCrewBriefing = () => {
    setIsCrewExpanded(false)
    if (resumeAfterOverlayRef.current) {
      setIsPaused(false)
    }
    resumeAfterOverlayRef.current = false
  }

  const updateInstructions = (crewId, instructions) => {
    setCrewState((state) => state.map((member) => (member.id === crewId ? { ...member, instructions } : member)))
  }

  const updateAlliances = (crewId, alliances) => {
    setCrewState((state) => state.map((member) => (member.id === crewId ? { ...member, alliances } : member)))
  }

  const updateUnits = (crewId, units) => {
    setCrewState((state) =>
      state.map((member) => {
        if (member.id !== crewId) return member
        const boundedUnits = clamp(units, member.minUnits, member.maxUnits)
        return { ...member, units: boundedUnits }
      }),
    )
  }

  const addObstacle = useCallback(
    (type) => {
      if (!currentRoute) return
      const config = OBSTACLE_TYPES[type]
      if (!config) return
      const ratio = Math.min(progress + 0.08, 0.92)
      const obstacle = { id: createId('obstacle'), type, ratio, resolved: false }
      setObstacles((state) => [...state, obstacle])
      const timestamp = new Date().toISOString()
      pushLogEntry({
        id: createId('log'),
        type: 'system',
        author: 'Mission Control',
        transcript: `${config.label}: ${config.description}`,
        chainOfThought: [],
        timestamp,
      })
      adjustCrewStress(['intel', 'captain', 'operations', 'navigator', 'engineer'], 9, 3)
      scheduleLogEntry(400, () => ({
        id: createId('log'),
        type: 'crew',
        author: "Analyst Priya N'Dour",
        role: 'Intelligence',
        transcript: config.analystReport,
        chainOfThought: [
          'Refreshing sensor fusion loop for obstacle classification.',
          `Estimating clearance vector for ${config.label.toLowerCase()}.`,
          'Relaying recommendations to the bridge team.',
          ...buildStressNotes('intel'),
        ],
        timestamp: new Date().toISOString(),
      }))
      scheduleLogEntry(950, () => ({
        id: createId('log'),
        type: 'crew',
        author: 'Captain Mira Chen',
        role: 'Mission Command',
        transcript: config.captainDirective,
        chainOfThought: [
          'Reviewing analyst summary and navigational offsets.',
          'Coordinating ballast and propulsion directives.',
          'Tasking operations for contingency readiness.',
          ...buildStressNotes('captain'),
        ],
        timestamp: new Date().toISOString(),
      }))
      scheduleLogEntry(1500, () => ({
        id: createId('log'),
        type: 'crew',
        author: 'Warrant Jorge Ibarra',
        role: 'Operations Control',
        transcript: config.operationsFollowUp,
        chainOfThought: [
          'Paging response teams across compartments.',
          'Updating systems checklist for evolving hazard.',
          'Confirming crew execution timelines.',
          ...buildStressNotes('operations'),
        ],
        timestamp: new Date().toISOString(),
      }))
      scheduleLogEntry(2000, () => ({
        id: createId('log'),
        type: 'crew',
        author: 'Lieutenant Theo Park',
        role: 'Navigation',
        transcript: config.navigatorAction,
        chainOfThought: [
          'Projecting detour across plotted bathymetry.',
          'Feeding updated waypoints to helm control.',
          'Verifying clearance margins on cable segment.',
          ...buildStressNotes('navigator'),
        ],
        timestamp: new Date().toISOString(),
      }))
    },
    [currentRoute, progress, pushLogEntry, scheduleLogEntry, adjustCrewStress, buildStressNotes],
  )

  const totalCrewUnits = useMemo(() => crewState.reduce((sum, member) => sum + member.units, 0), [crewState])

  const aggregateTeamStress = useMemo(() => {
    const values = crewState.map((member) => crewMetrics[member.id]?.stress ?? 0)
    if (!values.length) return 0
    return values.reduce((sum, value) => sum + value, 0) / values.length
  }, [crewMetrics, crewState])

  useEffect(() => {
    setPeakTeamStress((prev) => Math.max(prev, aggregateTeamStress))
  }, [aggregateTeamStress])

  const teamStressGrade = useMemo(() => describeStressLevel(aggregateTeamStress), [aggregateTeamStress])

  const currentRouteDistanceNm = useMemo(() => {
    if (!currentRoute) return 0
    return computeRouteDistanceNauticalMiles(currentRoute.path)
  }, [currentRoute])

  const remainingNauticalMiles = useMemo(() => {
    if (!currentRouteDistanceNm) return 0
    return Math.max(0, currentRouteDistanceNm * (1 - progress))
  }, [currentRouteDistanceNm, progress])

  const elapsedSimHours = useMemo(() => {
    const missionMinutes = elapsedMs / 60000
    const simMinutes = missionMinutes * SIMULATION_MINUTES_PER_MISSION_MINUTE
    return simMinutes / 60
  }, [elapsedMs])

  const stressFactor = 1 + (aggregateTeamStress / 100) * STRESS_FUEL_MULTIPLIER
  const burnRate = useMemo(() => {
    const baseRate = BASE_FUEL_BURN_PER_HOUR + totalCrewUnits * ADDITIONAL_BURN_PER_CREW_UNIT
    return baseRate * stressFactor
  }, [totalCrewUnits, stressFactor])

  const fuelConsumedLiters = burnRate * elapsedSimHours
  const fuelPercentage = clamp((fuelConsumedLiters / FUEL_TANK_CAPACITY_LITERS) * 100, 0, 100)
  const enduranceHours = burnRate > 0 ? FUEL_TANK_CAPACITY_LITERS / burnRate : 0
  const projectedRangeNm = burnRate > 0 ? Math.max(0, (FUEL_TANK_CAPACITY_LITERS - fuelConsumedLiters) / burnRate) * 18 : 0

  const resourceStats = {
    burnRate,
    fuelConsumedLiters,
    fuelPercentage,
    enduranceHours,
    tankCapacity: FUEL_TANK_CAPACITY_LITERS,
    stressFactor,
    projectedRangeNm,
  }

  const depthMeters = useMemo(() => {
    if (!currentRoute) return 0
    const baseDepth = 210
    const wave = Math.sin(progress * Math.PI * 1.2) * 35
    const obstacleLoad = obstacles.filter((obstacle) => !obstacle.resolved).length * 12
    const stressEffect = aggregateTeamStress * 0.4
    const milestoneRelief = triggeredMilestones.length * -5
    const value = baseDepth + wave + obstacleLoad + stressEffect + milestoneRelief
    return Math.round(clamp(value, 120, 360))
  }, [currentRoute, progress, obstacles, aggregateTeamStress, triggeredMilestones])

  const telemetrySummary = {
    elapsedLabel: formatTime(elapsedMs),
    milestonesLabel: `${triggeredMilestones.length}/${currentRoute?.milestones.length ?? 0}`,
    remainingDistanceLabel: formatNauticalMiles(remainingNauticalMiles),
    depthLabel: `${depthMeters} m`,
    crewLabel: `${totalCrewUnits} specialists`,
    crewUnits: totalCrewUnits,
  }

  const rotationSummary = useMemo(() => {
    const rotations = crewState
      .map((member) => {
        const metrics = crewMetrics[member.id]
        if (!metrics) return null
        if (metrics.totalTeams <= 1) {
          return `${member.role}: no reserve rotation`
        }
        const shiftProgress = metrics.clock % SHIFT_LENGTH_HOURS
        const hours = shiftProgress === 0 ? SHIFT_LENGTH_HOURS : SHIFT_LENGTH_HOURS - shiftProgress
        return `${member.role}: next team in ${formatHours(hours)}`
      })
      .filter(Boolean)
    if (!rotations.length) {
      return 'Rotation schedule preparing.'
    }
    return rotations[0]
  }, [crewState, crewMetrics])

  const aggregateMilestoneSummary = `${triggeredMilestones.length}/${currentRoute?.milestones.length ?? 0} milestones`


  return (
    <div
      className={
        [
          'app',
          isCrewExpanded ? 'app--briefing' : null,
          isSidebarCollapsed ? 'app--sidebar-collapsed' : null,
        ]
          .filter(Boolean)
          .join(' ')
      }
    >
      <CrewSidebar
        crewState={crewState}
        crewMetrics={crewMetrics}
        aggregateStress={aggregateTeamStress}
        stressGrade={teamStressGrade}
        totalCrewUnits={totalCrewUnits}
        rotationSummary={rotationSummary}
        peakTeamStress={peakTeamStress}
        onOpenBriefing={openCrewBriefing}
        isPaused={isPaused}
        canResume={isRunning}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed((state) => !state)}
      />
      <main className="main-panel">
        <div className="top-controls">
          <RouteSelector
            origin={origin}
            destination={destination}
            onOriginChange={(value) => {
              setOrigin(value)
              setDestination((current) => {
                if (!value) return null
                if (!current) return null
                const valid = routes.some((route) => route.origin === value && route.destination === current)
                return valid ? current : null
              })
            }}
            onDestinationChange={setDestination}
            availableOrigins={availableOrigins}
            availableDestinations={availableDestinations}
            currentRoute={currentRoute}
            isLocked={hasLaunched}
            isCollapsed={isRouteCollapsed}
            onToggleCollapse={() => setIsRouteCollapsed((state) => !state)}
          />
          <MissionControls
            elapsedMs={elapsedMs}
            onStart={handleStart}
            onPauseToggle={handlePauseToggle}
            onRestart={handleRestart}
            canStart={canStart}
            isRunning={isRunning}
            isPaused={isPaused}
            isCollapsed={isMissionCollapsed}
            onToggleCollapse={() => setIsMissionCollapsed((state) => !state)}
          />
        </div>
        <ShipLog entries={logEntries} />
        <MapViewport
          route={currentRoute}
          progress={progress}
          milestones={currentRoute?.milestones ?? []}
          submarinePosition={submarinePosition}
          obstacles={obstacles}
          onAddObstacle={addObstacle}
          isRunning={isRunning && !isPaused}
          isCollapsed={isMapCollapsed}
          onToggleCollapse={() => setIsMapCollapsed((state) => !state)}
          telemetrySummary={{
            ...telemetrySummary,
            milestonesLabel: aggregateMilestoneSummary,
          }}
          resourceStats={resourceStats}
          aggregateStress={aggregateTeamStress}
          stressGrade={teamStressGrade}
        />
      </main>
      {isCrewExpanded ? (
        <CrewBriefingOverlay
          crewState={crewState}
          crewMetrics={crewMetrics}
          onClose={closeCrewBriefing}
          onUpdateInstructions={updateInstructions}
          onUpdateAlliances={updateAlliances}
          onUpdateUnits={updateUnits}
          canModifyStaffing={!hasLaunched}
          resourceStats={resourceStats}
        />
      ) : null}
    </div>
  )
}

export default App
