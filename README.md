# storyIsStraight

**Get your story straight.** Evidence-backed continuity intelligence for authors, writers' rooms, filmmakers, and any long-form story world.

## What this MVP demonstrates

- Browser-local import for manuscript chapters, screenplays, teleplays, plays, treatments, outlines, and other page-based drafts in PDF, `.docx`, `.txt`, Fountain, and Final Draft `.fdx`.
- A persistent local story bible: source roles, evidence metadata, and writer-approved locks survive refreshes. Full source text does not persist.
- A deterministic canon ledger for explicit deaths, injuries, object states, and numeric-code reveals.
- Source-backed contradiction alerts with earlier/later evidence, repair framing, and a downstream impact map.
- An Obsidian-style story graph connecting scenes/beats through story order and shared-character threads.
- An opt-in cloud evidence review that retrieves approved canon from ClickHouse and asks a Gemini Enterprise continuity agent to evaluate the current incoming draft.
- Remembered light and dark workspace modes.

The included project, **The Last Loop**, is original demo data. The default workflow reads supported story source files locally in the browser and does not upload them. Its local analysis intentionally covers explicit, source-backed state changes only; Gemini is used only after the writer explicitly opts into cloud evidence review. It works best when drafts use scene or chapter headings and concrete page action.

## Gemini Enterprise + ClickHouse agent

The local workflow is the default. Cloud review is an explicit, per-review opt-in: it sends only the current incoming-draft text and user-locked canon evidence to the configured cloud services. The server stores evidence rows in ClickHouse; it does not persist the full draft there.

1. Copy `.env.example` to your secret store or local environment. Authenticate local development with Application Default Credentials (`gcloud auth application-default login`); hosted deployments use a sealed service-account JSON variable. Set your Google Cloud project/location, enable billing and Gemini Enterprise Agent Platform, and configure a private ClickHouse service.
2. Build the app and run the combined app/API server:

```bash
npm run build
npm run serve
```

For local UI development, run `npm start` and `npm run serve` in separate terminals; Vite proxies `/api` to the agent server.

The `AI evidence review` button intentionally fails closed until both cloud services are configured and the writer checks the consent box.

## Run

```bash
npm install
npm start
```

Open the local URL shown in the terminal.
