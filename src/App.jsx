import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const compartments = [
  {
    id: 'bridge',
    name: 'Bridge',
    description:
      'Command deck coordinating navigation choices, tactical approvals, and the overall mission vector.',
  },
  {
    id: 'sonar',
    name: 'Sonar & Recon',
    description: 'Sensor suite decoding sonar sweeps and environmental readings in real time.',
  },
  {
    id: 'torpedo',
    name: 'Torpedo Bay',
    description: 'Armaments staging with missile launch controls and reload teams.',
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'Propulsion, damage control, and reactor tuning for quiet running.',
  },
]

const initialCrew = [
  {
    id: 'captain',
    name: 'Captain Mira Chen',
    role: 'Commanding Officer',
    compartment: 'bridge',
    instructions:
      'Keep sonar and engineering timelines synchronized before approving torpedo launches. Authorize depth changes deliberately.',
  },
  {
    id: 'sonar-lead',
    name: 'Ensign Theo Park',
    role: 'Sonar Lead',
    compartment: 'sonar',
    instructions:
      'Continuously annotate sonar contacts and brief command when threat likelihood crosses 60%.',
  },
  {
    id: 'weapons-chief',
    name: 'Chief Ava Rahman',
    role: 'Weapons Chief',
    compartment: 'torpedo',
    instructions:
      'Maintain torpedo readiness posture two. Await command authentication before firing solutions.',
  },
  {
    id: 'engineer',
    name: 'Lt. Jorge Ibarra',
    role: 'Chief Engineer',
    compartment: 'engineering',
    instructions:
      'Balance power draw between silent running and sensor resolution. Report capacity changes instantly.',
  },
]

const initialTasks = [
  {
    id: 'task-1',
    title: 'Transit Left Port',
    objective: 'Exit the western harbor quietly and maintain sonar coverage.',
    compartmentFocus: 'bridge',
    assignees: ['captain', 'sonar-lead'],
    status: 'In Progress',
    reasoning:
      'Bridge keeps helm decisions in sync with sonar sweeps. Tactical remains on standby while engineering stages propulsion.',
  },
  {
    id: 'task-2',
    title: 'Depth Envelope Validation',
    objective: 'Test ballast adjustments to keep a safe ride height above the ocean floor.',
    compartmentFocus: 'engineering',
    assignees: ['engineer'],
    status: 'Planned',
    reasoning: 'Engineering cycles pumps while sonar monitors bottom terrain for hazards.',
  },
]

const initialTeams = [
  {
    id: 'team-command',
    name: 'Command Net',
    function: 'Mission orchestration and decision arbitration.',
    members: ['captain', 'sonar-lead'],
  },
  {
    id: 'team-tactical',
    name: 'Tactical Cell',
    function: 'Targeting, ordinance, and risk mitigation.',
    members: ['weapons-chief', 'captain'],
  },
  {
    id: 'team-sustain',
    name: 'Sustainment Group',
    function: 'Engineering support and survivability.',
    members: ['engineer'],
  },
]

const initialLog = [
  {
    id: 'log-1',
    speaker: 'Captain Chen',
    tone: 'command',
    timestamp: new Date().toISOString(),
    message: 'Bridge briefed on harbor departure. Navigation plotting a line that skirts enemy patrol arcs.',
  },
  {
    id: 'log-2',
    speaker: 'Ensign Park',
    tone: 'sonar',
    timestamp: new Date().toISOString(),
    message: 'Sonar buoys calibrated. Ready to feed contour data to engineering as we descend.',
  },
]

const achievementCatalog = [
  {
    id: 'ach-distance-100',
    label: 'Harbor Wake',
    description: 'Travel more than 100 meters from the left port.',
    type: 'distance',
    value: 100,
  },
  {
    id: 'ach-depth-120',
    label: 'Into the Blue',
    description: 'Descend beyond 120 meters without scraping the seafloor.',
    type: 'depth',
    value: 120,
  },
  {
    id: 'ach-distance-600',
    label: 'Midway Vector',
    description: 'Surge past the midpoint between ports while remaining undetected.',
    type: 'distance',
    value: 600,
  },
  {
    id: 'ach-bots-avoided',
    label: 'Ghosted Rivals',
    description: 'Avoid all bot submarines for two minutes of continuous travel.',
    type: 'avoidance',
    value: 120,
  },
  {
    id: 'ach-arrival',
    label: 'Right Port Secure',
    description: 'Reach the eastern harbor without striking the ocean floor.',
    type: 'arrival',
  },
]

const MAX_DEPTH = 360
const MIN_DEPTH = 30
const VIEWPORT_WIDTH = 960
const VIEWPORT_HEIGHT = 520
const SEA_FLOOR = VIEWPORT_HEIGHT - 60
const SURFACE_LEVEL = 60

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function createId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

function formatTimestamp(isoString) {
  const date = new Date(isoString)
  return `${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

function AchievementTrack({ achievements }) {
  return (
    <div className="achievement-track" aria-label="Mission milestones">
      {achievements.map((achievement) => (
        <div
          key={achievement.id}
          className={achievement.achieved ? 'achievement achieved' : 'achievement'}
        >
          <span className="achievement-dot" />
          <span className="achievement-label">{achievement.label}</span>
        </div>
      ))}
    </div>
  )
}

function ShipLog({ entries }) {
  return (
    <section className="ship-log" aria-label="Crew coordination log">
      <h2>Ship's Log</h2>
      <div className="log-bubble">
        <ul>
          {entries.slice(-6).map((entry) => (
            <li key={entry.id}>
              <div className="log-meta">
                <span className="log-speaker">{entry.speaker}</span>
                <time>{formatTimestamp(entry.timestamp)}</time>
              </div>
              <p>{entry.message}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Sidebar({
  crew,
  tasks,
  teams,
  activeTab,
  onChangeTab,
  compartments,
  onCrewCompartmentChange,
  onCrewRoleChange,
  onCrewInstructionChange,
  onCrewInstructionBlur,
  onUpdateTaskStatus,
  onToggleTaskAssignee,
  newTask,
  setNewTask,
  onAddTask,
  newCrew,
  setNewCrew,
  onAddCrew,
  achievements,
  onToggleMilestoneDrawer,
  isMilestoneDrawerOpen,
  milestoneDrawer,
  crewCountByCompartment,
  tasksByCrew,
  teamsByCrew,
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div>
          <h1>Submarine Orchestration Simulator</h1>
          <p>Direct crew coordination while guiding the submarine safely across the channel.</p>
        </div>
        <button
          type="button"
          className="milestone-button"
          onClick={onToggleMilestoneDrawer}
          aria-expanded={isMilestoneDrawerOpen}
        >
          Milestones
        </button>
      </div>

      <nav className="sidebar-tabs" aria-label="Crew coordination views">
        <button
          type="button"
          className={activeTab === 'crew' ? 'sidebar-tab active' : 'sidebar-tab'}
          onClick={() => onChangeTab('crew')}
        >
          Crew
        </button>
        <button
          type="button"
          className={activeTab === 'tasks' ? 'sidebar-tab active' : 'sidebar-tab'}
          onClick={() => onChangeTab('tasks')}
        >
          Mission Tasks
        </button>
        <button
          type="button"
          className={activeTab === 'teams' ? 'sidebar-tab active' : 'sidebar-tab'}
          onClick={() => onChangeTab('teams')}
        >
          Chain of Command
        </button>
        <button
          type="button"
          className={activeTab === 'stations' ? 'sidebar-tab active' : 'sidebar-tab'}
          onClick={() => onChangeTab('stations')}
        >
          Stations
        </button>
      </nav>

      <div className="sidebar-content">
        {activeTab === 'crew' && (
          <div className="sidebar-panel">
            <form className="sidebar-form" onSubmit={onAddCrew}>
              <div className="form-row">
                <label htmlFor="crew-name">Name</label>
                <input
                  id="crew-name"
                  value={newCrew.name}
                  onChange={(event) => setNewCrew((state) => ({ ...state, name: event.target.value }))}
                  required
                  placeholder="Crewmember"
                />
              </div>
              <div className="form-row">
                <label htmlFor="crew-role">Role</label>
                <input
                  id="crew-role"
                  value={newCrew.role}
                  onChange={(event) => setNewCrew((state) => ({ ...state, role: event.target.value }))}
                  required
                  placeholder="Specialty"
                />
              </div>
              <div className="form-row">
                <label htmlFor="crew-compartment">Station</label>
                <select
                  id="crew-compartment"
                  value={newCrew.compartment}
                  onChange={(event) => setNewCrew((state) => ({ ...state, compartment: event.target.value }))}
                >
                  {compartments.map((compartment) => (
                    <option key={compartment.id} value={compartment.id}>
                      {compartment.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row wide">
                <label htmlFor="crew-instructions">Instructions</label>
                <textarea
                  id="crew-instructions"
                  value={newCrew.instructions}
                  onChange={(event) => setNewCrew((state) => ({ ...state, instructions: event.target.value }))}
                  rows={2}
                  placeholder="Guidance for the new crewmate"
                />
              </div>
              <button type="submit" className="primary">Add crewmate</button>
            </form>

            <div className="crew-list">
              {crew.map((member) => (
                <article key={member.id} className="crew-card">
                  <header>
                    <div>
                      <h2>{member.name}</h2>
                      <p>{member.role}</p>
                    </div>
                    <span className="crew-station">
                      {compartments.find((compartment) => compartment.id === member.compartment)?.name}
                    </span>
                  </header>
                  <dl>
                    <div>
                      <dt>Assignments</dt>
                      <dd>{tasksByCrew[member.id]?.map((task) => task.title).join(', ') || 'No tasking'}</dd>
                    </div>
                    <div>
                      <dt>Teams</dt>
                      <dd>{teamsByCrew[member.id]?.map((team) => team.name).join(', ') || 'Solo watch'}</dd>
                    </div>
                  </dl>
                  <div className="crew-controls">
                    <label>
                      Role
                      <input
                        value={member.role}
                        onChange={(event) => onCrewRoleChange(member.id, event.target.value)}
                      />
                    </label>
                    <label>
                      Station
                      <select
                        value={member.compartment}
                        onChange={(event) => onCrewCompartmentChange(member.id, event.target.value)}
                      >
                        {compartments.map((compartment) => (
                          <option key={compartment.id} value={compartment.id}>
                            {compartment.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="crew-instructions-editor">
                    Instructions
                    <textarea
                      value={member.instructions}
                      rows={3}
                      onChange={(event) => onCrewInstructionChange(member.id, event.target.value)}
                      onBlur={(event) =>
                        onCrewInstructionBlur(member.id, member.name, event.target.value)
                      }
                    />
                  </label>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="sidebar-panel">
            <form className="sidebar-form" onSubmit={onAddTask}>
              <div className="form-row">
                <label htmlFor="task-title">Title</label>
                <input
                  id="task-title"
                  value={newTask.title}
                  onChange={(event) => setNewTask((state) => ({ ...state, title: event.target.value }))}
                  placeholder="Objective name"
                  required
                />
              </div>
              <div className="form-row wide">
                <label htmlFor="task-objective">Objective</label>
                <textarea
                  id="task-objective"
                  rows={2}
                  value={newTask.objective}
                  onChange={(event) => setNewTask((state) => ({ ...state, objective: event.target.value }))}
                />
              </div>
              <div className="form-row">
                <label htmlFor="task-compartment">Station</label>
                <select
                  id="task-compartment"
                  value={newTask.compartmentFocus}
                  onChange={(event) =>
                    setNewTask((state) => ({ ...state, compartmentFocus: event.target.value }))
                  }
                >
                  {compartments.map((compartment) => (
                    <option key={compartment.id} value={compartment.id}>
                      {compartment.name}
                    </option>
                  ))}
                </select>
              </div>
              <fieldset className="form-row assignees">
                <legend>Assign crew</legend>
                {crew.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={newTask.assignees.includes(member.id)}
                      onChange={() => onToggleTaskAssignee(member.id)}
                    />
                    {member.name}
                  </label>
                ))}
              </fieldset>
              <div className="form-row wide">
                <label htmlFor="task-reasoning">Reasoning</label>
                <textarea
                  id="task-reasoning"
                  rows={2}
                  value={newTask.reasoning}
                  onChange={(event) => setNewTask((state) => ({ ...state, reasoning: event.target.value }))}
                />
              </div>
              <button type="submit" className="primary">Register task</button>
            </form>

            <div className="task-list">
              {tasks.map((task) => (
                <article key={task.id} className={`task-card status-${task.status.toLowerCase()}`}>
                  <header>
                    <div>
                      <h2>{task.title}</h2>
                      <p>{task.objective}</p>
                    </div>
                    <span className="status-chip">{task.status}</span>
                  </header>
                  <dl>
                    <div>
                      <dt>Station</dt>
                      <dd>
                        {compartments.find((compartment) => compartment.id === task.compartmentFocus)?.name}
                      </dd>
                    </div>
                    <div>
                      <dt>Assignees</dt>
                      <dd>
                        {task.assignees
                          .map((crewId) => crew.find((member) => member.id === crewId)?.name)
                          .filter(Boolean)
                          .join(', ') || 'Unassigned'}
                      </dd>
                    </div>
                    <div>
                      <dt>Intent</dt>
                      <dd>{task.reasoning || 'No reasoning filed yet.'}</dd>
                    </div>
                  </dl>
                  <footer>
                    {task.status !== 'Completed' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTaskStatus(
                            task.id,
                            task.status === 'Planned' ? 'In Progress' : 'Completed',
                          )
                        }
                      >
                        Advance to {task.status === 'Planned' ? 'In Progress' : 'Completed'}
                      </button>
                    ) : (
                      <span className="completed">Ready for review</span>
                    )}
                  </footer>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="sidebar-panel">
            <div className="team-grid">
              {teams.map((team) => (
                <article key={team.id} className="team-card">
                  <header>
                    <h2>{team.name}</h2>
                    <p>{team.function}</p>
                  </header>
                  <div>
                    <h3>Members</h3>
                    <ul>
                      {team.members
                        .map((crewId) => crew.find((member) => member.id === crewId)?.name)
                        .filter(Boolean)
                        .map((name) => (
                          <li key={name}>{name}</li>
                        ))}
                    </ul>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'stations' && (
          <div className="sidebar-panel stations-panel">
            <ul>
              {compartments.map((compartment) => (
                <li key={compartment.id}>
                  <h2>{compartment.name}</h2>
                  <p>{compartment.description}</p>
                  <p className="station-metric">
                    {crewCountByCompartment[compartment.id] || 0} crew •{' '}
                    {tasks.filter((task) => task.compartmentFocus === compartment.id).length} active tasks
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {milestoneDrawer}

      <div className="achievement-summary">
        <h2>Mission Milestones</h2>
        <ul>
          {achievements.map((achievement) => (
            <li key={achievement.id} className={achievement.achieved ? 'achieved' : undefined}>
              <span>{achievement.label}</span>
              <small>{achievement.description}</small>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  )
}

function GameSimulation({
  onLog,
  achievements,
  onAchievementUnlock,
  shipHasArrived,
  onArrival,
}) {
  const [submarine, setSubmarine] = useState({
    x: 80,
    depth: 80,
    verticalVelocity: 0,
    horizontalSpeed: 70,
    targetDepth: 120,
    battery: 94,
    hullIntegrity: 100,
    distanceTravelled: 0,
    avoidanceClock: 0,
  })

  const [enemyBots, setEnemyBots] = useState(() =>
    Array.from({ length: 3 }, (_, index) => ({
      id: `bot-${index}`,
      x: 280 + index * 180,
      depth: 70 + index * 40,
      direction: index % 2 === 0 ? 1 : -1,
      speed: 35 + Math.random() * 20,
      changeTimer: Math.random() * 6,
    })),
  )

  const [fishSchools, setFishSchools] = useState(() =>
    Array.from({ length: 10 }, (_, index) => ({
      id: `fish-${index}`,
      x: Math.random() * VIEWPORT_WIDTH,
      depth: 40 + Math.random() * (MAX_DEPTH - 40),
      speed: 15 + Math.random() * 10,
      direction: Math.random() > 0.5 ? 1 : -1,
      size: 0.4 + Math.random() * 0.6,
    })),
  )

  const [activePopups, setActivePopups] = useState([])
  const pendingEventsRef = useRef([])
  const bottomAlertRef = useRef(false)

  useEffect(() => {
    let animationFrame
    let lastTimestamp

    const tick = (timestamp) => {
      if (!lastTimestamp) {
        lastTimestamp = timestamp
      }

      const delta = Math.min((timestamp - lastTimestamp) / 1000, 0.12)
      lastTimestamp = timestamp

      setSubmarine((current) => {
        const nextDistance = current.distanceTravelled + current.horizontalSpeed * delta
        const acceleration = (current.targetDepth - current.depth) * 0.6
        const nextVerticalVelocity = clamp(current.verticalVelocity + acceleration * delta, -80, 80)
        const nextDepth = clamp(current.depth + nextVerticalVelocity * delta, MIN_DEPTH, MAX_DEPTH)
        const energyDrain = 0.02 + Math.abs(nextVerticalVelocity) * 0.0006
        const nearSeafloor = nextDepth > MAX_DEPTH - 10
        const hullPenalty = nearSeafloor ? 0.5 : 0
        if (nearSeafloor && !bottomAlertRef.current) {
          bottomAlertRef.current = true
          pendingEventsRef.current.push({
            speaker: 'Lt. Ibarra',
            message: 'Warning: keel proximity alert. Adjusting ballast to avoid scraping the ocean floor.',
            tone: 'engineering',
          })
        }
        if (!nearSeafloor && bottomAlertRef.current) {
          bottomAlertRef.current = false
        }

        return {
          ...current,
          x: clamp(current.x + (current.horizontalSpeed * delta) / 2, 40, VIEWPORT_WIDTH - 120),
          depth: nextDepth,
          verticalVelocity: nextVerticalVelocity,
          battery: Math.max(0, current.battery - energyDrain),
          hullIntegrity: Math.max(0, current.hullIntegrity - hullPenalty),
          distanceTravelled: nextDistance,
          avoidanceClock: current.avoidanceClock + delta,
        }
      })

      setEnemyBots((current) =>
        current.map((bot) => {
          let { x, depth, direction, changeTimer, speed } = bot
          changeTimer -= delta
          if (changeTimer <= 0) {
            direction = Math.random() > 0.5 ? 1 : -1
            speed = clamp(speed + (Math.random() - 0.5) * 20, 20, 55)
            changeTimer = 3 + Math.random() * 5
          }
          x += direction * speed * delta
          depth += Math.sin(timestamp / 1000 + bot.x) * 4 * delta * direction

          if (x < 120) {
            x = 120
            direction = 1
          }
          if (x > VIEWPORT_WIDTH - 140) {
            x = VIEWPORT_WIDTH - 140
            direction = -1
          }
          depth = clamp(depth, MIN_DEPTH + 20, MAX_DEPTH - 20)

          return {
            ...bot,
            x,
            depth,
            direction,
            changeTimer,
            speed,
          }
        }),
      )

      setFishSchools((current) =>
        current.map((school) => {
          let x = school.x + school.direction * school.speed * delta
          if (x < 40) {
            x = VIEWPORT_WIDTH - 20
          }
          if (x > VIEWPORT_WIDTH - 20) {
            x = 40
          }
          return {
            ...school,
            x,
          }
        }),
      )

      const events = pendingEventsRef.current
      pendingEventsRef.current = []
      events.forEach((event) =>
        onLog({ ...event, id: createId('log'), timestamp: new Date().toISOString() }),
      )

      animationFrame = requestAnimationFrame(tick)
    }

    animationFrame = requestAnimationFrame(tick)

    return () => cancelAnimationFrame(animationFrame)
  }, [onLog])

  useEffect(() => {
    if (!shipHasArrived && submarine.x >= VIEWPORT_WIDTH - 140) {
      onLog({
        id: createId('log'),
        speaker: 'Captain Chen',
        tone: 'command',
        message: 'Eastern harbor in sight. Crew, prepare to surface and secure the berth.',
        timestamp: new Date().toISOString(),
      })
      onArrival()
      onAchievementUnlock('ach-arrival')
    }
  }, [onAchievementUnlock, onArrival, onLog, shipHasArrived, submarine.x])

  useEffect(() => {
    const achievementsToCheck = achievements.filter((achievement) => !achievement.achieved)
    achievementsToCheck.forEach((achievement) => {
      let achieved = false
      if (achievement.type === 'distance' && submarine.distanceTravelled >= achievement.value) {
        achieved = true
      }
      if (achievement.type === 'depth' && submarine.depth >= achievement.value) {
        achieved = true
      }
      if (
        achievement.type === 'avoidance' &&
        submarine.avoidanceClock >= achievement.value
      ) {
        achieved = true
      }

      if (achieved) {
        onAchievementUnlock(achievement.id)
        setActivePopups((current) => [
          ...current,
          { id: achievement.id, label: achievement.label, timestamp: Date.now() },
        ])
        onLog({
          id: createId('log'),
          speaker: 'Mission Control',
          tone: 'systems',
          message: `Milestone achieved: ${achievement.label}.`,
          timestamp: new Date().toISOString(),
        })
      }
    })
  }, [achievements, onAchievementUnlock, onLog, submarine])

  useEffect(() => {
    if (!activePopups.length) return
    const timeout = setTimeout(() => {
      setActivePopups((current) => current.slice(1))
    }, 4000)
    return () => clearTimeout(timeout)
  }, [activePopups])

  useEffect(() => {
    const collisions = enemyBots.filter((bot) => Math.abs(bot.x - submarine.x) < 60 && Math.abs(bot.depth - submarine.depth) < 24)
    if (collisions.length) {
      setSubmarine((current) => ({
        ...current,
        hullIntegrity: Math.max(0, current.hullIntegrity - 6 * collisions.length),
        avoidanceClock: 0,
      }))
      collisions.forEach((bot) => {
        onLog({
          id: createId('log'),
          speaker: 'Chief Rahman',
          tone: 'tactical',
          message: `Bot submarine ${bot.id.replace('bot-', '#')} passed close! Helm, adjust bearing immediately.`,
          timestamp: new Date().toISOString(),
        })
      })
    }
  }, [enemyBots, onLog, submarine.depth, submarine.x])

  const depthRatio = (submarine.depth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH)
  const submarineY = SURFACE_LEVEL + depthRatio * (SEA_FLOOR - SURFACE_LEVEL)

  const submarineStats = [
    { label: 'Depth', value: `${Math.round(submarine.depth)} m` },
    {
      label: 'Vertical velocity',
      value: `${submarine.verticalVelocity > 0 ? 'Desc' : 'Asc'} ${Math.abs(submarine.verticalVelocity).toFixed(1)} m/s`,
    },
    { label: 'Forward speed', value: `${Math.round(submarine.horizontalSpeed)} kts` },
    { label: 'Battery reserve', value: `${Math.round(submarine.battery)}%` },
    { label: 'Hull integrity', value: `${Math.round(submarine.hullIntegrity)}%` },
  ]

  const handleCommand = (nextDepth) => {
    const safeDepth = clamp(nextDepth, MIN_DEPTH + 5, MAX_DEPTH - 5)
    setSubmarine((current) => ({
      ...current,
      targetDepth: safeDepth,
    }))
    onLog({
      id: createId('log'),
      speaker: 'Captain Chen',
      tone: 'command',
      message: `Set depth ${Math.round(safeDepth)} meters. Engineering, trim ballast accordingly.`,
      timestamp: new Date().toISOString(),
    })
  }

  const handleTrim = (direction) => {
    setSubmarine((current) => ({
      ...current,
      horizontalSpeed: clamp(current.horizontalSpeed + direction * 8, 40, 110),
    }))
    onLog({
      id: createId('log'),
      speaker: 'Lt. Ibarra',
      tone: 'engineering',
      message:
        direction > 0
          ? 'Boosting propulsion coils for additional thrust. Monitoring reactor load.'
          : 'Reducing propulsor output for a quieter profile.',
      timestamp: new Date().toISOString(),
    })
  }

  return (
    <div className="game-area">
      <AchievementTrack achievements={achievements} />

      <div className="game-viewport">
        <svg
          className="game-canvas"
          viewBox={`0 0 ${VIEWPORT_WIDTH} ${VIEWPORT_HEIGHT}`}
          role="img"
          aria-label="Submarine transit simulation"
        >
          <defs>
            <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a1c33" />
              <stop offset="60%" stopColor="#0d2744" />
              <stop offset="100%" stopColor="#071426" />
            </linearGradient>
            <linearGradient id="seafloor" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#2d2f38" />
              <stop offset="100%" stopColor="#1d1e25" />
            </linearGradient>
          </defs>

          <rect width={VIEWPORT_WIDTH} height={VIEWPORT_HEIGHT} fill="url(#ocean)" />

          <rect x="20" y={SURFACE_LEVEL - 30} width="110" height="28" fill="#131b29" rx="6" />
          <rect
            x={VIEWPORT_WIDTH - 140}
            y={SURFACE_LEVEL - 30}
            width="120"
            height="28"
            fill="#131b29"
            rx="6"
          />
          <text x="75" y={SURFACE_LEVEL - 36} className="port-label">
            West Port
          </text>
          <text x={VIEWPORT_WIDTH - 80} y={SURFACE_LEVEL - 36} className="port-label">
            East Port
          </text>

          {enemyBots.map((bot) => {
            const botDepthRatio = (bot.depth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH)
            const botY = SURFACE_LEVEL + botDepthRatio * (SEA_FLOOR - SURFACE_LEVEL)
            return (
              <g key={bot.id} className="bot-submarine">
                <ellipse cx={bot.x} cy={botY} rx="28" ry="10" fill="#6d7c8d" opacity="0.7" />
                <rect x={bot.x - 10} y={botY - 4} width="20" height="8" fill="#55616f" />
              </g>
            )
          })}

          {fishSchools.map((fish) => {
            const fishDepthRatio = (fish.depth - MIN_DEPTH) / (MAX_DEPTH - MIN_DEPTH)
            const fishY = SURFACE_LEVEL + fishDepthRatio * (SEA_FLOOR - SURFACE_LEVEL)
            const fishSize = 12 * fish.size
            return (
              <g key={fish.id} className="fish">
                <ellipse
                  cx={fish.x}
                  cy={fishY}
                  rx={fishSize}
                  ry={fishSize * 0.4}
                  fill="#f6b756"
                  opacity="0.75"
                />
                <polygon
                  points={`${fish.x - fishSize} ${fishY} ${fish.x - fishSize - 8 * fish.size} ${fishY - fishSize * 0.4} ${fish.x - fishSize - 8 * fish.size} ${fishY + fishSize * 0.4}`}
                  fill="#f38f3d"
                  opacity="0.75"
                />
              </g>
            )
          })}

          <rect
            x="0"
            y={SEA_FLOOR}
            width={VIEWPORT_WIDTH}
            height={VIEWPORT_HEIGHT - SEA_FLOOR}
            fill="url(#seafloor)"
          />

          <g className="submarine">
            <ellipse cx={submarine.x} cy={submarineY} rx="36" ry="14" fill="#d1dde8" opacity="0.9" />
            <rect x={submarine.x - 30} y={submarineY - 8} width="60" height="16" fill="#b4c2d0" />
            <rect x={submarine.x - 10} y={submarineY - 20} width="20" height="12" fill="#b4c2d0" rx="3" />
            <circle cx={submarine.x + 12} cy={submarineY} r="5" fill="#1f2d3b" />
          </g>

          {Array.from({ length: 3 }).map((_, index) => (
            <rect
              key={`enemy-${index}`}
              x={220 + index * 200}
              y={SURFACE_LEVEL - 46}
              width="80"
              height="16"
              fill="#2b3447"
            />
          ))}
        </svg>

        <div className="stats-overlay">
          {submarineStats.map((stat) => (
            <div key={stat.label}>
              <span>{stat.label}</span>
              <strong>{stat.value}</strong>
            </div>
          ))}
        </div>

        <div className="control-panel">
          <button type="button" onClick={() => handleCommand(submarine.depth - 30)}>
            Ascend 30m
          </button>
          <button type="button" onClick={() => handleCommand(submarine.depth + 30)}>
            Descend 30m
          </button>
          <button type="button" onClick={() => handleCommand(120)}>
            Hold at 120m
          </button>
          <button type="button" onClick={() => handleTrim(-1)}>Reduce thrust</button>
          <button type="button" onClick={() => handleTrim(1)}>Boost thrust</button>
        </div>

        {activePopups.map((popup) => (
          <div key={popup.id} className="achievement-popup">
            <strong>{popup.label}</strong>
            <span>Milestone reached</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function App() {
  const [crew, setCrew] = useState(initialCrew)
  const [tasks, setTasks] = useState(initialTasks)
  const [teams] = useState(initialTeams)
  const [shipLog, setShipLog] = useState(initialLog)
  const [achievements, setAchievements] = useState(
    achievementCatalog.map((achievement) => ({ ...achievement, achieved: false })),
  )
  const [activeTab, setActiveTab] = useState('crew')
  const [newCrew, setNewCrew] = useState({
    name: '',
    role: '',
    compartment: compartments[0].id,
    instructions: '',
  })
  const [newTask, setNewTask] = useState({
    title: '',
    objective: '',
    compartmentFocus: compartments[0].id,
    assignees: [],
    reasoning: '',
  })
  const [milestonesOpen, setMilestonesOpen] = useState(false)
  const [hasArrived, setHasArrived] = useState(false)

  const crewCountByCompartment = useMemo(() => {
    return crew.reduce((acc, member) => {
      acc[member.compartment] = (acc[member.compartment] || 0) + 1
      return acc
    }, {})
  }, [crew])

  const tasksByCrew = useMemo(() => {
    return crew.reduce((acc, member) => {
      acc[member.id] = tasks.filter((task) => task.assignees.includes(member.id))
      return acc
    }, {})
  }, [crew, tasks])

  const teamsByCrew = useMemo(() => {
    return crew.reduce((acc, member) => {
      acc[member.id] = teams.filter((team) => team.members.includes(member.id))
      return acc
    }, {})
  }, [crew, teams])

  const addLogEntry = ({ speaker, message, tone }) => {
    setShipLog((current) => [
      ...current,
      {
        id: createId('log'),
        speaker,
        tone,
        message,
        timestamp: new Date().toISOString(),
      },
    ])
  }

  const handleAddCrew = (event) => {
    event.preventDefault()
    if (!newCrew.name.trim() || !newCrew.role.trim()) {
      return
    }
    const crewMember = { id: createId('crew'), ...newCrew }
    setCrew((current) => [...current, crewMember])
    addLogEntry({
      speaker: 'Mission Control',
      tone: 'systems',
      message: `${crewMember.name} boarded as ${crewMember.role}. Assigned to ${
        compartments.find((compartment) => compartment.id === crewMember.compartment)?.name
      }.`,
    })
    setNewCrew({ name: '', role: '', compartment: compartments[0].id, instructions: '' })
  }

  const handleCrewInstructionChange = (crewId, nextInstructions) => {
    setCrew((current) =>
      current.map((member) =>
        member.id === crewId ? { ...member, instructions: nextInstructions } : member,
      ),
    )
  }

  const handleCrewInstructionBlur = (crewId, name, nextInstructions) => {
    addLogEntry({
      speaker: name,
      tone: 'crew',
      message: `Acknowledged updated directive: "${nextInstructions || 'Awaiting orders.'}"`,
    })
  }

  const handleCrewRoleChange = (crewId, nextRole) => {
    setCrew((current) =>
      current.map((member) =>
        member.id === crewId ? { ...member, role: nextRole } : member,
      ),
    )
    const crewMember = crew.find((member) => member.id === crewId)
    if (crewMember) {
      addLogEntry({
        speaker: crewMember.name,
        tone: 'crew',
        message: `Role updated to ${nextRole}. Coordinating with team leads for handoff.`,
      })
    }
  }

  const handleCrewCompartmentChange = (crewId, nextCompartment) => {
    setCrew((current) =>
      current.map((member) =>
        member.id === crewId ? { ...member, compartment: nextCompartment } : member,
      ),
    )
    const crewMember = crew.find((member) => member.id === crewId)
    if (crewMember) {
      addLogEntry({
        speaker: crewMember.name,
        tone: 'crew',
        message: `Relocating to ${
          compartments.find((compartment) => compartment.id === nextCompartment)?.name
        } to support operations.`,
      })
    }
  }

  const handleToggleTaskAssignee = (crewId) => {
    setNewTask((current) => {
      const exists = current.assignees.includes(crewId)
      return {
        ...current,
        assignees: exists
          ? current.assignees.filter((id) => id !== crewId)
          : [...current.assignees, crewId],
      }
    })
  }

  const handleAddTask = (event) => {
    event.preventDefault()
    if (!newTask.title.trim()) return
    const task = { id: createId('task'), status: 'Planned', ...newTask }
    setTasks((current) => [...current, task])
    addLogEntry({
      speaker: 'Captain Chen',
      tone: 'command',
      message: `Logged mission task "${task.title}". ${
        task.assignees.length
          ? `Assigned to ${task.assignees
              .map((id) => crew.find((member) => member.id === id)?.name)
              .filter(Boolean)
              .join(', ')}.`
          : 'Awaiting crew assignment.'
      }`,
    })
    setNewTask({ title: '', objective: '', compartmentFocus: compartments[0].id, assignees: [], reasoning: '' })
  }

  const handleUpdateTaskStatus = (taskId, nextStatus) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)),
    )
    const task = tasks.find((item) => item.id === taskId)
    if (task) {
      addLogEntry({
        speaker: 'Mission Control',
        tone: 'systems',
        message: `Task "${task.title}" marked ${nextStatus}.`,
      })
    }
  }

  const handleAchievementUnlock = (achievementId) => {
    setAchievements((current) =>
      current.map((achievement) =>
        achievement.id === achievementId
          ? { ...achievement, achieved: true, achievedAt: new Date().toISOString() }
          : achievement,
      ),
    )
  }

  const handleLogFromGame = (entry) => {
    setShipLog((current) => [...current, entry])
  }

  const milestoneDrawer = milestonesOpen ? (
    <div className="milestone-drawer" role="dialog" aria-label="Milestone descriptions">
      <header>
        <h2>Achievement Manifest</h2>
        <button type="button" onClick={() => setMilestonesOpen(false)} aria-label="Close milestones">
          Close
        </button>
      </header>
      <ul>
        {achievements.map((achievement) => (
          <li key={achievement.id} className={achievement.achieved ? 'achieved' : undefined}>
            <strong>{achievement.label}</strong>
            <p>{achievement.description}</p>
          </li>
        ))}
      </ul>
    </div>
  ) : null

  return (
    <div className="app-layout">
      <Sidebar
        crew={crew}
        tasks={tasks}
        teams={teams}
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        compartments={compartments}
        onCrewCompartmentChange={handleCrewCompartmentChange}
        onCrewRoleChange={handleCrewRoleChange}
        onCrewInstructionChange={handleCrewInstructionChange}
        onCrewInstructionBlur={handleCrewInstructionBlur}
        onUpdateTaskStatus={handleUpdateTaskStatus}
        onToggleTaskAssignee={handleToggleTaskAssignee}
        newTask={newTask}
        setNewTask={setNewTask}
        onAddTask={handleAddTask}
        newCrew={newCrew}
        setNewCrew={setNewCrew}
        onAddCrew={handleAddCrew}
        achievements={achievements}
        onToggleMilestoneDrawer={() => setMilestonesOpen((state) => !state)}
        isMilestoneDrawerOpen={milestonesOpen}
        milestoneDrawer={milestoneDrawer}
        crewCountByCompartment={crewCountByCompartment}
        tasksByCrew={tasksByCrew}
        teamsByCrew={teamsByCrew}
      />

      <div className="main-column">
        <GameSimulation
          onLog={handleLogFromGame}
          achievements={achievements}
          onAchievementUnlock={handleAchievementUnlock}
          shipHasArrived={hasArrived}
          onArrival={() => setHasArrived(true)}
        />
        <ShipLog entries={shipLog} />
      </div>
    </div>
  )
}

export default App
