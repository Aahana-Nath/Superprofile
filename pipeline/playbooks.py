"""Niche playbooks: how the storefront should differ by creator type.

Picked in code from the inferred niche/themes (transparent and testable), overridable by the creator.
Each playbook can add product formats, steer the prompt, attach a trust note to the page
(an impact pledge or a disclaimer) and give the creator a few practical tips.
"""
import re

PLAYBOOKS = {
    "cause": {
        "label": "Social impact / NGO",
        "keywords": ["welfare", "ngo", "non-profit", "nonprofit", "charity", "foundation", "rescue",
                     "social work", "social worker", "volunteer", "fundrais", "donat", "underprivileged",
                     "stray", "animal", "relief", "seva", "community service", "upliftment", "orphan"],
        "extra_formats": ["donation", "sponsorship"],
        "trust_note": "pledge",
        "guidance": (
            "This creator runs a cause (social work, NGO, animal welfare or similar). Do not sell the cause like a "
            "business. Make buying feel like supporting: include one 'support the work' contribution (format "
            "donation) and one monthly sponsorship of something concrete (format sponsorship, e.g. 'feed a rescue "
            "for a month'), plus one or two value products drawn from their real expertise (a care guide, a "
            "volunteer training workshop). Avoid expensive 1:1 mentoring. Say plainly that the money supports the "
            "work. Never claim tax benefits (80G, 12A) or registration numbers unless the creator wrote them. "
            "Also return pledge_purpose (a short phrase of what the money pays for, e.g. 'food, vet care and "
            "shelter for rescued animals') and pledge_recipient (the organisation name exactly as the creator "
            "wrote it, or null)."
        ),
        "tips": [
            "Say exactly where the money goes (food, vet bills, shelter) and post a short monthly update. Specific beats emotional.",
            "If your trust has 80G registration, add it: donors in India can claim a tax deduction, which lifts giving.",
            "Keep a low support amount (₹99 to ₹199) so students can chip in. Most donors start small and come back.",
        ],
    },
    "finance": {
        "label": "Personal finance",
        "keywords": ["finance", "financial", "invest", "stock market", "stocks", "trading", "mutual fund", "income tax",
                     "tax saving", "wealth", "crypto", "credit card", "insurance", "retirement", "personal budgeting"],
        "extra_formats": [],
        "trust_note": "disclaimer",
        "guidance": (
            "Teach, don't advise. No stock tips, guaranteed returns, or portfolio-advice products unless the creator "
            "says they are SEBI-registered. Prefer budgeting templates, beginner courses and workshops."
        ),
        "tips": [
            "Keep the disclaimer on. Selling stock tips or portfolio advice needs SEBI registration; teaching concepts doesn't.",
            "Lead with a low-price starter (a budget template at ₹99 to ₹299). Finance audiences trust you after a small win.",
        ],
    },
    "health": {
        "label": "Fitness and health",
        "keywords": ["fitness", "workout", "gym", "yoga", "diet", "nutrition", "weight", "health", "wellness", "physio"],
        "extra_formats": [],
        "trust_note": "disclaimer",
        "guidance": (
            "No medical claims, cures or guaranteed weight loss. Prefer structured programs, plans and form-check "
            "or diet-review calls."
        ),
        "tips": [
            "Describe what people will do each week rather than promising results like 'lose 10 kg'.",
            "1:1 diet or form-check calls are your highest-trust offer. Cap the slots to keep quality high.",
        ],
    },
    "education": {
        "label": "Education and exam prep",
        "keywords": ["exam", "upsc", "neet", "jee", "cat ", "gate", "ssc", "study", "tutor", "teacher", "coaching", "school", "college"],
        "extra_formats": [],
        "trust_note": None,
        "guidance": "Prefer notes, mock-test packs, cohort batches and doubt-solving calls. Tie offers to exam timelines.",
        "tips": [
            "Time launches to the exam calendar. Students buy 6 to 10 weeks before an exam.",
            "Offer a cheap sample (one chapter, one mock test) to prove quality before the bigger product.",
        ],
    },
    "general": {
        "label": "General creator",
        "keywords": [],
        "extra_formats": [],
        "trust_note": None,
        "guidance": "",
        "tips": [
            "Put your lowest-price product first. It's the easiest first purchase.",
            "Pin your store link on your most-viewed reel, not just in your bio.",
        ],
    },
}

ORDER = ["cause", "finance", "health", "education"]

DISCLAIMERS = {
    "finance": {
        "english": "For education only. This is not investment advice; do your own research or consult a SEBI-registered adviser.",
        "hinglish": "Sirf education ke liye. Yeh investment advice nahi hai; apna research karein ya SEBI-registered adviser se baat karein.",
        "hindi": "केवल शिक्षा के लिए। यह निवेश सलाह नहीं है; अपना शोध करें या SEBI-पंजीकृत सलाहकार से बात करें।",
    },
    "health": {
        "english": "General guidance only, not medical advice. If you have a health condition, check with a doctor before starting.",
        "hinglish": "Yeh general guidance hai, medical advice nahi. Koi health condition ho toh shuru karne se pehle doctor se poochein.",
        "hindi": "यह सामान्य मार्गदर्शन है, चिकित्सा सलाह नहीं। कोई स्वास्थ्य समस्या हो तो शुरू करने से पहले डॉक्टर से पूछें।",
    },
}


def _profile_text(doc: dict) -> str:
    inf = doc["inferred"]
    parts = [inf["niche"]["value"], inf["sub_niche"]["value"], inf["target_audience"]["value"], *inf["recurring_themes"]]
    if doc.get("instagram_data"):
        parts += [doc["instagram_data"].get("bio"), doc["instagram_data"].get("business_category")]
    if doc.get("manual_data"):
        parts += [doc["manual_data"].get("description"), doc["manual_data"].get("audience")]
    return " ".join(p for p in parts if p).lower()


def pick_playbook(doc: dict) -> str:
    """Scores each playbook by keyword hits in the niche (weighted) and the rest of the profile."""
    inf = doc["inferred"]
    niche = " ".join(filter(None, [inf["niche"]["value"], inf["sub_niche"]["value"]])).lower()
    text = _profile_text(doc)
    best, best_score = "general", 0
    for pid in ORDER:
        score = 0
        for kw in PLAYBOOKS[pid]["keywords"]:
            pattern = r"\b" + re.escape(kw.strip())
            score += 3 * len(re.findall(pattern, niche)) + len(re.findall(pattern, text))
        if score > best_score:
            best, best_score = pid, score
    return best


def playbook(pid: str) -> dict:
    return PLAYBOOKS.get(pid) or PLAYBOOKS["general"]


def disclaimer(pid: str, language: str):
    texts = DISCLAIMERS.get(pid)
    return texts.get(language, texts["english"]) if texts else None


def options() -> list:
    return [{"id": k, "label": v["label"]} for k, v in PLAYBOOKS.items()]
