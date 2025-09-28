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

const OBSTACLE_TYPES = {
  battleship: {
    label: 'Battleship screen',
    description: 'Surface fleet interdiction detected ahead of the cable corridor.',
    iconColor: '#f78c6b',
    analystReport: 'Surface contact designated as hostile destroyer screen. Recommend veer five degrees port and drop to 180m.',
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
    buildTranscript: ({ crewMember }) =>
      `${crewMember.name}: Sensor fusion cycle green; hazards queued for bridge review.`,
    buildThoughts: ({ telemetry }) => [
      'Refreshing maritime intelligence overlays.',
      `Monitoring corridor at ${(telemetry.progress * 100).toFixed(0)}% completion.`,
      'Scheduling next threat broadcast to the command deck.',
    ],
  },
  {
    crewId: 'captain',
    buildTranscript: ({ crewMember }) =>
      `${crewMember.name}: Maintain cadence and report deviations immediately.`,
    buildThoughts: ({ telemetry }) => [
      `Reviewing bridge status at T+${formatTime(telemetry.elapsedMs)}.`,
      'Confirming navigation offsets align with mission plan.',
      'Coordinating readiness posture with operations.',
    ],
  },
  {
    crewId: 'engineer',
    buildTranscript: ({ crewMember }) =>
      `${crewMember.name}: Thermal envelopes steady; rerouting spare capacity to maneuvering.`,
    buildThoughts: () => [
      'Sweeping diagnostics across propulsion pods.',
      'Balancing reactor output with ballast adjustments.',
      'Logging engineering status to systems console.',
    ],
  },
  {
    crewId: 'navigator',
    buildTranscript: ({ crewMember }) =>
      `${crewMember.name}: Waypoints locked — autopilot gliding along the cable grade.`,
    buildThoughts: ({ telemetry }) => [
      `Interpolating bathymetry at ${(telemetry.progress * 100).toFixed(1)}% of route.`,
      'Checking helm inputs for micro-corrections.',
      'Synchronizing updates with mission command.',
    ],
  },
  {
    crewId: 'operations',
    buildTranscript: ({ crewMember }) =>
      `${crewMember.name}: Crew rotations steady; obstacle drills ready on short notice.`,
    buildThoughts: () => [
      'Auditing compartment readiness reports.',
      'Coordinating with engineering for contingency rehearsals.',
      'Updating ship log tasks for next rotation.',
    ],
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

function groupCrewByRole(crew) {
  return crew.reduce((acc, member) => {
    const entry = acc.get(member.role) ?? { units: 0, members: [] }
    entry.units += member.units
    entry.members.push(member)
    acc.set(member.role, entry)
    return acc
  }, new Map())
}

function CrewSidebar({
  crewSummary,
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
            <p>Monitor crew allotments while the submarine follows intercontinental fiber routes.</p>
          </header>
          <ul className="crew-sidebar__list">
            {crewSummary.map(({ role, units }) => (
              <li key={role}>
                <span className="crew-role">{role}</span>
                <span className="crew-units">{units} units</span>
              </li>
            ))}
          </ul>
          <button type="button" className="crew-sidebar__button" onClick={onOpenBriefing}>
            View crew instructions
          </button>
          <p className="crew-sidebar__hint">
            Expanding the crew briefing pauses the voyage so you can adjust directives and alliances.
          </p>
        </div>
      )}
    </aside>
  )
}

function CrewBriefingOverlay({
  crewState,
  onClose,
  onUpdateInstructions,
  onUpdateAlliances,
}) {
  return (
    <div className="crew-briefing" role="dialog" aria-modal="true">
      <div className="crew-briefing__panel">
        <header>
          <h2>Crew Instructions & Alliances</h2>
          <p>
            Adjust guidance and collaborative ties for each specialist. Changes apply immediately once you resume the
            voyage.
          </p>
        </header>
        <div className="crew-briefing__content">
          {crewState.map((member) => (
            <section key={member.id} className="crew-card">
              <header className="crew-card__header">
                <div>
                  <h3>{member.name}</h3>
                  <p>{member.role}</p>
                </div>
                <span>{member.units} units</span>
              </header>
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
          ))}
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
    <div className="map-wrapper">
      <svg
        className="map-viewport"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label="Global submarine cable voyage"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <linearGradient id="ocean" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#082032" />
            <stop offset="100%" stopColor="#0c4160" />
          </linearGradient>
        </defs>
        <rect width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#ocean)" />
        <g className="world-outline">
          {worldPolygons.map((feature) => (
            <polygon
              key={feature.id}
              points={feature.coordinates.map(([lon, lat]) => projectPoint({ latitude: lat, longitude: lon }).join(',')).join(' ')}
            />
          ))}
        </g>
        {projectedRoute.length ? (
          <g className="route-path">
            <polyline points={projectedRoute.map(([x, y]) => `${x},${y}`).join(' ')} />
            {projectedMilestones.map((milestone) =>
              milestone ? (
                <g key={milestone.id} className="route-milestone" transform={`translate(${milestone.coordinates[0]}, ${milestone.coordinates[1]})`}>
                  <circle r="8" />
                  <text x="12" y="4">{milestone.label}</text>
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
            <text {...anchorText(resolvePort(route.origin))}>
              {resolvePort(route.origin).name}
            </text>
            <text {...anchorText(resolvePort(route.destination))}>
              {resolvePort(route.destination).name}
            </text>
          </g>
        ) : null}
        <text className="progress-indicator" x={MAP_WIDTH - 24} y={MAP_HEIGHT - 24} textAnchor="end">
          {Math.round(progress * 100)}% complete
        </text>
      </svg>
      <div className="obstacle-console" aria-hidden={!isRunning}>
        <strong>Inject challenges</strong>
        {Object.entries(OBSTACLE_TYPES).map(([type, config]) => (
          <button
            key={type}
            type="button"
            onClick={() => onAddObstacle(type)}
            disabled={!route || !isRunning}
          >
            {config.label}
          </button>
        ))}
      </div>
    </div>
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
    crewManifest.map((member) => ({ ...member, instructions: member.defaultInstructions.slice() }))
  )
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
  const [hasLaunched, setHasLaunched] = useState(false)
  const resumeAfterOverlayRef = useRef(false)
  const [logEntries, setLogEntries] = useState([])
  const [triggeredMilestones, setTriggeredMilestones] = useState([])
  const [obstacles, setObstacles] = useState([])
  const previousRouteKeyRef = useRef('none')

  const animationFrameRef = useRef(null)
  const lastTickRef = useRef(null)
  const obstacleTimersRef = useRef(new Set())
  const heartbeatIntervalRef = useRef(null)
  const crewHeartbeatIndexRef = useRef(0)
  const latestTelemetryRef = useRef({ progress: 0, elapsedMs: 0 })

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
    if (previousRouteKeyRef.current !== routeKey) {
      setProgress(0)
      setElapsedMs(0)
      setIsRunning(false)
      setIsPaused(true)
      setTriggeredMilestones([])
      setLogEntries([])
      setHasLaunched(false)
      setObstacles([])
      obstacleTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
      obstacleTimersRef.current.clear()
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current)
        heartbeatIntervalRef.current = null
      }
      crewHeartbeatIndexRef.current = 0
      previousRouteKeyRef.current = routeKey
    }
  }, [routeKey])

  useEffect(() => () => {
    obstacleTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
    obstacleTimersRef.current.clear()
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
  }, [])

  const crewSummary = useMemo(() => {
    const grouped = groupCrewByRole(crewState)
    return Array.from(grouped.entries()).map(([role, { units }]) => ({ role, units }))
  }, [crewState])

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
        ],
        timestamp: new Date().toISOString(),
      })
      const cleanupId = setTimeout(() => {
        setObstacles((current) => current.filter((item) => item.id !== obstacle.id))
        obstacleTimersRef.current.delete(cleanupId)
      }, 4500)
      obstacleTimersRef.current.add(cleanupId)
    })
  }, [progress, obstacles, pushLogEntry])

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
              chainOfThought: thought.chainOfThought,
              provider: thought.provider,
              timestamp: new Date().toISOString(),
            },
            ...entries,
          ])
        })
      }
    })
  }, [progress, currentRoute, crewState, elapsedMs, triggeredMilestones])

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
    obstacleTimersRef.current.forEach((timeoutId) => clearTimeout(timeoutId))
    obstacleTimersRef.current.clear()
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current)
      heartbeatIntervalRef.current = null
    }
    crewHeartbeatIndexRef.current = 0
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
        ],
        timestamp: new Date().toISOString(),
      }))
    },
    [currentRoute, progress, pushLogEntry, scheduleLogEntry],
  )

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
      pushLogEntry({
        id: createId('log'),
        type: 'crew',
        author: crewMember.name,
        role: crewMember.role,
        transcript: sequence.buildTranscript({ crewMember, telemetry }),
        chainOfThought: sequence.buildThoughts({ crewMember, telemetry }),
        timestamp: new Date().toISOString(),
      })
    }, Math.max(4000, 12000 / Math.max(TIME_SCALE, 0.1)))

    heartbeatIntervalRef.current = interval

    return () => {
      clearInterval(interval)
      heartbeatIntervalRef.current = null
    }
  }, [isRunning, isPaused, crewState, pushLogEntry])

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
        crewSummary={crewSummary}
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
        />
      </main>
      {isCrewExpanded ? (
        <CrewBriefingOverlay
          crewState={crewState}
          onClose={closeCrewBriefing}
          onUpdateInstructions={updateInstructions}
          onUpdateAlliances={updateAlliances}
        />
      ) : null}
    </div>
  )
}

export default App
