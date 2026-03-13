from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.notification import Notification
from app.models.user import User

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/")
async def list_notifications(
    read: bool | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = select(Notification).where(Notification.user_id == user.id)
    count_q = select(func.count(Notification.id)).where(Notification.user_id == user.id)

    if read is not None:
        q = q.where(Notification.read == read)
        count_q = count_q.where(Notification.read == read)

    total = (await db.execute(count_q)).scalar() or 0
    unread_count = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id,
            Notification.read == False,
        )
    )).scalar() or 0

    q = q.order_by(Notification.created_at.desc())
    q = q.offset((page - 1) * per_page).limit(per_page)
    result = await db.execute(q)
    notifications = result.scalars().all()

    return {
        "notifications": [
            {
                "id": n.id,
                "type": n.type,
                "title": n.title,
                "message": n.message,
                "target_type": n.target_type,
                "target_id": n.target_id,
                "read": n.read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in notifications
        ],
        "unread_count": unread_count,
        "total": total,
        "page": page,
        "per_page": per_page,
    }


@router.get("/unread-count")
async def unread_count(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    count = (await db.execute(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id,
            Notification.read == False,
        )
    )).scalar() or 0
    return {"count": count}


@router.patch("/{notification_id}/read")
async def mark_read(
    notification_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.read = True
    await db.commit()
    return {"ok": True}


@router.post("/read-all")
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read == False)
        .values(read=True)
    )
    await db.commit()
    return {"ok": True}
