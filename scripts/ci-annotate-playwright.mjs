#!/usr/bin/env node
/**
 * Converts a Playwright JSON report into GitHub Actions annotations.
 *
 * Job logs and report artifacts live in blob storage, which is not readable from
 * every environment; check-run annotations are, so the first failure of each
 * test is re-emitted as `::error::` with the assertion message inline.
 *
 * Usage: node scripts/ci-annotate-playwright.mjs [report.json]
 */
import { readFileSync, existsSync } from 'node:fs';

const reportPath = process.argv[2] ?? 'test-results/e2e.json';

/** @typedef {{ title: string, ok: boolean, tests: unknown[] }} Spec */
/** @typedef {{ title: string, file: string, specs: Spec[], suites?: Suite[] }} Suite */
/** @typedef {{ title: string, file: string, suites: Suite[] }} Suite */

/** Depth-first walk over Playwright's nested suite tree. */
function collect(suite, file, out) {
  for (const spec of suite.specs ?? []) {
    out.push({ ...spec, file: suite.file ?? file ?? spec.file ?? 'e2e' });
  }
  for (const child of suite.suites ?? []) {
    collect(child, suite.file ?? file, out);
  }
  return out;
}

/** First failure message of a spec, "—" when results are missing. */
function failureMessage(spec) {
  for (const test of spec.tests ?? []) {
    for (const result of test.results ?? []) {
      for (const error of result.errors ?? []) {
        const message = (error.message ?? error.value ?? '').toString();
        if (message.trim().length > 0) return message;
      }
      if (result.status === 'timedOut') return 'timeout';
    }
  }
  return 'failed without a message';
}

function main() {
  if (!existsSync(reportPath)) {
    console.log(`::warning::Playwright report not found at ${reportPath}`);
    return;
  }
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const specs = [];
  for (const suite of report.suites ?? []) collect(suite, suite.file, specs);

  const failed = specs.filter((spec) => spec.ok === false);
  console.log(`Playwright: ${specs.length} specs, ${failed.length} failed`);

  for (const spec of failed.slice(0, 25)) {
    const message = failureMessage(spec).split('\n').slice(0, 6).join(' ').replace(/%/g, '%25');
    const title = `${spec.file} › ${spec.title}`.replace(/%/g, '%25').replace(/\r?\n/g, ' ');
    console.log(`::error file=${spec.file},title=${title}::${message}`);
  }
  if (failed.length > 25) {
    console.log(`::error::${failed.length - 25} more Playwright failures not annotated`);
  }
}

main();
