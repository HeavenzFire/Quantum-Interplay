'use strict';

const { spawn } = require('node:child_process');

function invokeWorkerProcess({ workerPath, input, timeoutMs = 90000, maxOutputBytes = 1024 * 1024 }) {
  if (typeof workerPath !== 'string' || !workerPath.trim()) throw new TypeError('workerPath is required');
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('input must be an object');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new RangeError('timeoutMs must be 1..120000');
  if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 128 || maxOutputBytes > 8 * 1024 * 1024) throw new RangeError('maxOutputBytes must be 128..8388608');

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [workerPath], {
      shell: false,
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env }
    });
    let stdout = '';
    let stderr = '';
    let bytes = 0;
    let settled = false;
    let timedOut = false;
    let oversized = false;
    const finishError = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
      finishError(new Error('Worker timed out after ' + timeoutMs + ' ms'));
    }, timeoutMs);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      bytes += Buffer.byteLength(chunk, 'utf8');
      if (bytes > maxOutputBytes) {
        oversized = true;
        child.kill();
        finishError(new Error('Worker output exceeded ' + maxOutputBytes + ' bytes'));
        return;
      }
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 4096) stderr += chunk.slice(0, 4096 - stderr.length);
    });
    child.on('error', (error) => finishError(new Error('Worker spawn failed: ' + error.message)));
    child.on('close', (code) => {
      if (settled) return;
      clearTimeout(timer);
      if (timedOut) return finishError(new Error('Worker timed out'));
      if (oversized) return finishError(new Error('Worker output exceeded limit'));
      if (code !== 0) return finishError(new Error('Worker exited with code ' + code + ': ' + stderr.trim().slice(0, 1000)));
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch {
        return finishError(new Error('Worker returned malformed JSON'));
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return finishError(new Error('Worker response must be a JSON object'));
      }
      settled = true;
      resolve({
        ...parsed,
        workerPid: child.pid,
        workerExitCode: code,
        workerDurationMs: Date.now() - started
      });
    });
    child.stdin.on('error', (error) => finishError(new Error('Worker stdin failed: ' + error.message)));
    child.stdin.end(JSON.stringify(input));
  });
}

module.exports = { invokeWorkerProcess };
