"""Offline tests: no network, no API keys.   Run:  python -m unittest test_offline -v

Covers the deterministic parts (handle parsing, status mapping, metrics, claim guardrails).
The full-pipeline test uses a fake LLM and is skipped if pydantic is not installed.
"""
import json
import sys
import types
import unittest
from unittest import mock

from pipeline import guards, metrics, scraper


def fake_post(i, caption="5 exercises every beginner should know", likes=500, comments=20, t="Sidecar"):
    return {"shortCode": f"abc{i}", "type": t, "caption": caption, "hashtags": ["fitness"],
            "likesCount": likes, "commentsCount": comments, "timestamp": "2026-11-01T10:00:00.000Z"}


class HandleTests(unittest.TestCase):
    def test_valid_forms(self):
        for raw in ["@aarav.fit", "aarav.fit", " https://www.instagram.com/aarav.fit/ ", "instagram.com/aarav.fit?hl=en"]:
            self.assertEqual(scraper.normalize_handle(raw), "aarav.fit", raw)

    def test_invalid(self):
        for raw in ["", "   ", "hello world", "@@@", "....", "a" * 31, "बिना हैंडल"]:
            self.assertIsNone(scraper.normalize_handle(raw), raw)


class MetricsTests(unittest.TestCase):
    def test_engagement(self):
        posts = [{"likes": 1000, "comments": 50, "caption": ""}, {"likes": 500, "comments": 10, "caption": ""}]
        m = metrics.compute_metrics(posts, 25000)
        self.assertEqual(m["avg_likes"], 750.0)
        self.assertEqual(m["engagement_rate"], round((750 + 30) / 25000 * 100, 2))

    def test_hidden_likes_ignored(self):
        m = metrics.compute_metrics([{"likes": None, "comments": None, "caption": ""}], 1000)
        self.assertIsNone(m["engagement_rate"])

    def test_script_detection(self):
        self.assertEqual(metrics.detect_caption_script(["Beginners ke liye ye 5 exercises zaroor karo, bahut kaam aayengi aur sab ke liye hai"]), "hinglish")
        self.assertEqual(metrics.detect_caption_script(["Five simple exercises every beginner should learn before touching heavy weights"]), "english")
        self.assertEqual(metrics.detect_caption_script(["शुरुआत करने वालों के लिए पांच आसान व्यायाम जो हर किसी को आने चाहिए"]), "devanagari")
        self.assertEqual(metrics.detect_caption_script(["hi"]), "unknown")


class StatusTests(unittest.TestCase):
    def test_private(self):
        self.assertEqual(scraper._classify({"private": True, "followersCount": 5}, [])[0], "private")

    def test_not_found(self):
        self.assertEqual(scraper._classify({"error": "not_found"}, [])[0], "not_found")

    def test_stats_only_is_partial(self):  # like the aahana.nath run: followers present, no posts, error set
        self.assertEqual(scraper._classify({"followersCount": 731, "error": "could not fetch posts"}, [])[0], "partial")

    def test_failed_without_data(self):
        self.assertEqual(scraper._classify({"error": "boom"}, [])[0], "failed")

    def test_completed(self):
        posts = [scraper._map_post(fake_post(i), i) for i in range(1, 6)]
        self.assertEqual(scraper._classify({"followersCount": 100}, posts)[0], "completed")


class FetchTests(unittest.TestCase):
    """Patch `requests` so fetch_instagram_profile runs without a network."""

    def _run(self, status_code=200, payload=None, exc=None):
        fake = types.ModuleType("requests")
        class Timeout(Exception): pass
        class RequestException(Exception): pass
        fake.Timeout, fake.RequestException = Timeout, RequestException
        resp = mock.Mock(status_code=status_code, text="x")
        resp.json.return_value = payload
        def post(*a, **k):
            if exc == "timeout": raise Timeout()
            return resp
        fake.post = post
        with mock.patch.dict(sys.modules, {"requests": fake}), mock.patch.object(scraper.settings.__class__, "apify_token", "tok"):
            return scraper.fetch_instagram_profile("someone")

    def test_happy_path(self):
        item = {"username": "someone", "fullName": "Some One", "biography": "Fitness coach for beginners", "followersCount": 25000,
                "followsCount": 100, "postsCount": 300, "verified": False, "isBusinessAccount": True,
                "businessCategoryName": "Personal Trainer", "externalUrl": "https://x.com",
                "latestPosts": [fake_post(i) for i in range(1, 15)]}
        ig, raw = self._run(payload=[item])
        self.assertEqual(ig["extraction_status"], "completed")
        self.assertEqual(len(ig["posts"]), 12)  # capped by MAX_POSTS
        self.assertEqual(ig["posts"][0]["id"], "p1")
        self.assertEqual(ig["posts"][0]["type"], "carousel")
        self.assertTrue(scraper.has_enough_signal(ig))

    def test_empty_is_not_found(self):
        ig, _ = self._run(payload=[])
        self.assertEqual(ig["extraction_status"], "not_found")
        self.assertFalse(scraper.has_enough_signal(ig))

    def test_timeout_is_failed(self):
        ig, _ = self._run(exc="timeout")
        self.assertEqual(ig["extraction_status"], "failed")

    def test_auth_error_is_blocked(self):
        ig, _ = self._run(status_code=401)
        self.assertEqual(ig["extraction_status"], "blocked")

    def test_thin_account_has_no_signal(self):
        item = {"username": "someone", "followersCount": 10, "biography": "", "latestPosts": []}
        ig, _ = self._run(payload=[item])
        self.assertFalse(scraper.has_enough_signal(ig))


class GuardTests(unittest.TestCase):
    BIO = "Certified yoga instructor | 10+ years teaching | Helping beginners"

    def test_valid_claim_accepted(self):
        ok, bad = guards.verify_claims(
            [{"claim": "Certified yoga instructor", "source": "bio", "quote": "Certified yoga instructor"}], self.BIO, "bio")
        self.assertEqual((len(ok), len(bad)), (1, 0))

    def test_invented_claim_rejected(self):
        ok, bad = guards.verify_claims(
            [{"claim": "Trained 5000 students", "source": "bio", "quote": "trained 5000 students"}], self.BIO, "bio")
        self.assertEqual((len(ok), len(bad)), (0, 1))

    def test_number_not_in_source_rejected(self):
        ok, bad = guards.verify_claims(
            [{"claim": "15 years teaching", "source": "bio", "quote": "years teaching"}], self.BIO, "bio")
        self.assertEqual(len(bad), 1)
        self.assertIn("15", bad[0]["reason"])

    def test_wrong_source_rejected(self):
        ok, bad = guards.verify_claims(
            [{"claim": "Certified yoga instructor", "source": "user_input", "quote": "Certified yoga instructor"}], self.BIO, "bio")
        self.assertEqual(len(bad), 1)

    def test_evidence_sanitised(self):
        s = guards.sanitize_scored({"value": "Fitness", "confidence": 0.95, "evidence": ["p99"]}, {"bio", "p1"})
        self.assertEqual(s["evidence"], [])
        self.assertLessEqual(s["confidence"], 0.5)

    def test_auto_confirmation(self):
        inf = {"niche": {"value": "Fitness", "confidence": 0.9}, "sub_niche": {"value": "x", "confidence": 0.4},
               "target_audience": {"value": None, "confidence": 0.0}}
        self.assertEqual(guards.auto_needs_confirmation(inf, []), ["sub_niche", "target_audience"])


try:
    import pydantic  # noqa: F401
    HAS_PYDANTIC = True
except ImportError:
    HAS_PYDANTIC = False


@unittest.skipUnless(HAS_PYDANTIC, "pydantic not installed")
class PipelineTests(unittest.TestCase):
    GOOD = {"input_quality": "ok", "input_quality_note": None,
            "niche": {"value": "Fitness", "confidence": 0.95, "evidence": ["bio", "p1"]},
            "sub_niche": {"value": "Beginner strength training", "confidence": 0.9, "evidence": ["p1"]},
            "target_audience": {"value": "Fitness beginners", "confidence": 0.9, "evidence": ["p1"]},
            "recurring_themes": ["Beginner workouts"], "content_tone": ["educational"], "output_language": "english",
            "credibility_claims": [{"claim": "10+ years teaching", "source": "bio", "quote": "10+ years teaching"},
                                   {"claim": "Won national gold", "source": "bio", "quote": "Won national gold"}],
            "needs_confirmation": [], "unknown_fields": ["location"]}

    def _ig(self):
        posts = [scraper._map_post(fake_post(i), i) for i in range(1, 6)]
        d = scraper._empty("someone", "completed")
        d.update({"bio": "Certified yoga instructor | 10+ years teaching", "follower_count": 25000, "posts": posts,
                  "derived_metrics": metrics.compute_metrics(posts, 25000)})
        return d

    def test_full_instagram_path_with_fake_llm(self):
        from pipeline import document
        with mock.patch("pipeline.llm.call_llm", return_value="```json\n" + json.dumps(self.GOOD) + "\n```"):
            doc = document.build_document("instagram", ig=self._ig())
        self.assertIsNone(doc["manual_data"])
        self.assertEqual(len(doc["credibility_claims"]), 1)        # invented "national gold" dropped
        self.assertEqual(len(doc["gaps"]["rejected_claims"]), 1)
        self.assertEqual(doc["quality_control"]["inference_status"], "ok")
        self.assertIn(doc["inferred"]["engagement_level"], ("low", "medium", "high"))

    def test_retry_then_success(self):
        from pipeline import document
        replies = iter(["not json at all", json.dumps(self.GOOD)])
        with mock.patch("pipeline.llm.call_llm", side_effect=lambda s, u: next(replies)):
            doc = document.build_document("instagram", ig=self._ig())
        self.assertEqual(doc["quality_control"]["llm_attempts"], 2)

    def test_llm_total_failure_falls_back(self):
        from pipeline import document
        with mock.patch("pipeline.llm.call_llm", side_effect=RuntimeError("API down")):
            doc = document.build_document("instagram", ig=self._ig())
        self.assertEqual(doc["quality_control"]["inference_status"], "fallback")
        self.assertEqual(doc["inferred"]["niche"]["value"], None)
        self.assertIn("niche", doc["gaps"]["needs_confirmation"])

    def test_manual_language_outranks_inference(self):
        from pipeline import document
        manual = {"description": "I teach UPSC prep to working professionals", "audience": None,
                  "follower_range": "none", "language": "hinglish", "credibility": None, "existing_prices": None}
        with mock.patch("pipeline.llm.call_llm", return_value=json.dumps(self.GOOD)):
            doc = document.build_document("manual", manual=manual)
        self.assertEqual(doc["inferred"]["output_language"], "hinglish")
        self.assertIsNone(doc["instagram_data"])
        self.assertEqual(doc["inferred"]["engagement_level"], "unknown")


class StorefrontTests(unittest.TestCase):
    """Storefront generation with a fake LLM: price bands, retries, script and number guards."""

    DOC = {
        "input_method": "manual",
        "generated_at": "2026-11-20T00:00:00+00:00",
        "instagram_data": None,
        "manual_data": {"description": "I teach UPSC prep to working professionals", "audience": None,
                        "follower_range": "none", "language": "english", "credibility": None, "existing_prices": None},
        "inferred": {
            "niche": {"value": "Exam Prep", "confidence": 0.9, "evidence": ["description"]},
            "sub_niche": {"value": "UPSC for working professionals", "confidence": 0.9, "evidence": ["description"]},
            "target_audience": {"value": "working professionals", "confidence": 0.9, "evidence": ["description"]},
            "recurring_themes": [], "content_tone": [], "output_language": "english", "engagement_level": "unknown",
        },
        "credibility_claims": [],
        "gaps": {"unknown_fields": [], "needs_confirmation": [], "rejected_claims": []},
        "quality_control": {"llm_provider": "x", "llm_model": "x", "llm_attempts": 1, "inference_status": "ok"},
    }

    @staticmethod
    def product(fmt="ebook", price=199, desc="A short guide for busy professionals preparing for UPSC."):
        return {"format": fmt, "title": "UPSC Starter Guide", "description": desc, "price_inr": price,
                "price_rationale": f"₹{price} is an easy first purchase.", "cta": "Get it"}

    def store(self, **over):
        s = {"headline": "UPSC prep that fits your workday", "bio": "I help working professionals prepare for UPSC.",
             "products": [self.product(), self.product("one_on_one", 499)]}
        s.update(over)
        return json.dumps(s)

    def setUp(self):
        from pipeline import storefront
        self.sf = storefront

    def test_bands_shrink_for_small_audiences(self):
        small, big = self.sf.allowed_prices("none"), self.sf.allowed_prices("100k_plus")
        self.assertLess(max(small["cohort_course"]), max(big["cohort_course"]))
        self.assertTrue(all(p in self.sf.CHARM_PRICES for p in big["ebook"]))

    def test_happy_path(self):
        with mock.patch("pipeline.llm.call_llm", return_value=self.store()):
            out = self.sf.generate_storefront(self.DOC)
        self.assertEqual(len(out["products"]), 2)
        self.assertTrue(all(p["id"].startswith("p_") for p in out["products"]))
        self.assertEqual(out["generation"]["llm_attempts"], 1)

    def test_skipped_audience_size_uses_description(self):
        self.assertEqual(self.sf.followers_from_text("I have 30k followers who love treks"), 30_000)
        self.assertEqual(self.sf.followers_from_text("1.2 lakh subscribers on YouTube"), 120_000)
        self.assertEqual(self.sf.followers_from_text("5,000 followers"), 5_000)
        self.assertIsNone(self.sf.followers_from_text("I bake sourdough at home"))

        d = json.loads(json.dumps(self.DOC))
        d["manual_data"]["follower_range"] = "unknown"
        d["manual_data"]["description"] = "I travel on a budget and share tips with my 40k followers"
        self.assertEqual(self.sf.audience_tier(d), "25k_100k")
        d["manual_data"]["description"] = "I travel on a budget and share tips"
        self.assertEqual(self.sf.audience_tier(d), "under_5k")
        d["manual_data"]["follower_range"] = "100k_plus"
        self.assertEqual(self.sf.audience_tier(d), "100k_plus")

    def test_language_defaults_to_english_not_inferred(self):
        d = json.loads(json.dumps(self.DOC))
        d["inferred"]["output_language"] = "hindi"
        d["manual_data"]["language"] = None
        with mock.patch("pipeline.llm.call_llm", return_value=self.store()):
            self.assertEqual(self.sf.generate_storefront(d)["language"], "english")
            self.assertEqual(self.sf.generate_storefront(d, language="hinglish")["language"], "hinglish")

    def test_bad_price_retried_then_snapped(self):
        bad = self.store(products=[self.product(price=777), self.product("one_on_one", 499)])
        with mock.patch("pipeline.llm.call_llm", return_value=bad) as m:
            out = self.sf.generate_storefront(self.DOC)
        self.assertEqual(m.call_count, 2)
        self.assertIn("not in the allowed list", m.call_args_list[1].args[1])
        price = out["products"][0]["price_inr"]
        self.assertIn(price, self.sf.allowed_prices("none")["ebook"])
        self.assertIn(f"₹{price}", out["products"][0]["price_rationale"])
        self.assertTrue(out["generation"]["repaired"])

    def test_invented_number_in_bio_removed(self):
        bad = self.store(bio="I have taught 5000 students. I help working professionals prepare for UPSC.")
        with mock.patch("pipeline.llm.call_llm", return_value=bad):
            out = self.sf.generate_storefront(self.DOC)
        self.assertNotIn("5000", out["bio"])
        self.assertIn("working professionals", out["bio"])

    def test_devanagari_in_hinglish_triggers_retry(self):
        bad = self.store(products=[self.product(desc="Yeh guide उन professionals ke liye hai jo UPSC karna chahte hain."),
                                   self.product("one_on_one", 499)])
        replies = iter([bad, self.store()])
        with mock.patch("pipeline.llm.call_llm", side_effect=lambda s, u: next(replies)) as m:
            self.sf.generate_storefront(self.DOC, language="hinglish")
        self.assertEqual(m.call_count, 2)
        self.assertIn("Roman script", m.call_args_list[1].args[1])

    def test_total_failure_raises(self):
        with mock.patch("pipeline.llm.call_llm", side_effect=RuntimeError("API down")):
            with self.assertRaises(self.sf.StorefrontError):
                self.sf.generate_storefront(self.DOC)

    def test_regenerate_product_keeps_id(self):
        current = {"language": "english", "products": [{"id": "p_keep", "format": "ebook", "title": "Old", "price_inr": 199}]}
        with mock.patch("pipeline.llm.call_llm", return_value=json.dumps(self.product("template_pack", 149))):
            out = self.sf.regenerate_section(self.DOC, current, "product", 0)
        self.assertEqual(out["result"]["id"], "p_keep")
        self.assertEqual(out["result"]["format"], "template_pack")


class PlaybookTests(unittest.TestCase):
    """Niche playbooks: detection, extra formats, pledge verification, disclaimers."""

    def doc(self, niche, sub="", themes=(), bio=None):
        d = json.loads(json.dumps(StorefrontTests.DOC))
        d["inferred"]["niche"]["value"] = niche
        d["inferred"]["sub_niche"]["value"] = sub
        d["inferred"]["recurring_themes"] = list(themes)
        if bio is not None:
            d["manual_data"]["description"] = bio
        return d

    def setUp(self):
        from pipeline import playbooks, storefront
        self.pb, self.sf = playbooks, storefront

    def test_detection(self):
        cases = {
            "cause": self.doc("Animal Welfare", "Stray animal rescue", ["Fundraising for treatment"]),
            "finance": self.doc("Personal Finance", "Budgeting for students"),
            "health": self.doc("Fitness", "Home workouts for women"),
            "education": self.doc("Exam Prep", "UPSC for working professionals"),
            "general": self.doc("Space & Astronomy", "Galaxies", bio="I post photos of the night sky"),
            "general ": self.doc("Travel", "Budget Himalayan travel", ["Budget stays", "Packing tips"],
                                 bio="I travel on a budget and share homestays and taxi routes"),
        }
        for expected, d in cases.items():
            self.assertEqual(self.pb.pick_playbook(d), expected.strip(), expected)

    def test_donation_formats_only_for_cause(self):
        self.assertNotIn("donation", self.sf.allowed_prices("5k_25k"))
        self.assertIn("donation", self.sf.allowed_prices("5k_25k", ("donation", "sponsorship")))
        errs = self.sf._check_product(StorefrontTests.product("donation", 199), self.sf.allowed_prices("5k_25k"))
        self.assertIn("not available", errs[0])

    def cause_reply(self, recipient):
        return json.dumps({
            "headline": "Helping stray animals in Noida", "bio": "I rescue and care for stray animals in Noida.",
            "products": [StorefrontTests.product("donation", 199), StorefrontTests.product("sponsorship", 499)],
            "insights": ["Your rescue stories get the most love."],
            "pledge_recipient": recipient, "pledge_purpose": "food and vet care for rescued animals",
        })

    def test_cause_store_has_unconfirmed_pledge(self):
        d = self.doc("Animal Welfare", "Stray rescue", bio="I run Asha Foundation and rescue stray animals in Noida")
        with mock.patch("pipeline.llm.call_llm", return_value=self.cause_reply("Asha Foundation")):
            out = self.sf.generate_storefront(d)
        self.assertEqual(out["playbook"]["id"], "cause")
        self.assertEqual(out["pledge"]["recipient"], "Asha Foundation")
        self.assertEqual(out["pledge"]["percent"], 100)
        self.assertFalse(out["pledge"]["confirmed"])
        self.assertEqual(out["insights"], ["Your rescue stories get the most love."])
        self.assertTrue(out["tips"])

    def test_invented_recipient_dropped(self):
        d = self.doc("Animal Welfare", "Stray rescue", bio="I rescue stray animals in Noida")
        with mock.patch("pipeline.llm.call_llm", return_value=self.cause_reply("Helping Paws Trust")):
            out = self.sf.generate_storefront(d)
        self.assertIsNone(out["pledge"]["recipient"])

    def test_finance_gets_disclaimer_in_language(self):
        d = self.doc("Personal Finance", "Budgeting")
        with mock.patch("pipeline.llm.call_llm", return_value=StorefrontTests().store()):
            out = self.sf.generate_storefront(d, language="hinglish")
        self.assertIsNone(out["pledge"])
        self.assertIn("SEBI", out["disclaimer"])
        self.assertIn("Sirf education", out["disclaimer"])

    def test_playbook_override(self):
        d = self.doc("Fitness", "Home workouts")
        with mock.patch("pipeline.llm.call_llm", return_value=StorefrontTests().store()):
            out = self.sf.generate_storefront(d, playbook_id="general")
        self.assertEqual(out["playbook"]["id"], "general")
        self.assertIsNone(out["disclaimer"])


if __name__ == "__main__":
    unittest.main()
