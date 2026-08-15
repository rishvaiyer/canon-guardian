# Story CI — implementation handoff

Status: authorized and in progress on `codex/story-ci`.

## Product promise

Treat approved canon like tests. Every incoming revision produces a deterministic, inspectable release verdict before the writers' room promotes it.

## Required loop

1. Build a test manifest from approved canon locks and evidence-backed continuity findings.
2. Run deterministic policy checks with no model dependency.
3. Block a revision when a critical/high unresolved break violates the configured threshold or when a finding lacks valid evidence.
4. Show passed, failed, and review-required checks with exact evidence and downstream scope.
5. Compare the current run with a previous baseline.
6. Export a portable manifest and machine-readable report that a CLI can evaluate in GitHub Actions.

## Architecture

- `story-ci.mjs`: pure evaluator shared by browser and Node tests.
- `scripts/story-ci-cli.mjs`: zero-secret CLI for exported manifests.
- `story-ci.test.mjs`: policy, evidence, threshold, deterministic-hash, and comparison coverage.
- `demo/story-ci-sample.json`: reproducible synthetic blocked run.
- CanonCue UI: a responsive Story CI release-gate panel driven by current local locks/findings.
- `.github/workflows/quality.yml`: existing/new checks include Story CI tests.

## Acceptance criteria

- Same canonical input yields the same SHA-256-compatible deterministic content hash.
- Invalid or missing evidence cannot silently pass.
- Critical unresolved findings block; intentional/accepted findings can be recorded without disappearing.
- A clean fixture passes and a broken fixture exits non-zero in CLI verification.
- UI clearly distinguishes `PASS`, `BLOCK`, and `REVIEW`.
- No screenplay text, API key, or cloud call is required for Story CI.
- Existing CanonCue analysis, build, and privacy boundaries remain intact.

## Deployment and publishing

- Push the focused addition to the existing public CanonCue repository after tests and review.
- Deploy to the existing `story-is-straight` Railway service and verify terminal `SUCCESS`, `/api/health`, UI copy, and one synthetic Story CI run.
- Add a portfolio-hosted route later without linking it from the portfolio homepage.

## Boundaries

- Do not claim story correctness, production readiness, or automatic editorial authority.
- Do not make model output the release decision; model findings must normalize into evidence-gated deterministic inputs.
- Do not expose source text in CI artifacts by default.
