# Unified Field — Epoch 0/1 Local Runtime

This folder is the version-controlled, local-first runtime handoff for the HeavenzFire Unified Field research work. It uses the existing local inference endpoint; it does not install a service or expose a network port.

## Current execution contract

- Four engineering lanes: architecture, implementation, security, verification; followed by a synthesis join.
- Lane roles are orchestrated by the same local model backend in this build. They are not four independent model processes, and this is not proof of a separate ChatGPT instance participating.
- Model outputs are proposals. A deterministic quality gate rejects empty, refused, or truncated output; the report is persisted with a SHA-256 integrity digest and hash-chained stage trace.
- Prompt-injection-marked tasks are held for review. Synthetic secret redaction and approval-state behavior are unit tested.
- Micro-sandbox IDs are not OS isolation. Filesystem/network isolation needs a separately enforced process/container/VM boundary and evidence.

## Run locally

From the connected Windows machine, use PowerShell 5.1 and the complete local UnifiedField directory because its dependencies are maintained there:

```powershell
.\Invoke-UnifiedField.ps1 -Goal 'Define the next bounded Unified Field research milestone' -MaxParallel 1 -MaxTokens 128
```

The portable source and tests in `runtime/` preserve the implementation and its relative imports. This repository snapshot does not copy local generated run reports containing machine-specific paths.

## First epoch status

See `evidence/epoch-0001-status.json`. The first live attempt reached the four lane stages but failed at synthesis with a local-model context overflow; the quality gate correctly prevented a success claim. The deterministic targeted suite most recently passed 15/15 tests. A rerun with shorter prompts and a larger output budget is in progress; its result must be recorded separately before the epoch can be marked complete.

## Next gates

1. Complete a live synthesis without truncation/context overflow.
2. Add per-lane process identity if truly independent workers are required.
3. Run the full Unified Field suite and adversarial task/lease/idempotency cases.
4. Add formula-specific numerical or symbolic oracles to the 200-equation lab; family-level smoke checks are not proofs.
5. Open a PR for review; do not merge to `main` automatically.
