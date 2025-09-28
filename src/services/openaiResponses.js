const RESPONSES_ENDPOINT = 'https://api.openai.com/v1/responses'

const DEFAULT_MODEL = 'gpt-4.1-mini'

function buildCrewPrompt({ crewMember, milestone, route, elapsedMinutes }) {
  return [
    {
      role: 'system',
      content: `You are ${crewMember.name}, ${crewMember.role} aboard a submarine tracing undersea cables. Provide a concise thought process (three short bullet points) and a closing directive sentence. Maintain professional naval tone.`,
    },
    {
      role: 'user',
      content: `Current milestone: ${milestone.label}. Situation: ${milestone.description}. Route: ${route.name} (${route.cable}). Elapsed minutes: ${elapsedMinutes.toFixed(
        1,
      )}. Alliances assisting: ${crewMember.alliances.join(
        ', ',
      )}. Primary directives: ${crewMember.instructions}. Share your internal reasoning bullets followed by a directive to the crew.`,
    },
  ]
}

async function callResponsesEndpoint({ apiKey, body }) {
  const response = await fetch(RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error?.message ?? 'Unable to fetch crew reasoning from OpenAI responses API')
  }

  return response.json()
}

export async function requestCrewThought({
  crewMember,
  milestone,
  route,
  elapsedMinutes,
  model = DEFAULT_MODEL,
}) {
  const apiKey = import.meta.env.VITE_OPENAI_API_KEY
  if (!apiKey) {
    const fallbackThoughts = [
      `Reviewing ${milestone.label} hazard contours alongside ${crewMember.alliances.join(', ')}.`,
      'Cross-referencing telemetry with bathymetric archives.',
      'Reconfirming redundancy paths if the cable bends beyond safe tolerance.',
    ]
    return {
      transcript: `${crewMember.name}: Maintain formation discipline and execute countermeasures for ${milestone.label.toLowerCase()}.`,
      chainOfThought: fallbackThoughts,
      provider: 'fallback',
    }
  }

  const messages = buildCrewPrompt({ crewMember, milestone, route, elapsedMinutes })

  try {
    const payload = {
      model,
      input: messages,
      temperature: 0.8,
      max_output_tokens: 256,
    }

    const result = await callResponsesEndpoint({ apiKey, body: payload })
    const output = result.output?.[0]?.content?.[0]?.text ?? ''
    const [rawThoughts, directive] = output.split('\n\n').map((part) => part.trim())
    const chainOfThought = rawThoughts
      ? rawThoughts
          .split(/\n+/)
          .map((line) => line.replace(/^[-*\d.\s]+/, '').trim())
          .filter(Boolean)
      : []

    return {
      transcript: directive?.length ? directive : `${crewMember.name}: ${output.trim()}`,
      chainOfThought: chainOfThought.length ? chainOfThought : [output.trim()],
      provider: 'openai',
    }
  } catch (error) {
    console.error(error)
    return {
      transcript: `${crewMember.name}: Maintain vigilance while we pass ${milestone.label}.`,
      chainOfThought: [error.message],
      provider: 'error-fallback',
    }
  }
}
