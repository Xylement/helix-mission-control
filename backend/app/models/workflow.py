from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import String, DateTime, ForeignKey, Integer, Text, Boolean
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Workflow(Base):
    """Workflow definition — a named, reusable DAG of steps."""
    __tablename__ = "workflows"

    id: Mapped[int] = mapped_column(primary_key=True)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    trigger_type: Mapped[str] = mapped_column(String(20), default="manual")  # manual | schedule | event
    trigger_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    marketplace_template_slug: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    steps: Mapped[list["WorkflowStep"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan",
        order_by="WorkflowStep.step_order"
    )
    executions: Mapped[list["WorkflowExecution"]] = relationship(
        back_populates="workflow", cascade="all, delete-orphan"
    )


class WorkflowStep(Base):
    """A single node in the workflow DAG."""
    __tablename__ = "workflow_steps"

    id: Mapped[int] = mapped_column(primary_key=True)
    workflow_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    step_id: Mapped[str] = mapped_column(String(50), nullable=False)  # e.g. 'brief', 'write', 'review'
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    agent_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("agents.id", ondelete="SET NULL"), nullable=True)
    action_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    depends_on: Mapped[list[str] | None] = mapped_column(ARRAY(String(50)), server_default="{}", nullable=True)
    timeout_minutes: Mapped[int] = mapped_column(Integer, default=60)
    requires_approval: Mapped[bool] = mapped_column(Boolean, default=False)
    step_order: Mapped[int] = mapped_column(Integer, default=0)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    position_x: Mapped[int] = mapped_column(Integer, default=0)
    position_y: Mapped[int] = mapped_column(Integer, default=0)

    workflow: Mapped["Workflow"] = relationship(back_populates="steps")
    agent: Mapped[Optional["Agent"]] = relationship()  # noqa: F821


class WorkflowExecution(Base):
    """A running instance of a workflow."""
    __tablename__ = "workflow_executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    workflow_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False)
    org_id: Mapped[int] = mapped_column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="running")  # running | paused | completed | failed | cancelled
    input_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    started_by: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    workflow: Mapped["Workflow"] = relationship(back_populates="executions")
    step_executions: Mapped[list["WorkflowStepExecution"]] = relationship(
        back_populates="execution", cascade="all, delete-orphan"
    )


class WorkflowStepExecution(Base):
    """Tracks execution state of a single step within a workflow execution."""
    __tablename__ = "workflow_step_executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    execution_id: Mapped[int] = mapped_column(Integer, ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=False)
    step_id: Mapped[str] = mapped_column(String(50), nullable=False)
    task_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | running | waiting_approval | completed | failed | skipped
    input_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    output_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    execution: Mapped["WorkflowExecution"] = relationship(back_populates="step_executions")
