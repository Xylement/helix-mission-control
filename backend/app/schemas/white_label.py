from datetime import datetime
from pydantic import BaseModel


class BrandingPublic(BaseModel):
    product_name: str = "HELIX Mission Control"
    product_short_name: str = "HELIX"
    company_name: str = "HelixNode"
    logo_url: str | None = None
    favicon_url: str | None = None
    accent_color: str = "#3b82f6"
    accent_color_secondary: str = "#8b5cf6"
    login_title: str = "Sign in to Mission Control"
    login_subtitle: str | None = None
    footer_text: str = "Powered by HelixNode"
    loading_animation_enabled: bool = True
    loading_animation_text: str = "HELIX"
    custom_css: str | None = None
    docs_url: str = "https://docs.helixnode.tech"
    support_email: str | None = None
    support_url: str | None = None
    marketplace_visible: bool = True

    class Config:
        from_attributes = True


class WhiteLabelConfigOut(BrandingPublic):
    id: int
    org_id: int
    created_at: datetime
    updated_at: datetime


class WhiteLabelConfigUpdate(BaseModel):
    product_name: str | None = None
    product_short_name: str | None = None
    company_name: str | None = None
    accent_color: str | None = None
    accent_color_secondary: str | None = None
    login_title: str | None = None
    login_subtitle: str | None = None
    footer_text: str | None = None
    loading_animation_enabled: bool | None = None
    loading_animation_text: str | None = None
    custom_css: str | None = None
    docs_url: str | None = None
    support_email: str | None = None
    support_url: str | None = None
    marketplace_visible: bool | None = None
