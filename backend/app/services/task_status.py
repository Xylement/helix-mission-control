from enum import Enum
from typing import Optional


class TaskStatus(str, Enum):
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    REVIEW = "review"
    APPROVED = "approved"
    REJECTED = "rejected"
    DONE = "done"
    CANCELLED = "cancelled"


class ActorType(str, Enum):
    USER = "user"
    AGENT = "agent"
    SYSTEM = "system"
    HELIX = "helix"  # Helix Director has elevated permissions


# Valid status transitions per actor type
TRANSITIONS = {
    ActorType.AGENT: {
        TaskStatus.TODO: [TaskStatus.IN_PROGRESS],
        TaskStatus.IN_PROGRESS: [TaskStatus.REVIEW],
        TaskStatus.REJECTED: [TaskStatus.IN_PROGRESS],
    },
    ActorType.USER: {
        TaskStatus.TODO: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
        TaskStatus.IN_PROGRESS: [TaskStatus.REVIEW, TaskStatus.CANCELLED],
        TaskStatus.REVIEW: [TaskStatus.APPROVED, TaskStatus.REJECTED, TaskStatus.DONE],
        TaskStatus.APPROVED: [TaskStatus.DONE],
        TaskStatus.REJECTED: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
        TaskStatus.DONE: [],
        TaskStatus.CANCELLED: [TaskStatus.TODO],
    },
    ActorType.HELIX: {
        TaskStatus.TODO: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
        TaskStatus.IN_PROGRESS: [TaskStatus.REVIEW, TaskStatus.DONE, TaskStatus.CANCELLED],
        TaskStatus.REVIEW: [TaskStatus.APPROVED, TaskStatus.REJECTED, TaskStatus.DONE],
        TaskStatus.APPROVED: [TaskStatus.DONE],
        TaskStatus.REJECTED: [TaskStatus.IN_PROGRESS, TaskStatus.CANCELLED],
        TaskStatus.DONE: [],
        TaskStatus.CANCELLED: [TaskStatus.TODO],
    },
}


def validate_transition(
    current_status: TaskStatus,
    new_status: TaskStatus,
    actor_type: ActorType,
) -> tuple[bool, Optional[str]]:
    """
    Returns (is_valid, error_message).
    If valid, error_message is None.
    """
    if current_status == new_status:
        return True, None  # No-op is always valid

    actor_transitions = TRANSITIONS.get(actor_type, {})
    allowed = actor_transitions.get(current_status, [])

    if new_status not in allowed:
        return False, (
            f"{actor_type.value} cannot move task from '{current_status.value}' "
            f"to '{new_status.value}'. Allowed: {[s.value for s in allowed]}"
        )

    return True, None


def get_status_after_agent_completion() -> TaskStatus:
    """After an agent finishes work, task always goes to Review."""
    return TaskStatus.REVIEW
