'use strict';

const MAX_INPUT_BYTES = 64 * 1024;

async function main() {
  let raw = '';
  for await (const chunk of process.stdin) {
    raw += chunk;
    if (Buffer.byteLength(raw, 'utf8') > MAX_INPUT_BYTES) throw new Error('Worker input exceeded 64 KiB');
  }
  const input = JSON.parse(raw);
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Worker input must be an object');
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 12000) throw new TypeError('prompt must be 1..12000 characters');
  if (typeof input.model !== 'string' || !input.model.trim() || input.model.length > 128) throw new TypeError('model is required');
  if (!Number.isInteger(input.maxTokens) || input.maxTokens < 16 || input.maxTokens > 128) throw new RangeError('maxTokens must be 16..128');
  const endpoint = new URL(input.endpoint);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)) throw new Error('Inference endpoint must be loopback-only');
  if (!['http:', 'https:'].includes(endpoint.protocol)) throw new Error('Unsupported inference protocol');
  const started = Date.now();
  const response = await fetch(endpoint.origin + '/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: input.model,
      messages: [{ role: 'user', content: input.prompt }],
      stream: false,
      max_tokens: input.maxTokens,
      temperature: Number.isFinite(input.temperature) ? input.temperature : 0.2
    }),
    signal: AbortSignal.timeout(Math.min(Number(input.timeoutMs) || 90000, 120000))
  });
  const data = await response.json().catch(() => ({}));
  const choice = data.choices && data.choices[0];
  const output = choice && choice.message && choice.message.content;
  if (!response.ok) {
    const detail = data.error && typeof data.error.message === 'string' ? data.error.message : data.error ? JSON.stringify(data.error) : 'no provider error detail';
    throw new Error('Local inference HTTP ' + response.status + ': ' + String(detail).slice(0, 500));
  }
  if (typeof output !== 'string' || !output.trim()) throw new Error('Local inference returned no text');
  process.stdout.write(JSON.stringify({
    adapter: 'unified-local-runtime',
    model: data.model || input.model,
    response: output,
    finishReason: choice.finish_reason || 'unknown',
    durationMs: Date.now() - started
  }));
}

main().catch((error) => {
  process.stderr.write(String(error && error.stack || error).slice(0, 4000));
  process.exitCode = 1;
});
