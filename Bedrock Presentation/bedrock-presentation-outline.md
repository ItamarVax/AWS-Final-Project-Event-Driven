# AWS Bedrock — Student-Led Presentation Outline

**Course:** Introduction to Cloud and Serverless Development with AWS
**Format:** ~24 min · 2 presenters · live demo · real code/architecture allowed
**Service:** AWS Bedrock (already the production LLM layer for the BigID PII pipeline in this repo)

## Time & ownership

| Part | Owner | Slides | Time |
|------|-------|--------|------|
| Part 1 — What Bedrock is & how it works | **P1** | 1–9 | ~11:30 |
| Part 2 — Bedrock in practice + demo | **P2** | 10–16 | ~12:30 |

The **live demo (slide 14) is the time buffer** — trim or extend it to land on 24 min.

### Requirement coverage (assignment → slides)

| Required point | Slide(s) |
|---|---|
| What it is / problem it solves | 3, 4 |
| How it works (architecture + components) | 5, 6, 7, 8, 9 |
| Similar / alternative AWS services | 10 |
| Advantages & limitations | 11 |
| Practical real-world use case | 12, 13 |
| Insights / tips / lessons learned | 15 |
| Live demo | 14 |

---

# PART 1 — P1: "What is Bedrock & how does it work" (~11:30)

## Slide 1 — Title · `0:30`
**On slide:**
- **AWS Bedrock** — Managed Generative AI on AWS
- "Introduction to Cloud and Serverless Development with AWS"
- Presenter names · date

**Notes:** Who you are. One-sentence promise: *"By the end you'll know what Bedrock is, how it works under the hood, and you'll watch it classify real PII data live."*

## Slide 2 — Agenda + hook · `1:00`
**On slide:**
- Hook: *"Every LLM call in a production system we run at BigID goes through Bedrock."*
- Roadmap: What → How it works → Alternatives & trade-offs → Real use case → **Live demo**

**Notes:** The hook earns attention — not a toy, a system you operate. Flag that the second half is hands-on.

## Slide 3 — What is Bedrock · `1:30`
**On slide:**
- **One fully-managed API to many foundation models** — Anthropic Claude, Amazon Nova/Titan, Meta Llama, Mistral, Cohere
- No servers, no GPUs, no per-vendor SDKs — call a model like any other AWS API
- Pay per token, scales to zero

**Notes:** Mental model: *"Bedrock is to LLMs what S3 is to storage — a managed AWS service you call, not infra you run."* Emphasize **serverless** (course tie-in): you never provision a GPU.

## Slide 4 — The problem it solves · `2:00`
**On slide (before/after):**

| Without Bedrock | With Bedrock |
|---|---|
| One SDK + API key *per vendor* | One boto3 client |
| Keys to store & rotate | **IAM auth** — no keys |
| Each vendor's own request format | One **Converse** request shape |
| Self-host = manage GPUs, scaling | Fully managed, scales to zero |

**Notes:** Lead with the pain: Claude *and* Llama *and* Nova without Bedrock = 3 SDKs, 3 key stores, 3 formats. Bedrock collapses that. IAM auth is the AWS-native win — credentials are your existing role, nothing extra to leak.

## Slide 5 — Where it fits in AWS / serverless · `1:00`
**On slide:**
- Two planes: **control plane** (`bedrock`) = manage/list models · **runtime plane** (`bedrock-runtime`) = call models
- Regional endpoints, IAM-scoped, integrates with Lambda / Step Functions / CloudWatch

**Notes:** You only touch `bedrock-runtime` for inference — and that's one line of code (next slide).

## Slide 6 — Architecture & main components · `2:00`
**On slide (diagram):**
```
Your app (boto3 / aioboto3)
        │  IAM-signed HTTPS
        ▼
  bedrock-runtime  ──►  Foundation model (Claude / Nova / Llama)
   (regional)            via inference profile (us.anthropic.*)
        │
        ▼
   CloudWatch / cost metrics
```
**Real code — creating the client (`core/bedrock.py`):**
```python
session = boto3.Session(profile_name=profile, region_name=region)
client = session.client("bedrock-runtime", config=config)
```

**Notes:** Walk the arrow: the app never holds the model; it sends an IAM-signed request to a regional endpoint; AWS routes to the model. Point out the `Config` (600s read timeout, 6 retries) — production LLM calls are slow and need resilience. **Components:** runtime client, model/inference-profile ID, request (system + messages + inferenceConfig), response (content + token usage).

## Slide 7 — The Converse API + inference profiles · `2:00`
**On slide:**
- **Converse = one unified request shape for *every* model.** Swap models by changing one string.
- **Inference profile** (`us.anthropic.claude-sonnet-4-6`) = cross-region routing for throughput & availability

**Real code — the request (`_build_converse_kwargs`):**
```python
kwargs = {
    "modelId": model_id,                  # e.g. "us.anthropic.claude-sonnet-4-6"
    "system":   [{"text": system_prompt}],
    "messages": [{"role": "user",
                  "content": [{"text": user_prompt}]}],
    "inferenceConfig": {"maxTokens": max_tokens,
                        "temperature": temperature},
}
response = client.converse(**kwargs)
```

**Notes:** Headline: *"This exact dict works for Claude, Nova, Llama, Mistral — I only change `modelId`."* The whole value prop in one block. Inference profiles: the `us.` prefix means AWS load-balances across US regions so you don't hit one region's capacity. **Plant the seed:** "remember this — it pays off as a lesson at the end" (P2 lands it on slide 15).

## Slide 8 — Structured output via tool-use · `0:45`
**On slide:**
- Problem: LLMs return *prose*; production needs *guaranteed JSON*
- Bedrock tool-use **forces** the model to emit JSON matching your schema — no regex, no "parse the prose and pray"

**Real code (`core/bedrock.py`):**
```python
kwargs["toolConfig"] = {
    "tools": [tool_spec],                        # built from a Pydantic model
    "toolChoice": {"tool": {"name": tool_name}}, # force this exact tool
}
# response: we read block["toolUse"]["input"] — already a typed dict
```

**Notes:** Standout reliability feature. Define a Pydantic model (e.g. `{score, reasoning}`), Bedrock converts it to a tool schema, `toolChoice` *forces* the call — output is valid JSON by construction. We never string-parse prose. *The difference between a demo and a production system.*

## Slide 9 — Cost & quality levers · `0:45`
**On slide — two more real features:**

1. **Prompt caching** — one block, real savings on a fixed system prompt
   ```python
   system.append({"cachePoint": {"type": "default"}})
   # response reports cacheReadInputTokens → cheaper repeat calls
   ```
2. **Extended thinking** — let the model reason harder on tough calls
   ```python
   additionalModelRequestFields = {"thinking": {"type": "adaptive"}}
   ```

**Notes:** Caching = **money**: our system prompt (the classifier "brief") is reused across thousands of findings — pay full price once, cached-read after (cache reads bill at **10%** of the input rate). Thinking = **quality** on hard calls. Honest nuance: forced tool-use + thinking can't combine, so we relax to `toolChoice: auto` and the parser handles the fallback.

---

# PART 2 — P2: "Bedrock in practice + demo" (~12:30)

## Slide 10 — Similar / alternative AWS services · `2:00`
**On slide:**

| Option | What you get | Trade-off |
|---|---|---|
| **Amazon SageMaker (JumpStart)** | Deploy & self-host models on your own endpoints | Most control, but you manage instances/scaling/ops |
| **Lambda + external LLM API** | Call OpenAI/Anthropic directly from your code | You manage keys, no AWS model catalog or IAM-native auth |
| **Amazon Q** | Prebuilt AWS assistant (higher-level) | Not raw model access — opinionated, less flexible |
| **Bedrock** | Managed catalog **+** raw API, no infra | The middle ground — our choice |

**Notes:** Position Bedrock in the middle: more managed than SageMaker, more flexible than Q. **Concrete contrast from our repo:** we *do* use OpenAI direct + OpenRouter for two sub-tasks (web search, eval sweeps) — and those each needed their own wrapper module, unlike Bedrock's single Converse call. That contrast sets up the slide-15 lesson.

## Slide 11 — Advantages & limitations · `2:00`
**On slide:**

**Advantages**
- One API, many models (Converse)
- IAM auth — no API keys to manage
- Managed / serverless, scales to zero
- Caching, tool-use, extended thinking built in
- Per-model cost tracking

**Limitations (all hit in real code)**
- Cross-region inference profiles need a region anchor (`us-east-1`); model must be **activated** per account/region
- Not every model supports every feature — Llama/Mistral/Cohere reject `cachePoint` (we added a `BEDROCK_CACHE_SYSTEM=false` toggle)
- `CountTokens` API needs the **single-region** model ID, not the `us.` profile ID (we strip the prefix)
- Forced tool-use + extended thinking can't combine
- Quotas/throughput limits; model availability varies by region
- **AWS Learner Lab may not expose all models** → demo risk

**Notes:** Keep advantages crisp; spend time on limitations because they're real and earned. Each limitation maps to actual code we wrote to work around it — that's credibility.

## Slide 12 — Real-world use case: the pipeline · `2:00`
**On slide:**
- **BigID PII-classifier prompt-engineering pipeline**
- Problem: regex flags candidate PII → many false positives. Need an LLM to judge *true vs false positive* per PII type, guided by a "classifier brief."
- The loop: **spec → generate dataset → label → judge errors → refine prompt → validate** (iterate)

**Diagram:**
```
spec_agent ─► prompt_agent ─► dataset_agent ─► validator_agent
                  ▲                                  │
                  └──── judge_agent ◄────────────────┘
              (error_analyzer · prompt_modifier · cluster_map)
```

**Notes:** This is the "real-world use case" deliverable. Every box is an LLM call through Bedrock. The system *automatically writes and refines the prompt* that a downstream validator uses — meta, but concrete. Don't go deep on PII semantics; keep focus on "this is a multi-agent system and Bedrock serves every model."

## Slide 13 — The model mix + cost story · `2:00`
**On slide — right model for the right job, swapped via one string:**

| Task | Model | $/M in | $/M out |
|---|---|---|---|
| High-volume labeling | Claude **Haiku 4.5** | 0.25 | 1.25 |
| Default validator | Amazon **Nova 2 Lite** | **0.06** | 0.24 |
| Dataset gen / cross-check | Claude **Sonnet 4.6** | 3.00 | 15.00 |
| Judge (hard reasoning) | Claude **Opus 4.6** | 5.00 | 25.00 |
| Ground-truth audit | Claude **Opus 4.8** | 5.00 | 25.00 |

- Nova 2 Lite input is **~83× cheaper** than Opus; Haiku is **20×** cheaper.
- Caching makes the reused system prompt bill at **10%** on cache reads.
- **Because of Converse, choosing the cost-optimal model per task = changing one inference-profile string** — no new code.

**Notes:** This is the most persuasive slide — it turns "multi-model" from a feature into *dollars*. Tell the story: you don't pay Opus prices to label 10,000 cheap findings; you pay Nova/Haiku and reserve Opus for the hard judge step. Bedrock makes that a config choice, not an engineering project.

## Slide 14 — 🔴 LIVE DEMO · `~4:00` (time buffer)
**Goal:** show real input → Bedrock → real structured output, supporting the explanation (not just clicking the console).

**Plan:** run `validate_finding_async` (`pii_agents/validator_agent/validator.py`) — the innermost call: one finding + classifier brief → Bedrock Converse → `{"score": 1|2|3, "reasoning": "..."}`.

**Notes / TODO (deferred — separate demo-prep session):**
- Confirm Learner Lab exposes a usable Bedrock model (or use a personal account — needs instructor approval per assignment).
- Minimal standalone script with synthetic PII text so nothing proprietary/sensitive is on screen.
- Show the JSON output + the token/cost log line (ties back to slides 9 & 13).
- Have a recorded fallback in case live Bedrock access fails.

## Slide 15 — Lessons learned / tips · `1:00`
**On slide:**
- **One API, not N wrappers.** The Converse API meant **zero per-provider request code** for our Bedrock models — same `converse()` shape for Claude, Nova, Llama; swapping a model is a one-string change. (Our OpenAI/OpenRouter paths *did* need their own wrappers — which proves the point.)
- **Tool-use > prose parsing** for structured output — reliable JSON by construction.
- **Cache the system prompt** — real money when it's reused (10% read rate).
- **Provider abstraction seam** (`core/llm.py`) — adding a provider is a one-`elif` change.
- **Gotchas:** region-anchored inference profiles · `CountTokens` needs the single-region ID · not all models support caching.

**Notes:** P1 planted the Converse seed on slide 7 — land it here. These are *earned* lessons from building the system, which is exactly what the assignment asks for.

## Slide 16 — Wrap + Q&A · `1:00`
**On slide — three takeaways:**
1. Bedrock = **managed, multi-model** GenAI API on AWS (serverless, IAM-auth)
2. **Converse = one request shape** for every model — swap with one string
3. **Right-model-for-the-job economics** — Nova/Haiku for volume, Opus for hard calls

**Notes:** Both presenters field questions. If short on time, this is where you recover; if long, demo already absorbed it.

---

## Open TODOs
- [ ] Demo de-risking session (Learner Lab Bedrock access, standalone script, fallback recording) — slide 14
- [ ] Build actual slides from this outline
- [ ] Confirm with BigID what repo detail is OK to show publicly (currently assuming real code/arch is allowed)
