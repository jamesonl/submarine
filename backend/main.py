from typing import List, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

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


app = FastAPI(title="Submarine Agents Backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

orchestrator = AgentOrchestrator()


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
    for entry in conversation[:-1]:
        for raw_line in entry["content"].splitlines():
            cleaned = raw_line.strip().lstrip("-•·").strip()
            if cleaned:
                thought_lines.append(cleaned)
    return CrewThoughtResponse(
        transcript=final_entry["content"],
        chain_of_thought=thought_lines,
        provider="agents-backend",
    )


@app.post("/api/crew/thought", response_model=CrewThoughtResponse)
async def create_crew_thought(payload: CrewThoughtRequest) -> CrewThoughtResponse:
    context = _prepare_context(payload)
    if orchestrator.is_available():
        try:
            conversation = orchestrator.run(context)
            return _build_response_from_conversation(conversation)
        except HTTPException:
            raise
        except Exception:  # pragma: no cover - defensive logging
            fallback = synthesise_fallback(context)
            return CrewThoughtResponse(**fallback)
    fallback = synthesise_fallback(context)
    return CrewThoughtResponse(**fallback)
