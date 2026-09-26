"""
ingestion/producer.py
Simulated live feed producer.
Reads the Kaggle AQI CSV and replays rows row-by-row into a Redis Stream,
mimicking a real-time sensor feed at a controllable pace.

Usage:
    python -m ingestion.producer --city Delhi --speed 1.0

Data source: Kaggle "Air Quality Data In India (2015-2020)" by rohanrao
Place the CSV at: Backend/data/city_day.csv
"""
import asyncio
import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timezone

import pandas as pd
import redis.asyncio as aioredis

# Allow running from Backend/ root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from app.core.config import settings

STREAM_NAME = "atmos:sensor:stream"
CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "city_day.csv"

# Expected columns in the Kaggle dataset
REQUIRED_COLS = ["City", "Date", "PM2.5", "PM10", "NO2", "AQI"]


async def produce(city: str, speed: float = 1.0, delay_sec: float = 0.5):
    """
    Stream rows for a given city into Redis.
    speed > 1.0 = faster replay (e.g. 5.0 = 5× speed).
    """
    if not CSV_PATH.exists():
        print(f"[ERROR] Dataset not found at {CSV_PATH}")
        print("Download from: https://www.kaggle.com/datasets/rohanrao/air-quality-data-in-india")
        return

    print(f"[producer] Loading dataset from {CSV_PATH} ...")
    df = pd.read_csv(CSV_PATH)

    missing = [c for c in REQUIRED_COLS if c not in df.columns]
    if missing:
        print(f"[ERROR] Missing columns in CSV: {missing}")
        return

    city_df = df[df["City"].str.lower() == city.lower()].copy()
    city_df = city_df.sort_values("Date").dropna(subset=["AQI"])

    if city_df.empty:
        print(f"[ERROR] No data found for city '{city}'")
        return

    print(f"[producer] Found {len(city_df)} rows for {city}. Starting stream...")

    r = await aioredis.from_url(settings.redis_url, decode_responses=True)

    for _, row in city_df.iterrows():
        message = {
            "city":      city,
            "date":      str(row["Date"]),
            "pm25":      str(row.get("PM2.5", "")),
            "pm10":      str(row.get("PM10", "")),
            "no2":       str(row.get("NO2", "")),
            "co":        str(row.get("CO", "")),
            "so2":       str(row.get("SO2", "")),
            "o3":        str(row.get("O3", "")),
            "aqi":       str(row["AQI"]),
            "aqi_bucket":str(row.get("AQI_Bucket", "")),
            "replayed":  "true",
            "stream_ts": datetime.now(timezone.utc).isoformat(),
        }

        # XADD to Redis stream (auto-generates message ID)
        await r.xadd(STREAM_NAME, message)

        sleep_time = delay_sec / max(speed, 0.1)
        await asyncio.sleep(sleep_time)

    print(f"[producer] Done — {len(city_df)} messages sent to stream '{STREAM_NAME}'")
    await r.aclose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Atmos Twin Redis Stream Producer")
    parser.add_argument("--city",  default="Delhi", help="City name matching the Kaggle dataset")
    parser.add_argument("--speed", type=float, default=1.0, help="Replay speed multiplier (default 1.0)")
    parser.add_argument("--delay", type=float, default=0.5, help="Base delay between rows in seconds")
    args = parser.parse_args()

    asyncio.run(produce(city=args.city, speed=args.speed, delay_sec=args.delay))
