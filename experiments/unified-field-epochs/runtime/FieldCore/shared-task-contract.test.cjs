'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createTaskRecord, validateTaskRecord, transitionTask } = require('./shared-task-contract.cjs');

test('creates a proposed task with pending approval and stable correlation ID', () => {
  const task = createTaskRecord({ taskId: 'task-test-001', source: 'unified-field', goal: 'Verify the local integration' });
  assert.equal(task.taskId, 'task-test-001');
  assert.equal(task.status, 'proposed');
  assert.equal(task.approvalState, 'pending');
  assert.deepEqual(task.evidence, []);
  assert.equal(validateTaskRecord(task), true);
});

test('blocks execution until explicit approval', () => {
  const task = createTaskRecord({ source: 'rd-pipeline', goal: 'Run a read-only health check' });
  assert.throws(() => transitionTask(task, 'approved'), /explicit approvalState/);
  assert.throws(() => transitionTask(task, 'running'), /invalid task transition/);
  const approved = transitionTask(task, 'approved', { approvalState: 'approved', actor: 'user-confirmed' });
  const running = transitionTask(approved, 'running');
  assert.equal(running.status, 'running');
  assert.equal(running.approvalState, 'approved');
});

test('allows evidence-backed completion only after approved execution', () => {
  const proposed = createTaskRecord({ source: 'test', goal: 'Run a deterministic test' });
  const approved = transitionTask(proposed, 'approved', { approvalState: 'approved', actor: 'operator' });
  const running = transitionTask(approved, 'running');
  const complete = transitionTask(running, 'completed', {
    actor: 'test-runner',
    evidenceItem: { kind: 'test-result', summary: 'Node test suite passed', sourceUrl: null }
  });
  assert.equal(complete.status, 'completed');
  assert.equal(complete.evidence.length, 1);
  assert.equal(complete.evidence[0].kind, 'test-result');
});

test('rejects illegal transitions, malformed evidence, and unapproved execution states', () => {
  const task = createTaskRecord({ source: 'test', goal: 'Check state machine' });
  assert.throws(() => transitionTask(task, 'completed'), /invalid task transition/);
  assert.throws(() => validateTaskRecord({ ...task, status: 'completed' }), /requires explicit approval/);
  assert.throws(() => transitionTask(task, 'review_required', { evidenceItem: { kind: '', summary: 'missing kind' } }), /evidence.kind/);
  assert.throws(() => createTaskRecord({ source: 'test', goal: 'x'.repeat(12001) }), /exceeds/);
});
