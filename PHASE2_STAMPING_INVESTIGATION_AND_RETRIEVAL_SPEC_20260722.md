# PHASE 2 — THE STAMPING INVESTIGATION + THE RETRIEVAL RELEVANCE-LEG SPEC
### ⬡B:clair.phase2:INVESTIGATION:stamping_and_retrieval_relevance:20260722⬡
### Lineage FOUNDER>CLAUDETTE. CLAIRE's Phase 2 deliverable (the investigation + the spec); A'NU/CODA builds; CATHY reviews the schema migration. Verified against the LIVE memory bank (qhuoscbrgozsicxeipun), not asserted.

---

## THE FOUNDER'S QUESTION (verbatim, 20260721)
> "Careful always stamping everything importance nine… explore what life would be like if you stop doing this. **Is this an industry standard, or something my original coder came up with?**"

Two questions, answered from evidence below:
1. Is a hand-assigned `importance` integer, used as a retrieval filter, a real pattern or a homegrown crutch?
2. What happens if we stop reflexively stamping everything high?

---

## FINDING 1 — importance IS a real published pattern, but only as ONE of THREE legs
The canonical memory-retrieval design in the literature is Stanford's **Generative Agents** (Park et al., 2023): an agent's memory stream is retrieved by a weighted sum of **recency + importance + relevance**, where:
- **recency** = exponential time decay,
- **importance** = an LLM-rated salience score (the model grades each memory 1–10 *by what it means*, at write time),
- **relevance** = **embedding cosine similarity** between the memory and the current query.

So importance is legitimate — but it was never meant to stand alone. It is a *salience prior*, combined with a *semantic relevance* signal computed against the actual question. Two things follow immediately:
- Importance is only meaningful if it is **graded by meaning** (an LLM rating salience), never set by reflex. A writer that stamps everything 9 has not implemented the importance leg — it has disabled it.
- Importance without relevance is a two-legged stool. You can rank *how salient* a memory is, but never *whether it answers this question*.

**Verdict:** not "your original coder's invention" — it's a real pattern. But this system built **recency + importance** and **never built the relevance leg**. That missing third leg is the whole Phase-2 gap.

## FINDING 2 — what the code actually does (evidence: core/find.js)
Retrieval is `stamp_type == X AND importance >= N AND newest-first AND limit`. The only knobs (find.js):
```
importance=gte.N        // the "importance leg" — a floor, not a relevance measure
stamp_type=eq.X         // a class filter
order=created_at.desc   // the "recency leg"
limit=K
```
Representative callers: RESULT beads `importance_gte: 7`, DOCTRINE `importance_gte: 8`. **There is no embedding column, no vector match, no semantic step anywhere in the retrieval path.** Meaning is never consulted. This is the two-legged stool, in code.

## FINDING 3 — the live importance distribution (evidence: 500k+ live beads)
The roadmap GAP assumed "importance is near-uniformly 8–10." The live bank says otherwise:

| importance | count | share |
|---|---|---|
| 1 | 8,220 | 1.6% |
| 2 | 9,888 | 2.0% |
| 3 | 66,926 | 13.3% |
| 4 | 7,585 | 1.5% |
| **5** | **193,727** | **38.4%** ← dominant |
| 6 | 50,741 | 10.1% |
| 7 | 41,243 | 8.2% |
| 8 | 88,235 | 17.5% |
| 9 | 25,503 | 5.1% |
| 10 | 11,924 | 2.4% |
| **≥8** | **125,662** | **~25%** |

The bank is **importance-5-dominated** (a few high-volume machinery writers — voice turns, command-center stamps, PAI-cycle records — default to 5), and only a quarter is ≥8. So at the *machinery* layer, importance is not uniformly-high.

**Where the founder's instinct is exactly right anyway:** the reflexive-high pathology lives in the **agent-authored knowledge layer**, not the machinery. The five fabricated `os.origin_story.*` beads were stamped importance **9**. Doctrine was reflexively stamped high. In that layer — the one that's supposed to carry *meaning* — importance was set by reflex ("it feels important") rather than graded by salience, which is precisely how importance stops being a signal and becomes **"stamped = done" theater**. When a writer stamps its own output 9, the importance filter is a no-op for that writer AND the number now certifies nothing.

## FINDING 4 — the failure this causes (his words: the "Lakers fact")
A plainly-stored fact under a modest `importance` or an unexpected `stamp_type` is **invisible** to a filter that gates on `stamp_type + importance>=N`. The retriever can only find what was pre-sorted into the right bin at the right height. This is the root cause of the **workaround culture** the CLAIR contract named as fake: `tool.loop.js:2102` regex → synthetic tool-result injection exists to *force-feed* facts the retriever cannot find by meaning. You cannot scaffold your way out of a missing relevance leg; every preload hack is a symptom.

---

## THE SPEC — RETRIEVAL BECOMES A DELIBERATION (the Phase 2 WORK)
A thinking WORK that feeds the one wonder (granddaddy-911) — the same shape as the Keeper, generalized from canon to *all* retrieval. It never speaks; it hands the cycle the strand it decided.

**COLD (the wide, cheap candidate net — high recall, no meaning yet):**
- Union of candidate sources, each cheap and bounded:
  - **semantic** — vector match on an `embedding` column (pgvector; his Supabase already supports it). Highest-recall-by-meaning; the leg that's missing today.
  - **recency** — newest-first, small window.
  - **lexical/structural** — a broad `stamp_type`/`source` net.
- **Critically, the net is NOT importance-gated.** Nothing is invisible for being low-importance. Candidates carry `id, source, stamp_type, summary` only — a catalog, cheap even over a 5MB library (the Keeper already proves this shape).

**MIND (the relevance judgment — the missing leg):**
- A retrieval mind reads the candidate catalog against the *actual question* and DECIDES the strand — exactly the Keeper's source-pick pass, generalized. Leashed: it may only choose from real candidates (it cannot invent a bead), and its choices are verified against the catalog before they leave.

**importance survives only in an honest role:**
- As a **tie-breaker / decay weight** among already-relevance-ranked candidates — never a gate. And it must be **graded** (LLM-rated salience at write, à la Generative Agents) or **retired**. A reflexive constant is noise; delete it rather than pretend it's signal.

**Schema piece (CATHY reviews; ships via the migration runner built in #857):**
- `migrations/0002_beads_embedding_pgvector.sql` — `CREATE EXTENSION IF NOT EXISTS vector; ALTER TABLE memory_bank.beads ADD COLUMN IF NOT EXISTS embedding vector(N);` + an IVFFlat/HNSW index. Backfill is a background job (500k rows), not a blocking migration.
- Until the column + backfill land, the WORK runs on the lexical+recency net with the mind relevance leg — which already kills the Lakers-fact failure. Vector recall is added underneath the same mind when the column exists.

**PROOF (Phase 2 done, live, with receipts):**
Store a plain fact under an arbitrary `stamp_type` at modest `importance`; the retrieval WORK returns it *by meaning*, live, with no keyword net and no preload injection. The `tool.loop.js:2102` synthetic-injection workaround becomes deletable.

---

## OWNER SPLIT (per the roadmap)
- **CLAIRE:** this investigation + spec (done); a proven, additive first-cut WORK (`core/retrieve.js`) so the mind is real and verified live, not a paper design — without rewiring the hot `find.js` cycle path (that wiring is central/CODA's call).
- **A'NU/CODA:** wires the relevance WORK into the cycle's retrieval, retires the injection workaround.
- **CATHY:** reviews the pgvector schema migration.
