#!/usr/bin/env node
/*
 Groups Vitest/V8 json-summary coverage by top-level module folders in src/
 Modules: src/main, src/renderer, src/shared, and other top-levels under src.
 Prints a compact table per module and a grand total.
*/

const fs = require('fs');
const path = require('path');

function readJsonSummary() {
  const summaryPath = path.resolve(process.cwd(), 'coverage', 'coverage-summary.json');
  if (!fs.existsSync(summaryPath)) {
    console.error('coverage/coverage-summary.json not found. Run tests with coverage first.');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
}

function formatPct(n) {
  return `${(Math.round(n * 100) / 100).toFixed(2)}%`;
}

function aggregateByModule(summary) {
  const byModule = new Map();
  const totals = { lines: { total: 0, covered: 0 }, statements: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, functions: { total: 0, covered: 0 } };

  for (const [filePath, metrics] of Object.entries(summary)) {
    // Skip the special total row
    if (filePath === 'total') continue;
    // Normalize path separators
    const normalized = filePath.split(path.sep).join('/');
    // Only include source files under src/
    if (!normalized.includes('/src/')) continue;
    const srcIndex = normalized.indexOf('/src/');
    const afterSrc = normalized.slice(srcIndex + 5); // after 'src/'
    const moduleName = afterSrc.split('/')[0] || 'root';

    if (!byModule.has(moduleName)) {
      byModule.set(moduleName, { lines: { total: 0, covered: 0 }, statements: { total: 0, covered: 0 }, branches: { total: 0, covered: 0 }, functions: { total: 0, covered: 0 } });
    }
    const agg = byModule.get(moduleName);

    // Sum metrics
    for (const key of ['lines', 'statements', 'branches', 'functions']) {
      const m = metrics[key];
      if (!m) continue;
      agg[key].total += m.total || 0;
      agg[key].covered += m.covered || 0;
      totals[key].total += m.total || 0;
      totals[key].covered += m.covered || 0;
    }
  }

  return { byModule, totals };
}

function printTable(byModule, totals) {
  const modules = Array.from(byModule.entries()).sort(([a], [b]) => a.localeCompare(b));
  const rows = [];
  const header = ['Module', 'Stmts', 'Branch', 'Funcs', 'Lines'];

  function pct(covered, total) {
    return total === 0 ? '0.00%' : formatPct((covered / total) * 100);
  }

  for (const [name, agg] of modules) {
    rows.push([
      name,
      pct(agg.statements.covered, agg.statements.total),
      pct(agg.branches.covered, agg.branches.total),
      pct(agg.functions.covered, agg.functions.total),
      pct(agg.lines.covered, agg.lines.total),
    ]);
  }

  // Total row
  rows.push([
    'TOTAL',
    pct(totals.statements.covered, totals.statements.total),
    pct(totals.branches.covered, totals.branches.total),
    pct(totals.functions.covered, totals.functions.total),
    pct(totals.lines.covered, totals.lines.total),
  ]);

  // Compute column widths
  const colWidths = header.map((h, i) => Math.max(h.length, ...rows.map(r => r[i].length)));
  const pad = (s, w) => s + ' '.repeat(w - s.length);

  console.log(header.map((h, i) => pad(h, colWidths[i])).join('  '));
  console.log(colWidths.map(w => '-'.repeat(w)).join('  '));
  for (const r of rows) {
    console.log(r.map((c, i) => pad(c, colWidths[i])).join('  '));
  }
}

function main() {
  const summary = readJsonSummary();
  const { byModule, totals } = aggregateByModule(summary);
  printTable(byModule, totals);
}

main();


