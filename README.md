# storyIsStraight

**Get your story straight.** Evidence-backed story intelligence for a screenplay revision.

## What this MVP demonstrates

- Browser-local import for PDF, `.docx`, `.txt`, Fountain, and Final Draft `.fdx`.
- A deterministic canon ledger for explicit deaths, injuries, phone states, and numeric-code reveals.
- Source-backed contradiction alerts with earlier/later evidence and repair framing.
- A downstream impact map showing which later story beats stop making sense.
- Remembered light and dark workspace modes.

The included project, **The Last Loop**, is original demo data. The app reads supported screenplay source files locally in the browser and does not upload them. It does not call an LLM in this MVP; analysis intentionally covers explicit, source-backed state changes only.

## Run

```bash
npm install
npm start
```

Open the local URL shown in the terminal.
