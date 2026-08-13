# storyIsStraight

**Get your story straight.** Evidence-backed continuity intelligence for authors, writers' rooms, filmmakers, and any long-form story world.

## What this MVP demonstrates

- Browser-local import for manuscript chapters, screenplays, teleplays, plays, treatments, outlines, and other page-based drafts in PDF, `.docx`, `.txt`, Fountain, and Final Draft `.fdx`.
- A persistent local story bible: source roles, evidence metadata, and writer-approved locks survive refreshes. Full source text does not persist.
- A deterministic canon ledger for explicit deaths, injuries, object states, and numeric-code reveals.
- Source-backed contradiction alerts with earlier/later evidence, repair framing, and a downstream impact map.
- An Obsidian-style story graph connecting scenes/beats through story order and shared-character threads.
- Remembered light and dark workspace modes.

The included project, **The Last Loop**, is original demo data. The app reads supported story source files locally in the browser and does not upload them. It does not call an LLM in this MVP; analysis intentionally covers explicit, source-backed state changes only. It works best when drafts use scene or chapter headings and concrete page action.

## Run

```bash
npm install
npm start
```

Open the local URL shown in the terminal.
