"""
Marketplace router — browse, install, uninstall, export templates.
Proxies public browse to api.helixnode.tech; install/uninstall are local.
"""
import logging

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin
from pydantic import BaseModel, Field
from app.schemas.marketplace import (
    InstallRequest, UninstallRequest, ReviewCreate,
    InstalledTemplateSchema, PreInstallCheckResponse,
)
from app.services.marketplace_service import MarketplaceService
from app.services.install_service import InstallService
from app.services.export_service import ExportService
from app.services.license_service import LicenseService
from app.services.skill_service import SkillService

logger = logging.getLogger("helix.marketplace")

router = APIRouter(tags=["marketplace"])


def _get_services(db: AsyncSession):
    license_svc = LicenseService(db)
    marketplace_svc = MarketplaceService(db, license_svc)
    skill_svc = SkillService(db)
    install_svc = InstallService(db, marketplace_svc, license_svc, skill_svc)
    export_svc = ExportService(db)
    return marketplace_svc, install_svc, export_svc


# ─── Browse (proxy to registry) ───

@router.get("/marketplace/templates")
async def list_templates(
    type: str | None = Query(None),
    category: str | None = Query(None),
    q: str | None = Query(None),
    sort: str = Query("popular"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.list_templates(type, category, q, sort, page, page_size)
    except Exception as e:
        logger.error("Failed to fetch marketplace templates: %s", e)
        raise HTTPException(status_code=502, detail="Marketplace temporarily unavailable")


@router.get("/marketplace/templates/{slug}")
async def get_template(
    slug: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_template(slug)
    except Exception as e:
        logger.error("Failed to fetch template %s: %s", slug, e)
        raise HTTPException(status_code=502, detail="Marketplace temporarily unavailable")


@router.get("/marketplace/templates/{slug}/manifest")
async def get_template_manifest(
    slug: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_manifest(slug)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Marketplace temporarily unavailable")


@router.get("/marketplace/categories")
async def list_categories(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.list_categories()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Marketplace temporarily unavailable")


@router.get("/marketplace/featured")
async def get_featured(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_featured()
    except Exception as e:
        raise HTTPException(status_code=502, detail="Marketplace temporarily unavailable")


@router.get("/marketplace/templates/{slug}/reviews")
async def list_reviews(
    slug: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.list_reviews(slug, page, page_size)
    except Exception as e:
        raise HTTPException(status_code=502, detail="Marketplace temporarily unavailable")


# ─── Actions (require auth) ───

@router.post("/marketplace/templates/{slug}/reviews")
async def submit_review(
    slug: str,
    review: ReviewCreate,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.submit_review(slug, review.rating, review.title, review.body)
    except Exception as e:
        logger.error("Failed to submit review: %s", e)
        raise HTTPException(status_code=502, detail="Failed to submit review")


@router.post("/marketplace/install")
async def install_template(
    body: InstallRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, install_svc, _ = _get_services(db)
    org_id = user.org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    try:
        # Determine template type from manifest
        mp, _, _ = _get_services(db)
        manifest = await mp.get_manifest(body.template_slug)
        template_type = manifest.get("type", "")

        if template_type == "agent_template":
            result = await install_svc.install_agent_template(
                org_id, user.id, body.template_slug, body.customizations
            )
        elif template_type == "skill":
            result = await install_svc.install_skill_template(
                org_id, user.id, body.template_slug, body.customizations
            )
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported template type: {template_type}")

        return result
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Install failed: %s", e)
        raise HTTPException(status_code=500, detail="Installation failed")


@router.post("/marketplace/uninstall")
async def uninstall_template(
    body: UninstallRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, install_svc, _ = _get_services(db)
    org_id = user.org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    try:
        return await install_svc.uninstall_template(org_id, user.id, body.installed_template_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("Uninstall failed: %s", e)
        raise HTTPException(status_code=500, detail="Uninstall failed")


@router.get("/marketplace/installed")
async def list_installed(
    type: str | None = Query(None),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    org_id = user.org_id
    if not org_id:
        return []

    templates = await mp.get_installed_templates(org_id, type)
    return [InstalledTemplateSchema.model_validate(t) for t in templates]


@router.post("/marketplace/pre-install-check")
async def pre_install_check(
    body: InstallRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, install_svc, _ = _get_services(db)
    org_id = user.org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    try:
        result = await install_svc.pre_install_check(org_id, body.template_slug, body.customizations)
        return result
    except Exception as e:
        logger.error("Pre-install check failed: %s", e)
        raise HTTPException(status_code=502, detail="Pre-install check failed")


# ─── Export ───

@router.post("/marketplace/export/agent/{agent_id}")
async def export_agent_template(
    agent_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, _, export_svc = _get_services(db)
    org_id = user.org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    try:
        return await export_svc.export_agent_as_template(agent_id, org_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/marketplace/export/skill/{skill_id}")
async def export_skill_template(
    skill_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _, _, export_svc = _get_services(db)
    org_id = user.org_id
    if not org_id:
        raise HTTPException(status_code=400, detail="User has no organization")

    try:
        return await export_svc.export_skill_as_template(skill_id, org_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ─── Review actions (proxy to registry) ───

@router.post("/marketplace/reviews/{review_id}/helpful")
async def upvote_review(
    review_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.upvote_review(review_id)
    except Exception as e:
        logger.error("Failed to upvote review: %s", e)
        raise HTTPException(status_code=502, detail="Failed to upvote review")


class FlagRequest(BaseModel):
    reason: str


@router.post("/marketplace/reviews/{review_id}/flag")
async def flag_review(
    review_id: str,
    body: FlagRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.flag_review(review_id, body.reason)
    except Exception as e:
        logger.error("Failed to flag review: %s", e)
        raise HTTPException(status_code=502, detail="Failed to flag review")


class ReviewRespondBody(BaseModel):
    body: str = Field(max_length=1000)


@router.post("/marketplace/reviews/{review_id}/respond")
async def respond_to_review(
    review_id: str,
    body: ReviewRespondBody,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.respond_to_review(review_id, body.body)
    except Exception as e:
        logger.error("Failed to respond to review: %s", e)
        raise HTTPException(status_code=502, detail="Failed to respond to review")


# ─── Community (proxy to registry) ───

@router.get("/marketplace/community/feed")
async def community_feed(
    limit: int = Query(20, ge=1, le=50),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_community_feed(limit)
    except Exception as e:
        logger.error("Failed to fetch community feed: %s", e)
        raise HTTPException(status_code=502, detail="Community feed temporarily unavailable")


@router.get("/marketplace/community/leaderboard")
async def community_leaderboard(
    limit: int = Query(10, ge=1, le=50),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_leaderboard(limit)
    except Exception as e:
        logger.error("Failed to fetch leaderboard: %s", e)
        raise HTTPException(status_code=502, detail="Leaderboard temporarily unavailable")


@router.get("/marketplace/creators")
async def list_creators(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    sort: str = Query("installs"),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_creators(page, page_size, sort)
    except Exception as e:
        logger.error("Failed to fetch creators: %s", e)
        raise HTTPException(status_code=502, detail="Creators list temporarily unavailable")


@router.get("/marketplace/creators/{username}")
async def get_creator(
    username: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_creator_profile(username)
    except Exception as e:
        logger.error("Failed to fetch creator profile: %s", e)
        raise HTTPException(status_code=502, detail="Creator profile not found")


@router.get("/marketplace/profile")
async def get_own_profile(
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_own_profile()
    except Exception as e:
        logger.error("Failed to fetch profile: %s", e)
        raise HTTPException(status_code=502, detail="Profile not available")


class ProfileUpdateBody(BaseModel):
    username: str | None = None
    display_name: str | None = None
    bio: str | None = None
    website: str | None = None
    avatar_url: str | None = None


@router.post("/marketplace/profile")
async def update_profile(
    body: ProfileUpdateBody,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.update_profile(body.model_dump(exclude_none=True))
    except Exception as e:
        logger.error("Failed to update profile: %s", e)
        raise HTTPException(status_code=502, detail="Failed to update profile")


# ─── Submissions (proxy to registry) ───

class SubmissionCreateBody(BaseModel):
    name: str
    template_type: str
    description: str | None = None
    long_description: str | None = None
    category_slug: str
    tags: list[str] = []
    emoji: str | None = None
    manifest: dict
    version: str = "1.0.0"
    min_helix_version: str | None = None
    creator_username: str | None = None
    creator_display_name: str | None = None


@router.post("/marketplace/submit")
async def submit_template(
    body: SubmissionCreateBody,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.submit_template(body.model_dump())
    except Exception as e:
        logger.error("Failed to submit template: %s", e)
        raise HTTPException(status_code=502, detail="Failed to submit template")


@router.get("/marketplace/submissions")
async def list_submissions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.list_my_submissions(page, page_size)
    except Exception as e:
        logger.error("Failed to fetch submissions: %s", e)
        raise HTTPException(status_code=502, detail="Submissions temporarily unavailable")


@router.get("/marketplace/submissions/{submission_id}")
async def get_submission(
    submission_id: str,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    mp, _, _ = _get_services(db)
    try:
        return await mp.get_submission_status(submission_id)
    except Exception as e:
        logger.error("Failed to fetch submission: %s", e)
        raise HTTPException(status_code=502, detail="Submission not found")
