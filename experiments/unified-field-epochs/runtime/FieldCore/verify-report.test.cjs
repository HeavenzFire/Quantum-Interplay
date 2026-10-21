'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verifyReport } = require('./verify-report.cjs');
const { canonical, sha256 } = require('../BraidedPipeline/braided-pipeline.cjs');

test('verifies report integrity and hash-chained trace', () => {
  const base = { schema: 'test', result: { trace: [], traceHead: null } };
  const digest = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');
  const report = { ...base, integrity: { algorithm: 'sha256', digest } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-field-'));
  const file = path.join(dir, 'report.json');
  try {
    fs.writeFileSync(file, JSON.stringify(report), 'utf8');
    const result = verifyReport(file);
    assert.equal(result.ok, true);
    assert.equal(result.reportIntegrity, true);
    assert.equal(result.traceValid, null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('rejects tampered report content', () => {
  const base = { schema: 'test', result: { trace: [], traceHead: null } };
  const digest = crypto.createHash('sha256').update(JSON.stringify(base)).digest('hex');
  const report = { ...base, integrity: { algorithm: 'sha256', digest } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-field-'));
  const file = path.join(dir, 'report.json');
  try {
    report.schema = 'tampered';
    fs.writeFileSync(file, JSON.stringify(report), 'utf8');
    assert.equal(verifyReport(file).ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('detects trace-chain modification', () => {
  const base = { seq: 1, at: '2026-01-01T00:00:00.000Z', runId: 'test', type: 'pipeline.started', stageId: null, previousHash: '0'.repeat(64), detail: {} };
  const event = { ...base, hash: sha256(canonical(base)) };
  const body = { schema: 'test', result: { trace: [event], traceHead: event.hash } };
  const digest = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const report = { ...body, integrity: { algorithm: 'sha256', digest } };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hf-field-'));
  const file = path.join(dir, 'report.json');
  try {
    report.result.trace[0].detail = { altered: true };
    fs.writeFileSync(file, JSON.stringify(report), 'utf8');
    const result = verifyReport(file);
    assert.equal(result.reportIntegrity, false);
    assert.equal(result.traceValid, false);
    assert.equal(result.ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
