# Unified Field — Epochs 1 and 2

Status: **two bounded local execution milestones verified**; overall system remains a research prototype.

## Epoch 1 — local role pipeline

- Existing local Ollama endpoint `127.0.0.1:11434`, model `llama3.2:1b`.
- Four registered engineering roles plus synthesis completed five stages.
- Quality gate checks for empty, refused, and truncated lane outputs and synthesis; synthesis-refusal false-positive was fixed and regression-tested.
- Independent verifier validated report SHA-256 and 12-event hash chain. See `evidence/epoch-0001-status.json`.

## Epoch 2 — distinct worker processes

- Live run ID: `9b3ea8b6-970c-4a9d-a584-fa3def5dddf9` at `2026-10-21T22:49:46.081Z`.
- Five separate Node child processes executed architecture, implementation, security, verification, and synthesis. Observed PIDs: `21308`, `36204`, `29392`, `34156`, `10428`; all exited with code 0 and were distinct.
- Model: `llama3.2:1b`; requests stayed on loopback; workers had a bounded timeout, 64 KiB input ceiling, and 1 MiB output ceiling.
- Quality gate passed with no refused or truncated outputs. Independent verifier validated report SHA-256 and the 12-event hash chain; digest `3e5a6e125dece117f1c3818ea788bae405c8ac822b1742905756ab7f79295f37`.
- Targeted regression suite: 21 passed, 0 failed, including worker PID uniqueness, malformed JSON, deadline termination, output-budget termination, synthesis refusal, secret redaction, and trace/report tampering.
- Machine-readable record: `evidence/epoch-0002-status.json`.

## Reproducible local command

From the complete local UnifiedField directory in Windows PowerShell 5.1:

```powershell
.\Invoke-UnifiedField.ps1 -Goal 'Coordinate local GitHub micro-sandboxes; define interfaces, acceptance checks, and next action.' -UseOllama -Model 'llama3.2:1b' -MaxParallel 1 -MaxTokens 64
node .\FieldCore\verify-report.cjs .\FieldCore\reports\latest-run.json
```

## Negative findings retained

1. Qwen 0.5B exceeded its context window with the initial prompt/aggregation design.
2. A 48-token budget truncated lane outputs.
3. A synthesis refusal exposed a quality-gate false positive. The gate now rejects synthesis refusals and the test suite reproduces the defect.
4. GitHub Actions exposed NumPy 2.5 compatibility breakage in Batch 9 (`np.trapz` was removed); switched to `scipy.integrate.trapezoid` and reran the experiment locally: 1,536/1,536 numerical checks passed. CI for the updated commit is being checked separately.

## Scope limits / next gates

- Five separate worker processes are now verified, but they run under the same Windows user and share one local model backend. They are **not OS-isolated security sandboxes**.
- No evidence yet of another ChatGPT instance participating.
- Lease fencing, durable queue/recovery, idempotent duplicate delivery, explicit filesystem capability boundaries, and cleanup/escape tests remain open.
- The 200-equation harness still reuses 16 family-level invariants across 200 IDs; it is not 200 formula-specific proofs.
