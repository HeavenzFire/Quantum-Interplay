'use strict';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { raw += chunk; });
process.stdin.on('end', () => {
  let input;
  try { input = JSON.parse(raw); } catch { process.stderr.write('bad input'); process.exitCode = 2; return; }
  if (input.mode === 'malformed') { process.stdout.write('{not-json'); return; }
  if (input.mode === 'large') { process.stdout.write('x'.repeat(10000)); return; }
  if (input.mode === 'delay') { setTimeout(() => process.stdout.write(JSON.stringify({ done: true })), 5000); return; }
  process.stdout.write(JSON.stringify({ value: input.value, pid: process.pid }));
});
