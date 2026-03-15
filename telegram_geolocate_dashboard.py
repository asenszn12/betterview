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


def pick_primary_location(nlp, text: str, locations: list[str], severity: str) -> Optional[str]:
    """
    Pick the single most relevant location for this message so we don't place the same
    message in multiple countries. Prefer a place that appears in the same sentence as
    an event keyword (e.g. 'explosion in Kyiv' -> Kyiv). Otherwise use the first location.
    """
    if not locations:
        return None
    if len(locations) == 1:
        return locations[0]

    doc = nlp(text)
    lower = text.lower()
    # Keywords that indicate "where the event happened" when in same sentence as a location
    event_keywords = KEYWORDS_CRITICAL + KEYWORDS_HIGH + ["in", "at", "near", "outside", "inside"]

    # Find sentences (rough split) and which locations appear in which sentence
    sentences = [s.strip() for s in re.split(r"[.!?]\s+", text) if s.strip()]
    best_location = None
    best_score = -1

    for loc in locations:
        score = 0
        # Prefer location that appears in a sentence containing an event keyword
        for sent in sentences:
            if loc not in sent:
                continue
            sent_lower = sent.lower()
            if any(kw in sent_lower for kw in event_keywords):
                score += 2
            # First mentioned location often is the primary (e.g. "Kyiv" before "Russia")
            if text.find(loc) < (len(text) // 2):
                score += 1
        if score > best_score:
            best_score = score
            best_location = loc

    return best_location if best_location else locations[0]


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
            "location_label": g.location_text,
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

def _popup_card_html(g: GeoMessage) -> str:
    """Build a single styled card HTML for the marker popup (no raw text; only this div is used)."""
    severity_colors = {"critical": "#c0392b", "high": "#d35400", "low": "#2980b9"}
    header_color = severity_colors.get(g.severity, "#2980b9")
    msg_escaped = html.escape(g.text[:500])
    if len(g.text) > 500:
        msg_escaped += "…"
    link_block = ""
    if g.telegram_url:
        link_block = (
            f"<div style='margin-bottom:8px;'>"
            f"<a href='{html.escape(g.telegram_url)}' target='_blank' rel='noopener noreferrer' "
            "style='color:#22d3ee;text-decoration:none;font-size:12px;'>View on Telegram</a></div>"
        )
    return (
        f"<div style='max-width:380px;min-width:200px;padding:12px;border-radius:8px;"
        f"background:rgba(30,30,35,0.98);border:1px solid rgba(255,255,255,0.12);"
        f"font-family:system-ui,sans-serif;font-size:13px;line-height:1.45;color:#e2e8f0;'>"
        f"<div style='font-weight:700;letter-spacing:0.05em;font-size:11px;margin-bottom:8px;color:{header_color};'>"
        f"{html.escape(g.severity.upper())}</div>"
        f"{link_block}"
        f"<p style='margin:0;word-break:break-word;'>{msg_escaped}</p>"
        f"</div>"
    )


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
        popup_html = _popup_card_html(g)
        folium.Marker(
            [g.lat, g.lon],
            popup=folium.Popup(popup_html, max_width=400),
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
        if not locations:
            continue
        severity = classify_severity(text)
        primary_loc = pick_primary_location(nlp, text, locations, severity)
        if not primary_loc:
            continue
        coords = geocode_location(primary_loc, delay_seconds=1.0, cache=geocode_cache)
        if coords is None:
            continue
        lat, lon = coords
        telegram_url = f"https://t.me/{channel_username}/{message_id}" if channel_username else ""
        geo_messages.append(
            GeoMessage(
                text=text,
                timestamp=date,
                channel=channel_name,
                location_text=primary_loc,
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
