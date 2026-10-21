'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { invokeWorkerProcess } = require('./worker-process.cjs');

const fixture = path.join(__dirname, 'worker-process-fixture.cjs');

test('launches distinct worker processes and records PID and exit code', async () => {
  const results = await Promise.all([1, 2, 3, 4].map((value) =>
    invokeWorkerProcess({ workerPath: fixture, input: { value }, timeoutMs: 2000 })
  ));
  assert.deepEqual(results.map(x => x.value).sort(), [1, 2, 3, 4]);
  assert.ok(results.every(x => Number.isInteger(x.workerPid) && x.workerExitCode === 0));
  assert.equal(new Set(results.map(x => x.workerPid)).size, 4);
  assert.ok(results.every(x => x.pid === x.workerPid));
});

test('rejects malformed worker JSON', async () => {
  await assert.rejects(
    invokeWorkerProcess({ workerPath: fixture, input: { mode: 'malformed' }, timeoutMs: 2000 }),
    /malformed JSON/
  );
});

test('terminates a worker that exceeds its deadline', async () => {
  await assert.rejects(
    invokeWorkerProcess({ workerPath: fixture, input: { mode: 'delay' }, timeoutMs: 50 }),
    /timed out/
  );
});

test('terminates workers that exceed the output budget', async () => {
  await assert.rejects(
    invokeWorkerProcess({ workerPath: fixture, input: { mode: 'large' }, timeoutMs: 2000, maxOutputBytes: 256 }),
    /output exceeded/
  );
});

test('validates worker inputs and execution bounds', () => {
  assert.throws(() => invokeWorkerProcess({ workerPath: '', input: {} }), /workerPath/);
  assert.throws(() => invokeWorkerProcess({ workerPath: fixture, input: [] }), /input/);
  assert.throws(() => invokeWorkerProcess({ workerPath: fixture, input: {}, timeoutMs: 0 }), /timeoutMs/);
  assert.throws(() => invokeWorkerProcess({ workerPath: fixture, input: {}, maxOutputBytes: 10 }), /maxOutputBytes/);
});
