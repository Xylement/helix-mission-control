"""Create all tables from scratch

Revision ID: 001_initial_schema
Revises: None
Create Date: 2026-03-24

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- organizations (no deps) ---
    op.create_table(
        "organizations",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(200), unique=True, nullable=False),
        sa.Column("slug", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- departments (FK → organizations) ---
    op.create_table(
        "departments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("emoji", sa.String(10), nullable=True),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- boards (FK → departments) ---
    op.create_table(
        "boards",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("sort_order", sa.Integer, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- users (FK → organizations) ---
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("email", sa.String(255), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", sa.String(20), server_default="member"),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("avatar_url", sa.String(500), nullable=True),
        sa.Column("telegram_notifications", sa.Boolean, server_default="false"),
        sa.Column("telegram_user_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- ai_models (FK → organizations) ---
    op.create_table(
        "ai_models",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("api_key_encrypted", sa.Text, nullable=True),
        sa.Column("base_url", sa.String(500), nullable=False),
        sa.Column("is_default", sa.Boolean, server_default="false"),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # --- gateways (FK → organizations) ---
    op.create_table(
        "gateways",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("websocket_url", sa.String(500), nullable=False),
        sa.Column("token", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- agents (FK → organizations, departments, boards, ai_models) ---
    op.create_table(
        "agents",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(100), unique=True, nullable=False, index=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("role_title", sa.String(200), nullable=False),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("primary_board_id", sa.Integer, sa.ForeignKey("boards.id"), nullable=False),
        sa.Column("system_prompt", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), server_default="offline"),
        sa.Column("execution_mode", sa.String(20), server_default="manual"),
        sa.Column("ai_model_id", sa.Integer, sa.ForeignKey("ai_models.id"), nullable=True),
        sa.Column("model_provider", sa.String(50), nullable=True),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("marketplace_template_slug", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- tasks (FK → boards, agents, users) ---
    op.create_table(
        "tasks",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("status", sa.String(20), server_default="todo"),
        sa.Column("priority", sa.String(20), server_default="medium"),
        sa.Column("board_id", sa.Integer, sa.ForeignKey("boards.id"), nullable=False),
        sa.Column("assigned_agent_id", sa.Integer, sa.ForeignKey("agents.id"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("requires_approval", sa.Boolean, server_default="false"),
        sa.Column("result", sa.Text, nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.Text), server_default="{}"),
        sa.Column("archived", sa.Boolean, server_default="false"),
        sa.Column("metadata", postgresql.JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # --- comments (FK → tasks) ---
    op.create_table(
        "comments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_type", sa.String(10), nullable=False),
        sa.Column("author_id", sa.Integer, nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("mentions", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- activity_logs (FK → organizations) ---
    op.create_table(
        "activity_logs",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("actor_type", sa.String(10), nullable=False),
        sa.Column("actor_id", sa.Integer, nullable=True),
        sa.Column("action", sa.String(100), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.Integer, nullable=False),
        sa.Column("details", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- notifications (FK → organizations, users) ---
    op.create_table(
        "notifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("message", sa.String(1000), nullable=False),
        sa.Column("target_type", sa.String(50), nullable=True),
        sa.Column("target_id", sa.Integer, nullable=True),
        sa.Column("read", sa.Boolean, server_default="false"),
        sa.Column("telegram_sent", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_notifications_user_read_created",
        "notifications",
        ["user_id", "read", "created_at"],
    )

    # --- organization_settings (FK → organizations, gateways) ---
    op.create_table(
        "organization_settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), unique=True, nullable=False),
        sa.Column("moonshot_api_key", sa.String(500), nullable=True),
        sa.Column("openai_api_key", sa.String(500), nullable=True),
        sa.Column("anthropic_api_key", sa.String(500), nullable=True),
        sa.Column("default_gateway_id", sa.Integer, sa.ForeignKey("gateways.id"), nullable=True),
        sa.Column("model_provider", sa.String(50), nullable=True),
        sa.Column("model_name", sa.String(100), nullable=True),
        sa.Column("model_api_key_encrypted", sa.Text, nullable=True),
        sa.Column("model_base_url", sa.String(500), nullable=True),
        sa.Column("model_display_name", sa.String(100), nullable=True),
        sa.Column("model_context_window", sa.Integer, nullable=True),
        sa.Column("model_max_tokens", sa.Integer, nullable=True),
        sa.Column("timezone", sa.String(50), nullable=True),
        sa.Column("logo_url", sa.String(500), nullable=True),
        sa.Column("max_agents", sa.Integer, nullable=True),
        sa.Column("telegram_bot_token_encrypted", sa.Text, nullable=True),
        sa.Column("telegram_allowed_user_ids", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # --- service_tokens (FK → organizations, users) ---
    op.create_table(
        "service_tokens",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("token_hash", sa.String(255), nullable=False),
        sa.Column("token_prefix", sa.String(10), nullable=True, index=True),
        sa.Column("permissions", postgresql.JSONB, nullable=True),
        sa.Column("created_by_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("revoked", sa.Boolean, server_default="false"),
    )

    # --- task_attachments (FK → tasks, organizations, users, agents) ---
    op.create_table(
        "task_attachments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("filename", sa.String(500), nullable=False),
        sa.Column("file_path", sa.Text, nullable=False),
        sa.Column("file_size", sa.Integer, nullable=False),
        sa.Column("mime_type", sa.String(200), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("uploaded_by_agent_id", sa.Integer, sa.ForeignKey("agents.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- board_permissions (FK → boards, users) ---
    op.create_table(
        "board_permissions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("board_id", sa.Integer, sa.ForeignKey("boards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("permission_level", sa.String(20), nullable=False),
        sa.Column("granted_by_user_id", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
    )

    # --- onboarding_state (FK → organizations) ---
    op.create_table(
        "onboarding_state",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=True),
        sa.Column("current_step", sa.Integer, server_default="1"),
        sa.Column("completed", sa.Boolean, server_default="false"),
        sa.Column("data", sa.JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # --- token_usage (FK → organizations, agents, tasks) ---
    op.create_table(
        "token_usage",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id"), nullable=False, index=True),
        sa.Column("agent_id", sa.Integer, sa.ForeignKey("agents.id"), nullable=True, index=True),
        sa.Column("model_provider", sa.String(50), nullable=False),
        sa.Column("model_name", sa.String(100), nullable=False),
        sa.Column("input_tokens", sa.Integer, server_default="0"),
        sa.Column("output_tokens", sa.Integer, server_default="0"),
        sa.Column("total_tokens", sa.Integer, server_default="0"),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), index=True),
    )

    # --- skills (FK → organizations, users) ---
    op.create_table(
        "skills",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False, index=True),
        sa.Column("slug", sa.String(100), nullable=False),
        sa.Column("version", sa.String(20), server_default="1.0.0"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("category", sa.String(50), nullable=True),
        sa.Column("tags", postgresql.ARRAY(sa.Text), nullable=True),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("frontmatter", postgresql.JSONB, nullable=True),
        sa.Column("activation_mode", sa.String(20), server_default="always"),
        sa.Column("activation_boards", postgresql.ARRAY(sa.Integer), nullable=True),
        sa.Column("activation_tags", postgresql.ARRAY(sa.Text), nullable=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("is_system", sa.Boolean, server_default="false"),
        sa.Column("marketplace_template_id", sa.String(100), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("org_id", "slug", name="uq_skills_org_slug"),
    )

    # --- agent_skills (FK → agents, skills, users) ---
    op.create_table(
        "agent_skills",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("agent_id", sa.Integer, sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("skill_id", sa.Integer, sa.ForeignKey("skills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("agent_id", "skill_id", name="uq_agent_skills_agent_skill"),
    )

    # --- skill_attachments (FK → skills, users) ---
    op.create_table(
        "skill_attachments",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("skill_id", sa.Integer, sa.ForeignKey("skills.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("file_size", sa.Integer, nullable=True),
        sa.Column("mime_type", sa.String(100), nullable=True),
        sa.Column("storage_path", sa.Text, nullable=False),
        sa.Column("uploaded_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True)),
    )

    # --- installed_templates (FK → organizations, users) ---
    op.create_table(
        "installed_templates",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("template_slug", sa.String(100), nullable=False),
        sa.Column("template_type", sa.String(20), nullable=False),
        sa.Column("template_name", sa.String(200), nullable=False),
        sa.Column("template_version", sa.String(20), nullable=False),
        sa.Column("manifest", postgresql.JSONB, nullable=False),
        sa.Column("local_resource_id", sa.Integer, nullable=False),
        sa.Column("local_resource_type", sa.String(20), nullable=False),
        sa.Column("installed_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("installed_at", sa.DateTime(timezone=True)),
        sa.Column("is_active", sa.Boolean, server_default="true"),
    )

    # --- workflows (FK → organizations, users) ---
    op.create_table(
        "workflows",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("trigger_type", sa.String(20), server_default="manual"),
        sa.Column("trigger_config", postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("marketplace_template_slug", sa.String(100), nullable=True),
        sa.Column("created_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True)),
        sa.Column("updated_at", sa.DateTime(timezone=True)),
    )

    # --- workflow_steps (FK → workflows, agents) ---
    op.create_table(
        "workflow_steps",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("workflow_id", sa.Integer, sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_id", sa.String(50), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("agent_id", sa.Integer, sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action_prompt", sa.Text, nullable=True),
        sa.Column("depends_on", postgresql.ARRAY(sa.String(50)), server_default="{}"),
        sa.Column("timeout_minutes", sa.Integer, server_default="60"),
        sa.Column("requires_approval", sa.Boolean, server_default="false"),
        sa.Column("step_order", sa.Integer, server_default="0"),
        sa.Column("config", postgresql.JSONB, nullable=True),
        sa.Column("position_x", sa.Integer, server_default="0"),
        sa.Column("position_y", sa.Integer, server_default="0"),
    )

    # --- workflow_executions (FK → workflows, organizations, users) ---
    op.create_table(
        "workflow_executions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("workflow_id", sa.Integer, sa.ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), server_default="running"),
        sa.Column("input_data", postgresql.JSONB, nullable=True),
        sa.Column("output_data", postgresql.JSONB, nullable=True),
        sa.Column("started_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
    )

    # --- workflow_step_executions (FK → workflow_executions, tasks) ---
    op.create_table(
        "workflow_step_executions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("execution_id", sa.Integer, sa.ForeignKey("workflow_executions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step_id", sa.String(50), nullable=False),
        sa.Column("task_id", sa.Integer, sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("input_data", postgresql.JSONB, nullable=True),
        sa.Column("output_data", postgresql.JSONB, nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text, nullable=True),
    )

    # --- installed_plugins (FK → organizations, users) ---
    op.create_table(
        "installed_plugins",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plugin_slug", sa.String(100), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("emoji", sa.String(10), server_default="🔌"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("plugin_type", sa.String(30), server_default="api_connector"),
        sa.Column("manifest", postgresql.JSONB, nullable=False),
        sa.Column("credentials_encrypted", sa.LargeBinary, nullable=True),
        sa.Column("settings", postgresql.JSONB, nullable=True),
        sa.Column("is_active", sa.Boolean, server_default="true"),
        sa.Column("is_configured", sa.Boolean, server_default="false"),
        sa.Column("marketplace_template_slug", sa.String(100), nullable=True),
        sa.Column("installed_by", sa.Integer, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("installed_at", sa.DateTime(timezone=True)),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("org_id", "plugin_slug", name="uq_org_plugin_slug"),
    )

    # --- agent_plugins (FK → agents, installed_plugins) ---
    op.create_table(
        "agent_plugins",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("agent_id", sa.Integer, sa.ForeignKey("agents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plugin_id", sa.Integer, sa.ForeignKey("installed_plugins.id", ondelete="CASCADE"), nullable=False),
        sa.Column("capabilities", postgresql.JSONB, nullable=True),
        sa.UniqueConstraint("agent_id", "plugin_id", name="uq_agent_plugin"),
    )

    # --- plugin_executions (FK → organizations, installed_plugins, agents) ---
    op.create_table(
        "plugin_executions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("org_id", sa.Integer, sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("plugin_id", sa.Integer, sa.ForeignKey("installed_plugins.id", ondelete="SET NULL"), nullable=True),
        sa.Column("agent_id", sa.Integer, sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("capability_id", sa.String(100), nullable=False),
        sa.Column("capability_name", sa.String(200), nullable=True),
        sa.Column("request_data", postgresql.JSONB, nullable=True),
        sa.Column("response_summary", postgresql.JSONB, nullable=True),
        sa.Column("status", sa.String(20), server_default="pending"),
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),
        sa.Column("executed_at", sa.DateTime(timezone=True)),
    )

    # --- license_cache (raw SQL table, not a SQLAlchemy model) ---
    op.execute("""
        CREATE TABLE IF NOT EXISTS license_cache (
            id INTEGER PRIMARY KEY DEFAULT 1,
            license_key_prefix VARCHAR(30),
            plan VARCHAR(50),
            status VARCHAR(50),
            max_agents INTEGER DEFAULT 0,
            max_members INTEGER DEFAULT 0,
            features JSONB DEFAULT '[]',
            trial BOOLEAN DEFAULT false,
            trial_ends_at TIMESTAMP WITH TIME ZONE,
            current_period_end TIMESTAMP WITH TIME ZONE,
            grace_period_ends TIMESTAMP WITH TIME ZONE,
            message TEXT,
            last_validated_at TIMESTAMP WITH TIME ZONE,
            cached_response JSONB
        )
    """)


def downgrade() -> None:
    op.drop_table("plugin_executions")
    op.drop_table("agent_plugins")
    op.drop_table("installed_plugins")
    op.drop_table("workflow_step_executions")
    op.drop_table("workflow_executions")
    op.drop_table("workflow_steps")
    op.drop_table("workflows")
    op.drop_table("installed_templates")
    op.drop_table("skill_attachments")
    op.drop_table("agent_skills")
    op.drop_table("skills")
    op.drop_table("token_usage")
    op.drop_table("onboarding_state")
    op.drop_table("board_permissions")
    op.drop_table("task_attachments")
    op.drop_table("service_tokens")
    op.drop_table("organization_settings")
    op.drop_table("notifications")
    op.drop_table("activity_logs")
    op.drop_table("comments")
    op.drop_table("tasks")
    op.drop_table("agents")
    op.drop_table("gateways")
    op.drop_table("ai_models")
    op.drop_table("users")
    op.drop_table("boards")
    op.drop_table("departments")
    op.drop_table("organizations")
    op.execute("DROP TABLE IF EXISTS license_cache")
