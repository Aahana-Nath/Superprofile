"""Central settings, read from environment variables (.env supported)."""
import os

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:  # dotenv is optional; plain env vars still work
    pass


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


class Settings:
    apify_token: str = os.getenv("APIFY_TOKEN", "")
    apify_actor: str = os.getenv("APIFY_ACTOR", "grabd~instagram-profile-scraper")
    scrape_timeout: int = _int("SCRAPE_TIMEOUT_SECONDS", 90)
    max_posts: int = _int("MAX_POSTS", 12)

    llm_provider: str = os.getenv("LLM_PROVIDER", "anthropic").lower()
    anthropic_key: str = os.getenv("ANTHROPIC_API_KEY", "")
    openai_key: str = os.getenv("OPENAI_API_KEY", "")
    gemini_key: str = os.getenv("GEMINI_API_KEY", "")
    llm_model: str = os.getenv("LLM_MODEL", "")
    llm_timeout: int = _int("LLM_TIMEOUT_SECONDS", 60)

    @property
    def resolved_model(self) -> str:
        if self.llm_model:
            return self.llm_model
        defaults = {"openai": "gpt-4o-mini", "gemini": "gemini-3.5-flash-lite"}
        return defaults.get(self.llm_provider, "claude-sonnet-5-5")


settings = Settings()
