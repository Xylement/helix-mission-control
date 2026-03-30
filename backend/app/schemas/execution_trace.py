from datetime import datetime
from pydantic import BaseModel


class TraceStepOut(BaseModel):
    id: str
    step_number: int
    step_type: str
    content: str | None = None
    tool_name: str | None = None
    tool_input: dict | None = None
    tool_output: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    estimated_cost_usd: float = 0
    duration_ms: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class TraceOut(BaseModel):
    id: str
    task_id: int
    agent_id: int
    trace_status: str
    total_steps: int = 0
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    total_estimated_cost_usd: float = 0
    model_provider: str | None = None
    model_name: str | None = None
    error_message: str | None = None
    started_at: datetime
    completed_at: datetime | None = None
    duration_ms: int | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class TraceDetailOut(TraceOut):
    steps: list[TraceStepOut] = []


class TraceStatsOut(BaseModel):
    total_traces: int = 0
    avg_steps: float = 0
    avg_cost_usd: float = 0
    avg_duration_ms: float = 0
