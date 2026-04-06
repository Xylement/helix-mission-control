"""
Marketplace proxy service — fetches from api.helixnode.tech, caches in Redis,
and tracks installed templates in the local DB.
"""
import json
import logging

import httpx
from sqlalchemy import select, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.installed_template import InstalledTemplate
from app.services.license_service import LicenseService

logger = logging.getLogger("helix.marketplace")


class MarketplaceService:
    def __init__(self, db: AsyncSession, license_service: LicenseService):
        self.db = db
        self.license_service = license_service
        self._http = httpx.AsyncClient(
            base_url=settings.MARKETPLACE_API_URL,
            timeout=15.0,
            headers={"User-Agent": "HELIX-Instance/1.0"},
        )

    async def _auth_headers(self) -> dict:
        """Get auth headers using the effective license key (env var or DB cache)."""
        key = await self.license_service._get_effective_license_key()
        return {"X-License-Key": key}

    # ─── Browse (proxy to registry) ───

    async def list_templates(
        self, type: str | None, category: str | None, q: str | None,
        sort: str, page: int, page_size: int,
    ) -> dict:
        params = {"page": page, "page_size": page_size, "sort": sort}
        if type:
            params["type"] = type
        if category:
            params["category"] = category
        if q:
            params["q"] = q
        resp = await self._http.get("/v1/marketplace/templates", params=params)
        resp.raise_for_status()
        return resp.json()

    async def get_template(self, slug: str) -> dict:
        resp = await self._http.get(f"/v1/marketplace/templates/{slug}")
        resp.raise_for_status()
        return resp.json()

    async def get_manifest(self, slug: str) -> dict:
        resp = await self._http.get(f"/v1/marketplace/templates/{slug}/manifest")
        resp.raise_for_status()
        return resp.json()

    async def list_categories(self) -> list:
        resp = await self._http.get("/v1/marketplace/categories")
        resp.raise_for_status()
        return resp.json()

    async def get_featured(self) -> list:
        resp = await self._http.get("/v1/marketplace/featured")
        resp.raise_for_status()
        return resp.json()

    async def list_reviews(self, slug: str, page: int, page_size: int) -> dict:
        resp = await self._http.get(
            f"/v1/marketplace/templates/{slug}/reviews",
            params={"page": page, "page_size": page_size},
        )
        resp.raise_for_status()
        return resp.json()

    # ─── Reviews ───

    async def submit_review(self, slug: str, rating: int, title: str | None, body: str | None) -> dict:
        resp = await self._http.post(
            f"/v1/marketplace/templates/{slug}/reviews",
            json={"rating": rating, "title": title, "body": body},
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def upvote_review(self, review_id: str) -> dict:
        resp = await self._http.post(
            f"/v1/marketplace/reviews/{review_id}/helpful",
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def flag_review(self, review_id: str, reason: str) -> dict:
        resp = await self._http.post(
            f"/v1/marketplace/reviews/{review_id}/flag",
            json={"reason": reason},
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def respond_to_review(self, review_id: str, body: str) -> dict:
        resp = await self._http.post(
            f"/v1/marketplace/reviews/{review_id}/respond",
            json={"body": body},
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    # ─── Community ───

    async def get_community_feed(self, limit: int = 20) -> list:
        resp = await self._http.get("/v1/community/feed", params={"limit": limit})
        resp.raise_for_status()
        return resp.json()

    async def get_leaderboard(self, limit: int = 10) -> list:
        resp = await self._http.get("/v1/community/leaderboard", params={"limit": limit})
        resp.raise_for_status()
        return resp.json()

    async def get_creators(self, page: int = 1, page_size: int = 20, sort: str = "installs") -> dict:
        resp = await self._http.get(
            "/v1/community/creators",
            params={"page": page, "per_page": page_size},
        )
        resp.raise_for_status()
        return resp.json()

    async def get_creator_profile(self, username: str) -> dict:
        resp = await self._http.get(f"/v1/community/creators/{username}")
        resp.raise_for_status()
        return resp.json()

    async def get_own_profile(self) -> dict:
        resp = await self._http.get(
            "/v1/community/profile",
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def update_profile(self, data: dict) -> dict:
        resp = await self._http.post(
            "/v1/community/profile",
            json=data,
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    # ─── Submissions ───

    async def submit_template(self, data: dict) -> dict:
        resp = await self._http.post(
            "/v1/marketplace/submissions",
            json=data,
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def list_my_submissions(self, page: int = 1, page_size: int = 20) -> dict:
        resp = await self._http.get(
            "/v1/marketplace/my-submissions",
            params={"page": page, "per_page": page_size},
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def get_submission_status(self, submission_id: str) -> dict:
        resp = await self._http.get(
            f"/v1/marketplace/submissions/{submission_id}/status",
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    async def update_submission(self, submission_id: str, data: dict) -> dict:
        resp = await self._http.patch(
            f"/v1/marketplace/submissions/{submission_id}",
            json=data,
            headers=await self._auth_headers(),
        )
        resp.raise_for_status()
        return resp.json()

    # ─── Install tracking (local DB) ───

    async def get_installed_templates(self, org_id: int, type: str | None = None) -> list:
        stmt = select(InstalledTemplate).where(
            InstalledTemplate.org_id == org_id,
            InstalledTemplate.is_active == True,
        )
        if type:
            stmt = stmt.where(InstalledTemplate.template_type == type)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_installed_count(self, org_id: int, type: str) -> int:
        stmt = select(sqlfunc.count()).select_from(InstalledTemplate).where(
            InstalledTemplate.org_id == org_id,
            InstalledTemplate.template_type == type,
            InstalledTemplate.is_active == True,
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def is_template_installed(self, org_id: int, template_slug: str) -> bool:
        stmt = select(InstalledTemplate).where(
            InstalledTemplate.org_id == org_id,
            InstalledTemplate.template_slug == template_slug,
            InstalledTemplate.is_active == True,
        )
        result = await self.db.execute(stmt)
        return result.scalar() is not None

    async def record_install(
        self, org_id: int, template_slug: str, template_type: str,
        template_name: str, template_version: str, manifest: dict,
        local_resource_id: int, local_resource_type: str, installed_by: int,
    ) -> InstalledTemplate:
        # Check if previously installed (is_active=False) — reactivate
        stmt = select(InstalledTemplate).where(
            InstalledTemplate.org_id == org_id,
            InstalledTemplate.template_slug == template_slug,
            InstalledTemplate.is_active == False,
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        if existing:
            existing.is_active = True
            existing.local_resource_id = local_resource_id
            existing.local_resource_type = local_resource_type
            existing.manifest = manifest
            existing.template_version = template_version
            existing.installed_by = installed_by
            self.db.add(existing)
            await self.db.flush()
            return existing

        record = InstalledTemplate(
            org_id=org_id,
            template_slug=template_slug,
            template_type=template_type,
            template_name=template_name,
            template_version=template_version,
            manifest=manifest,
            local_resource_id=local_resource_id,
            local_resource_type=local_resource_type,
            installed_by=installed_by,
        )
        self.db.add(record)
        await self.db.flush()
        return record

    async def record_uninstall(self, installed_template_id: int, org_id: int) -> None:
        stmt = select(InstalledTemplate).where(
            InstalledTemplate.id == installed_template_id,
            InstalledTemplate.org_id == org_id,
            InstalledTemplate.is_active == True,
        )
        result = await self.db.execute(stmt)
        record = result.scalar_one_or_none()
        if not record:
            raise ValueError("Installed template not found")
        record.is_active = False
        self.db.add(record)
        await self.db.flush()

    # ─── Log install/uninstall to registry (analytics, non-critical) ───

    async def log_install_to_registry(self, template_slug: str) -> None:
        try:
            await self._http.post(
                f"/v1/marketplace/templates/{template_slug}/install",
                headers=await self._auth_headers(),
                json={"helix_version": settings.HELIX_VERSION},
            )
        except Exception:
            pass

    async def log_uninstall_to_registry(self, template_slug: str) -> None:
        try:
            await self._http.post(
                f"/v1/marketplace/templates/{template_slug}/uninstall",
                headers=await self._auth_headers(),
            )
        except Exception:
            pass
