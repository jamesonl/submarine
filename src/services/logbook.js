import { BACKEND_URL } from './openaiResponses.js'

function buildBackendUrl(path) {
  return `${BACKEND_URL.replace(/\/$/, '')}${path}`
}

export async function recordShipLogEntry(entry) {
  if (!entry) return null
  const payload = { ...entry }
  if (!payload.id) delete payload.id
  if ('persistedByBackend' in payload) {
    delete payload.persistedByBackend
  }
  if (!Array.isArray(payload.chainOfThought) && Array.isArray(payload.chain_of_thought)) {
    payload.chainOfThought = payload.chain_of_thought
    delete payload.chain_of_thought
  }
  if (!Array.isArray(payload.chainOfThought)) {
    payload.chainOfThought = []
  }
  if (!Array.isArray(payload.conversation)) {
    delete payload.conversation
  }
  if (!payload.metadata || typeof payload.metadata !== 'object') {
    delete payload.metadata
  }
  if (!payload.provider) {
    delete payload.provider
  }
  const response = await fetch(buildBackendUrl('/api/log'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`Failed to persist log entry (status ${response.status})`)
  }
  return response.json()
}

export async function resetShipLog() {
  const response = await fetch(buildBackendUrl('/api/log'), {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error(`Failed to reset ship log (status ${response.status})`)
  }
}

export async function fetchShipLogStory() {
  const response = await fetch(buildBackendUrl('/api/log/story'))
  if (!response.ok) {
    throw new Error(`Failed to fetch ship log story (status ${response.status})`)
  }
  const data = await response.json()
  return { story: data.story ?? '', entryCount: data.entry_count ?? data.entryCount ?? 0 }
}

export async function downloadShipLog() {
  const response = await fetch(buildBackendUrl('/api/log/download'))
  if (!response.ok) {
    throw new Error(`Failed to download ship log (status ${response.status})`)
  }
  const blob = await response.blob()
  const disposition = response.headers.get('Content-Disposition') || ''
  let filename = 'ship-log.json'
  const match = disposition.match(/filename="?([^";]+)"?/i)
  if (match && match[1]) {
    filename = match[1]
  }
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
