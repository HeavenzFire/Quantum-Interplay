'use strict';

const { randomUUID } = require('node:crypto');

const SCHEMA = 'heavenzfire.shared-task.v1';
const STATUSES = new Set(['proposed', 'approved', 'running', 'completed', 'failed', 'review_required', 'rejected']);
const TRANSITIONS = Object.freeze({
  proposed: new Set(['approved', 'rejected', 'review_required']),
  approved: new Set(['running', 'rejected', 'review_required']),
  running: new Set(['completed', 'failed', 'review_required']),
  review_required: new Set(['approved', 'rejected']),
  completed: new Set(),
  failed: new Set(),
  rejected: new Set()
});

function boundedText(value, field, max = 4000) {
  if (typeof value !== 'string' || !value.trim()) throw new TypeError(field + ' must be a non-empty string');
  if (value.length > max) throw new RangeError(field + ' exceeds ' + max + ' characters');
  return value.trim();
}

function createTaskRecord({ taskId = randomUUID(), source, goal, metadata = {} }) {
  const record = {
    schema: SCHEMA,
    taskId: boundedText(taskId, 'taskId', 128),
    source: boundedText(source, 'source', 128),
    goal: boundedText(goal, 'goal', 12000),
    status: 'proposed',
    approvalState: 'pending',
    evidence: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    metadata: metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {}
  };
  validateTaskRecord(record);
  return record;
}

function validateTaskRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) throw new TypeError('task record must be an object');
  if (record.schema !== SCHEMA) throw new Error('unsupported task schema');
  boundedText(record.taskId, 'taskId', 128);
  boundedText(record.source, 'source', 128);
  boundedText(record.goal, 'goal', 12000);
  if (!STATUSES.has(record.status)) throw new Error('unsupported task status');
  if (!['pending', 'approved', 'rejected'].includes(record.approvalState)) throw new Error('unsupported approval state');
  if (!Array.isArray(record.evidence)) throw new Error('evidence must be an array');
  for (const item of record.evidence) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('evidence items must be objects');
    boundedText(item.kind, 'evidence.kind', 80);
    boundedText(item.summary, 'evidence.summary', 2000);
    if (item.sourceUrl != null && (typeof item.sourceUrl !== 'string' || item.sourceUrl.length > 1000)) throw new Error('invalid evidence sourceUrl');
  }
  if (record.status === 'approved' || record.status === 'running' || record.status === 'completed') {
    if (record.approvalState !== 'approved') throw new Error('execution status requires explicit approval state');
  }
  return true;
}

function transitionTask(record, nextStatus, { approvalState, evidenceItem, actor = 'system' } = {}) {
  validateTaskRecord(record);
  if (!STATUSES.has(nextStatus)) throw new Error('unsupported task status');
  if (!TRANSITIONS[record.status].has(nextStatus)) throw new Error('invalid task transition: ' + record.status + ' -> ' + nextStatus);
  if (nextStatus === 'approved' && approvalState !== 'approved') throw new Error('explicit approvalState=approved is required');
  if (nextStatus === 'rejected' && record.status === 'proposed' && approvalState !== 'rejected') throw new Error('explicit rejection is required');
  const updated = {
    ...record,
    status: nextStatus,
    approvalState: nextStatus === 'approved' || nextStatus === 'running' || nextStatus === 'completed'
      ? 'approved'
      : nextStatus === 'rejected' ? 'rejected' : record.approvalState,
    updatedAt: new Date().toISOString(),
    evidence: record.evidence.slice()
  };
  if (evidenceItem) updated.evidence.push({
    kind: boundedText(evidenceItem.kind, 'evidence.kind', 80),
    summary: boundedText(evidenceItem.summary, 'evidence.summary', 2000),
    sourceUrl: evidenceItem.sourceUrl == null ? null : String(evidenceItem.sourceUrl).slice(0, 1000),
    observedAt: new Date().toISOString(),
    actor: boundedText(actor, 'actor', 128)
  });
  validateTaskRecord(updated);
  return updated;
}

module.exports = { SCHEMA, STATUSES, createTaskRecord, validateTaskRecord, transitionTask };
