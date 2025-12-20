"""
Data fetching module for NYC Open Data API.
"""

import os
from sodapy import Socrata
from dotenv import load_dotenv

load_dotenv()

# NYC Open Data Air Quality Dataset
DATASET_ID = "c3uy-2p5r"
DOMAIN = "data.cityofnewyork.us"


def get_client():
    """
    Initialize and return a Socrata client.
    
    Returns:
        Socrata: Client instance for accessing NYC Open Data API
    """
    app_token = os.getenv("SOCRATA_APP_TOKEN")
    return Socrata(DOMAIN, app_token)


def fetch_air_quality_data(limit=1000, **kwargs):
    """
    Fetch air quality data from NYC Open Data API.
    
    Args:
        limit: Maximum number of records to fetch
        **kwargs: Additional query parameters (e.g., where, order, etc.)
    
    Returns:
        list: List of records from the API
    """
    client = get_client()
    results = client.get(DATASET_ID, limit=limit, **kwargs)
    return results





