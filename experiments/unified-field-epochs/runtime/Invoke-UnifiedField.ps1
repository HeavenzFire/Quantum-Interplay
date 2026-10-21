param(
  [Parameter(Mandatory=$true, Position=0)]
  [ValidateNotNullOrEmpty()]
  [string]$Goal,
  [switch]$PlanOnly,
  [switch]$UseOllama,
  [ValidateSet('heavenzfire-qwen-0.5b','qwen2.5:0.5b','heavenzfire-runtime:latest','heavenzfire:latest','llama3.2:1b')]
  [string]$Model = 'heavenzfire-qwen-0.5b',
  [ValidateRange(1,4)]
  [int]$MaxParallel = 1,
  [ValidateRange(16,128)]
  [int]$MaxTokens = 128
)
$ErrorActionPreference = 'Stop'
$runner = Join-Path $PSScriptRoot 'FieldCore\run-unified-field.cjs'
if (-not (Test-Path -LiteralPath $runner)) { throw "Unified Field runner not found: $runner" }
if ($UseOllama) {
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:11434/api/tags' -TimeoutSec 4
  $available = @($health.models | ForEach-Object { $_.name })
  if ($available -notcontains $Model) { throw "Requested Ollama model is not installed: $Model" }
  $env:HF_UNIFIED_FIELD_INFERENCE_URL = 'http://127.0.0.1:11434'
} else {
  if ($Model -ne 'heavenzfire-qwen-0.5b') { throw 'The primary local runtime exposes only heavenzfire-qwen-0.5b. Use -UseOllama explicitly for legacy Ollama models.' }
  $health = Invoke-RestMethod -Uri 'http://127.0.0.1:11801/v1/models' -TimeoutSec 4
  $available = @($health.data | ForEach-Object { $_.id })
  if ($available -notcontains $Model) { throw "Primary local model is not available: $Model" }
  $env:HF_UNIFIED_FIELD_INFERENCE_URL = 'http://127.0.0.1:11800'
}
$env:HF_UNIFIED_FIELD_MODEL = $Model
$env:HF_UNIFIED_FIELD_MAX_PARALLEL = [string]$MaxParallel
$env:HF_UNIFIED_FIELD_MAX_TOKENS = [string]$MaxTokens
$args = @($runner, $Goal, "--max-parallel=$MaxParallel", "--max-tokens=$MaxTokens")
if ($PlanOnly) { $args += '--plan-only' }
& node @args
if ($LASTEXITCODE -eq 1) { throw 'Unified Field runner encountered an execution error.' }
if ($LASTEXITCODE -eq 2) { Write-Warning 'Unified Field completed its pipeline but the quality gate requires human review; the report was saved.' }
