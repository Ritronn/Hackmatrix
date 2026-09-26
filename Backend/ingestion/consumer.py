"""
ingestion/consumer.py
Redis Stream consumer.
Reads messages from the sensor stream, writes a rolling working dataset
to Redis, and triggers drift detection comparison after each batch.

Usage:
    python -m ingestion.consumer

Runs continuously until interrupted.
"""
import asyncio
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

import redis.asyncio as aioredis

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings
from app.services.drift_service import store_observed_snapshot

STREAM_NAME   = "atmos:sensor:stream"
CONSUMER_GROUP = "atmos-workers"
CONSUMER_NAME  = "worker-1"
BATCH_SIZE     = 10          # process N messages at a time
WORKING_KEY    = "working_dataset"   # Redis hash for the latest readings per city

# How many readings to keep in rolling buffer per city (for ML team)
BUFFER_SIZE = 500


async def ensure_group(r: aioredis.Redis):
    """Create the consumer group if it doesn't exist yet."""
    try:
        await r.xgroup_create(STREAM_NAME, CONSUMER_GROUP, id="0", mkstream=True)
        print(f"[consumer] Created consumer group '{CONSUMER_GROUP}'")
    except aioredis.ResponseError as e:
        if "BUSYGROUP" in str(e):
            pass  # group already exists
        else:
            raise


def _safe_float(val: str) -> float | None:
    try:
        return float(val) if val and val.strip() else None
    except ValueError:
        return None


async def process_batch(r: aioredis.Redis, messages: list):
    """
    Process a batch of stream messages:
    1. Parse each row
    2. Update rolling buffer in Redis (Hash keyed by city)
    3. Push to working dataset for the ML team
    4. Update observed snapshot for drift detection
    """
    by_city: dict[str, list[dict]] = {}

    for _stream, msg_list in messages:
        for msg_id, fields in msg_list:
            city = fields.get("city", "unknown")
            row = {
                "city":      city,
                "date":      fields.get("date"),
                "aqi":       _safe_float(fields.get("aqi", "")),
                "pm25":      _safe_float(fields.get("pm25", "")),
                "pm10":      _safe_float(fields.get("pm10", "")),
                "no2":       _safe_float(fields.get("no2", "")),
                "co":        _safe_float(fields.get("co", "")),
                "so2":       _safe_float(fields.get("so2", "")),
                "o3":        _safe_float(fields.get("o3", "")),
                "replayed":  fields.get("replayed") == "true",
                "consumed_at": datetime.now(timezone.utc).isoformat(),
            }

            if row["aqi"] is None:
                # Acknowledge and skip malformed rows
                await r.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)
                continue

            by_city.setdefault(city, []).append(row)

            # ── Update working dataset (Hash of JSON lists per city) ──
            buffer_key = f"buffer:{city.lower()}"
            existing_raw = await r.get(buffer_key)
            existing: list = json.loads(existing_raw) if existing_raw else []
            existing.append(row)
            # Keep only the last BUFFER_SIZE entries
            if len(existing) > BUFFER_SIZE:
                existing = existing[-BUFFER_SIZE:]
            await r.set(buffer_key, json.dumps(existing))

            # Acknowledge message
            await r.xack(STREAM_NAME, CONSUMER_GROUP, msg_id)

    # ── Update observed snapshots for drift detection ──
    for city, rows in by_city.items():
        latest_row = rows[-1]
        station_id = f"{city.lower()}-replayed"
        snapshot = {
            station_id: {
                "aqi":  latest_row["aqi"],
                "name": f"{city} (Replayed Sensor)",
            }
        }
        await store_observed_snapshot(city, snapshot)

    if by_city:
        cities = ", ".join(by_city.keys())
        total = sum(len(v) for v in by_city.values())
        print(f"[consumer] Processed {total} rows for: {cities}")


async def run():
    r = await aioredis.from_url(settings.redis_url, decode_responses=True)
    await ensure_group(r)
    print(f"[consumer] Listening on stream '{STREAM_NAME}' ...")

    while True:
        try:
            messages = await r.xreadgroup(
                groupname=CONSUMER_GROUP,
                consumername=CONSUMER_NAME,
                streams={STREAM_NAME: ">"},  # only new messages
                count=BATCH_SIZE,
                block=2000,  # block up to 2s waiting for new messages
            )
            if messages:
                await process_batch(r, messages)
        except KeyboardInterrupt:
            print("\n[consumer] Shutting down.")
            break
        except Exception as e:
            print(f"[consumer] Error: {e}")
            await asyncio.sleep(1)

    await r.aclose()


if __name__ == "__main__":
    asyncio.run(run())
