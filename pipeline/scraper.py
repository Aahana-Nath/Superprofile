"""Instagram fetch layer (Apify). No LLM here, and no pydantic: plain dicts.

Public API:
    normalize_handle(raw)            -> clean username or None
    fetch_instagram_profile(handle)  -> (instagram_data_dict, raw_items_list)
    has_enough_signal(ig)            -> bool  (is there enough content to infer from?)

The Apify actor's exact field names can drift, so every read goes through
`_get(...)`, which tries several known names. The raw actor response is also
returned so main.py can save it for inspection.
"""
import re
from datetime import datetime, timezone

from .config import settings
from .metrics import compute_metrics

HANDLE_RE = re.compile(r"^[A-Za-z0-9._]{1,30}$")


# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------
def normalize_handle(raw: str):
    """'@aarav.fit', 'instagram.com/aarav.fit/', 'aarav.fit' -> 'aarav.fit'. Invalid -> None."""
    if not raw:
        return None
    s = raw.strip()
    m = re.search(r"instagram\.com/([A-Za-z0-9._]+)", s)
    if m:
        s = m.group(1)
    s = s.lstrip("@").strip().strip("/")
    if not HANDLE_RE.match(s) or set(s) <= {"."}:
        return None
    return s


def _get(d: dict, *keys, default=None):
    for k in keys:
        if isinstance(d, dict) and d.get(k) is not None:
            return d[k]
    return default


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _empty(handle: str, status: str, detail: str = None) -> dict:
    return {
        "username": f"@{handle}",
        "provider": "apify",
        "extraction_status": status,
        "extracted_at": _now(),
        "error_detail": detail,
        "display_name": None,
        "bio": None,
        "profile_image_url": None,
        "follower_count": None,
        "following_count": None,
        "post_count": None,
        "is_verified": False,
        "is_private": False,
        "is_business_account": False,
        "business_category": None,
        "external_link": None,
        "posts": [],
        "derived_metrics": compute_metrics([], None),
    }


def _map_post(p: dict, index: int) -> dict:
    t = str(_get(p, "type", default="")).lower()
    product = str(_get(p, "productType", default="")).lower()
    if "sidecar" in t or "carousel" in t:
        ptype = "carousel"
    elif "video" in t or "reel" in t or product == "clips":
        ptype = "reel"
    elif "image" in t:
        ptype = "image"
    else:
        ptype = "unknown"

    def _num(v):
        return v if isinstance(v, int) and v >= 0 else None  # -1 = hidden likes

    hashtags = _get(p, "hashtags", default=[]) or []
    images = _get(p, "images", default=[]) or []
    image = _get(p, "displayUrl", "display_url", "thumbnailUrl", "thumbnail_src", "imageUrl", "image_url") or (
        images[0] if images and isinstance(images[0], str) else None
    )
    return {
        "id": f"p{index}",
        "type": ptype,
        "caption": (_get(p, "caption", default="") or "").strip(),
        "hashtags": [str(h) if str(h).startswith("#") else f"#{h}" for h in hashtags],
        "likes": _num(_get(p, "likesCount", "likes")),
        "comments": _num(_get(p, "commentsCount", "comments")),
        "transcript": None,
        "url": _get(p, "url") or (f"https://www.instagram.com/p/{p['shortCode']}/" if p.get("shortCode") else None),
        "image_url": image if isinstance(image, str) and image.startswith("https://") else None,
        "posted_at": _get(p, "timestamp", "takenAt"),
    }


def _classify(item: dict, posts: list):
    """Decide extraction_status from one actor item. Returns (status, detail)."""
    err = str(_get(item, "error", "errorMessage", "errorDescription", default="") or "")
    err_l = err.lower()
    followers = _get(item, "followersCount", "followers")
    is_private = bool(_get(item, "private", "isPrivate", default=False))

    if is_private or "private" in err_l:
        return "private", err or "Account is private"
    if err and any(k in err_l for k in ("not_found", "not found", "does not exist", "doesn't exist", "404", "no profile")):
        return "not_found", err
    if err and followers is None:
        return "failed", err
    if err and not posts:
        return "partial", err  # profile numbers came back, but no content
    if len(posts) >= 3:
        return "completed", None
    return "partial", err or "Fewer than 3 public posts available"


# ----------------------------------------------------------------------------
# main entry
# ----------------------------------------------------------------------------
def fetch_instagram_profile(handle: str):
    """Call the Apify actor synchronously. Never raises: failures become a status."""
    import requests  # imported here so offline tests don't need it

    if not settings.apify_token:
        return _empty(handle, "failed", "APIFY_TOKEN is not set"), []

    url = f"https://api.apify.com/v2/acts/{settings.apify_actor}/run-sync-get-dataset-items"
    try:
        resp = requests.post(
            url,
            params={"token": settings.apify_token, "timeout": max(settings.scrape_timeout - 10, 20)},
            json={"usernames": [handle]},
            timeout=settings.scrape_timeout,
        )
    except requests.Timeout:
        return _empty(handle, "failed", "Scraper timed out"), []
    except requests.RequestException as e:
        return _empty(handle, "failed", f"Network error: {e}"), []

    if resp.status_code in (401, 403, 429):
        return _empty(handle, "blocked", f"Apify returned HTTP {resp.status_code}"), []
    if resp.status_code not in (200, 201):
        return _empty(handle, "failed", f"Apify returned HTTP {resp.status_code}: {resp.text[:200]}"), []

    try:
        items = resp.json()
    except ValueError:
        return _empty(handle, "failed", "Scraper returned invalid JSON"), []

    if not isinstance(items, list) or not items:
        return _empty(handle, "not_found", "Scraper returned no data for this handle"), items or []

    item = items[0]
    raw_posts = _get(item, "latestPosts", "posts", default=[]) or []
    posts = [_map_post(p, i + 1) for i, p in enumerate(raw_posts[: settings.max_posts]) if isinstance(p, dict)]

    status, detail = _classify(item, posts)
    followers = _get(item, "followersCount", "followers")

    data = _empty(handle, status, detail)
    data.update(
        {
            "username": f"@{_get(item, 'username', default=handle)}",
            "display_name": _get(item, "fullName", "full_name"),
            "bio": _get(item, "biography", "bio"),
            "profile_image_url": _get(item, "profilePicUrlHD", "profilePicUrl", "profile_pic_url"),
            "follower_count": followers,
            "following_count": _get(item, "followsCount", "followingCount", "following"),
            "post_count": _get(item, "postsCount", "mediaCount"),
            "is_verified": bool(_get(item, "verified", "isVerified", default=False)),
            "is_private": status == "private",
            "is_business_account": bool(_get(item, "isBusinessAccount", "businessAccount", default=False)),
            "business_category": _get(item, "businessCategoryName", "categoryName"),
            "external_link": _get(item, "externalUrl", "external_url"),
            "posts": posts,
            "derived_metrics": compute_metrics(posts, followers),
        }
    )
    return data, items


def has_enough_signal(ig: dict) -> bool:
    """Even a 'completed'/'partial' fetch may be too thin to infer a niche from."""
    if ig["extraction_status"] not in ("completed", "partial"):
        return False
    bio_len = len((ig.get("bio") or "").strip())
    captions = sum(1 for p in ig["posts"] if len(p["caption"]) >= 15)
    return bio_len >= 10 or captions >= 1
