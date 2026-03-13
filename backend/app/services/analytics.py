"""
GA4 and Google Search Console data fetching for agent task prompts.
"""
import logging
import os
from datetime import datetime, timedelta

logger = logging.getLogger("helix.analytics")

GA4_PROPERTY_ID = os.getenv("GA4_PROPERTY_ID", "357446757")
GSC_SITE_URL = os.getenv("GSC_SITE_URL", "sc-domain:galado.com.my")
CREDENTIALS_PATH = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS",
    "credentials/galado-ga4-gsc-service-account.json",
)

# Agent names or board IDs that should receive analytics context
ANALYTICS_AGENT_NAMES = {"Metric", "Adley", "Maven"}
ANALYTICS_BOARD_IDS = {2, 4, 7}  # Meta Ads, SEO & Blog, Growth & Analytics


def should_inject_analytics(agent_name: str, board_id: int | None) -> bool:
    """Check if this agent/board should receive analytics data in prompts."""
    return agent_name in ANALYTICS_AGENT_NAMES or (board_id in ANALYTICS_BOARD_IDS)


def fetch_analytics_context(days: int = 7) -> str:
    """Fetch GA4 + GSC data and format as text context for agent prompts."""
    sections = []

    # GA4
    try:
        ga4 = _fetch_ga4_metrics(days)
        if ga4:
            bounce = float(ga4.get("bounce_rate", 0)) * 100
            duration = float(ga4.get("avg_session_duration", 0))
            sections.append(
                f"## GA4 Website Analytics (Last {days} Days)\n"
                f"- Sessions: {ga4['sessions']}\n"
                f"- Active Users: {ga4['active_users']}\n"
                f"- New Users: {ga4['new_users']}\n"
                f"- Bounce Rate: {bounce:.1f}%\n"
                f"- Avg Session Duration: {duration:.0f}s\n"
                f"- Page Views: {ga4['page_views']}"
            )
    except Exception as e:
        logger.warning("Failed to fetch GA4 metrics: %s", e)

    # GSC
    try:
        gsc = _fetch_gsc_metrics(days)
        if gsc:
            sections.append(
                f"## Google Search Console (Last {days} Days)\n"
                f"- Clicks: {gsc['clicks']}\n"
                f"- Impressions: {gsc['impressions']}\n"
                f"- CTR: {gsc['ctr']}%\n"
                f"- Avg Position: {gsc['position']}"
            )
    except Exception as e:
        logger.warning("Failed to fetch GSC metrics: %s", e)

    # Top queries
    try:
        queries = _fetch_gsc_top_queries(days, limit=10)
        if queries:
            lines = [f"## Top Search Queries (Last {days} Days)"]
            lines.append("| Query | Clicks | Impressions | CTR | Position |")
            lines.append("|-------|--------|-------------|-----|----------|")
            for q in queries:
                lines.append(
                    f"| {q['query']} | {q['clicks']} | {q['impressions']} "
                    f"| {q['ctr']}% | {q['position']} |"
                )
            sections.append("\n".join(lines))
    except Exception as e:
        logger.warning("Failed to fetch GSC top queries: %s", e)

    if not sections:
        return ""

    return (
        "\n\n---\n"
        "# Live Analytics Data (auto-injected)\n\n"
        + "\n\n".join(sections)
        + "\n---"
    )


def _get_ga4_client():
    from google.analytics.data_v1beta import BetaAnalyticsDataClient
    from google.oauth2 import service_account

    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH,
        scopes=["https://www.googleapis.com/auth/analytics.readonly"],
    )
    return BetaAnalyticsDataClient(credentials=creds)


def _get_gsc_service():
    from google.oauth2 import service_account
    from googleapiclient.discovery import build

    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH,
        scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
    )
    return build("searchconsole", "v1", credentials=creds)


def _fetch_ga4_metrics(days: int = 7) -> dict:
    from google.analytics.data_v1beta.types import (
        DateRange, Metric, RunReportRequest,
    )

    client = _get_ga4_client()
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    response = client.run_report(RunReportRequest(
        property=f"properties/{GA4_PROPERTY_ID}",
        date_ranges=[DateRange(start_date=start, end_date=end)],
        metrics=[
            Metric(name="sessions"),
            Metric(name="activeUsers"),
            Metric(name="newUsers"),
            Metric(name="bounceRate"),
            Metric(name="averageSessionDuration"),
            Metric(name="screenPageViews"),
        ],
    ))
    if not response.rows:
        return {}
    row = response.rows[0]
    names = ["sessions", "active_users", "new_users", "bounce_rate", "avg_session_duration", "page_views"]
    return {name: row.metric_values[i].value for i, name in enumerate(names)}


def _fetch_gsc_metrics(days: int = 7) -> dict:
    service = _get_gsc_service()
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    response = service.searchanalytics().query(
        siteUrl=GSC_SITE_URL,
        body={"startDate": start, "endDate": end, "dimensions": [], "rowLimit": 1},
    ).execute()
    rows = response.get("rows", [])
    if not rows:
        return {"clicks": 0, "impressions": 0, "ctr": 0, "position": 0}
    r = rows[0]
    return {
        "clicks": r.get("clicks", 0),
        "impressions": r.get("impressions", 0),
        "ctr": round(r.get("ctr", 0) * 100, 2),
        "position": round(r.get("position", 0), 1),
    }


def _fetch_gsc_top_queries(days: int = 7, limit: int = 10) -> list[dict]:
    service = _get_gsc_service()
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    response = service.searchanalytics().query(
        siteUrl=GSC_SITE_URL,
        body={
            "startDate": start,
            "endDate": end,
            "dimensions": ["query"],
            "rowLimit": limit,
            "orderBy": [{"fieldName": "clicks", "sortOrder": "DESCENDING"}],
        },
    ).execute()
    return [
        {
            "query": r["keys"][0],
            "clicks": r["clicks"],
            "impressions": r["impressions"],
            "ctr": round(r["ctr"] * 100, 2),
            "position": round(r["position"], 1),
        }
        for r in response.get("rows", [])
    ]
