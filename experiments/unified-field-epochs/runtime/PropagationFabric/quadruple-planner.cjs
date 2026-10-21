'use strict';

const { randomUUID } = require('node:crypto');

const DEFAULT_POLICY = Object.freeze({
  maxDepth: 3,
  maxTotalNodes: 85,
  maxChildrenPerNode: 4,
  maxConcurrentWorkers: 8,
  maxRetries: 1
});

function buildQuadruplePlan({ rootTask, policy = {} }) {
  if (typeof rootTask !== 'string' || !rootTask.trim()) throw new TypeError('rootTask is required.');
  const limits = { ...DEFAULT_POLICY, ...policy };
  for (const key of Object.keys(DEFAULT_POLICY)) {
    if (!Number.isInteger(limits[key]) || limits[key] < 0) throw new RangeError(key + ' must be a non-negative integer.');
  }
  if (limits.maxChildrenPerNode > 4) throw new RangeError('This planner caps branching at four children per node.');
  if (limits.maxDepth > 5) throw new RangeError('Depth above five requires an explicit reviewed policy change.');
  if (limits.maxTotalNodes < 1) throw new RangeError('maxTotalNodes must be at least one.');

  const nodes = [{
    id: randomUUID(), parentId: null, depth: 0,
    kind: 'root', task: rootTask.trim(), status: 'planned'
  }];
  let frontier = [nodes[0]];

  for (let depth = 1; depth <= limits.maxDepth; depth += 1) {
    const next = [];
    for (const parent of frontier) {
      if (nodes.length >= limits.maxTotalNodes) break;
      const remaining = limits.maxTotalNodes - nodes.length;
      const count = Math.min(limits.maxChildrenPerNode, remaining);
      for (let i = 0; i < count; i += 1) {
        const node = {
          id: randomUUID(), parentId: parent.id, depth,
          kind: 'work-unit',
          task: 'Decompose and independently verify subtask ' + (i + 1) + ' for: ' + parent.task,
          status: 'planned'
        };
        nodes.push(node);
        next.push(node);
      }
    }
    frontier = next;
    if (!frontier.length) break;
  }

  return Object.freeze({
    schema: 'heavenzfire.quadruple-plan.v1',
    strategy: 'bounded-four-way-decomposition',
    executionStarted: false,
    policy: limits,
    nodeCount: nodes.length,
    nodes
  });
}

module.exports = { buildQuadruplePlan, DEFAULT_POLICY };
