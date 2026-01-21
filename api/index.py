"""
Vercel serverless function wrapper for FastAPI backend
"""
import sys
from pathlib import Path

# Add backend directory to path
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from main import app
from mangum import Mangum

# Create ASGI handler for Vercel
handler = Mangum(app, lifespan="off")

# Vercel Python runtime expects a handler function that receives event and context
def handler_func(event, context):
    """Vercel serverless function handler"""
    response = handler(event, context)
    return response
