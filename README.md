# Canon Guardian

Evidence-backed story-canon intelligence for a screenplay revision.

## What this MVP demonstrates

- An LLM-shaped workflow that extracts revision claims about characters, objects, chronology, and knowledge.
- A locked canon ledger with page-level evidence.
- Contradiction alerts that explain the smallest repair.
- A yellow downstream impact map showing which later story beats stop making sense.

The included project, **The Last Loop**, is original demo data. This static MVP does not call an LLM or upload screenplay data; its interactions demonstrate the intended product flow safely and deterministically.

## Run

```bash
npm start
```

Open http://localhost:4173.

## Next build step

Add an opt-in server-side analysis route using structured LLM output for claims, evidence links, confidence, and repair suggestions. Keep a human editor in control of every canon lock and every proposed change.
