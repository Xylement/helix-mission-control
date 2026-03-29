"""
Branded email service — reads white_label_config for branding, renders
responsive HTML email templates, sends via Resend.
"""
import logging
import os

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.white_label import WhiteLabelConfig

logger = logging.getLogger("helix.email")

RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", "noreply@helixnode.tech")
PUBLIC_URL = os.getenv("PUBLIC_URL", "")

_DEFAULT_BRANDING = {
    "company_name": "HelixNode",
    "product_name": "HELIX Mission Control",
    "logo_url": None,
    "accent_color": "#3b82f6",
    "footer_text": "Powered by HelixNode",
    "support_email": None,
    "docs_url": "https://docs.helixnode.tech",
}


async def get_email_branding(db: AsyncSession) -> dict:
    """Get branding values for emails from white_label_config."""
    result = await db.execute(select(WhiteLabelConfig).limit(1))
    config = result.scalar_one_or_none()

    if not config:
        return dict(_DEFAULT_BRANDING)

    logo_url = None
    if config.logo_url:
        if PUBLIC_URL:
            logo_url = f"{PUBLIC_URL.rstrip('/')}{config.logo_url}"
        # else: skip logo in emails — no PUBLIC_URL configured
        # TODO: support custom email domains for logo URLs

    return {
        "company_name": config.company_name or _DEFAULT_BRANDING["company_name"],
        "product_name": config.product_name or _DEFAULT_BRANDING["product_name"],
        "logo_url": logo_url,
        "accent_color": config.accent_color or _DEFAULT_BRANDING["accent_color"],
        "footer_text": config.footer_text or _DEFAULT_BRANDING["footer_text"],
        "support_email": config.support_email,
        "docs_url": config.docs_url or _DEFAULT_BRANDING["docs_url"],
    }


def render_email_html(subject: str, body_html: str, branding: dict) -> str:
    """Render a responsive branded HTML email template with inline CSS."""
    accent = branding.get("accent_color", "#3b82f6")
    company = branding.get("company_name", "HelixNode")
    footer = branding.get("footer_text", "Powered by HelixNode")
    logo_url = branding.get("logo_url")

    logo_block = ""
    if logo_url:
        logo_block = (
            f'<img src="{logo_url}" alt="{company}" '
            f'style="max-height:40px;width:auto;margin-right:12px;" />'
        )

    return f"""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;">
<tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">

<!-- Header -->
<tr>
<td style="background-color:{accent};padding:20px 24px;">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="vertical-align:middle;">{logo_block}</td>
<td style="vertical-align:middle;color:#ffffff;font-size:18px;font-weight:600;">{company}</td>
</tr></table>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:32px 24px;color:#1a1a1a;font-size:15px;line-height:1.6;">
{body_html}
</td>
</tr>

<!-- Footer -->
<tr>
<td style="background-color:#f9fafb;padding:16px 24px;text-align:center;font-size:12px;color:#6b7280;border-top:1px solid #e5e7eb;">
{footer}
</td>
</tr>

</table>
</td></tr>
</table>
</body>
</html>"""


async def send_branded_email(
    db: AsyncSession,
    to: str,
    subject: str,
    body_html: str,
) -> bool:
    """Send a branded email via Resend API. Returns True on success."""
    if not RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set — email not sent to %s", to)
        return False

    branding = await get_email_branding(db)
    html = render_email_html(subject, body_html, branding)
    from_name = branding.get("product_name", "HELIX Mission Control")

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": f"{from_name} <{FROM_EMAIL}>",
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )
            if resp.status_code in (200, 201):
                logger.info("Email sent to %s: %s", to, subject)
                return True
            else:
                logger.error("Resend API error %s: %s", resp.status_code, resp.text)
                return False
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to, e)
        return False
