"""
app/core/redis_client.py
Shared async Redis connection pool.
All services import `get_redis` to obtain a connection.
"""
import redis.asyncio as aioredis
from app.core.config import settings

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Return (or lazily create) the shared Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
    return _pool


async def close_redis() -> None:
    """Close the pool — call on app shutdown."""
    global _pool
    if _pool:
        await _pool.aclose()
        _pool = None
