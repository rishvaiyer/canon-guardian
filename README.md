# CanonCue

**Get your story straight.**

CanonCue is an evidence-first continuity workspace for authors, writers’ rooms, filmmakers, novelists, playwrights, and anyone maintaining a story across chapters, episodes, or revisions.

> CanonCue remembers what is true, proves what changed, and shows the smallest repair before one bad line breaks the season.

## Live demo

- **App:** [app-production-517f.up.railway.app](https://app-production-517f.up.railway.app/)
- **Repository:** [github.com/rishvaiyer/canon-guardian](https://github.com/rishvaiyer/canon-guardian)
- **Synthetic walkthrough:** [`demo/episode-01-canon.txt`](demo/episode-01-canon.txt) → [`demo/episode-02-revision.txt`](demo/episode-02-revision.txt)

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
9. Open **Download outputs** to export the ledger, review, map, project bundle, or source files.

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

### Continuity Map

- The complete scene index is the primary browsing surface.
- Selecting a scene shows a bounded local neighborhood instead of a decorative graph cloud.
- `NEXT` edges show story order; `THREAD` edges show consecutive shared-character continuity.
- The selected scene explains **WHY CONNECTED** and exposes evidence when available.
- Full-map mode remains available for longer scripts.

### Portable outputs

**Download outputs** can create:

- JSON project bundle with ledger, findings, and map metadata
- Markdown canon ledger
- Markdown continuity review
- CSV Continuity Map
- Untouched imported source files during the active browser session
- Annotated source PDF when a PDF revision has findings

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

The response also includes evidence-backed impact scope, confidence, repair options, scored `repair_plan` entries, and aggregate metrics.

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
