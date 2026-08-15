# CanonCue

**Get your story straight.**

CanonCue is an evidence-first continuity workspace for authors, writers’ rooms, filmmakers, novelists, playwrights, and anyone maintaining a story across chapters, episodes, or revisions.

> CanonCue remembers what is true, proves what changed, and shows the smallest repair before one bad line breaks the season.

## Live demo

- **App:** [app-production-517f.up.railway.app](https://app-production-517f.up.railway.app/)
- **Repository:** [github.com/rishvaiyer/canon-guardian](https://github.com/rishvaiyer/canon-guardian)
- **Synthetic walkthrough:** [`demo/episode-01-canon.txt`](demo/episode-01-canon.txt) → [`demo/episode-02-revision.txt`](demo/episode-02-revision.txt)
- **Current live release:** `47bf546` · Railway deployment `0b1e453f-071d-4da2-ab7a-34520e6c1dbf` (`SUCCESS`)

The demo files are original synthetic fiction created for this repository. They are safe to use in a public walkthrough.

## The five-minute walkthrough

1. Open the app and choose **Start with canon**.
2. Import `demo/episode-01-canon.txt` as **Canon source**.
3. Review the extracted facts and lock the states you want to protect.
4. Import `demo/episode-02-revision.txt` as **Incoming draft**.
5. Choose **Check continuity** for the private browser-local pass.
6. Open the **Review Inbox** and select a finding.
7. Inspect the source-backed evidence, downstream impact, and **Repair Simulator**.
8. Select a scene in the **Continuity Map** to see its nearby `NEXT` and `THREAD` connections.
9. Run **Story CI** to generate an evidence-gated release verdict and deterministic manifest hash.
10. Open **Download outputs** to export the ledger, review, map, project bundle, or source files.

The synthetic revision intentionally breaks four established states: Jonah’s death, Maya’s wrist injury, the phone’s dead state, and the timing of the locker-code reveal.

## What is shipped

### Local-first story memory

- Imports PDF, Word `.docx`, `.txt`, Fountain, and Final Draft `.fdx` in the browser.
- Extracts scene-aware lines and explicit story states locally.
- Detects supported reversals involving deaths, injuries, phone/object state, and numeric-code reveals.
- Persists project title, source metadata, evidence metadata, candidates, and writer-approved locks in browser storage.
- Does **not** persist full screenplay text after refresh and does not upload a local import during the default workflow.

### Evidence-led review

- Review Inbox surfaces open findings first.
- Every finding includes earlier/later evidence, severity, and downstream beats to inspect.
- Repair Simulator compares the current claim with a proposed smallest edit. It is preview-only; CanonCue never changes a draft automatically.
- PDF imports can produce a locally annotated copy with source highlights and a review appendix. The original PDF is never modified.

### Explainable continuity scoring

CanonCue separates **finding priority** from **repair preference**. Gemini can propose the interpretation, but the server validates the cited evidence and computes the ranking deterministically. Unsupported findings without a valid evidence index are removed before they reach the UI.

Each supported finding receives a `finding_score` from 0–100:

| Signal | Weight | What it measures |
| --- | ---: | --- |
| Evidence strength | 30% | Exact source, scene, line, and excerpt quality, plus corroboration |
| Contradiction strength | 25% | Direct reversal versus weaker drift or ambiguity |
| Downstream blast radius | 25% | Number of later beats and scope: scene, episode, season, or series |
| Timeline certainty | 10% | Confidence that the ordering or knowledge boundary is established |
| Gemini confidence | 10% | The model’s structured confidence after evidence gating |

The API returns the component `score_breakdown`, a plain-language `score_rationale`, `priority_rank`, and aggregate `score_average`/`highest_score` metrics. Findings are displayed highest-risk first, so a well-supported series-level contradiction outranks an uncertain scene-level note.

Repair options use a separate 0–100 ranking:

- **40% canon preservation** — protect approved story truth.
- **30% blast-radius reduction** — resolve the most later risk.
- **20% edit effort** — prefer the smallest practical rewrite.
- **10% confidence** — prefer options with stronger support.

The result is an explainable editorial aid, not a claim that the score is objective truth or a learned model. The current weights are transparent heuristics. The Repair Simulator can record `accepted_repair`, `marked_intentional`, or `dismissed` decisions locally—without screenplay text—and export them as a calibration CSV for a future learned ranker.

### Continuity Map

- The complete scene index is the primary browsing surface.
- Selecting a scene shows a bounded local neighborhood instead of a decorative graph cloud.
- `NEXT` edges show story order; `THREAD` edges show consecutive shared-character continuity.
- The selected scene explains **WHY CONNECTED** and exposes evidence when available.
- Full-map mode remains available for longer scripts.

### Story CI release gate

- Converts approved canon locks and current continuity findings into a portable `canoncue.story-ci/v1` manifest.
- Blocks unresolved high/critical breaks and any finding with missing or unknown evidence IDs.
- Keeps the release decision deterministic: model output can propose a finding, but it cannot override policy.
- Records explicit editorial decisions without silently deleting the original finding.
- Compares the current report with a promoted browser-local baseline and exports both manifest and report JSON.
- Ships a zero-secret Node CLI and GitHub Actions workflow for the same policy evaluator used in the browser.

Run an exported or synthetic manifest from CI:

```bash
npm run story-ci -- demo/story-ci-sample.json
```

The command exits `1` for a blocked revision, `0` for pass/review, and `2` for invalid input or runtime failure.

### Portable outputs

**Download outputs** can create:

- JSON project bundle with ledger, findings, and map metadata
- Markdown canon ledger
- Markdown continuity review
- CSV Continuity Map
- Untouched imported source files during the active browser session
- Annotated source PDF when a PDF revision has findings
- Review-feedback CSV containing only local editorial decisions and score metadata

## Optional Gemini + ClickHouse layer

The local checker is the default and remains available offline. The cloud layer is explicit and consent-gated.

| Component | Responsibility |
| --- | --- |
| **Gemini Enterprise** | Proposes canon candidates, answers grounded canon questions, and reasons over the incoming draft |
| **ClickHouse** | Stores approved evidence rows for durable season/series retrieval |
| **ClickHouse MCP** | Provides a localhost-only, read-only `run_query` tool boundary for evidence retrieval |
| **CanonCue server** | Validates evidence indexes, normalizes findings, scores repair plans, and keeps secrets server-side |
| **Writer** | Approves locks, reviews findings, and decides whether a repair is accepted |

Cloud review sends only the current incoming-draft text plus writer-approved canon evidence after consent. `Ask locked canon` sends the question plus locked evidence. Unsupported answers return `not_found`; unsupported Gemini findings without valid evidence indexes are excluded before reaching the UI.

Cloud review responses use `analysis_version: continuity-crew-v2` and support eight finding types:

`direct_contradiction`, `timeline_impossibility`, `knowledge_leak`, `character_state_conflict`, `relationship_drift`, `prop_location_mismatch`, `setup_payoff_gap`, and `needs_review`.

The response also includes evidence-backed impact scope, confidence, repair options, scored `repair_plan` entries, and aggregate metrics. CanonCue's transparent heuristic ranks each finding with evidence strength (30%), contradiction strength (25%), downstream blast radius (25%), timeline certainty (10%), and Gemini confidence (10%). Repair options are scored separately for canon preservation (40%), blast-radius reduction (30%), edit effort (20%), and confidence (10%). These are explainable decision aids, not a trained replacement for editorial judgment.

The repair simulator captures optional writer decisions—accept repair, mark intentional, or dismiss—locally without storing screenplay text. The export center can download those decisions as CSV so a future calibration job can learn better weights from real editorial outcomes. No training job or automatic weight update is currently enabled.

## Run locally

Requirements: Node.js 22+ and npm.

```bash
npm install
npm start
```

Open the Vite URL shown in the terminal. The browser-local workflow works without Google Cloud or ClickHouse.

To run the API server for the optional cloud layer, use a second terminal:

```bash
cp .env.example .env
npm run serve
```

When using `npm start`, Vite proxies `/api` requests to `http://localhost:8787`. The production-style combined server is:

```bash
npm run build
npm run serve
```

## Configure the optional cloud layer

Never commit `.env`, service-account JSON, API keys, or ClickHouse credentials. Use a secret manager or hosting-provider variables.

1. Authenticate local Google Application Default Credentials:

   ```bash
   gcloud auth application-default login
   ```

2. Set the variables in [`.env.example`](.env.example).
3. Enable the required Google Cloud APIs and billing in your own project.
4. Provide a private ClickHouse instance and credentials.
5. Start the official `mcp-clickhouse` sidecar through `start.sh` or your deployment runtime.

The sidecar binds to `127.0.0.1` only. `CLICKHOUSE_MCP_AUTH_TOKEN` is an internal secret between the Node API and MCP sidecar.

The UI fails closed when the cloud service, prerequisites, or consent are missing. A cloud response displays the agent trace and keeps human approval required.

## Quality checks

```bash
npm run check
npm run check:server
npm run test:analysis
npm run test:story-ci
npm run build
npm audit --omit=dev --audit-level=high
git diff --check
```

## Deploy on Railway

The repository includes [`railway.json`](railway.json), [`Dockerfile`](Dockerfile), and [`start.sh`](start.sh).

```bash
railway up -y --service <app-service-id>
```

The Docker runtime:

1. Builds the Vite app.
2. Installs the official `mcp-clickhouse` tool.
3. Starts the localhost-only MCP sidecar.
4. Waits for the sidecar health check.
5. Starts the Node API and serves the app.

Railway health check: `/api/health`.

## Privacy and product boundaries

- Local imports stay in the browser by default.
- Full source text is intentionally not persisted in `localStorage`.
- Cloud review is opt-in per action and rate-limited server-side.
- Locked evidence is durable in ClickHouse only when the cloud workflow is explicitly used.
- Gemini proposes; it does not lock facts or rewrite drafts automatically.
- The demo uses synthetic fiction, not a real screenplay.

## License

[MIT](LICENSE)
