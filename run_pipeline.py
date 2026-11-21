"""JSON bridge for the Nuxt frontend. Reads a request on stdin, writes one JSON response on stdout.

Requests:
  {"mode": "instagram", "handle": "@x"}             -> {"ok": true, "document": {...}}
  {"mode": "manual", "manual": {...}}                -> same
  {"mode": "storefront", "document": {...}, "language"?, "name"?, "instruction"?}  -> {"ok": true, "store": {...}}
  {"mode": "regenerate", "document": {...}, "store": {...}, "target": "bio|product|new_product",
   "index"?, "instruction"?}                         -> {"ok": true, "result": {...}, "generation": {...}}
Errors:
          {"ok": false, "code": "...", "message": "...", "fallback_to_manual": bool}
"""
import json
import sys

from main import STATUS_MESSAGES, looks_empty
from pipeline.document import build_document
from pipeline.schemas import FinalDocument
from pipeline.scraper import fetch_instagram_profile, has_enough_signal, normalize_handle
from pipeline.storefront import StorefrontError, generate_storefront, regenerate_section


def fail(code: str, message: str, fallback_to_manual: bool = False) -> dict:
    return {"ok": False, "code": code, "message": message, "fallback_to_manual": fallback_to_manual}


def run_instagram(raw_handle: str) -> dict:
    handle = normalize_handle(raw_handle or "")
    if not handle:
        return fail("invalid_handle", "That doesn't look like a valid Instagram handle.")

    # Nothing is written to disk: runs are not kept between visits.
    ig, _raw_items = fetch_instagram_profile(handle)
    if not has_enough_signal(ig):
        status = ig["extraction_status"] if ig["extraction_status"] != "completed" else "partial"
        message = STATUS_MESSAGES.get(status, STATUS_MESSAGES["failed"])
        return fail(status, message, fallback_to_manual=True)

    doc = build_document("instagram", ig=ig)
    return {"ok": True, "document": doc}


def run_manual(data: dict) -> dict:
    description = (data.get("description") or "").strip()
    if looks_empty(description):
        return fail("too_short", "That's a bit short. A line about what you do and what you create works best.")

    manual = {
        "description": description,
        "audience": (data.get("audience") or "").strip() or None,
        "follower_range": data.get("follower_range") or "unknown",
        "language": data.get("language") or "english",
        "credibility": (data.get("credibility") or "").strip() or None,
        "existing_prices": (data.get("existing_prices") or "").strip() or None,
    }
    doc = build_document("manual", manual=manual)
    return {"ok": True, "document": doc}


def _profile(req: dict) -> dict:
    return FinalDocument.model_validate(req.get("document")).model_dump()


def run_storefront(req: dict) -> dict:
    try:
        store = generate_storefront(_profile(req), req.get("language"), req.get("name"), req.get("instruction"),
                                    req.get("playbook"))
    except StorefrontError as e:
        return fail("llm_failed", f"We couldn't write your store this time ({e}). Please try again.")
    return {"ok": True, "store": store}


def run_regenerate(req: dict) -> dict:
    try:
        out = regenerate_section(_profile(req), req.get("store") or {}, req.get("target"), req.get("index"),
                                 req.get("instruction"))
    except StorefrontError as e:
        return fail("llm_failed", f"We couldn't rewrite that part ({e}). Please try again.")
    return {"ok": True, **out}


MODES = {
    "instagram": lambda r: run_instagram(r.get("handle")),
    "manual": lambda r: run_manual(r.get("manual") or {}),
    "storefront": run_storefront,
    "regenerate": run_regenerate,
}


def main():
    try:
        req = json.load(sys.stdin)
        handler = MODES.get(req.get("mode"))
        result = handler(req) if handler else fail("bad_request", f"mode must be one of {', '.join(MODES)}")
    except Exception as e:  # keep stdout valid JSON no matter what
        result = fail("internal_error", f"{type(e).__name__}: {e}")
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
