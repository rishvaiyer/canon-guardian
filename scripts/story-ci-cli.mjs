#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { evaluateStoryCI, reportSummary } from '../story-ci.mjs';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/story-ci-cli.mjs <manifest.json>');
  process.exitCode = 2;
} else {
  try {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const report = await evaluateStoryCI(manifest);
    console.log(reportSummary(report));
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.verdict === 'BLOCK' ? 1 : 0;
  } catch (error) {
    console.error(`Story CI could not evaluate ${file}: ${error.message}`);
    process.exitCode = 2;
  }
}
