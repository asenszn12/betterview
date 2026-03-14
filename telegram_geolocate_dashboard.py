#!/usr/bin/env python3
"""
Telegram scraping and geolocating dashboard.
Uses Telethon (scrape), spaCy (NER), Geopy (geocoding), and Folium (map).
Output: telegram_threat_map.html

Install:
  pip install telethon spacy geopy folium
  python -m spacy download en_core_web_sm

Env / .env:
  TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_CHANNEL (e.g. warmonitors)
  SUPABASE_URL, SUPABASE_SERVICE_KEY (optional; if set, pushes to messages table for the globe)
"""

from __future__ import annotations

import asyncio
import html
import os
import re
import sys
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

# ---------------------------------------------------------------------------
# Configuration & .env
# ---------------------------------------------------------------------------

def _load_dotenv(path: str = ".env") -> None:
    if not os.path.exists(path):
        return
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key, value = key.strip(), value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as e:
        print(f"[config] Failed to read .env: {e}", file=sys.stderr)


_load_dotenv()

TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH")
TELEGRAM_SESSION = os.getenv("TELEGRAM_SESSION", "telegram_geo_dashboard")
# One or more channels, comma-separated: warmonitors,FinancialJuice,rnintel
TELEGRAM_CHANNEL_RAW = os.getenv("TELEGRAM_CHANNEL", "").strip()
TELEGRAM_CHANNELS = [c.strip() for c in TELEGRAM_CHANNEL_RAW.split(",") if c.strip()]

SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip()
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "").strip()

if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
    print(
        "ERROR: Set TELEGRAM_API_ID and TELEGRAM_API_HASH (env or .env).",
        file=sys.stderr,
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# Risk keywords: Critical (red), High (yellow), Low (blue)
# ---------------------------------------------------------------------------

KEYWORDS_CRITICAL = [
    "explosion", "explosions", "exploded", "bomb", "bombing", "bombed",
    "fire", "burning", "burned", "attack", "attacked", "strike", "strikes",
    "casualty", "casualties", "killed", "dead", "death", "deaths",
    "invasion", "invaded", "shelling", "shelled", "missile", "missiles",
    "nuclear", "chemical", "massacre", "hostage", "hostages",
]

KEYWORDS_HIGH = [
    "protest", "protests", "demonstration", "unrest", "riot", "riots",
    "violence", "violent", "military", "troops", "soldiers", "army",
    "tension", "escalation", "conflict", "fighting", "clash", "clashes",
    "evacuation", "refugee", "refugees", "fleeing", "crisis",
]

KEYWORDS_LOW = [
    "peaceful", "peace", "agreement", "ceasefire", "talks", "negotiation",
    "aid", "humanitarian", "relief", "stability", "calm",
]

# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------

@dataclass
class GeoMessage:
    """A message with extracted location and risk level."""
    text: str
    timestamp: datetime
    channel: str
    location_text: str
    lat: float
    lon: float
    severity: str  # "critical" | "high" | "low"
    telegram_url: str = ""  # https://t.me/channel_username/message_id


# ---------------------------------------------------------------------------
# 1. Scraping (Telethon, async)
# ---------------------------------------------------------------------------

async def scrape_channel(client: "TelegramClient", channel: str, limit: int = 100):
    """Fetch last `limit` messages. Yields (text, date, channel_name, message_id, channel_username)."""
    from telethon import TelegramClient
    from telethon.tl.types import Message

    try:
        entity = await client.get_entity(channel)
        name = getattr(entity, "title", None) or getattr(entity, "username", channel)
        username = getattr(entity, "username", None) or channel
    except Exception as e:
        print(f"[scrape] Could not get entity for {channel}: {e}", file=sys.stderr)
        return

    count = 0
    async for msg in client.iter_messages(entity, limit=limit):
        if not isinstance(msg, Message) or not getattr(msg, "text", None):
            continue
        text = (msg.text or "").strip()
        if not text:
            continue
        date = msg.date
        if date.tzinfo is None:
            date = date.replace(tzinfo=timezone.utc)
        count += 1
        yield text, date, name, msg.id, username

    print(f"[scrape] Fetched {count} messages from {name}")


# ---------------------------------------------------------------------------
# 2. NLP entity extraction (spaCy – GPE / LOC)
# ---------------------------------------------------------------------------

def load_spacy():
    try:
        import spacy
        nlp = spacy.load("en_core_web_sm")
        return nlp
    except OSError:
        print(
            "Run first: python -m spacy download en_core_web_sm",
            file=sys.stderr,
        )
        sys.exit(1)


def extract_locations(nlp, text: str) -> list[str]:
    """Return list of unique GPE and LOC entity texts (normalized)."""
    doc = nlp(text)
    seen = set()
    out = []
    for ent in doc.ents:
        if ent.label_ not in ("GPE", "LOC"):
            continue
        normalized = ent.text.strip()
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        out.append(normalized)
    return out


# ---------------------------------------------------------------------------
# 3. Risk analysis (keyword-based)
# ---------------------------------------------------------------------------

def classify_severity(text: str) -> str:
    """Return 'critical', 'high', or 'low' based on keyword lists."""
    lower = text.lower()
    for kw in KEYWORDS_CRITICAL:
        if re.search(r"\b" + re.escape(kw) + r"\b", lower):
            return "critical"
    for kw in KEYWORDS_HIGH:
        if re.search(r"\b" + re.escape(kw) + r"\b", lower):
            return "high"
    for kw in KEYWORDS_LOW:
        if re.search(r"\b" + re.escape(kw) + r"\b", lower):
            return "low"
    return "low"


# ---------------------------------------------------------------------------
# 4. Geocoding (Geopy Nominatim, 1s delay) + cache so each place is only requested once
# ---------------------------------------------------------------------------

def geocode_location(
    location: str,
    delay_seconds: float = 1.0,
    cache: Optional[dict[str, Optional[tuple[float, float]]]] = None,
) -> Optional[tuple[float, float]]:
    """Convert place name to (lat, lon). Uses Nominatim. Returns None if not found.
    Pass a dict as cache to avoid re-requesting the same location (big speedup)."""
    from geopy.geocoders import Nominatim
    from geopy.exc import GeocoderTimedOut, GeocoderServiceError

    if cache is not None:
        if location in cache:
            return cache[location]
    else:
        cache = {}

    geolocator = Nominatim(user_agent="telegram_geo_dashboard/1.0")
    try:
        time.sleep(delay_seconds)
        result = geolocator.geocode(location, timeout=10)
        if result is None:
            coords = None
        else:
            coords = (result.latitude, result.longitude)
        if cache is not None:
            cache[location] = coords
        return coords
    except (GeocoderTimedOut, GeocoderServiceError, Exception):
        if cache is not None:
            cache[location] = None
        return None


# ---------------------------------------------------------------------------
# 5. Supabase: push to messages table (for globe pulsating signals + Telegram link)
# ---------------------------------------------------------------------------

def push_to_supabase(geo_messages: list[GeoMessage]) -> None:
    """Insert geocoded signals into Supabase messages table. Globe reads this for pulsating lights."""
    try:
        from supabase import create_client
    except ImportError:
        print("[supabase] pip install supabase", file=sys.stderr)
        return

    client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    table = "messages"

    rows = []
    for g in geo_messages:
        rows.append({
            "message_text": g.text,
            "latitude": g.lat,
            "longitude": g.lon,
            "severity": g.severity,
            "telegram_url": g.telegram_url or None,
        })

    try:
        client.table(table).insert(rows).execute()
        print(f"[supabase] Inserted {len(rows)} rows into {table} (globe will show pulsating signals + Telegram links).")
    except Exception as e:
        print(f"[supabase] Insert failed: {e}", file=sys.stderr)
        print("Ensure table 'messages' exists with columns: message_text, latitude, longitude, severity, telegram_url (all optional except table name).", file=sys.stderr)


# ---------------------------------------------------------------------------
# 6. Map (Folium + MarkerCluster)
# ---------------------------------------------------------------------------

def build_map(geo_messages: list[GeoMessage], output_path: str = "telegram_threat_map.html") -> None:
    """Create interactive Folium map with MarkerCluster and color-coded markers."""
    import folium
    from folium.plugins import MarkerCluster

    # Base map
    m = folium.Map(location=[20, 0], zoom_start=2, tiles="CartoDB positron")

    # One cluster for all markers to reduce clutter (color is per-marker)
    cluster = MarkerCluster(name="Signals").add_to(m)

    colors = {"critical": "red", "high": "orange", "low": "blue"}

    for g in geo_messages:
        color = colors.get(g.severity, "blue")
        link_html = ""
        if g.telegram_url:
            link_html = f"<a href='{html.escape(g.telegram_url)}' target='_blank' rel='noopener'>View on Telegram</a><br>"
        popup_html = (
            f"<div style='max-width:320px;'>"
            f"<strong>{g.severity.upper()}</strong> · {g.location_text}<br>"
            f"<small>{g.timestamp.strftime('%Y-%m-%d %H:%M UTC')}</small><br>"
            f"{link_html}"
            f"<p style='margin-top:8px;'>{html.escape(g.text[:500])}"
            + ("…" if len(g.text) > 500 else "")
            + "</p></div>"
        )
        folium.Marker(
            [g.lat, g.lon],
            popup=folium.Popup(popup_html, max_width=360),
            icon=folium.Icon(color=color, icon="info-sign"),
        ).add_to(cluster)

    m.save(output_path)
    print(f"[map] Saved {output_path} with {len(geo_messages)} markers.")


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------

async def main() -> None:
    if not TELEGRAM_CHANNELS:
        print(
            "Set TELEGRAM_CHANNEL in .env or env (e.g. warmonitors or warmonitors,rnintel,DDGeopolitics).",
            file=sys.stderr,
        )
        sys.exit(1)

    from telethon import TelegramClient

    client = TelegramClient(
        TELEGRAM_SESSION,
        int(TELEGRAM_API_ID),
        TELEGRAM_API_HASH,
    )

    await client.start()
    nlp = load_spacy()

    all_messages: list[tuple[str, datetime, str, int, str]] = []
    for channel in TELEGRAM_CHANNELS:
        async for text, date, name, msg_id, username in scrape_channel(client, channel, limit=100):
            all_messages.append((text, date, name, msg_id, username))

    geo_messages: list[GeoMessage] = []
    geocode_cache: dict[str, Optional[tuple[float, float]]] = {}
    unique_locations = set()
    for _t, _d, _c, _mid, _u in all_messages:
        unique_locations.update(extract_locations(nlp, _t))
    total_unique = len(unique_locations)
    print(f"[geo] Up to {total_unique} unique locations (1 Nominatim req/s; repeated places use cache).")

    for text, date, channel_name, message_id, channel_username in all_messages:
        locations = extract_locations(nlp, text)
        severity = classify_severity(text)
        telegram_url = f"https://t.me/{channel_username}/{message_id}" if channel_username else ""

        for loc in locations:
            coords = geocode_location(loc, delay_seconds=1.0, cache=geocode_cache)
            if coords is None:
                continue
            lat, lon = coords
            geo_messages.append(
                GeoMessage(
                    text=text,
                    timestamp=date,
                    channel=channel_name,
                    location_text=loc,
                    lat=lat,
                    lon=lon,
                    severity=severity,
                    telegram_url=telegram_url,
                )
            )

    await client.disconnect()

    if not geo_messages:
        print("No geocoded messages; map would be empty. Check channel and NLP/geocoding.")
        return

    build_map(geo_messages, "telegram_threat_map.html")

    if SUPABASE_URL and SUPABASE_SERVICE_KEY:
        push_to_supabase(geo_messages)
    else:
        print("[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set; skipping upload (globe will not update).")


if __name__ == "__main__":
    asyncio.run(main())
