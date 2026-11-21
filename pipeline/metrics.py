"""Deterministic metrics computed in code (no LLM, no pydantic)."""
import re
from statistics import mean

DEVANAGARI = re.compile(r"[\u0900-\u097F]")
LATIN = re.compile(r"[A-Za-z]")

# Roman-script Hindi words that are unlikely to appear in normal English text.
HINGLISH_WORDS = {
    "hai", "hain", "nahi", "nahin", "kya", "kaise", "kaisa", "aap", "aapko", "tum", "tumhe",
    "mera", "meri", "mere", "apna", "apni", "apne", "karo", "kare", "karna", "kiya", "kuch",
    "bahut", "sab", "yeh", "woh", "ko", "ke", "ki", "ka", "mein", "se", "liye", "lekin",
    "aur", "bhi", "toh", "chahiye", "hota", "hoti", "hoga", "raha", "rahe", "rahi", "wala",
    "wali", "din", "abhi", "jab", "agar", "kyun", "kyunki", "sirf", "zyada", "accha", "achha",
    "dost", "bhai", "yaar", "paisa", "paise", "seekho", "sikho", "jaldi", "roz",
}


def detect_caption_script(texts: list) -> str:
    joined = " ".join(t for t in texts if t)
    dev = len(DEVANAGARI.findall(joined))
    lat = len(LATIN.findall(joined))
    total = dev + lat
    if total < 20:
        return "unknown"
    if dev / total > 0.3:
        return "devanagari"
    words = re.findall(r"[a-z]+", joined.lower())
    if words and sum(1 for w in words if w in HINGLISH_WORDS) / len(words) > 0.06:
        return "hinglish"
    return "english"


def engagement_level(rate, followers) -> str:
    """Rough benchmark bands: bigger accounts naturally have lower engagement rates.
    These thresholds are heuristics; tune them with real data."""
    if rate is None or not followers:
        return "unknown"
    if followers < 10_000:
        hi, lo = 6.0, 3.0
    elif followers < 100_000:
        hi, lo = 3.5, 1.5
    else:
        hi, lo = 2.0, 0.8
    return "high" if rate >= hi else "medium" if rate >= lo else "low"


def compute_metrics(posts: list, followers) -> dict:
    likes = [p["likes"] for p in posts if isinstance(p.get("likes"), int) and p["likes"] >= 0]
    comments = [p["comments"] for p in posts if isinstance(p.get("comments"), int) and p["comments"] >= 0]
    avg_l = round(mean(likes), 1) if likes else 0.0
    avg_c = round(mean(comments), 1) if comments else 0.0
    rate = None
    if followers and followers > 0 and (likes or comments):
        rate = round((avg_l + avg_c) / followers * 100, 2)
    return {
        "posts_analyzed": len(posts),
        "avg_likes": avg_l,
        "avg_comments": avg_c,
        "engagement_rate": rate,
        "caption_script": detect_caption_script([p.get("caption", "") for p in posts]),
    }
