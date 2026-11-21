"""Assembles the final JSON document and validates it before it is written."""
from datetime import datetime, timezone

from .inference import infer
from .metrics import engagement_level
from .schemas import FinalDocument


def build_document(input_method: str, ig: dict = None, manual: dict = None) -> dict:
    """Exactly one of `ig` / `manual` is used; the other is null in the output."""
    if input_method not in ("instagram", "manual"):
        raise ValueError("input_method must be 'instagram' or 'manual'")
    if input_method == "instagram" and not ig:
        raise ValueError("instagram data required")
    if input_method == "manual" and not manual:
        raise ValueError("manual data required")

    result = infer(input_method, ig, manual)

    # Engagement level is computed in code from real numbers, not guessed by the LLM.
    if input_method == "instagram":
        m = ig["derived_metrics"]
        eng = engagement_level(m["engagement_rate"], ig["follower_count"])
    else:
        eng = "unknown"

    gaps_unknown = list(result["unknown_fields"])
    if input_method == "manual" and not manual.get("existing_prices") and "existing_prices" not in gaps_unknown:
        gaps_unknown.append("existing_prices")

    doc = {
        "input_method": input_method,
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "instagram_data": ig if input_method == "instagram" else None,
        "manual_data": manual if input_method == "manual" else None,
        "inferred": {**result["inferred_fields"], "engagement_level": eng},
        "credibility_claims": result["claims"],
        "gaps": {
            "unknown_fields": gaps_unknown,
            "needs_confirmation": result["needs_confirmation"],
            "rejected_claims": result["rejected_claims"],
        },
        "quality_control": result["qc"],
    }
    # Final structural validation: raises if anything is malformed, so we never write a broken file.
    return FinalDocument.model_validate(doc).model_dump(mode="json")
