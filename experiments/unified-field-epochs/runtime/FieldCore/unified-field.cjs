'use strict';

const { createEnvelope } = require('../PropagationFabric/fabric-envelope.cjs');
const { buildQuadruplePlan } = require('../PropagationFabric/quadruple-planner.cjs');
const { runBraidedPipeline } = require('../BraidedPipeline/braided-pipeline.cjs');
const { redactSensitive, detectPromptInjection } = require('../SovereigntyLab/src/sovereignty-lab.cjs');
const { LANE_BINDINGS } = require('./seraphim-777.cjs');
const { createTaskRecord } = require('./shared-task-contract.cjs');

const LANES = Object.freeze([
  { id: 'architecture', title: 'Architecture', instruction: 'Name the main boundary, dependency, and interface.' },
  { id: 'implementation', title: 'Implementation', instruction: 'Name one minimal change and one acceptance test.' },
  { id: 'security', title: 'Security', instruction: 'Name one trust boundary and one denial test.' },
  { id: 'verification', title: 'Verification', instruction: 'Name one falsifiable test and its pass condition.' }
]);

function validateGoal(goal) {
  if (typeof goal !== 'string' || !goal.trim()) throw new TypeError('goal must be a non-empty string');
  if (goal.length > 12000) throw new RangeError('goal exceeds 12000 characters');
  return goal.trim();
}

function isRefusal(text) {
  return /^(i can(?:not|'t) fulfill this request|i can(?:not|'t) help with (?:that|this request)|i'm sorry,? but i can(?:not|'t)|i can't assist with|i cannot assist with)/i.test(String(text || '').trim());
}

function buildUnifiedFieldPlan(goal, policy = {}) {
  const cleanGoal = validateGoal(goal);
  const decomposition = buildQuadruplePlan({
    rootTask: cleanGoal,
    policy: { maxDepth: 1, maxTotalNodes: 5, maxChildrenPerNode: 4, maxConcurrentWorkers: 4, maxRetries: 0, ...policy }
  });
  const taskRecord = createTaskRecord({
    source: 'unified-field',
    goal: cleanGoal,
    metadata: { planSchema: 'heavenzfire.unified-field-plan.v1', strategy: 'bounded-four-lane-braid' }
  });
  return {
    schema: 'heavenzfire.unified-field-plan.v1',
    strategy: 'bounded-four-lane-braid',
    executionStarted: false,
    goal: cleanGoal,
    taskRecord,
    lanes: LANES.map((lane) => ({ ...lane })),
    decomposition
  };
}

async function runUnifiedField({ goal, invokeAdapter, adapterId = 'ollama-local', model, maxParallel = 4, allowFlaggedInjection = false }) {
  const cleanGoal = validateGoal(goal);
  if (typeof invokeAdapter !== 'function') throw new TypeError('invokeAdapter function is required');
  if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 4) throw new RangeError('maxParallel must be 1..4');

  const redaction = redactSensitive(cleanGoal);
  const injection = detectPromptInjection(cleanGoal);
  const plan = buildUnifiedFieldPlan(redaction.text);
  const envelope = createEnvelope({
    type: 'task',
    source: 'heavenzfire-unified-field',
    target: 'local-orchestrator',
    payload: { goal: redaction.text, taskId: plan.taskRecord.taskId, laneIds: LANES.map((lane) => lane.id), policy: 'bounded-four-lane-braid' },
    ttlMs: 5 * 60 * 1000
  });
  const safety = {
    policy: 'hf-sovereignty-heuristic-v1',
    redactionFindings: redaction.findings,
    promptInjection: injection,
    reviewRequired: injection.flagged && allowFlaggedInjection !== true
  };
  if (safety.reviewRequired) {
    return { ok: false, status: 'review_required', executionStarted: false, plan, envelopeId: envelope.id, safety };
  }

  const stages = LANES.map((lane) => ({
    id: lane.id,
    handler: lane.id,
    agent: LANE_BINDINGS[lane.id],
    after: [],
    prompt: 'HF lane=' + lane.title + '. ' + lane.instruction +
      '\nAnswer in one sentence, maximum 18 words. No preamble. Goal: ' + redaction.text
  }));
  stages.push({
    id: 'synthesis',
    handler: 'synthesis',
    agent: LANE_BINDINGS.synthesis,
    after: LANES.map((lane) => lane.id),
    includeDependencies: true,
    prompt: 'Write one concise action sentence based on the four notes below. Maximum 30 words; include the next test and mark any unverified claim.'
  });

  const handlers = {};
  for (const stage of stages) {
    handlers[stage.id] = async ({ dependencies }) => {
      let prompt = stage.prompt;
      if (stage.includeDependencies) {
        const compactDependencies = Object.entries(dependencies).map(([key, value]) => JSON.stringify({
          lane: key,
          response: String(value && value.response || '').slice(0, 90),
          finishReason: value && value.finishReason || 'unknown'
        }));
        prompt += '\nNotes:\n' + compactDependencies.join('\n');
      }
      const output = await invokeAdapter(adapterId, { prompt, model, timeoutMs: 90000 });
      return { ...output, agent: stage.agent, lane: stage.id };
    };
  }

  const result = await runBraidedPipeline({
    stages,
    handlers,
    input: { goal: redaction.text, taskId: plan.taskRecord.taskId, envelopeId: envelope.id },
    maxParallel
  });
  const rejectedLanes = LANES.filter((lane) => {
    const laneResult = result.results && result.results[lane.id];
    const text = String(laneResult && laneResult.response || '').trim();
    return !text || isRefusal(text) || (laneResult && laneResult.finishReason === 'length');
  }).map((lane) => lane.id);
  const truncatedLanes = LANES.filter((lane) => result.results && result.results[lane.id] && result.results[lane.id].finishReason === 'length').map((lane) => lane.id);
  const synthesisResult = result.results && result.results.synthesis;
  const synthesisText = String(synthesisResult && synthesisResult.response || '').trim();
  const synthesisTruncated = Boolean(synthesisResult && synthesisResult.finishReason === 'length');
  const synthesisRefusal = isRefusal(synthesisText);
  const synthesisRejected = !synthesisText || synthesisRefusal || synthesisTruncated;
  const qualityGate = {
    passed: result.ok && rejectedLanes.length === 0 && !synthesisRejected,
    rejectedLanes,
    truncatedLanes,
    synthesisRejected,
    synthesisRefusal,
    synthesisTruncated,
    policy: 'all-four-lanes-and-synthesis-must-return-usable-non-refusal-untruncated-output'
  };
  const pipelineOk = result.ok;
  const ok = pipelineOk && qualityGate.passed;
  return { ...result, ok, pipelineOk, status: !pipelineOk ? 'failed' : qualityGate.passed ? 'completed' : 'review_required', qualityGate, executionStarted: true, plan, envelopeId: envelope.id, safety };
}

module.exports = { LANES, validateGoal, isRefusal, buildUnifiedFieldPlan, runUnifiedField };
