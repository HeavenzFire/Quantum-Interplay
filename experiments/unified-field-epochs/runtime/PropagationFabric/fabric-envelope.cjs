'use strict';

const { randomUUID } = require('node:crypto');

const ALLOWED_TYPES = new Set([
  'discovery', 'capability', 'heartbeat', 'task', 'result', 'ack', 'event'
]);
const MAX_PAYLOAD_BYTES = 256 * 1024;

function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function createEnvelope({ type, source, target = 'broadcast', payload, ttlMs = 60_000, correlationId = null }) {
  const now = Date.now();
  const envelope = {
    protocol: 'heavenzfire.fabric.v1',
    id: randomUUID(),
    type,
    source,
    target,
    createdAt: now,
    expiresAt: now + ttlMs,
    correlationId,
    payload
  };
  validateEnvelope(envelope);
  return Object.freeze(envelope);
}

function validateEnvelope(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    throw new TypeError('Envelope must be an object.');
  }
  if (message.protocol !== 'heavenzfire.fabric.v1') throw new Error('Unsupported protocol.');
  if (typeof message.id !== 'string' || !message.id) throw new Error('Envelope id is required.');
  if (!ALLOWED_TYPES.has(message.type)) throw new Error('Unsupported message type.');
  if (typeof message.source !== 'string' || !message.source) throw new Error('Source is required.');
  if (typeof message.target !== 'string' || !message.target) throw new Error('Target is required.');
  if (!Number.isFinite(message.createdAt) || !Number.isFinite(message.expiresAt)) {
    throw new Error('Valid timestamps are required.');
  }
  if (message.expiresAt <= message.createdAt) throw new Error('Expiry must follow creation time.');
  if (jsonByteLength(message.payload) > MAX_PAYLOAD_BYTES) throw new Error('Payload exceeds 256 KiB.');
  if (message.expiresAt <= Date.now()) throw new Error('Envelope has expired.');
  return true;
}

class TransportRegistry {
  constructor({ dedupeTtlMs = 5 * 60_000 } = {}) {
    this.transports = new Map();
    this.seen = new Map();
    this.dedupeTtlMs = dedupeTtlMs;
  }

  register({ name, send, supportsBroadcast = false, isAvailable = () => true }) {
    if (!name || typeof name !== 'string') throw new TypeError('Transport name is required.');
    if (typeof send !== 'function') throw new TypeError('Transport send function is required.');
    this.transports.set(name, { name, send, supportsBroadcast, isAvailable });
    return () => this.transports.delete(name);
  }

  pruneSeen(now = Date.now()) {
    for (const [id, expiry] of this.seen) {
      if (expiry <= now) this.seen.delete(id);
    }
  }

  async dispatch(message) {
    validateEnvelope(message);
    this.pruneSeen();
    if (this.seen.has(message.id)) {
      return { status: 'duplicate', messageId: message.id, deliveredBy: [] };
    }
    this.seen.set(message.id, Math.min(message.expiresAt, Date.now() + this.dedupeTtlMs));

    const candidates = [...this.transports.values()].filter((transport) => {
      if (!transport.isAvailable()) return false;
      if (message.target === 'broadcast' && !transport.supportsBroadcast) return false;
      return true;
    });

    const deliveredBy = [];
    const failures = [];
    for (const transport of candidates) {
      try {
        await transport.send(message);
        deliveredBy.push(transport.name);
      } catch (error) {
        failures.push({ transport: transport.name, error: String(error && error.message || error) });
      }
    }

    return {
      status: deliveredBy.length ? 'dispatched' : 'undelivered',
      messageId: message.id,
      deliveredBy,
      failures
    };
  }
}

module.exports = { createEnvelope, validateEnvelope, TransportRegistry, MAX_PAYLOAD_BYTES };
