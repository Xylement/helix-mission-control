"""
GA4 and Google Search Console Integration
"""
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv(".env.analytics")

GA4_PROPERTY_ID = os.getenv("GA4_PROPERTY_ID", "")
GSC_SITE_URL = os.getenv("GSC_SITE_URL", "")
CREDENTIALS_PATH = os.getenv(
    "GOOGLE_APPLICATION_CREDENTIALS",
    "credentials/ga4-gsc-service-account.json",
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


def test_ga4_connection():
    """Verify GA4 access and return basic info."""
    from google.analytics.data_v1beta.types import (
        DateRange, Dimension, Metric, RunReportRequest,
    )

    client = _get_ga4_client()
    request = RunReportRequest(
        property=f"properties/{GA4_PROPERTY_ID}",
        date_ranges=[DateRange(start_date="yesterday", end_date="yesterday")],
        metrics=[Metric(name="activeUsers")],
    )
    response = client.run_report(request)
    users = response.rows[0].metric_values[0].value if response.rows else "0"
    return {"property_id": GA4_PROPERTY_ID, "users_yesterday": users}


def test_gsc_connection():
    """Verify GSC access."""
    service = _get_gsc_service()
    sites = service.sites().list().execute()
    site_list = sites.get("siteEntry", [])
    has_access = any(s["siteUrl"] == GSC_SITE_URL for s in site_list)
    return {"site_url": GSC_SITE_URL, "has_access": has_access, "sites": [s["siteUrl"] for s in site_list]}


def get_ga4_metrics(days=7):
    """Fetch GA4 metrics for the given number of days."""
    from google.analytics.data_v1beta.types import (
        DateRange, Metric, RunReportRequest,
    )

    client = _get_ga4_client()
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    request = RunReportRequest(
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
    )
    response = client.run_report(request)
    if not response.rows:
        return {}
    row = response.rows[0]
    names = ["sessions", "active_users", "new_users", "bounce_rate", "avg_session_duration", "page_views"]
    return {name: row.metric_values[i].value for i, name in enumerate(names)}


def get_gsc_metrics(days=7):
    """Fetch GSC metrics for the given number of days."""
    service = _get_gsc_service()
    start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
    end = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")

    response = service.searchanalytics().query(
        siteUrl=GSC_SITE_URL,
        body={
            "startDate": start,
            "endDate": end,
            "dimensions": [],
            "rowLimit": 1,
        },
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


def get_gsc_top_queries(days=7, limit=10):
    """Fetch top search queries from GSC."""
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
