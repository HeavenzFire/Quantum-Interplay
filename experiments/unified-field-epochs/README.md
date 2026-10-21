# Unified Field — Epoch 1

Status: **first bounded local execution verified**; overall system remains a research prototype.

## What ran

- Local Windows machine: existing Ollama endpoint `127.0.0.1:11434`.
- Model: `llama3.2:1b`.
- Four registered role lanes: architecture (K003 Strategos), implementation (K016 Builder), security (K013 Guardian), verification (T007 Sun Tzu), followed by synthesis (K006 Sentinel).
- Execution was sequential (`maxParallel=1`) to avoid overloading the single local inference backend. These are role bindings using one shared model backend, **not four independent model processes**.
- All five stages completed with non-empty, non-refusal, untruncated outputs; the quality gate passed after a regression fix added synthesis-refusal detection.
- Independent verifier passed report SHA-256 and hash-chained trace checks: 12 trace events, digest `635de55831ee0422226f6ff7bd8cb3ccf7556d2f2eda52f722500e01c71b969c`.
- Targeted deterministic suite: 16 passed, 0 failed, including secret-redaction, prompt-injection hold, task approval-state, report-tamper, trace-tamper, truncation, and synthesis-refusal cases.

## Reproducible local command

From the complete local UnifiedField directory in Windows PowerShell 5.1:

```powershell
.\Invoke-UnifiedField.ps1 -Goal 'Coordinate local GitHub micro-sandboxes; define interfaces, acceptance checks, and next action.' -UseOllama -Model 'llama3.2:1b' -MaxParallel 1 -MaxTokens 64
```

The script writes a per-run snapshot and `FieldCore\reports\latest-run.json`; then verify it with:

```powershell
node .\FieldCore\verify-report.cjs .\FieldCore\reports\latest-run.json
```

## Negative findings retained

1. The Qwen 0.5B endpoint exceeded its context window when the initial prompt/aggregation design was used.
2. A 48-token budget truncated the lane outputs.
3. An initial synthesis response was a refusal, while the prior quality gate only checked for empty/truncated synthesis and incorrectly accepted it. This was a real false positive. The gate now explicitly rejects synthesis refusals; a regression test reproduces and prevents the defect.

See `evidence/epoch-0001-status.json` for machine-readable evidence. The report file is not copied into this public repository because it contains machine-specific absolute paths.

## Scope limits / next gates

- This verifies a bounded local multi-role pipeline, not autonomous participation by another ChatGPT instance.
- Logical micro-sandbox IDs are not OS isolation. Separate process/container/VM boundaries, capability enforcement, lease fencing, durable recovery, and cleanup evidence remain open.
- The 200-equation experiment still has 16 family-level invariants reused across 200 IDs; it is not 200 formula-specific proofs.
- Next: add independent worker-process execution and persist process identity, then test lease/idempotency/crash recovery, and add formula-specific equation oracles.
