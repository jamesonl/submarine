import io
import json
from datetime import datetime, timedelta
from threading import Lock
from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import AliasChoices, BaseModel, Field, ConfigDict

from .agents import AgentOrchestrator, format_drift, format_heading, synthesise_fallback


def clamp(value: float, minimum: float, maximum: float) -> float:
    return max(minimum, min(maximum, value))


class CrewMemberPayload(BaseModel):
    id: str
    name: str
    role: str
    alliances: List[str] = Field(default_factory=list)
    instructions: Optional[str] = ""


class MilestonePayload(BaseModel):
    id: str
    label: str
    description: str


class RoutePayload(BaseModel):
    id: str
    name: str
    cable: str


class TelemetryPayload(BaseModel):
    progress: float = 0.0
    heading_deg: Optional[float] = None
    drift: Optional[float] = None
    fuel_percentage: Optional[float] = None
    stress_percentage: Optional[float] = None


class CrewMetricsPayload(BaseModel):
    stress: Optional[float] = None
    fatigue: Optional[float] = None
    efficiency: Optional[float] = None


class CrewThoughtRequest(BaseModel):
    crew_member: CrewMemberPayload
    milestone: MilestonePayload
    route: RoutePayload
    elapsed_minutes: float = 0.0
    telemetry: TelemetryPayload = TelemetryPayload()
    crew_metrics: Optional[CrewMetricsPayload] = None


class CrewThoughtResponse(BaseModel):
    transcript: str
    chain_of_thought: List[str]
    provider: str = "agents-backend"
    conversation: List[Dict[str, str]] = Field(default_factory=list)
    log_entry_id: Optional[str] = None


class ShipLogEntryPayload(BaseModel):
    """Payload used to persist entries inside the backend logbook."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    id: Optional[str] = None
    timestamp: Optional[datetime] = None
    entry_type: str = Field(default="system", alias="type")
    author: str
    role: Optional[str] = None
    transcript: str
    chain_of_thought: List[str] = Field(
        default_factory=list,
        validation_alias=AliasChoices("chain_of_thought", "chainOfThought"),
    )
    provider: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    conversation: Optional[List[Dict[str, str]]] = Field(
        default=None,
        validation_alias=AliasChoices("conversation", "conversation_history"),
    )


class ShipLogEntryResponse(BaseModel):
    id: str
    timestamp: str
    type: str
    author: str
    role: Optional[str] = None
    transcript: str
    chain_of_thought: List[str] = Field(default_factory=list)
    provider: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    conversation: List[Dict[str, str]] = Field(default_factory=list)


app = FastAPI(title="Submarine Agents Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = AgentOrchestrator()

_ship_log_entries: List[ShipLogEntryResponse] = []
_ship_log_lock = Lock()
_MAX_LOG_ENTRIES = 2000


def _serialize_timestamp(value: datetime) -> str:
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _record_ship_log_entry(payload: ShipLogEntryPayload) -> ShipLogEntryResponse:
    timestamp = payload.timestamp or datetime.utcnow()
    entry_id = payload.id or f"log-{uuid4()}"
    record = ShipLogEntryResponse(
        id=entry_id,
        timestamp=_serialize_timestamp(timestamp),
        type=payload.entry_type,
        author=payload.author,
        role=payload.role,
        transcript=payload.transcript,
        chain_of_thought=list(payload.chain_of_thought),
        provider=payload.provider,
        metadata=payload.metadata or {},
        conversation=list(payload.conversation or []),
    )
    with _ship_log_lock:
        _ship_log_entries.append(record)
        if len(_ship_log_entries) > _MAX_LOG_ENTRIES:
            del _ship_log_entries[: len(_ship_log_entries) - _MAX_LOG_ENTRIES]
    return record


def _get_ship_log_entries() -> List[ShipLogEntryResponse]:
    with _ship_log_lock:
        return list(_ship_log_entries)


def _reset_ship_log() -> None:
    with _ship_log_lock:
        _ship_log_entries.clear()


def _parse_timestamp(value: str) -> Optional[datetime]:
    try:
        if value.endswith("Z"):
            value = value[:-1] + "+00:00"
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _format_duration(delta: timedelta) -> Optional[str]:
    total_seconds = int(delta.total_seconds())
    if total_seconds <= 0:
        return None
    hours, remainder = divmod(total_seconds, 3600)
    minutes, _seconds = divmod(remainder, 60)
    parts: List[str] = []
    if hours:
        parts.append(f"{hours} hour{'s' if hours != 1 else ''}")
    if minutes:
        parts.append(f"{minutes} minute{'s' if minutes != 1 else ''}")
    if not parts:
        parts.append("moments")
    return " and ".join(parts)


def _build_ship_log_story(entries: List[ShipLogEntryResponse]) -> str:
    if not entries:
        return "No ship log entries were recorded for this voyage."

    ordered = sorted(entries, key=lambda item: item.timestamp)
    start_time = _parse_timestamp(ordered[0].timestamp)
    end_time = _parse_timestamp(ordered[-1].timestamp)
    duration_label: Optional[str] = None
    if start_time and end_time:
        duration_label = _format_duration(end_time - start_time)

    total_entries = len(entries)
    system_events = [entry for entry in ordered if entry.type == "system"]
    reflection_events = [entry for entry in ordered if entry.type == "reflection"]
    crew_updates = [entry for entry in ordered if entry.type in {"crew", "reflection"}]

    paragraphs: List[str] = []
    opening = (
        f"The ship's log captures {total_entries} coordinated updates"
        if total_entries != 1
        else "The ship's log captures a single coordinated update"
    )
    if duration_label:
        opening += f" across {duration_label}."
    else:
        opening += "."
    paragraphs.append(opening)

    if system_events:
        highlights = ", ".join(
            event.transcript.split(".")[0] for event in system_events[:3]
        )
        paragraphs.append(
            "Mission waypoints and alerts were marked by the control team: "
            f"{highlights}."
        )

    if reflection_events:
        paragraphs.append(
            "Crew reflections surfaced on a steady cadence, allowing every department to "
            "voice morale and emotional posture as the voyage advanced."
        )

    if crew_updates:
        final_update = crew_updates[-1]
        closing = final_update.transcript.strip()
        paragraphs.append(
            "The journey closed with "
            f"{final_update.author}'s words: \"{closing}\""
        )

    return "\n\n".join(paragraphs)


def _prepare_context(payload: CrewThoughtRequest) -> dict:
    telemetry = payload.telemetry
    progress_percent = clamp(telemetry.progress, 0.0, 1.0) * 100
    heading_label = format_heading(telemetry.heading_deg)
    drift_label = format_drift(telemetry.drift)
    fuel_label = (
        f"{telemetry.fuel_percentage:.1f}% fuel" if telemetry.fuel_percentage is not None else None
    )
    crew_metrics = payload.crew_metrics.model_dump() if payload.crew_metrics else None

    return {
        "crew": payload.crew_member.model_dump(),
        "milestone": payload.milestone.model_dump(),
        "route": payload.route.model_dump(),
        "elapsed_minutes": max(0.0, payload.elapsed_minutes),
        "progress": progress_percent,
        "telemetry": {
            "heading_label": heading_label,
            "drift_label": drift_label,
            "fuel_label": fuel_label,
            "stress": telemetry.stress_percentage,
        },
        "metrics": crew_metrics,
        "target_role": payload.crew_member.id,
    }


def _build_response_from_conversation(conversation: List[dict]) -> CrewThoughtResponse:
    if not conversation:
        raise ValueError("Conversation was empty")
    final_entry = conversation[-1]
    thought_lines: List[str] = []
    conversation_records: List[Dict[str, str]] = []
    for entry in conversation:
        role = entry.get("role", "crew")
        content = entry.get("content", "")
        conversation_records.append({"role": role, "content": content})
        for raw_line in content.splitlines():
            cleaned = raw_line.strip()
            if cleaned:
                thought_lines.append(f"{role.title()}: {cleaned}")
    return CrewThoughtResponse(
        transcript=final_entry["content"],
        chain_of_thought=thought_lines,
        provider="agents-backend",
        conversation=conversation_records,
    )


def _log_crew_thought(
    context: Dict[str, Any],
    request: CrewThoughtRequest,
    response: CrewThoughtResponse,
) -> CrewThoughtResponse:
    metadata = {
        "crew_id": request.crew_member.id,
        "crew_role": request.crew_member.role,
        "milestone_id": request.milestone.id,
        "milestone_label": request.milestone.label,
        "route_id": request.route.id,
        "route_name": request.route.name,
        "elapsed_minutes": context.get("elapsed_minutes"),
        "progress_percent": context.get("progress"),
        "telemetry": context.get("telemetry"),
        "metrics": context.get("metrics"),
        "source": "crew_thought",
    }
    entry = ShipLogEntryPayload(
        id=response.log_entry_id,
        entry_type="crew",
        author=request.crew_member.name,
        role=request.crew_member.role,
        transcript=response.transcript,
        chain_of_thought=response.chain_of_thought,
        provider=response.provider,
        metadata=metadata,
        conversation=response.conversation,
    )
    record = _record_ship_log_entry(entry)
    return response.model_copy(update={"log_entry_id": record.id})


@app.post("/api/crew/thought", response_model=CrewThoughtResponse)
async def create_crew_thought(payload: CrewThoughtRequest) -> CrewThoughtResponse:
    context = _prepare_context(payload)
    if orchestrator.is_available():
        try:
            conversation = orchestrator.run(context)
            response = _build_response_from_conversation(conversation)
            return _log_crew_thought(context, payload, response)
        except HTTPException:
            raise
        except Exception:  # pragma: no cover - defensive logging
            fallback = synthesise_fallback(context)
            response = CrewThoughtResponse(**fallback)
            return _log_crew_thought(context, payload, response)
    fallback = synthesise_fallback(context)
    response = CrewThoughtResponse(**fallback)
    return _log_crew_thought(context, payload, response)


@app.post("/api/log", response_model=ShipLogEntryResponse)
def append_ship_log(entry: ShipLogEntryPayload) -> ShipLogEntryResponse:
    return _record_ship_log_entry(entry)


@app.get("/api/log", response_model=List[ShipLogEntryResponse])
def list_ship_log() -> List[ShipLogEntryResponse]:
    return _get_ship_log_entries()


@app.delete("/api/log")
def clear_ship_log() -> JSONResponse:
    _reset_ship_log()
    return JSONResponse({"status": "cleared"})


@app.get("/api/log/download")
def download_ship_log() -> StreamingResponse:
    entries = _get_ship_log_entries()
    payload = {
        "exported_at": _serialize_timestamp(datetime.utcnow()),
        "entry_count": len(entries),
        "entries": [entry.model_dump() for entry in entries],
    }
    data = json.dumps(payload, ensure_ascii=False, indent=2)
    buffer = io.BytesIO(data.encode("utf-8"))
    buffer.seek(0)
    filename = f"ship-log-{datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')}" + ".json"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(buffer, media_type="application/json", headers=headers)


@app.get("/api/log/story")
def ship_log_story() -> Dict[str, Any]:
    entries = _get_ship_log_entries()
    story = _build_ship_log_story(entries)
    return {"story": story, "entry_count": len(entries)}
