"""Quality-control checks on LLM output. Plain Python so they are easy to test.

The key rule: a credibility claim (certification, years of experience, results)
is only allowed if the creator themselves wrote it. We enforce that in code by
requiring a verbatim quote that exists in the trusted source text.
"""
import re


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").lower()).strip()


def verify_claims(claims: list, source_text: str, allowed_source: str):
    """claims: list of dicts {claim, source, quote}.
    allowed_source: 'bio' for the Instagram path, 'user_input' for the manual path.
    Returns (accepted, rejected). Each rejected item carries a `reason`."""
    src = _norm(source_text)
    src_nocomma = src.replace(",", "")
    accepted, rejected = [], []
    for c in claims:
        reason = None
        quote = _norm(c.get("quote", ""))
        if c.get("source") != allowed_source:
            reason = f"source '{c.get('source')}' not allowed on this path"
        elif not quote or quote not in src:
            reason = "quote not found verbatim in source text"
        else:
            for n in re.findall(r"\d[\d,\.]*", c.get("claim", "")):
                n = n.rstrip(".,").replace(",", "")
                if n and n not in src_nocomma:
                    reason = f"number '{n}' not present in source text"
                    break
        if reason:
            rejected.append({**c, "reason": reason})
        else:
            accepted.append({"claim": c["claim"], "source": c["source"], "quote": c["quote"]})
    return accepted, rejected


def sanitize_scored(scored: dict, valid_ids: set) -> dict:
    """Drop evidence ids that don't exist. If a value has no valid evidence,
    cap its confidence so it gets flagged for confirmation."""
    ev = [e for e in scored.get("evidence", []) if e in valid_ids]
    conf = float(scored.get("confidence", 0.0))
    if scored.get("value") and not ev:
        conf = min(conf, 0.5)
    if not scored.get("value"):
        conf = 0.0
    return {"value": scored.get("value"), "confidence": round(conf, 2), "evidence": ev}


def auto_needs_confirmation(inferred: dict, existing: list, threshold: float = 0.7) -> list:
    """Anything missing or low-confidence goes to the 'check this' list."""
    out = [f for f in existing if f in ("niche", "sub_niche", "target_audience")]
    for field in ("niche", "sub_niche", "target_audience"):
        s = inferred[field]
        if (not s["value"] or s["confidence"] < threshold) and field not in out:
            out.append(field)
    return out
