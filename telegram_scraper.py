from __future__ import annotations

import argparse
import asyncio
import csv
import json
import os
import sys
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta, timezone
from typing import Iterable, List, Optional, Sequence, Set

from telethon import TelegramClient, errors
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.tl.types import Message, PeerChannel


def _load_dotenv(path: str = ".env") -> None:
    """
    Minimal .env loader so you don't have to export vars manually.
    Only sets variables that are not already in os.environ.
    """
    if not os.path.exists(path):
        return

    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if key and key not in os.environ:
                    os.environ[key] = value
    except Exception as e:
        print(f"[config] Failed to read .env file: {e}", file=sys.stderr)


# --- CONFIGURATION VIA ENVIRONMENT / .ENV ---

_load_dotenv()

TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH")
TELEGRAM_SESSION = os.getenv("TELEGRAM_SESSION", "telegram_geo_scraper")

if not TELEGRAM_API_ID or not TELEGRAM_API_HASH:
    print(
        "ERROR: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set.\n"
        "Either export them in your shell, e.g.:\n"
        "  export TELEGRAM_API_ID=123456\n"
        "  export TELEGRAM_API_HASH=your_hash_here\n"
        "or put them in a .env file in this folder:\n"
        "  TELEGRAM_API_ID=123456\n"
        "  TELEGRAM_API_HASH=your_hash_here",
        file=sys.stderr,
    )
    sys.exit(1)


TELEGRAM_API_ID_INT = int(TELEGRAM_API_ID)

# Default seed channels (geopolitics, war, finance, intel). Override with --channels.
DEFAULT_CHANNELS = [
    "TheIslanderNews",   # https://t.me/TheIslanderNews – Geopolitics and Justice
    "warmonitors",       # https://t.me/warmonitors – War Monitor
    "FinancialJuice",    # https://t.me/FinancialJuice – Financial news
    "rnintel",           # https://t.me/rnintel – Rerum Novarum Intel
    "DDGeopolitics",     # https://t.me/DDGeopolitics – DD Geopolitics
    "medmannews",        # https://t.me/medmannews – Mediterranean Man
    "boris_rozhin",      # https://t.me/boris_rozhin – Colonelcassad (Russian)
    "nexta_live",        # https://t.me/nexta_live – NEXTA Live (Belarus)
]

# Channels that are typically non-English; we translate when --translate is used.
NON_ENGLISH_CHANNELS = {"boris_rozhin", "nexta_live"}


def _get_translator():
    """Return GoogleTranslator if deep_translator is installed, else None."""
    try:
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source="auto", target="en")
    except ImportError:
        return None


def translate_to_english(text: str, max_length: int = 4500) -> Optional[str]:
    """
    Translate text to English (for non-English channels). Returns None if
    translation fails or deep_translator is not installed.
    Install with: pip install deep-translator
    """
    if not text or not text.strip():
        return None
    translator = _get_translator()
    if not translator:
        return None
    try:
        chunk = text.strip()[:max_length]
        return translator.translate(chunk)
    except Exception:
        return None


@dataclass
class ScrapedMessage:
    channel_id: int
    channel_username: Optional[str]
    channel_title: Optional[str]
    message_id: int
    date: str
    text: str
    views: Optional[int]
    forwards: Optional[int]
    url: Optional[str]
    text_translated: Optional[str] = None  # English translation when --translate used


def normalize_list(values: Optional[Sequence[str]]) -> List[str]:
    if not values:
        return []
    return [v.strip().lower() for v in values if v and v.strip()]


async def ensure_joined(client: TelegramClient, channel: str) -> None:
    """
    Join a public channel if not already a participant.
    `channel` can be a username (with or without @) or invite link.
    """
    username_or_link = channel.lstrip("@")
    try:
        entity = await client.get_entity(username_or_link)
    except errors.UsernameNotOccupiedError:
        print(f"[join] Channel '{channel}' does not exist or is not public.", file=sys.stderr)
        return
    except Exception as e:
        print(f"[join] Failed to resolve '{channel}': {e}", file=sys.stderr)
        return

    try:
        await client(JoinChannelRequest(entity))
        print(f"[join] Joined channel: {getattr(entity, 'title', None) or getattr(entity, 'username', channel)}")
    except errors.UserAlreadyParticipantError:
        # Already joined – fine.
        print(f"[join] Already in channel: {getattr(entity, 'title', None) or getattr(entity, 'username', channel)}")
    except errors.FloodWaitError as e:
        print(f"[join] Flood wait for {e.seconds}s when joining {channel}. Sleeping...", file=sys.stderr)
        await asyncio.sleep(e.seconds + 5)
    except Exception as e:
        print(f"[join] Unexpected error when joining {channel}: {e}", file=sys.stderr)


async def discover_related_channels(
    client: TelegramClient,
    seed_channels: Sequence[str],
    max_messages_per_channel: int = 100,
) -> Set[str]:
    """
    Discover additional public channels by inspecting forwarded messages
    from the given seed channels.
    """
    discovered: Set[str] = set()

    for ch in seed_channels:
        username_or_link = ch.lstrip("@")
        try:
            entity = await client.get_entity(username_or_link)
        except Exception as e:
            print(f"[discover] Could not resolve '{ch}': {e}", file=sys.stderr)
            continue

        print(f"[discover] Scanning forwards in '{getattr(entity, 'title', None) or username_or_link}'")

        try:
            async for msg in client.iter_messages(entity, limit=max_messages_per_channel):
                if not msg or not msg.fwd_from or not msg.fwd_from.from_id:
                    continue

                if isinstance(msg.fwd_from.from_id, PeerChannel):
                    try:
                        src = await client.get_entity(msg.fwd_from.from_id)
                    except Exception:
                        continue

                    uname = getattr(src, "username", None)
                    if uname:
                        uname = uname.lower()
                        if uname not in discovered and uname not in {c.lstrip("@").lower() for c in seed_channels}:
                            discovered.add(uname)
        except errors.FloodWaitError as e:
            print(f"[discover] Flood wait for {e.seconds}s on '{ch}'. Sleeping...", file=sys.stderr)
            await asyncio.sleep(e.seconds + 5)
        except Exception as e:
            print(f"[discover] Error while scanning '{ch}': {e}", file=sys.stderr)

        # Gentle rate limit between channels
        await asyncio.sleep(1.0)

    if discovered:
        print(f"[discover] Found {len(discovered)} additional channels via forwards.")
    else:
        print("[discover] No additional channels discovered via forwards.")

    return discovered


def text_matches_filters(
    text: str,
    keywords: Sequence[str],
    locations: Sequence[str],
) -> bool:
    """Check if text matches keyword and location filters (e.g. after translation)."""
    if not text or not text.strip():
        return False
    text_lower = text.lower()
    if keywords and not any(kw in text_lower for kw in keywords):
        return False
    if locations and not any(loc in text_lower for loc in locations):
        return False
    return True


def message_matches_filters(
    msg: Message,
    keywords: Sequence[str],
    locations: Sequence[str],
) -> bool:
    if not msg.message:
        return False
    return text_matches_filters(msg.message, keywords, locations)


async def scrape_channel(
    client: TelegramClient,
    channel: str,
    keywords: Sequence[str],
    locations: Sequence[str],
    since_hours: int,
    limit_per_channel: int,
    translate: bool = False,
) -> List[ScrapedMessage]:
    username_or_link = channel.lstrip("@")
    try:
        entity = await client.get_entity(username_or_link)
    except Exception as e:
        print(f"[scrape] Could not resolve '{channel}': {e}", file=sys.stderr)
        return []

    await ensure_joined(client, username_or_link)

    since_dt = datetime.now(timezone.utc) - timedelta(hours=since_hours)

    channel_username = getattr(entity, "username", None)
    channel_title = getattr(entity, "title", None)
    results: List[ScrapedMessage] = []
    is_non_english = channel_username and channel_username.lower() in NON_ENGLISH_CHANNELS

    if is_non_english:
        print(f"[scrape] Scraping '{channel_title or channel_username or channel}' (non-EN: fetch → translate → filter by EN keywords)...")
        if _get_translator() is None:
            print("[scrape] WARNING: deep_translator not installed. Install with: pip install deep-translator. Skipping message translation for this channel.", file=sys.stderr)
    else:
        print(f"[scrape] Scraping '{channel_title or channel_username or channel}'..." + (" (translate to EN)" if translate else ""))

    try:
        async for msg in client.iter_messages(
            entity,
            limit=limit_per_channel,
            offset_date=since_dt,
        ):
            raw_text = msg.message or ""

            if is_non_english:
                # MVP: fetch all → translate → filter by English keywords → save only matches
                if not raw_text:
                    continue
                text_translated = translate_to_english(raw_text)
                if not text_translated:
                    continue
                if not text_matches_filters(text_translated, keywords, locations):
                    continue
                url = f"https://t.me/{channel_username}/{msg.id}" if channel_username else None
                results.append(
                    ScrapedMessage(
                        channel_id=getattr(entity, "id", 0),
                        channel_username=channel_username,
                        channel_title=channel_title,
                        message_id=msg.id,
                        date=msg.date.astimezone(timezone.utc).isoformat() if msg.date else "",
                        text=raw_text,
                        views=getattr(msg, "views", None),
                        forwards=getattr(msg, "forwards", None),
                        url=url,
                        text_translated=text_translated,
                    )
                )
                await asyncio.sleep(0.15)  # rate limit translate API
            else:
                # English channels: filter on original text, then optionally translate for storage
                if not message_matches_filters(msg, keywords, locations):
                    continue
                url = f"https://t.me/{channel_username}/{msg.id}" if channel_username else None
                text_translated = translate_to_english(raw_text) if translate and raw_text else None
                results.append(
                    ScrapedMessage(
                        channel_id=getattr(entity, "id", 0),
                        channel_username=channel_username,
                        channel_title=channel_title,
                        message_id=msg.id,
                        date=msg.date.astimezone(timezone.utc).isoformat() if msg.date else "",
                        text=raw_text,
                        views=getattr(msg, "views", None),
                        forwards=getattr(msg, "forwards", None),
                        url=url,
                        text_translated=text_translated,
                    )
                )

    except errors.FloodWaitError as e:
        print(f"[scrape] Flood wait for {e.seconds}s on '{channel}'. Sleeping...", file=sys.stderr)
        await asyncio.sleep(e.seconds + 5)
    except Exception as e:
        print(f"[scrape] Error while scraping '{channel}': {e}", file=sys.stderr)

    print(f"[scrape] Found {len(results)} matching messages in '{channel_title or channel_username or channel}'.")
    # Gentle rate limit between channels
    await asyncio.sleep(1.0)

    return results


def write_jsonl(path: str, messages: Iterable[ScrapedMessage]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        for msg in messages:
            f.write(json.dumps(asdict(msg), ensure_ascii=False) + "\n")


def upload_to_supabase(messages: List[ScrapedMessage]) -> None:
    """Upsert scraped messages to Supabase. Requires SUPABASE_URL and SUPABASE_SERVICE_KEY in env."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not url or not key:
        print(
            "[supabase] SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) required. Skip upload.",
            file=sys.stderr,
        )
        return
    try:
        from supabase import create_client
    except ImportError:
        print("[supabase] pip install supabase. Skip upload.", file=sys.stderr)
        return
    client = create_client(url, key)
    rows = []
    for m in messages:
        rows.append({
            "channel_id": m.channel_id,
            "channel_username": m.channel_username,
            "channel_title": m.channel_title,
            "message_id": m.message_id,
            "date": m.date,
            "text": m.text,
            "text_translated": m.text_translated,
            "views": m.views,
            "forwards": m.forwards,
            "url": m.url,
        })
    try:
        client.table("telegram_messages").upsert(rows, on_conflict="channel_id,message_id").execute()
        print(f"[supabase] Upserted {len(rows)} messages.")
    except Exception as e:
        print(f"[supabase] Upload failed: {e}", file=sys.stderr)


def write_csv(path: str, messages: Iterable[ScrapedMessage]) -> None:
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    fieldnames = [
        "channel_id",
        "channel_username",
        "channel_title",
        "message_id",
        "date",
        "text",
        "text_translated",
        "views",
        "forwards",
        "url",
    ]
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for msg in messages:
            writer.writerow(asdict(msg))


async def run_scraper(
    seed_channels: Sequence[str],
    keywords: Sequence[str],
    locations: Sequence[str],
    since_hours: int,
    limit_per_channel: int,
    discovery: bool,
    output_path: str,
    output_format: str,
    translate: bool = False,
    supabase: bool = False,
) -> None:
    all_channels: List[str] = list(seed_channels)

    async with TelegramClient(TELEGRAM_SESSION, TELEGRAM_API_ID_INT, TELEGRAM_API_HASH) as client:
        # Optional discovery phase
        if discovery and seed_channels:
            discovered = await discover_related_channels(client, seed_channels)
            all_channels.extend(sorted(discovered))

        # Deduplicate channels (case-insensitive)
        seen: Set[str] = set()
        normalized: List[str] = []
        for ch in all_channels:
            key = ch.lstrip("@").lower()
            if key not in seen:
                seen.add(key)
                normalized.append(ch)

        print(f"[main] Total target channels: {len(normalized)}")

        all_results: List[ScrapedMessage] = []
        for ch in normalized:
            msgs = await scrape_channel(
                client,
                ch,
                keywords=keywords,
                locations=locations,
                since_hours=since_hours,
                limit_per_channel=limit_per_channel,
                translate=translate,
            )
            all_results.extend(msgs)

    print(f"[main] Collected {len(all_results)} total matching messages.")

    if not all_results:
        print("[main] No messages matched the given filters.")
        return

    if output_format == "jsonl":
        write_jsonl(output_path, all_results)
    elif output_format == "csv":
        write_csv(output_path, all_results)
    else:
        raise ValueError(f"Unsupported output format: {output_format}")

    print(f"[main] Saved results to '{output_path}' in {output_format.upper()} format.")

    if supabase:
        upload_to_supabase(all_results)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Telegram scraper for geopolitics / war / disaster channels using Telethon.\n"
            "Joins channels, optionally discovers related ones via forwards, and filters "
            "messages by keywords and locations."
        )
    )

    parser.add_argument(
        "--channels",
        nargs="*",
        default=None,
        help=(
            "Seed channel usernames or t.me links. If omitted, uses built-in list: "
            "TheIslanderNews, warmonitors, FinancialJuice, rnintel, DDGeopolitics, "
            "medmannews, boris_rozhin, nexta_live."
        ),
    )
    parser.add_argument(
        "--keywords",
        nargs="+",
        default=[
            "war",
            "offensive",
            "strike",
            "missile",
            "airstrike",
            "shelling",
            "geopolitics",
            "coup",
            "sanction",
            "border",
            "mobilization",
            "terrorist",
            "explosion",
            "conflict",
            "frontline",
            "evacuation",
            "earthquake",
            "flood",
            "hurricane",
            "wildfire",
            "disaster",
        ],
        help="Keywords to filter messages by (case-insensitive). Default: a geopolitics/war/disaster-focused set.",
    )
    parser.add_argument(
        "--locations",
        nargs="+",
        default=[],
        help=(
            "Optional list of location keywords (cities / regions / countries). "
            "When provided, messages must match BOTH a keyword and a location."
        ),
    )
    parser.add_argument(
        "--since-hours",
        type=int,
        default=24,
        help="How many hours back to look per channel. Default: 24.",
    )
    parser.add_argument(
        "--limit-per-channel",
        type=int,
        default=500,
        help="Maximum number of messages to inspect per channel. Default: 500.",
    )
    parser.add_argument(
        "--no-discovery",
        action="store_true",
        help="Disable discovery of additional channels via forwarded messages.",
    )
    parser.add_argument(
        "--output",
        default="data/telegram_geo_messages.jsonl",
        help="Output file path. Default: data/telegram_geo_messages.jsonl",
    )
    parser.add_argument(
        "--format",
        choices=["jsonl", "csv"],
        default="jsonl",
        help="Output format: jsonl or csv. Default: jsonl.",
    )
    parser.add_argument(
        "--translate",
        action="store_true",
        help=(
            "Translate non-English message text to English (e.g. boris_rozhin, nexta_live). "
            "Requires: pip install deep-translator. Adds 'text_translated' to output."
        ),
    )
    parser.add_argument(
        "--supabase",
        action="store_true",
        help=(
            "Upload scraped messages to Supabase. Set SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_KEY) in .env. "
            "Run supabase/schema.sql in your project first."
        ),
    )

    return parser


def main(argv: Optional[Sequence[str]] = None) -> None:
    parser = build_arg_parser()
    args = parser.parse_args(argv)

    if args.channels:
        seed_channels = [c.strip().replace("https://t.me/", "").lstrip("@") for c in args.channels if c.strip()]
    else:
        seed_channels = list(DEFAULT_CHANNELS)
    if not seed_channels:
        print("ERROR: No channels to scrape. Use --channels or rely on built-in defaults.", file=sys.stderr)
        sys.exit(1)

    keywords = normalize_list(args.keywords)
    locations = normalize_list(args.locations)

    print(f"[config] Seed channels: {seed_channels}")
    print(f"[config] Keywords: {keywords}")
    print(f"[config] Locations: {locations}")
    print(f"[config] Since hours: {args.since_hours}")
    print(f"[config] Limit per channel: {args.limit_per_channel}")
    print(f"[config] Discovery enabled: {not args.no_discovery}")
    print(f"[config] Output: {args.output} ({args.format})")
    print(f"[config] Translate to English: {args.translate}")
    print(f"[config] Upload to Supabase: {args.supabase}")
    if args.translate and _get_translator() is None:
        print("WARNING: --translate set but deep_translator not installed. Run: pip install deep-translator", file=sys.stderr)

    start = time.time()
    asyncio.run(
        run_scraper(
            seed_channels=seed_channels,
            keywords=keywords,
            locations=locations,
            since_hours=args.since_hours,
            limit_per_channel=args.limit_per_channel,
            discovery=not args.no_discovery,
            output_path=args.output,
            output_format=args.format,
            translate=args.translate,
            supabase=args.supabase,
        )
    )
    elapsed = time.time() - start
    print(f"[done] Finished in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
