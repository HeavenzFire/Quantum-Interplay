'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { canonical, sha256 } = require('../BraidedPipeline/braided-pipeline.cjs');

function verifyReport(filePath) {
  const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const { integrity, ...body } = report;
  const digest = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const reportIntegrity = Boolean(integrity && integrity.algorithm === 'sha256' && integrity.digest === digest);
  const trace = report.result && Array.isArray(report.result.trace) ? report.result.trace : [];
  let previous = '0'.repeat(64);
  let traceValid = true;
  for (const event of trace) {
    const { hash, ...base } = event;
    if (event.previousHash !== previous || sha256(canonical(base)) !== hash) {
      traceValid = false;
      break;
    }
    previous = hash;
  }
  if (trace.length && report.result.traceHead !== previous) traceValid = false;
  return {
    ok: reportIntegrity && traceValid,
    reportIntegrity,
    traceValid: trace.length ? traceValid : null,
    traceEvents: trace.length,
    reportDigest: digest,
    file: path.resolve(filePath)
  };
}

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, 'reports', 'latest-run.json');
  const result = verifyReport(file);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 1;
}
module.exports = { verifyReport };
