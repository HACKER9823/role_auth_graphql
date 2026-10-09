import { GraphQLError } from 'graphql';

const MAX_FAILURES = 5;
const WINDOW_MS = 15 * 60 * 1000;
const failures = new Map();

export function assertNotLimited(key) {
  const e = failures.get(key);
  if (e && e.reset > Date.now() && e.count >= MAX_FAILURES) {
    throw new GraphQLError('Too many failed attempts, try again later', {
      extensions: { code: 'RATE_LIMITED', http: { status: 429 } },
    });
  }
}

export function recordFailure(key) {
  const now = Date.now();
  const e = failures.get(key);
  if (!e || e.reset < now) failures.set(key, { count: 1, reset: now + WINDOW_MS });
  else e.count += 1;
}

export function clearFailures(key) {
  failures.delete(key);
}

// Clean up old entries every minute.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of failures) if (v.reset < now) failures.delete(k);
}, 60_000).unref();