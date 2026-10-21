'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { runUnifiedField, buildUnifiedFieldPlan } = require('./unified-field.cjs');
const { invokeWorkerProcess } = require('./worker-process.cjs');

const goal = process.argv[2];
const INFERENCE_URL = process.env.HF_UNIFIED_FIELD_INFERENCE_URL || 'http://127.0.0.1:11800';
const model = process.env.HF_UNIFIED_FIELD_MODEL || 'heavenzfire-qwen-0.5b';
const planOnly = process.argv.includes('--plan-only');
const maxParallelArg = process.argv.find((arg) => arg.startsWith('--max-parallel='));
const maxParallel = Number(maxParallelArg ? maxParallelArg.slice('--max-parallel='.length) : (process.env.HF_UNIFIED_FIELD_MAX_PARALLEL || 4));
const maxTokensArg = process.argv.find((arg) => arg.startsWith('--max-tokens='));
const maxTokens = Number(maxTokensArg ? maxTokensArg.slice('--max-tokens='.length) : (process.env.HF_UNIFIED_FIELD_MAX_TOKENS || 128));
if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 4) throw new RangeError('maxParallel must be an integer from 1 through 4');
if (!Number.isInteger(maxTokens) || maxTokens < 16 || maxTokens > 128) throw new RangeError('maxTokens must be an integer from 16 through 128');

async function invokeLocalRuntime(_adapterId, task) {
  return invokeWorkerProcess({
    workerPath: path.join(__dirname, 'local-model-worker.cjs'),
    input: {
      endpoint: INFERENCE_URL,
      model: task.model || model,
      prompt: task.prompt,
      maxTokens: Math.min(Number(task.numPredict) || maxTokens, maxTokens),
      temperature: 0.2,
      timeoutMs: task.timeoutMs || 90000
    },
    timeoutMs: Math.min(Number(task.timeoutMs) || 90000, 120000),
    maxOutputBytes: 1024 * 1024
  });
}

(async () => {
  if (!goal || !goal.trim()) throw new Error('Pass a non-empty goal argument.');
  const result = planOnly
    ? { ok: true, status: 'planned', executionStarted: false, plan: buildUnifiedFieldPlan(goal) }
    : await runUnifiedField({ goal, invokeAdapter: invokeLocalRuntime, model, maxParallel });
  const reportDir = path.join(__dirname, 'reports');
  const runsDir = path.join(reportDir, 'runs');
  fs.mkdirSync(runsDir, { recursive: true });
  const body = { schema: 'heavenzfire.unified-field-run-report.v1', generatedAt: new Date().toISOString(), model, maxParallel, maxTokens, result };
  const digest = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const report = { ...body, integrity: { algorithm: 'sha256', digest } };
  const runId = result.runId || result.envelopeId || crypto.randomUUID();
  const safeRunId = String(runId).replace(/[^a-zA-Z0-9-]/g, '');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapshotPath = path.join(runsDir, stamp + '-' + safeRunId + '.json');
  const latestPath = path.join(reportDir, 'latest-run.json');
  const serialized = JSON.stringify(report, null, 2);
  fs.writeFileSync(snapshotPath, serialized, { encoding: 'utf8', flag: 'wx' });
  fs.writeFileSync(latestPath, serialized, 'utf8');
  const stored = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const { integrity, ...storedBody } = stored;
  const verifiedDigest = crypto.createHash('sha256').update(JSON.stringify(storedBody)).digest('hex');
  if (!integrity || integrity.digest !== verifiedDigest) throw new Error('Persisted report integrity check failed');

  const workerResults = result.results
    ? ['architecture', 'implementation', 'security', 'verification', 'synthesis'].map((key) => result.results[key]).filter(Boolean)
    : [];
  const workerPids = workerResults.map((entry) => entry.workerPid).filter(Number.isInteger);
  process.stdout.write(JSON.stringify({
    ok: result.ok,
    status: result.status || 'planned',
    executionStarted: result.executionStarted,
    model,
    maxParallel,
    maxTokens,
    laneCount: result.plan.lanes.length,
    nodeCount: result.plan.decomposition.nodeCount,
    stageCount: result.trace ? result.trace.filter(e => e.type === 'stage.completed').length : 0,
    workerPids,
    uniqueWorkerPidCount: new Set(workerPids).size,
    safety: result.safety || null,
    qualityGate: result.qualityGate || null,
    integrity: { algorithm: 'sha256', verified: true, digest },
    snapshotPath,
    reportPath: latestPath
  }, null, 2) + '\n');
  if (result.ok === false) process.exitCode = 2;
})().catch((error) => {
  process.stderr.write(String(error && error.stack || error) + '\n');
  process.exitCode = 1;
});
