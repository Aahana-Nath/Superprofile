"""Thin LLM wrapper. One function, two providers. Swap providers via LLM_PROVIDER."""
from .config import settings


def call_llm(system: str, user: str) -> str:
    """Returns the model's raw text reply. Raises on API errors (caller handles retries)."""
    if settings.llm_provider == "openai":
        from openai import OpenAI

        client = OpenAI(api_key=settings.openai_key, timeout=settings.llm_timeout)
        resp = client.chat.completions.create(
            model=settings.resolved_model,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
        )
        return resp.choices[0].message.content or ""

    if settings.llm_provider == "gemini":
        import requests

        key = settings.gemini_key
        if not key:
            raise RuntimeError("GEMINI_API_KEY is not set")
        resp = requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{settings.resolved_model}:generateContent",
            headers={"x-goog-api-key": key},
            json={
                "systemInstruction": {"parts": [{"text": system}]},
                "contents": [{"role": "user", "parts": [{"text": user}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            timeout=settings.llm_timeout,
        )
        resp.raise_for_status()
        parts = resp.json()["candidates"][0]["content"]["parts"]
        return "".join(p.get("text", "") for p in parts)

    # default: anthropic
    from anthropic import Anthropic

    client = Anthropic(api_key=settings.anthropic_key, timeout=settings.llm_timeout)
    msg = client.messages.create(
        model=settings.resolved_model,
        max_tokens=1500,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return "".join(b.text for b in msg.content if getattr(b, "type", "") == "text")
