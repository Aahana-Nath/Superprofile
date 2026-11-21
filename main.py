"""CLI: Instagram handle OR manual description -> complete, validated JSON.

Usage:
    python main.py                      # interactive
    python main.py --handle @someone    # Instagram path
    python main.py --manual             # skip Instagram, go straight to the form
    python main.py --manual --description "I teach UPSC prep" --followers 5k_25k --language hinglish
"""
import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path

from pipeline.document import build_document
from pipeline.scraper import fetch_instagram_profile, has_enough_signal, normalize_handle

OUT_DIR = Path("output")

STATUS_MESSAGES = {
    "private": "That account is private, so we can't read it.",
    "not_found": "We couldn't find that Instagram account.",
    "blocked": "Instagram data is temporarily unavailable.",
    "failed": "We couldn't read that account right now.",
    "partial": "We found the account, but there isn't enough public content to learn from.",
    "completed": "",
}

FOLLOWER_OPTIONS = [
    ("none", "I don't have an audience yet"),
    ("under_5k", "Under 5K"),
    ("5k_25k", "5K to 25K"),
    ("25k_100k", "25K to 100K"),
    ("100k_plus", "100K+"),
]
LANGUAGE_OPTIONS = [("english", "English"), ("hinglish", "Hinglish"), ("hindi", "Hindi")]


# ----------------------------------------------------------------------------
# small input helpers
# ----------------------------------------------------------------------------
def ask(prompt: str, default: str = "") -> str:
    try:
        val = input(prompt).strip()
    except EOFError:
        val = ""
    return val or default


def choose(title: str, options: list, default_key: str) -> str:
    print(f"\n{title}")
    for i, (_, label) in enumerate(options, 1):
        print(f"  {i}. {label}")
    raw = ask(f"Pick 1-{len(options)} (Enter = skip): ")
    if raw.isdigit() and 1 <= int(raw) <= len(options):
        return options[int(raw) - 1][0]
    return default_key


def looks_empty(text: str) -> bool:
    """Cheap local check before spending an LLM call. The LLM catches subtler gibberish."""
    words = re.findall(r"[^\W\d_]+", text, flags=re.UNICODE)
    return len(words) < 2 or len(text) < 10


def collect_manual(args) -> dict:
    desc = args.description or ""
    while looks_empty(desc):
        if desc:
            print("That's a bit short. A line about what you do and what you create works best.")
        desc = ask("\nWhat do you do, and what do you create or inspire people with? ")
        if not desc and not sys.stdin.isatty():
            sys.exit("A description is required for the manual path.")

    audience = args.audience if args.audience is not None else ask("Who mostly watches your content? (optional) ")
    followers = args.followers or choose("How big is your audience? (optional)", FOLLOWER_OPTIONS, "unknown")
    language = args.language or choose("Language for your page?", LANGUAGE_OPTIONS, "english")
    credibility = args.credibility if args.credibility is not None else ask("Any credentials or results to mention? (optional) ")
    prices = args.prices if args.prices is not None else ask("Anything you already sell, with prices? (optional) ")

    return {
        "description": desc.strip(),
        "audience": audience.strip() or None,
        "follower_range": followers,
        "language": language,
        "credibility": credibility.strip() or None,
        "existing_prices": prices.strip() or None,
    }


# ----------------------------------------------------------------------------
# output
# ----------------------------------------------------------------------------
def save(name: str, payload: dict, suffix: str = "") -> Path:
    OUT_DIR.mkdir(exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUT_DIR / f"{name}{suffix}_{stamp}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


def print_summary(doc: dict, path: Path):
    inf, qc, gaps = doc["inferred"], doc["quality_control"], doc["gaps"]
    print("\n" + "=" * 60)
    print(f"Input method : {doc['input_method']}")
    print(f"Niche        : {inf['niche']['value']}  (confidence {inf['niche']['confidence']})")
    print(f"Sub-niche    : {inf['sub_niche']['value']}")
    print(f"Audience     : {inf['target_audience']['value']}")
    print(f"Language     : {inf['output_language']}")
    print(f"Engagement   : {inf['engagement_level']}")
    print(f"Themes       : {', '.join(inf['recurring_themes']) or '-'}")
    print(f"Credentials  : {len(doc['credibility_claims'])} verified, {len(gaps['rejected_claims'])} rejected")
    print(f"Check these  : {', '.join(gaps['needs_confirmation']) or '-'}")
    print(f"LLM          : {qc['llm_provider']}/{qc['llm_model']}  attempts={qc['llm_attempts']}  status={qc['inference_status']}  {qc['latency_seconds']}s")
    if qc["inference_status"] == "fallback":
        print(f"  (LLM failed, fallback used: {qc.get('last_error')})")
    print(f"\nSaved -> {path}")
    print("=" * 60)


# ----------------------------------------------------------------------------
# flow
# ----------------------------------------------------------------------------
def try_instagram(args):
    """Returns instagram_data dict if usable, else None (caller falls back to manual)."""
    raw = args.handle or ask("Instagram handle (press Enter to describe yourself instead): ")
    if not raw:
        return None
    handle = normalize_handle(raw)
    if not handle:
        print("That doesn't look like a valid Instagram handle.")
        return None

    print(f"Reading @{handle} ...")
    ig, raw_items = fetch_instagram_profile(handle)
    # Save the raw actor response: handy for checking real field names.
    save(handle, raw_items, suffix="_raw_apify")

    if has_enough_signal(ig):
        n = len(ig["posts"])
        print(f"Got profile ({ig['follower_count']} followers) and {n} posts. Status: {ig['extraction_status']}")
        return ig

    status = ig["extraction_status"] if ig["extraction_status"] != "completed" else "partial"
    print(STATUS_MESSAGES.get(status, STATUS_MESSAGES["failed"]))
    if ig.get("error_detail"):
        print(f"  detail: {ig['error_detail']}")
    print("No problem. Tell us a bit about yourself instead.")
    return None


def main():
    p = argparse.ArgumentParser(description="Build the creator data JSON from Instagram or a manual description.")
    p.add_argument("--handle", help="Instagram handle, e.g. @creator")
    p.add_argument("--manual", action="store_true", help="Skip Instagram and use the manual form")
    p.add_argument("--description")
    p.add_argument("--audience")
    p.add_argument("--followers", choices=[k for k, _ in FOLLOWER_OPTIONS])
    p.add_argument("--language", choices=[k for k, _ in LANGUAGE_OPTIONS])
    p.add_argument("--credibility")
    p.add_argument("--prices")
    args = p.parse_args()

    ig = None if args.manual else try_instagram(args)

    if ig:
        print("Analysing with LLM ...")
        doc = build_document("instagram", ig=ig)
        name = ig["username"].lstrip("@")
    else:
        manual = collect_manual(args)
        doc = None
        for attempt in range(3):
            print("Analysing with LLM ...")
            doc = build_document("manual", manual=manual)
            qc = doc["quality_control"]
            if qc["input_quality"] == "ok":
                break
            print(f"\nWe need a little more to go on: {qc['input_quality_note'] or 'the description is too vague'}")
            if not sys.stdin.isatty() or attempt == 2:
                print("Continuing with what we have; the flagged fields will need your confirmation.")
                break
            extra = ask("Add more detail (what do you teach, and to whom?): ")
            if qc["input_quality"] == "gibberish":
                manual["description"] = extra or manual["description"]
            else:
                manual["description"] = f"{manual['description']}. {extra}".strip()
        name = "manual"

    path = save(name, doc)
    print_summary(doc, path)


if __name__ == "__main__":
    main()
