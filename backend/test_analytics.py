#!/usr/bin/env python3
"""Test GA4 and GSC connections."""

from analytics_integration import (
    test_ga4_connection,
    test_gsc_connection,
)


def main():
    print("Testing GA4 Connection...")
    print("-" * 40)
    try:
        result = test_ga4_connection()
        print(f"  GA4 Connected")
        print(f"   Property ID: {result['property_id']}")
        print(f"   Users (yesterday): {result['users_yesterday']}")
        print()
    except Exception as e:
        print(f"  GA4 Connection Failed: {e}")
        print()

    print("Testing GSC Connection...")
    print("-" * 40)
    try:
        result = test_gsc_connection()
        if result["has_access"]:
            print(f"  GSC Connected")
            print(f"   Site URL: {result['site_url']}")
            print(f"   Has Access: {result['has_access']}")
        else:
            print(f"  GSC Access Not Found for {result['site_url']}")
            print(f"   Available sites: {result['sites']}")
        print()
    except Exception as e:
        print(f"  GSC Connection Failed: {e}")
        print()


if __name__ == "__main__":
    main()
