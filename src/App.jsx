import { useMemo, useState } from 'react'
import './App.css'

const compartments = [
  {
    id: 'bridge',
    name: 'Bridge',
    description: 'Command deck overseeing mission goals and navigation vectors.',
    resources: ['Mission console', 'Strategic chart table', 'Encrypted comms array'],
    coordinates: { x: 20, y: 35, width: 30, height: 18 },
  },
  {
    id: 'sonar',
    name: 'Sonar & Recon',
    description: 'Sensor suite decoding sonar sweeps and environmental readings.',
    resources: ['Hydrophone cluster', 'Pattern recognition AI copilot'],
    coordinates: { x: 55, y: 25, width: 25, height: 22 },
  },
  {
    id: 'torpedo',
    name: 'Torpedo Bay',
    description: 'Armaments staging with missile launch and reload control.',
    resources: ['Guidance calibration rig', 'Payload safety interlocks'],
    coordinates: { x: 15, y: 60, width: 32, height: 20 },
  },
  {
    id: 'engineering',
    name: 'Engineering',
    description: 'Propulsion, damage control, and reactor tuning for quiet running.',
    resources: ['Reactor diagnostics deck', 'Damage control lockers'],
    coordinates: { x: 52, y: 60, width: 28, height: 20 },
  },
]

const initialCrew = [
  {
    id: 'captain',
    name: 'Captain Mira Chen',
    role: 'Commanding Officer',
    compartment: 'bridge',
    instructions:
      'Coordinate all tasking. Keep sonar and engineering timelines synchronized before approving torpedo launches.',
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
    title: 'Chart Thermal Vent Field',
    objective: 'Map thermal vents to locate safe passage for survey drones.',
    compartmentFocus: 'sonar',
    assignees: ['captain', 'sonar-lead'],
    status: 'In Progress',
    reasoning:
      'Bridge needs continuous sensor updates; sonar lead triangulates vent plumes and posts summary to command.',
  },
  {
    id: 'task-2',
    title: 'Quiet Reactor Rebalance',
    objective: 'Reduce cavitation noise before covert transit segment.',
    compartmentFocus: 'engineering',
    assignees: ['engineer'],
    status: 'Planned',
    reasoning:
      'Engineering will stagger coolant cycle adjustments and request power windows from the bridge team.',
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
    timestamp: new Date().toISOString(),
    title: 'Mission Brief Uploaded',
    type: 'Overview',
    narrative:
      'Crew assembled on the bridge to review mission tasks. Command net agreed to prioritize vent mapping before stealth transit.',
  },
  {
    id: 'log-2',
    timestamp: new Date().toISOString(),
    title: 'Task Allocation Review',
    type: 'Coordination',
    narrative:
      'Captain Chen synchronized sonar sweeps with engineering power cycles. Weapons chief remains on ready posture awaiting contact data.',
  },
]

function SubmarineDiagram({
  compartments,
  selectedCompartment,
  onSelect,
  crewCountByCompartment,
}) {
  return (
    <div className="submarine-diagram">
      <svg viewBox="0 0 120 80" role="img" aria-label="Top-down submarine layout">
        <defs>
          <linearGradient id="hullGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1f2a44" />
            <stop offset="100%" stopColor="#101829" />
          </linearGradient>
        </defs>
        <path
          d="M5 40 C10 20, 40 10, 85 15 L110 15 C114 15, 118 25, 118 40 C118 55, 114 65, 110 65 L85 65 C40 70, 10 60, 5 40 Z"
          fill="url(#hullGradient)"
          stroke="#0b1423"
          strokeWidth="1"
        />
        {compartments.map((compartment) => {
          const { coordinates } = compartment
          const isSelected = compartment.id === selectedCompartment
          return (
            <g
              key={compartment.id}
              className={isSelected ? 'compartment selected' : 'compartment'}
              onClick={() => onSelect(compartment.id)}
            >
              <rect
                x={coordinates.x}
                y={coordinates.y}
                width={coordinates.width}
                height={coordinates.height}
                rx={3}
                ry={3}
                fill={isSelected ? 'rgba(76, 139, 245, 0.55)' : 'rgba(255, 255, 255, 0.18)'}
                stroke={isSelected ? '#4c8bf5' : 'rgba(255,255,255,0.35)'}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text x={coordinates.x + coordinates.width / 2} y={coordinates.y + coordinates.height / 2}>
                {compartment.name}
              </text>
              <text
                className="compartment-count"
                x={coordinates.x + coordinates.width / 2}
                y={coordinates.y + coordinates.height / 2 + 10}
              >
                {crewCountByCompartment[compartment.id] || 0} crew
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function Section({ title, description, children, actions }) {
  return (
    <section className="panel">
      <header>
        <div>
          <h2>{title}</h2>
          {description && <p className="panel-description">{description}</p>}
        </div>
        {actions && <div className="panel-actions">{actions}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}

function TabBar({ activeTab, onSelect }) {
  const tabs = [
    { id: 'crew', label: 'Crew & Roles' },
    { id: 'tasks', label: 'Mission Tasks' },
    { id: 'teams', label: 'Chain of Command' },
    { id: 'configuration', label: 'Configuration Guide' },
    { id: 'log', label: "Ship's Log" },
  ]
  return (
    <nav className="tab-bar" aria-label="Submarine coordination views">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={tab.id === activeTab ? 'tab active' : 'tab'}
          onClick={() => onSelect(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}

function formatTimestamp(isoString) {
  const date = new Date(isoString)
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

let idCounter = 0
function nextId(prefix) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function App() {
  const [crew, setCrew] = useState(initialCrew)
  const [tasks, setTasks] = useState(initialTasks)
  const [teams, setTeams] = useState(initialTeams)
  const [shipLog, setShipLog] = useState(initialLog)
  const [activeTab, setActiveTab] = useState('crew')
  const [selectedCompartment, setSelectedCompartment] = useState('bridge')
  const [newCrewMember, setNewCrewMember] = useState({
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
  const [newTeam, setNewTeam] = useState({ name: '', function: '', members: [] })

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

  const addLogEntry = ({ title, type, narrative }) => {
    setShipLog((current) => [
      ...current,
      {
        id: nextId('log'),
        timestamp: new Date().toISOString(),
        title,
        type,
        narrative,
      },
    ])
  }

  const handleAddCrewMember = (event) => {
    event.preventDefault()
    if (!newCrewMember.name.trim() || !newCrewMember.role.trim()) return

    const crewId = nextId('crew')
    const member = { id: crewId, ...newCrewMember }
    setCrew((current) => [...current, member])
    addLogEntry({
      title: 'Crewmember Added',
      type: 'Crew Update',
      narrative: `${member.name} joined as ${member.role} assigned to ${compartments.find((c) => c.id === member.compartment)?.name}. Instructions: ${member.instructions || 'awaiting detail.'}`,
    })
    setNewCrewMember({ name: '', role: '', compartment: compartments[0].id, instructions: '' })
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
      title: 'Instruction Update',
      type: 'Directive',
      narrative: `${name} acknowledged new guidance: ${nextInstructions}`,
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
        title: 'Role Adjustment',
        type: 'Crew Update',
        narrative: `${crewMember.name} reassigned role to ${nextRole}. Chain of command matrix updated.`,
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
        title: 'Crew Movement',
        type: 'Coordination',
        narrative: `${crewMember.name} relocated to ${compartments.find((c) => c.id === nextCompartment)?.name} to reinforce workflow connectivity.`,
      })
    }
  }

  const handleAddTask = (event) => {
    event.preventDefault()
    if (!newTask.title.trim()) return
    const task = { id: nextId('task'), status: 'Planned', ...newTask }
    setTasks((current) => [...current, task])
    addLogEntry({
      title: 'Task Created',
      type: 'Mission',
      narrative: `${task.title} registered for ${compartments.find((c) => c.id === task.compartmentFocus)?.name}. Assigned crew: ${task.assignees
        .map((id) => crew.find((member) => member.id === id)?.name)
        .filter(Boolean)
        .join(', ') || 'unassigned'}. ${task.reasoning ? `Intent: ${task.reasoning}` : ''}`,
    })
    setNewTask({ title: '', objective: '', compartmentFocus: compartments[0].id, assignees: [], reasoning: '' })
  }

  const updateTaskStatus = (taskId, nextStatus) => {
    setTasks((current) =>
      current.map((task) => (task.id === taskId ? { ...task, status: nextStatus } : task)),
    )
    const task = tasks.find((item) => item.id === taskId)
    if (task) {
      addLogEntry({
        title: 'Task Status Updated',
        type: 'Mission',
        narrative: `${task.title} marked ${nextStatus}. Crew cross-check results in ship's analytics queue.`,
      })
    }
  }

  const toggleTaskAssignee = (crewId) => {
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

  const toggleTeamMember = (crewId) => {
    setNewTeam((current) => {
      const exists = current.members.includes(crewId)
      return {
        ...current,
        members: exists
          ? current.members.filter((id) => id !== crewId)
          : [...current.members, crewId],
      }
    })
  }

  const handleAddTeam = (event) => {
    event.preventDefault()
    if (!newTeam.name.trim()) return
    const team = { id: nextId('team'), ...newTeam }
    setTeams((current) => [...current, team])
    addLogEntry({
      title: 'Team Configuration',
      type: 'Coordination',
      narrative: `${team.name} established to focus on ${team.function || 'cross-discipline coordination'}. Members: ${team.members
        .map((id) => crew.find((member) => member.id === id)?.name)
        .filter(Boolean)
        .join(', ') || 'pending assignment'}.`,
    })
    setNewTeam({ name: '', function: '', members: [] })
  }

  const configurationGuide = useMemo(() => {
    return compartments.map((compartment) => ({
      ...compartment,
      crew: crew.filter((member) => member.compartment === compartment.id),
      tasks: tasks.filter((task) => task.compartmentFocus === compartment.id),
    }))
  }, [crew, tasks])

  const selectedCompartmentDetails = configurationGuide.find(
    (compartment) => compartment.id === selectedCompartment,
  )

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>Submarine Orchestration Simulator</h1>
        <p>
          Configure crew roles, mission tasks, and collaboration pathways while monitoring the ship's
          live reasoning log.
        </p>
      </header>

      <div className="layout">
        <SubmarineDiagram
          compartments={compartments}
          selectedCompartment={selectedCompartment}
          onSelect={setSelectedCompartment}
          crewCountByCompartment={crewCountByCompartment}
        />
        {selectedCompartmentDetails && (
          <aside className="compartment-details">
            <h2>{selectedCompartmentDetails.name}</h2>
            <p>{selectedCompartmentDetails.description}</p>
            <h3>Resources</h3>
            <ul>
              {selectedCompartmentDetails.resources.map((resource) => (
                <li key={resource}>{resource}</li>
              ))}
            </ul>
            <h3>Crew on Station</h3>
            {selectedCompartmentDetails.crew.length ? (
              <ul>
                {selectedCompartmentDetails.crew.map((member) => (
                  <li key={member.id}>{member.name}</li>
                ))}
              </ul>
            ) : (
              <p className="empty">No personnel assigned.</p>
            )}
            <h3>Linked Tasks</h3>
            {selectedCompartmentDetails.tasks.length ? (
              <ul>
                {selectedCompartmentDetails.tasks.map((task) => (
                  <li key={task.id}>{task.title}</li>
                ))}
              </ul>
            ) : (
              <p className="empty">No active workstreams.</p>
            )}
          </aside>
        )}
      </div>

      <TabBar activeTab={activeTab} onSelect={setActiveTab} />

      <main className="tab-content">
        {activeTab === 'crew' && (
          <Section
            title="Crew Manifest & Directive Editor"
            description="Shape the available expertise and author instructions for each specialist."
            actions={<span>{crew.length} crew onboard</span>}
          >
            <form className="inline-form" onSubmit={handleAddCrewMember}>
              <div>
                <label htmlFor="crew-name">Name</label>
                <input
                  id="crew-name"
                  value={newCrewMember.name}
                  onChange={(event) =>
                    setNewCrewMember((state) => ({ ...state, name: event.target.value }))
                  }
                  placeholder="Crewmember name"
                  required
                />
              </div>
              <div>
                <label htmlFor="crew-role">Role</label>
                <input
                  id="crew-role"
                  value={newCrewMember.role}
                  onChange={(event) =>
                    setNewCrewMember((state) => ({ ...state, role: event.target.value }))
                  }
                  placeholder="e.g. Systems Analyst"
                  required
                />
              </div>
              <div>
                <label htmlFor="crew-compartment">Station</label>
                <select
                  id="crew-compartment"
                  value={newCrewMember.compartment}
                  onChange={(event) =>
                    setNewCrewMember((state) => ({ ...state, compartment: event.target.value }))
                  }
                >
                  {compartments.map((compartment) => (
                    <option key={compartment.id} value={compartment.id}>
                      {compartment.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="wide">
                <label htmlFor="crew-instructions">Initial Instructions</label>
                <textarea
                  id="crew-instructions"
                  value={newCrewMember.instructions}
                  onChange={(event) =>
                    setNewCrewMember((state) => ({ ...state, instructions: event.target.value }))
                  }
                  placeholder="Outline their primary directives"
                  rows={2}
                />
              </div>
              <button type="submit" className="primary">
                Add crewmember
              </button>
            </form>

            <div className="crew-grid">
              {crew.map((member) => (
                <article key={member.id} className="crew-card">
                  <header>
                    <h3>{member.name}</h3>
                    <div className="crew-meta">
                      <span>
                        Role:
                        <input
                          value={member.role}
                          onChange={(event) => handleCrewRoleChange(member.id, event.target.value)}
                        />
                      </span>
                      <span>
                        Station:
                        <select
                          value={member.compartment}
                          onChange={(event) =>
                            handleCrewCompartmentChange(member.id, event.target.value)
                          }
                        >
                          {compartments.map((compartment) => (
                            <option key={compartment.id} value={compartment.id}>
                              {compartment.name}
                            </option>
                          ))}
                        </select>
                      </span>
                    </div>
                  </header>
                  <div className="crew-section">
                    <h4>Instructions</h4>
                    <textarea
                      value={member.instructions}
                      onChange={(event) =>
                        handleCrewInstructionChange(member.id, event.target.value)
                      }
                      onBlur={(event) =>
                        handleCrewInstructionBlur(member.id, member.name, event.target.value)
                      }
                      rows={3}
                    />
                  </div>
                  <div className="crew-section">
                    <h4>Assigned Tasks</h4>
                    {tasksByCrew[member.id]?.length ? (
                      <ul>
                        {tasksByCrew[member.id].map((task) => (
                          <li key={task.id}>{task.title}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty">No tasks assigned.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </Section>
        )}

        {activeTab === 'tasks' && (
          <Section
            title="Mission Taskboard"
            description="Author operations, assign specialists, and advance mission cadence."
            actions={<span>{tasks.length} active directives</span>}
          >
            <form className="inline-form" onSubmit={handleAddTask}>
              <div>
                <label htmlFor="task-title">Title</label>
                <input
                  id="task-title"
                  value={newTask.title}
                  onChange={(event) =>
                    setNewTask((state) => ({ ...state, title: event.target.value }))
                  }
                  placeholder="Task title"
                  required
                />
              </div>
              <div className="wide">
                <label htmlFor="task-objective">Objective</label>
                <textarea
                  id="task-objective"
                  value={newTask.objective}
                  onChange={(event) =>
                    setNewTask((state) => ({ ...state, objective: event.target.value }))
                  }
                  placeholder="Describe the desired outcome"
                  rows={2}
                />
              </div>
              <div>
                <label htmlFor="task-compartment">Primary Station</label>
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
              <fieldset className="assignee-picker">
                <legend>Assign Crew</legend>
                {crew.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={newTask.assignees.includes(member.id)}
                      onChange={() => toggleTaskAssignee(member.id)}
                    />
                    {member.name}
                  </label>
                ))}
              </fieldset>
              <div className="wide">
                <label htmlFor="task-reasoning">Intent / Reasoning</label>
                <textarea
                  id="task-reasoning"
                  value={newTask.reasoning}
                  onChange={(event) =>
                    setNewTask((state) => ({ ...state, reasoning: event.target.value }))
                  }
                  placeholder="Capture the coordination plan or risks"
                  rows={2}
                />
              </div>
              <button type="submit" className="primary">
                Add task
              </button>
            </form>

            <div className="task-board">
              {tasks.map((task) => (
                <article key={task.id} className={`task-card status-${task.status.toLowerCase()}`}>
                  <header>
                    <div>
                      <h3>{task.title}</h3>
                      <span className="status-chip">{task.status}</span>
                    </div>
                    <p>{task.objective}</p>
                  </header>
                  <dl>
                    <div>
                      <dt>Station</dt>
                      <dd>{compartments.find((compartment) => compartment.id === task.compartmentFocus)?.name}</dd>
                    </div>
                    <div>
                      <dt>Assignees</dt>
                      <dd>
                        {task.assignees
                          .map((id) => crew.find((member) => member.id === id)?.name)
                          .filter(Boolean)
                          .join(', ') || 'Unassigned'}
                      </dd>
                    </div>
                    <div>
                      <dt>Reasoning</dt>
                      <dd>{task.reasoning || 'No narrative supplied yet.'}</dd>
                    </div>
                  </dl>
                  <footer>
                    {task.status !== 'Completed' && (
                      <button
                        type="button"
                        onClick={() =>
                          updateTaskStatus(
                            task.id,
                            task.status === 'Planned' ? 'In Progress' : 'Completed',
                          )
                        }
                      >
                        Advance to {task.status === 'Planned' ? 'In Progress' : 'Completed'}
                      </button>
                    )}
                    {task.status === 'Completed' && <span className="completed">Ready for review</span>}
                  </footer>
                </article>
              ))}
            </div>
          </Section>
        )}

        {activeTab === 'teams' && (
          <Section
            title="Chain of Command Builder"
            description="Visualize how teams overlap and how responsibilities cascade."
            actions={<span>{teams.length} teams configured</span>}
          >
            <form className="inline-form" onSubmit={handleAddTeam}>
              <div>
                <label htmlFor="team-name">Team Name</label>
                <input
                  id="team-name"
                  value={newTeam.name}
                  onChange={(event) => setNewTeam((state) => ({ ...state, name: event.target.value }))}
                  placeholder="e.g. Navigation Liaison"
                  required
                />
              </div>
              <div className="wide">
                <label htmlFor="team-function">Purpose</label>
                <textarea
                  id="team-function"
                  value={newTeam.function}
                  onChange={(event) =>
                    setNewTeam((state) => ({ ...state, function: event.target.value }))
                  }
                  placeholder="What coordination problem does this team solve?"
                  rows={2}
                />
              </div>
              <fieldset className="assignee-picker">
                <legend>Attach Crew</legend>
                {crew.map((member) => (
                  <label key={member.id}>
                    <input
                      type="checkbox"
                      checked={newTeam.members.includes(member.id)}
                      onChange={() => toggleTeamMember(member.id)}
                    />
                    {member.name}
                  </label>
                ))}
              </fieldset>
              <button type="submit" className="primary">
                Form team
              </button>
            </form>

            <div className="team-grid">
              {teams.map((team) => (
                <article key={team.id} className="team-card">
                  <header>
                    <h3>{team.name}</h3>
                    <p>{team.function}</p>
                  </header>
                  <div className="team-members">
                    <h4>Members</h4>
                    {team.members.length ? (
                      <ul>
                        {team.members.map((id) => {
                          const member = crew.find((item) => item.id === id)
                          return <li key={id}>{member ? member.name : 'Former crew'}</li>
                        })}
                      </ul>
                    ) : (
                      <p className="empty">No members assigned.</p>
                    )}
                  </div>
                  <div className="team-matrix">
                    <h4>Collaborative Touchpoints</h4>
                    <table>
                      <thead>
                        <tr>
                          <th>Compartment</th>
                          <th>Supporting Tasks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {compartments.map((compartment) => {
                          const hasCrew = team.members.some((memberId) => {
                            const member = crew.find((item) => item.id === memberId)
                            return member?.compartment === compartment.id
                          })
                          const relatedTasks = tasks.filter((task) =>
                            task.assignees.some((assignee) => team.members.includes(assignee)) &&
                            task.compartmentFocus === compartment.id,
                          )
                          if (!hasCrew && relatedTasks.length === 0) return null
                          return (
                            <tr key={compartment.id}>
                              <td>{compartment.name}</td>
                              <td>
                                {relatedTasks.length ? (
                                  <ul>
                                    {relatedTasks.map((task) => (
                                      <li key={task.id}>{task.title}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="tag">Standby support</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </article>
              ))}
            </div>
          </Section>
        )}

        {activeTab === 'configuration' && (
          <Section
            title="Submarine Configuration Guide"
            description="Reference compartment resources, amenities, and connected workflows."
          >
            <div className="configuration-grid">
              {configurationGuide.map((compartment) => (
                <article key={compartment.id} className="configuration-card">
                  <header>
                    <h3>{compartment.name}</h3>
                    <p>{compartment.description}</p>
                  </header>
                  <div>
                    <h4>Amenities & Resources</h4>
                    <ul>
                      {compartment.resources.map((resource) => (
                        <li key={resource}>{resource}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Assigned Crew</h4>
                    {compartment.crew.length ? (
                      <ul>
                        {compartment.crew.map((member) => (
                          <li key={member.id}>{member.name}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty">No on-duty personnel.</p>
                    )}
                  </div>
                  <div>
                    <h4>Active Tasks</h4>
                    {compartment.tasks.length ? (
                      <ul>
                        {compartment.tasks.map((task) => (
                          <li key={task.id}>{task.title}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="empty">No current tasking.</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </Section>
        )}

        {activeTab === 'log' && (
          <Section
            title="Ship's Log"
            description="All reasoning, coordination notes, and task results are recorded here for after-action analysis."
            actions={<span>{shipLog.length} entries</span>}
          >
            <div className="log-list">
              {shipLog
                .slice()
                .reverse()
                .map((entry) => (
                  <article key={entry.id} className="log-entry">
                    <header>
                      <h3>{entry.title}</h3>
                      <span className="log-meta">
                        <span className="log-type">{entry.type}</span>
                        <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                      </span>
                    </header>
                    <p>{entry.narrative}</p>
                  </article>
                ))}
            </div>
          </Section>
        )}
      </main>
    </div>
  )
}

export default App
