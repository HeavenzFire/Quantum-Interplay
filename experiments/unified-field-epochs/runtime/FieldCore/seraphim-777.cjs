'use strict';

// Seraphim 777 is the shared observability contract for registered agent identities.
// It reports only evidence available from the registry and persisted 144A task records.
const EYES = Object.freeze([
  { id: 'identity', label: 'Identity and provenance' },
  { id: 'liveness', label: 'Runtime liveness' },
  { id: 'capability', label: 'Declared capability' },
  { id: 'task', label: 'Task assignment and state' },
  { id: 'safety', label: 'Safety and policy outcome' },
  { id: 'trace', label: 'Execution trace evidence' },
  { id: 'integrity', label: 'Report integrity evidence' }
]);

const LANE_BINDINGS = Object.freeze({
  architecture: { agentId: 'K003', agentName: 'Strategos' },
  implementation: { agentId: 'K016', agentName: 'Builder' },
  security: { agentId: 'K013', agentName: 'Guardian' },
  verification: { agentId: 'T007', agentName: 'Sun Tzu' },
  synthesis: { agentId: 'K006', agentName: 'Sentinel' }
});

function createSeraphimSnapshot({ registry, tasks = [], now = new Date().toISOString() }) {
  if (!registry || !Array.isArray(registry.agents)) throw new TypeError('A registry with an agents array is required');
  if (!Array.isArray(tasks)) throw new TypeError('tasks must be an array');
  const completedStages = new Map();
  const latestTaskByAgent = new Map();
  for (const task of tasks) {
    const run = task && task.fieldRun;
    const trace = run && Array.isArray(run.trace) ? run.trace : [];
    for (const event of trace) {
      if (event && event.type === 'stage.completed' && typeof event.stageId === 'string') {
        completedStages.set(event.stageId, { taskId: task.id || null, at: event.at || task.updated || null, status: task.status || 'unknown' });
      }
    }
    if (task && task.leadAgentId) {
      const previous = latestTaskByAgent.get(task.leadAgentId);
      if (!previous || String(task.updated || task.created || '').localeCompare(String(previous.updated || previous.created || '')) > 0) latestTaskByAgent.set(task.leadAgentId, task);
    }
  }

  const agents = registry.agents.map((agent) => {
    const bindings = Object.entries(LANE_BINDINGS).filter(([, binding]) => binding.agentId === agent.id).map(([lane]) => lane);
    const laneObservations = bindings.map(lane => ({ lane, ...(completedStages.get(lane) || {}) }));
    const task = latestTaskByAgent.get(agent.id) || null;
    const eyes = {
      identity: { status: agent.id && agent.name ? 'observed' : 'missing', evidence: 'registry' },
      liveness: { status: laneObservations.some(x => x.taskId) ? 'observed_execution' : 'not_verified', evidence: laneObservations.some(x => x.taskId) ? 'persisted_task_trace' : 'no_runtime_heartbeat' },
      capability: { status: Array.isArray(agent.capabilities) && agent.capabilities.length ? 'declared' : 'missing', evidence: 'registry_declaration_only' },
      task: { status: task ? String(task.status || 'unknown').toLowerCase() : bindings.length ? 'lane_bound_no_task_evidence' : 'unassigned', taskId: task ? task.id || null : null },
      safety: { status: laneObservations.some(x => x.taskId) ? 'see_execution_report' : 'not_observed', evidence: 'no_inferred_pass' },
      trace: { status: laneObservations.some(x => x.taskId) ? 'present' : 'none', lanes: laneObservations },
      integrity: { status: task && task.fieldRunReport && task.fieldRunReport.digest ? 'digest_recorded_not_reverified_here' : 'not_available', digest: task && task.fieldRunReport ? task.fieldRunReport.digest || null : null }
    };
    return {
      id: agent.id,
      name: agent.name,
      topology: agent.topology || 'unspecified',
      domain: agent.domain || 'unspecified',
      declaredRuntimeStatus: agent.runtimeStatus || 'unspecified',
      connectionState: bindings.length ? 'orchestrator_lane_bound' : 'registry_only_not_connected',
      boundLanes: bindings,
      eyes
    };
  });
  const boundIds = new Set(Object.values(LANE_BINDINGS).map(binding => binding.agentId));
  const observedCount = agents.filter(agent => agent.eyes.liveness.status === 'observed_execution').length;
  return {
    schema: 'heavenzfire.seraphim-777-observability.v1',
    generatedAt: now,
    program: 'Seraphim 777 Eyes',
    observationDimensions: EYES,
    observationDimensionCount: EYES.length,
    registryAgentCount: agents.length,
    laneBoundAgentCount: agents.filter(agent => boundIds.has(agent.id)).length,
    agentsWithPersistedExecutionEvidence: observedCount,
    note: 'Seven observable dimensions per registered identity. Registry membership or lane binding is not proof of a separate model, live process, hardware sensor, or external provider connection.',
    agents
  };
}

module.exports = { EYES, LANE_BINDINGS, createSeraphimSnapshot };
