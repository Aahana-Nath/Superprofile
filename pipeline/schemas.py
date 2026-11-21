"""Pydantic models.

Two groups:
1. InferenceOutput  -> what we ask the LLM to return (validated, retried on failure)
2. FinalDocument    -> the complete JSON we write to disk (validated before saving)
"""
from typing import Literal, Optional

from pydantic import BaseModel, Field

ExtractionStatus = Literal["completed", "partial", "private", "not_found", "blocked", "failed"]
Language = Literal["english", "hinglish", "hindi"]
FollowerRange = Literal["unknown", "none", "under_5k", "5k_25k", "25k_100k", "100k_plus"]
EngagementLevel = Literal["low", "medium", "high", "unknown"]


# ----------------------------------------------------------------------------
# 1. LLM output
# ----------------------------------------------------------------------------
class Scored(BaseModel):
    value: Optional[str] = None
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    evidence: list[str] = Field(default_factory=list)


class ClaimFromLLM(BaseModel):
    claim: str
    source: Literal["bio", "user_input"]
    quote: str  # must be copied verbatim from the source text; checked in code


class InferenceOutput(BaseModel):
    input_quality: Literal["ok", "too_vague", "gibberish"] = "ok"
    input_quality_note: Optional[str] = None
    niche: Scored
    sub_niche: Scored
    target_audience: Scored
    recurring_themes: list[str] = Field(default_factory=list)
    content_tone: list[str] = Field(default_factory=list)
    output_language: Language
    credibility_claims: list[ClaimFromLLM] = Field(default_factory=list)
    needs_confirmation: list[str] = Field(default_factory=list)
    unknown_fields: list[str] = Field(default_factory=list)


# ----------------------------------------------------------------------------
# 2. Final document
# ----------------------------------------------------------------------------
class Post(BaseModel):
    id: str
    type: Literal["carousel", "reel", "image", "unknown"] = "unknown"
    caption: str = ""
    hashtags: list[str] = Field(default_factory=list)
    likes: Optional[int] = None
    comments: Optional[int] = None
    transcript: Optional[str] = None  # stays null in MVP; reserved for reel transcripts
    url: Optional[str] = None
    image_url: Optional[str] = None  # post thumbnail; used to pick a cover banner / profile photo
    posted_at: Optional[str] = None


class DerivedMetrics(BaseModel):
    posts_analyzed: int = 0
    avg_likes: float = 0.0
    avg_comments: float = 0.0
    engagement_rate: Optional[float] = None  # percent of followers
    caption_script: Literal["english", "devanagari", "hinglish", "unknown"] = "unknown"


class InstagramData(BaseModel):
    username: str
    provider: str = "apify"
    extraction_status: ExtractionStatus
    extracted_at: str
    error_detail: Optional[str] = None
    display_name: Optional[str] = None
    bio: Optional[str] = None
    profile_image_url: Optional[str] = None
    follower_count: Optional[int] = None
    following_count: Optional[int] = None
    post_count: Optional[int] = None
    is_verified: bool = False
    is_private: bool = False
    is_business_account: bool = False
    business_category: Optional[str] = None
    external_link: Optional[str] = None
    posts: list[Post] = Field(default_factory=list)
    derived_metrics: DerivedMetrics = Field(default_factory=DerivedMetrics)


class ManualData(BaseModel):
    description: str
    audience: Optional[str] = None
    follower_range: FollowerRange = "unknown"  # "unknown" = creator skipped it; inferred from the description
    language: Language = "english"
    credibility: Optional[str] = None
    existing_prices: Optional[str] = None


class InferredBlock(BaseModel):
    niche: Scored
    sub_niche: Scored
    target_audience: Scored
    recurring_themes: list[str] = Field(default_factory=list)
    content_tone: list[str] = Field(default_factory=list)
    output_language: Language
    engagement_level: EngagementLevel = "unknown"  # computed in code, not by the LLM


class CredibilityClaim(BaseModel):
    claim: str
    source: Literal["bio", "user_input"]
    quote: str


class Gaps(BaseModel):
    unknown_fields: list[str] = Field(default_factory=list)
    needs_confirmation: list[str] = Field(default_factory=list)
    rejected_claims: list[dict] = Field(default_factory=list)  # claims that failed the source check


class QualityControl(BaseModel):
    llm_provider: str
    llm_model: str
    llm_attempts: int
    inference_status: Literal["ok", "fallback"]
    input_quality: Literal["ok", "too_vague", "gibberish"] = "ok"
    input_quality_note: Optional[str] = None
    latency_seconds: float = 0.0
    last_error: Optional[str] = None  # set only when inference fell back


class FinalDocument(BaseModel):
    input_method: Literal["instagram", "manual"]
    generated_at: str
    instagram_data: Optional[InstagramData] = None
    manual_data: Optional[ManualData] = None
    inferred: InferredBlock
    credibility_claims: list[CredibilityClaim] = Field(default_factory=list)
    gaps: Gaps
    quality_control: QualityControl
