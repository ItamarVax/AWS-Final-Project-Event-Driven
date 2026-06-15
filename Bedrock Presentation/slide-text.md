# AWS Bedrock — Slide Text (editable)

_Extracted from the Genspark HTML slides. Edit freely; tell me to push changes back into the deck and re-render._


---

## 01 Title  
`01-title.html`

- Introduction to Cloud & Serverless Development with AWS
- Student-Led Presentation · 24 min
- A Field Report on
- AWS Bedrock
- Managed Generative AI on AWS — and what it looks like
- when every LLM call in a production system runs through it.
- Presented by
- Presenter One  ·  Presenter Two
- Live demo · real code · real architecture
- Reading List
- 01
- What it is & the problem
- it actually solves
- 02
- How it works —
- architecture & the API
- 03
- Alternatives & trade-offs
- 04
- A real production pipeline
- 05
- Live demo & lessons earned
- Vol. 01  ·  Bedrock in production
- 01 / 16

---

## 02 Agenda  
`02-agenda.html`

- Opening  ·  Set the stakes
- Foreword
- “
- Every LLM call in a production system we run
- at BigID goes through Bedrock.
- — Today's hook, and our promise
- The Roadmap
- I
- Foundations
- What Bedrock is
- The managed-API thesis & the problem it removes.
- II
- Mechanics
- How it works
- Architecture, Converse, tool-use, caching.
- III
- Context
- Alternatives
- SageMaker, Q, OpenAI direct — trade-offs.
- IV
- Field Notes
- A real pipeline
- PII classifier — multi-agent, multi-model.
- V
- Hands-on
- Live demo
- Real input, real structured output.
- Note  ·
- The second half is hands-on — we'll run real Bedrock calls on a real dataset.
- AWS Bedrock  ·  A field report
- 02 / 16

---

## 03 What is Bedrock  
`03-what-is-bedrock.html`

- Part 1  ·  Foundations
- Chapter 03  ·  Definition
- Definition
- What, exactly, is Bedrock?
- A
- fully-managed AWS API that fronts a catalogue of foundation models — Anthropic Claude, Amazon Nova & Titan, Meta Llama, Mistral, Cohere — behind one request shape, one auth model, one bill.
- i.
- Many models,
- one API
- Call bedrock-runtime the way you call any other AWS service. No per-vendor SDK, no per-vendor account.
- ii.
- No servers,
- no GPUs
- Serverless in the course sense — AWS provisions, hosts, scales the model. You never see a GPU instance.
- iii.
- Pay per token,
- scales to zero
- No minimum fleet, no idle GPU bill. Quiet hour costs you nothing; a spike just bills more tokens.
- Mental model  ·
- Bedrock is to LLMs what S3 is to storage — a managed AWS service you call, not infrastructure you run.
- AWS Bedrock  ·  A field report
- 03 / 16

---

## 04 Problem solved  
`04-problem-it-solves.html`

- Part 1  ·  Foundations
- Chapter 04  ·  The pain
- The Problem
- Three SDKs, three key stores,
- three request formats.
- Before  ·  Without Bedrock
- One SDK + API key per vendor
- Secrets to store, rotate, audit
- Each vendor's own request shape
- Self-host means GPUs & scaling
- →
- After  ·  With Bedrock
- One boto3 client
- IAM auth — no keys to leak
- One Converse request shape
- Managed, scales to zero
- The take  ·
- Bedrock's win isn't “another LLM service.” It's collapsing three of them into one IAM-native API.
- AWS Bedrock  ·  A field report
- 04 / 16

---

## 05 Where it fits  
`05-where-it-fits.html`

- Part 1  ·  Mechanics
- Chapter 05  ·  Placement
- Placement
- Two planes,
- one regional service.
- Control plane
- bedrock
- Manage & discover — list models, view inference profiles, request access, see quotas. Admin-side calls.
- You touch this rarely.
- Runtime plane
- bedrock-runtime
- Call models — converse(), converse_stream(). Token-billed, latency-sensitive, the hot path.
- You live in this plane.
- Integrates with
- Lambda
- /
- Step Functions
- /
- CloudWatch
- /
- IAM
- /
- VPC endpoints
- AWS Bedrock  ·  A field report
- 05 / 16

---

## 06 Architecture  
`06-architecture.html`

- Part 1  ·  Mechanics
- Chapter 06  ·  Components
- Architecture
- From your code
- to the model.
- Your application
- boto3 · aioboto3
- IAM-signed HTTPS
- ↓
- Runtime endpoint (regional)
- bedrock-runtime
- →
- routed by profile
- Foundation model
- Claude · Nova · Llama
- ↓
- Telemetry
- CloudWatch · cost metrics
- Real code · core/bedrock.py
- Creating the client
- session = boto3.Session(
- profile_name=profile,
- region_name=region,
- )
- client = session.client(
- "bedrock-runtime",
- config=config, # 600s read, 6 retries
- )
- Four components per call
- 1. Runtime client
- 2. Model / profile ID
- 3. Request (sys + msgs + cfg)
- 4. Response (content + tokens)
- AWS Bedrock  ·  A field report
- 06 / 16

---

## 07 Converse API  
`07-converse-api.html`

- Part 1  ·  How it works
- Chapter 07  ·  The API
- The Big Idea
- One request shape.
- Every model.
- “This exact dict works for Claude, Nova, Llama, Mistral — I only change modelId.”
- §1
- Converse unifies the request shape
- Same system + messages + inferenceConfig for every vendor. Swap models by changing one string — no rewrite, no new SDK.
- §2
- Inference profiles route across regions
- The us. prefix on us.anthropic.claude‑sonnet‑4‑6 load-balances across US regions — throughput & availability without code changes.
- Real code · core/bedrock.py
- _build_converse_kwargs
- kwargs = {
- "modelId": model_id, # ← swap me
- "system": [{"text": system_prompt}],
- "messages": [{
- "role": "user",
- "content": [{"text": user_prompt}]
- }],
- "inferenceConfig": {
- "maxTokens": max_tokens,
- "temperature": temperature,
- },
- }
- response = client.converse(**kwargs)
- AWS Bedrock  ·  A field report
- 07 / 16

---

## 08 Tool-use  
`08-tool-use.html`

- Part 1  ·  Mechanics
- Chapter 08  ·  Reliability
- Reliability — Tool-Use
- Guaranteed JSON,
- not parsed prose.
- The problem
- LLMs return prose. Production code needs a typed dict. Regex-on-prose is how demos pass and pipelines fail at 3am.
- The fix
- Bedrock's tool-use exposes your Pydantic schema as a tool. toolChoice forces the model to call it — the response block is already valid, typed JSON.
- The difference between a demo and a production system.
- Real code · core/bedrock.py
- Forcing structured output
- kwargs["toolConfig"] = {
- "tools": [tool_spec], # from Pydantic
- "toolChoice": {
- "tool": {"name": tool_name}, # force it
- },
- }
- # response
- typed = block["toolUse"]["input"]
- # → {"score": 1, "reasoning": "..."}
- What you get
- No regex · No retries on malformed JSON · Pydantic types you can trust.
- AWS Bedrock  ·  A field report
- 08 / 16

---

## 09 Cost levers  
`09-cost-quality-levers.html`

- Part 1  ·  Mechanics
- Chapter 09  ·  Levers
- Two more levers worth knowing
- Cheaper repeats.
- Smarter answers.
- ¶ I
- Money lever
- Prompt caching
- A fixed system prompt — our classifier “brief” — is reused across thousands of findings. Pay full price once; cache reads thereafter.
- system.append({"cachePoint": {"type": "default"}})
- # response.cacheReadInputTokens → 10% input rate
- 10%
- of the input rate
- on cache reads.
- ¶ II
- Quality lever
- Extended thinking
- Let the model spend extra tokens reasoning before it answers — pay more, decide better on the genuinely hard calls.
- additionalModelRequestFields = {
- "thinking": {"type": "adaptive"}
- }
- Honest nuance
- Forced tool-use + thinking can't combine — we relax to toolChoice: auto and the parser handles the fallback.
- AWS Bedrock  ·  A field report
- 09 / 16

---

## 10 Alternatives  
`10-alternatives.html`

- Part 2  ·  Context
- Chapter 10  ·  The field
- The Field
- If not Bedrock, then what?
- Option
- What you get
- Trade-off
- Pick?
- SageMaker JumpStart
- Self-host on your endpoint
- Deploy & run models on your own infra — most control, most knobs.
- You manage instances, scaling, ops, GPU bill.
- ○
- Lambda + external LLM
- OpenAI / Anthropic direct
- Call vendor APIs directly from your code — broadest model menu.
- You manage keys; no AWS catalog or IAM-native auth.
- ○
- Amazon Q
- Prebuilt AWS assistant
- Higher-level assistant for AWS & business workflows.
- Opinionated; not raw model access.
- ○
- Bedrock
- Managed catalog + raw API
- One IAM-auth API, many models — no infra to run.
- The middle ground — less control than SageMaker, more than Q.
- ●
- In our repo  ·
- We do use OpenAI direct + OpenRouter for two sub-tasks — each needed its own wrapper module. That contrast is the lesson on slide 15.
- AWS Bedrock  ·  A field report
- 10 / 16

---

## 11 Advantages limitations  
`11-advantages-limitations.html`

- Part 2  ·  Context
- Chapter 11  ·  Ledger
- The Ledger
- What we love.
- What we worked around.
- +
- Advantages
- One API, many models
- Converse handles every supported provider.
- IAM auth — no API keys
- Use the role you already have.
- Managed & serverless
- Scales to zero; pay per token.
- Caching, tool-use, thinking built-in
- Production features, not add-ons.
- Per-model cost tracking
- CloudWatch sees every call & token.
- −
- Limitations — all hit in real code
- Inference profiles need a region anchor
- us-east-1 — and the model must be activated per account/region.
- Not every model supports every feature
- Llama / Mistral / Cohere reject cachePoint — we added BEDROCK_CACHE_SYSTEM=false.
- CountTokens wants the single-region ID
- Not the us. profile ID — we strip the prefix.
- Forced tool-use + extended thinking can't combine
- Relax to toolChoice: auto; parse the fallback.
- Quotas, throughput & regional availability
- Plan around model + region; not every pairing exists.
- AWS Learner Lab may not expose all models
- Real demo risk — mitigated with a recorded fallback.
- AWS Bedrock  ·  A field report
- 11 / 16

---

## 12 Use case pipeline  
`12-use-case-pipeline.html`

- Part 2  ·  Field notes
- Chapter 12  ·  The pipeline
- Case Study — BigID PII classifier
- An LLM judging an LLM,
- writing the next prompt.
- The Problem
- Regex flags candidate PII — lots of false positives. We need an LLM to judge true vs false positive per PII type, guided by a “classifier brief.”
- The Loop
- spec → generate dataset → label → judge errors → refine prompt → validate  (iterate)
- Step 1
- spec_agent
- →
- Step 2
- prompt_agent
- →
- Step 3
- dataset_agent
- ↓
- Validates
- validator_agent
- ←
- Judges errors
- judge_agent
- ←
- refines
- ↑
- Helpers
- error_analyzer  ·  prompt_modifier  ·  cluster_map
- The point  ·
- Every box above is a Bedrock call. The system automatically writes the prompt that a downstream validator uses.
- AWS Bedrock  ·  A field report
- 12 / 16

---

## 13 Model mix cost  
`13-model-mix-cost.html`

- Part 2  ·  Field notes
- Chapter 13  ·  The economics
- The Economics
- Right model, right job.
- One string apart.
- Task
- Model
- $ / M in
- $ / M out
- High-volume labeling
- Claude Haiku 4.5
- 0.25
- 1.25
- Default validator
- Amazon Nova 2 Lite
- 0.06
- 0.24
- Dataset gen / cross-check
- Claude Sonnet 4.6
- 3.00
- 15.00
- Judge (hard reasoning)
- Claude Opus 4.6
- 5.00
- 25.00
- Ground-truth audit
- Claude Opus 4.8
- 5.00
- 25.00
- Input cost compared
- 83×
- Nova 2 Lite cheaper than Opus on input tokens.
- 20×
- Haiku cheaper than Opus on input tokens.
- Plus caching
- Reused system prompt bills at 10% on cache reads.
- The story  ·
- Don't pay Opus to label 10,000 cheap findings. Reserve Opus for the hard judge step. Converse makes that a config change, not a project.
- AWS Bedrock  ·  A field report
- 13 / 16

---

## 14 Live demo  
`14-live-demo.html`

- Part 2  ·  Hands-on
- Chapter 14  ·  Demo
- Live demo  ·  ~4 min
- Real input.
- Real model.
- Running validate_finding_async — the innermost Bedrock call.
- Input
- One PII finding
- + classifier brief
- →
- Through
- Bedrock Converse
- + forced tool-use
- →
- Output
- { "score": 1|2|3,
- "reasoning": "..." }
- Watch for  ·
- the JSON shape, the token / cost line in the log — the same hooks we discussed on slides 9 & 13.
- AWS Bedrock  ·  A field report
- 14 / 16

---

## 15 Lessons  
`15-lessons-learned.html`

- Part 2  ·  Lessons
- Chapter 15  ·  Earned wisdom
- Earned Wisdom
- Five things we wish
- we'd known on day one.
- 01
- One API, not N wrappers.
- Converse meant zero per-provider request code for our Bedrock models. Our OpenAI & OpenRouter paths each needed their own wrapper — which is exactly the proof.
- 02
- Tool-use > prose parsing.
- Force the model into your schema. Reliable JSON by construction beats clever regex every time.
- 03
- Cache the system prompt.
- Real money when it's reused — cache reads bill at 10% of the input rate. The biggest single-line cost win in the project.
- 04
- Build a provider seam.
- Our core/llm.py abstraction means adding a provider is a one-elif change. Don't bind your app to one SDK.
- 05
- Mind the gotchas.
- Region-anchored inference profiles · CountTokens needs the single-region ID · not every model supports caching. Each one cost us a debugging hour the first time.
- AWS Bedrock  ·  A field report
- 15 / 16

---

## 16 Wrap Q&A  
`16-wrap-qa.html`

- Closing  ·  Three takeaways & questions
- Colophon
- In closing
- Three takeaways.
- I.
- Bedrock = managed, multi-model GenAI on AWS.
- Serverless, IAM-authenticated, scales to zero.
- II.
- Converse = one request shape, every model.
- Swap models with a one-string change.
- III.
- Right-model-for-the-job economics.
- Nova / Haiku for volume; Opus for the hard calls.
- Now
- Questions?
- Both presenters
- Thank you — see the repo for the full code path.
- AWS Bedrock  ·  A field report  ·  End
- 16 / 16
