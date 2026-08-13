# storyIsStraight

**Get your story straight.** Evidence-backed continuity intelligence for authors, writers' rooms, filmmakers, and any long-form story world.

## Try the live demo

- Hosted app: https://app-production-517f.up.railway.app/
- Source: https://github.com/rishvaiyer/canon-guardian
- Synthetic walkthrough files: [`demo/episode-01-canon.txt`](demo/episode-01-canon.txt) and [`demo/episode-02-revision.txt`](demo/episode-02-revision.txt)

The fastest walkthrough is: import Episode 1 as **Canon source**, lock the facts, import Episode 2 as **Incoming revision**, run the local continuity check, then open the impact map. For a PDF source with a contradiction, use **Download annotated PDF** to receive a local marked-up copy plus an evidence appendix.

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

The cloud path is deliberately separate from the local path: the browser sends the current incoming draft and approved evidence only after explicit consent; the server stores approved evidence rows in ClickHouse and asks Gemini for structured, evidence-cited findings. The local checker remains available offline and is the default review path.

## Submission/runtime notes

- The included demo material is original synthetic fiction created for this repository; it is not a real screenplay.
- The app supports PDF, `.docx`, `.txt`, Fountain, and Final Draft `.fdx` imports. Full source text is not persisted in browser storage.
- The public demo is configured with Gemini Enterprise and ClickHouse on Railway. Do not paste credentials into the frontend or commit `.env` files.
- This repository is licensed under the MIT License.

## Run

```bash
npm install
npm start
```

Open the local URL shown in the terminal.
