# Submarine Agents Backend

This FastAPI service orchestrates a multi-agent chain using OpenAI's Agents SDK (Assistants + Threads) so the front-end no longer talks to OpenAI directly. Each request fans out to navigation, intelligence, engineering, operations, and command roles before the requested crew member issues a final directive.

## Running locally

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
export OPENAI_API_KEY=sk-...
uvicorn backend.main:app --reload --port 8000
```

The React application expects the backend on `http://localhost:8000`. Override with `VITE_BACKEND_URL` in `.env` if necessary.

## Environment variables

- `OPENAI_API_KEY` – required to enable the multi-agent pipeline. Without it the backend falls back to a deterministic offline response so the UI still functions.

## API

`POST /api/crew/thought`

```json
{
  "crew_member": {"id": "navigator", "name": "Lieutenant Theo Park", ...},
  "milestone": {"id": "mid-atlantic-ridge", ...},
  "route": {"id": "ac-2-nyc-bude", ...},
  "elapsed_minutes": 3.2,
  "telemetry": {"progress": 0.27, "heading_deg": 96.4, "drift": 4.1, "fuel_percentage": 18.3},
  "crew_metrics": {"stress": 42, "fatigue": 21, "efficiency": 0.92}
}
```

Response:

```json
{
  "transcript": "Lieutenant Theo Park: ...",
  "chain_of_thought": ["Navigator: ...", "Intel: ..."],
  "provider": "agents-backend"
}
```
