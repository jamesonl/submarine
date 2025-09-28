const BACKEND_URL = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000'
const REQUEST_TIMEOUT_MS = 30000

function sanitizeInstructions(value) {
  if (!value) return ''
  if (Array.isArray(value)) {
    return value.join(' ')
  }
  return String(value)
}

function formatHeading(headingDeg) {
  if (typeof headingDeg !== 'number' || Number.isNaN(headingDeg)) return 'steady course'
  const wrapped = ((headingDeg % 360) + 360) % 360
  const headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const index = Math.round((wrapped % 360) / 45) % headings.length
  return `${wrapped.toFixed(0)}° ${headings[index]}`
}

function describeDrift(lateralOffset) {
  if (typeof lateralOffset !== 'number' || Number.isNaN(lateralOffset)) return 'holding centerline'
  const magnitude = Math.abs(lateralOffset)
  if (magnitude < 1) return 'holding centerline'
  return `${magnitude.toFixed(0)} pt ${lateralOffset > 0 ? 'starboard' : 'port'} drift`
}

function buildFallbackThought({ crewMember, milestone, telemetry, aggregateStress }) {
  const heading = formatHeading(telemetry?.headingDeg)
  const drift = describeDrift(telemetry?.lateralOffset)
  const stressLine = typeof aggregateStress === 'number'
    ? `Team stress steady at ${Math.round(aggregateStress)}%.`
    : 'Team stress within acceptable range.'
  const alliances = crewMember.alliances?.length ? crewMember.alliances.join(', ') : 'bridge leads'

  const chainOfThought = [
    `Plotting ${heading} along the corridor with ${drift}.`,
    `Coordinating with ${alliances} to screen ${milestone.label.toLowerCase()}.`,
    stressLine,
  ]

  return {
    transcript: `${crewMember.name}: Maintain ${heading.toLowerCase()} and report any deviation from ${milestone.label.toLowerCase()}.`,
    chainOfThought,
    provider: 'fallback',
  }
}

async function callBackend(path, payload) {
  const url = `${BACKEND_URL.replace(/\/$/, '')}${path}`
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error?.error ?? `Backend request failed with status ${response.status}`)
    }

    return response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function requestCrewThought({
  crewMember,
  milestone,
  route,
  elapsedMinutes,
  telemetry = {},
  crewMetrics = null,
  aggregateStress,
}) {
  if (!crewMember || !milestone || !route) {
    return {
      transcript: 'Mission Control: Unable to synthesise crew guidance.',
      chainOfThought: ['Missing context for crew reasoning.'],
      provider: 'error-fallback',
    }
  }

  const basePayload = {
    crew_member: {
      id: crewMember.id,
      name: crewMember.name,
      role: crewMember.role,
      alliances: crewMember.alliances ?? [],
      instructions: sanitizeInstructions(crewMember.instructions),
    },
    milestone: {
      id: milestone.id,
      label: milestone.label,
      description: milestone.description,
    },
    route: {
      id: route.id,
      name: route.name,
      cable: route.cable,
    },
    elapsed_minutes: Number.isFinite(elapsedMinutes) ? elapsedMinutes : 0,
    telemetry: {
      progress: telemetry?.progress ?? 0,
      heading_deg: telemetry?.headingDeg ?? null,
      drift: telemetry?.lateralOffset ?? 0,
      fuel_percentage: telemetry?.fuelPercentage ?? null,
      stress_percentage: typeof aggregateStress === 'number' ? aggregateStress : null,
    },
    crew_metrics: crewMetrics
      ? {
          stress: crewMetrics.stress ?? null,
          fatigue: crewMetrics.fatigue ?? null,
          efficiency: crewMetrics.efficiency ?? null,
        }
      : null,
  }

  try {
    const result = await callBackend('/api/crew/thought', basePayload)
    const transcript = result.transcript ?? result.message
    const chain = Array.isArray(result.chain_of_thought)
      ? result.chain_of_thought
      : Array.isArray(result.chainOfThought)
        ? result.chainOfThought
        : []
    if (!transcript) {
      throw new Error('Backend did not return transcript content')
    }
    return {
      transcript,
      chainOfThought: chain,
      provider: result.provider ?? 'agents-backend',
    }
  } catch (error) {
    console.warn('Falling back to onboard reasoning:', error)
    return buildFallbackThought({ crewMember, milestone, telemetry, aggregateStress })
  }
}
