import os
from dataclasses import dataclass
from typing import Dict, List, Optional

try:
    from openai import OpenAI
    from openai.error import OpenAIError
except ImportError:  # pragma: no cover - optional dependency during tests
    OpenAI = None
    OpenAIError = Exception  # type: ignore


@dataclass
class AgentDefinition:
    role: str
    name: str
    instructions: str
    prompt_template: str
    model: Optional[str] = None
    temperature: Optional[float] = None


AGENT_DEFINITIONS: Dict[str, AgentDefinition] = {
    "navigator": AgentDefinition(
        role="navigator",
        name="Navigation Watch Officer",
        model="gpt-4.1-mini",
        instructions=(
            "You are the navigation liaison for a submarine threading subsea cable corridors."
            " Emphasise headings, cardinal directions, depth bands, and cross-track drift when advising the bridge."
            " Provide concise bullet points that describe how to steer relative to the plotted line."
        ),
        prompt_template=(
            "Detail two bullet points covering helm adjustments and hazard avoidance using cardinal language."
            " Finish with one sentence that issues a navigation recommendation."
        ),
    ),
    "intel": AgentDefinition(
        role="intel",
        name="Intelligence Analyst",
        model="gpt-4.1-mini",
        instructions=(
            "You fuse sensor, satellite, and maritime traffic intelligence."
            " Speak to how contacts or hydrography influence safe headings in cardinal terms."
            " Reference coordination with other teams."
        ),
        prompt_template=(
            "Provide two short bullets describing the sensor picture and recommended observation arcs,"
            " then close with a sentence that briefs the bridge on monitoring priorities."
        ),
    ),
    "engineer": AgentDefinition(
        role="engineer",
        name="Engineering Watch Supervisor",
        model="gpt-4.1-mini",
        instructions=(
            "You monitor propulsion, ballast, and reactor loads."
            " Note how engineering settings support the requested heading and drift corrections."
            " Coordinate with navigation and operations for stability."
        ),
        prompt_template=(
            "Share two bullets on machinery posture and ballast trim,"
            " followed by one sentence that confirms propulsion readiness for the specified course."
        ),
    ),
    "operations": AgentDefinition(
        role="operations",
        name="Operations Coordinator",
        model="gpt-4.1-mini",
        instructions=(
            "You synchronise crew rotations and readiness."
            " Emphasise how communications with the bridge and engineering keep the vessel on the plotted line."
        ),
        prompt_template=(
            "Produce two bullets highlighting crew coordination tied to the current heading and drift,"
            " and finish with a sentence assigning next check-in responsibilities."
        ),
    ),
    "captain": AgentDefinition(
        role="captain",
        name="Commanding Officer",
        model="gpt-4.1-mini",
        instructions=(
            "You arbitrate the final manoeuvre."
            " Synthesize prior officer inputs and judge risk relative to the cardinal course."
        ),
        prompt_template=(
            "Deliver two short assessments covering risk and mission priority,"
            " then issue a single-sentence command decision that names the heading to hold."
        ),
    ),
}

SUPPORT_SEQUENCE: List[str] = ["navigator", "intel", "engineer", "operations", "captain"]


def format_heading(heading: Optional[float]) -> str:
    if heading is None:
        return "steady course"
    wrapped = (heading % 360 + 360) % 360
    headings = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
    label = headings[int(round(wrapped / 45)) % len(headings)]
    return f"{wrapped:.0f}° {label}"


def format_drift(drift: Optional[float]) -> str:
    if drift is None:
        return "centerline"
    magnitude = abs(drift)
    if magnitude < 1:
        return "centerline"
    side = "starboard" if drift > 0 else "port"
    return f"{magnitude:.0f} pt {side}"


def format_efficiency(efficiency: Optional[float]) -> str:
    if efficiency is None:
        return ""
    return f"Efficiency {efficiency * 100:.0f}%"


class AgentOrchestrator:
    def __init__(self, default_model: str = "gpt-4.1-mini") -> None:
        self.default_model = default_model
        self._client: Optional[OpenAI] = None
        self._assistant_cache: Dict[str, str] = {}

    def is_available(self) -> bool:
        return OpenAI is not None and bool(os.getenv("OPENAI_API_KEY"))

    def _ensure_client(self) -> OpenAI:
        if self._client is None:
            if OpenAI is None:
                raise RuntimeError("OpenAI SDK not available")
            self._client = OpenAI()
        return self._client

    def _ensure_assistant(self, role: str) -> str:
        if role in self._assistant_cache:
            return self._assistant_cache[role]
        definition = AGENT_DEFINITIONS[role]
        client = self._ensure_client()
        assistant = client.beta.assistants.create(
            model=definition.model or self.default_model,
            name=definition.name,
            instructions=definition.instructions,
            temperature=definition.temperature,
        )
        self._assistant_cache[role] = assistant.id
        return assistant.id

    def _build_sequence(self, target_role: str) -> List[str]:
        sequence = [role for role in SUPPORT_SEQUENCE if role != target_role]
        sequence.append(target_role)
        return sequence

    def _compose_prompt(
        self,
        role: str,
        context: Dict[str, object],
        prior_responses: List[Dict[str, str]],
    ) -> str:
        milestone = context["milestone"]
        route = context["route"]
        telemetry = context["telemetry"]
        metrics = context.get("metrics") or {}
        summary_lines = [
            f"Mission: {route['name']} ({route['cable']}).",
            f"Milestone: {milestone['label']} — {milestone['description']}",
            f"Elapsed: {context['elapsed_minutes']:.1f} min · Progress {context['progress']:.0f}% complete",
            f"Heading {telemetry['heading_label']} with {telemetry['drift_label']} drift",
        ]
        if telemetry.get("fuel_label"):
            summary_lines.append(f"Fuel reserves {telemetry['fuel_label']}")
        if metrics:
            detail = ", ".join(filter(None, [
                format_efficiency(metrics.get("efficiency")),
                f"Stress {metrics['stress']:.0f}%" if isinstance(metrics.get("stress"), (int, float)) else "",
                f"Fatigue {metrics['fatigue']:.0f}%" if isinstance(metrics.get("fatigue"), (int, float)) else "",
            ]))
            if detail:
                summary_lines.append(detail)

        if prior_responses:
            thread = "\n".join(
                f"{entry['role'].title()}: {entry['content']}" for entry in prior_responses
            )
            conversation = f"\nPrior inputs:\n{thread}\n"
        else:
            conversation = "\nNo prior agent inputs.\n"

        if role in AGENT_DEFINITIONS:
            template = AGENT_DEFINITIONS[role].prompt_template
        else:
            template = (
                "Summarise the situation in two bullet points and close with a directive sentence"
                " that references the present heading."
            )

        if role == context["target_role"]:
            template = (
                f"Speak as {context['crew']['name']} ({context['crew']['role']}). "
                "Provide two crisp bullets describing your reasoning and finish with a directive"
                " sentence for the crew that cites the heading to steer."
            )

        summary = "\n".join(summary_lines)
        return f"{summary}\n{conversation}\n{template}"

    def run(self, context: Dict[str, object]) -> List[Dict[str, str]]:
        if not self.is_available():
            raise RuntimeError("OpenAI Agents SDK is not available")

        client = self._ensure_client()
        sequence = self._build_sequence(context["target_role"])
        thread = client.beta.threads.create()
        conversation: List[Dict[str, str]] = []

        try:
            for role in sequence:
                assistant_id = self._ensure_assistant(role)
                prompt = self._compose_prompt(role, context, conversation)
                client.beta.threads.messages.create(thread_id=thread.id, role="user", content=prompt)
                run = client.beta.threads.runs.create_and_poll(thread_id=thread.id, assistant_id=assistant_id)
                if run.status != "completed":
                    raise RuntimeError(f"Agent '{role}' did not complete (status={run.status}).")

                messages = client.beta.threads.messages.list(thread_id=thread.id, order="desc", limit=5)
                response_text = ""
                for message in messages.data:
                    if message.run_id != run.id:
                        continue
                    for block in message.content:
                        if getattr(block, "type", None) == "text":  # type: ignore[attr-defined]
                            response_text += block.text.value.strip() + "\n"
                response_text = response_text.strip() or "No directive provided."
                conversation.append({"role": role, "content": response_text})
        except OpenAIError as exc:  # pragma: no cover - network failure path
            raise RuntimeError("Agents SDK call failed") from exc

        return conversation


def synthesise_fallback(context: Dict[str, object]) -> Dict[str, object]:
    telemetry = context["telemetry"]
    heading = telemetry["heading_label"]
    drift = telemetry["drift_label"]
    crew = context["crew"]
    milestone = context["milestone"]
    chain = [
        f"Navigator notes heading {heading} with {drift}.",
        f"Intel confirms corridor risks near {milestone['label']}.",
        "Engineering keeps propulsion steady for cardinal adjustments.",
    ]
    transcript = (
        f"{crew['name']}: Maintain {heading.lower()} and hold the line through {milestone['label'].lower()}."
        " Report if drift grows beyond safe margins."
    )
    return {"transcript": transcript, "chain_of_thought": chain, "provider": "fallback"}
