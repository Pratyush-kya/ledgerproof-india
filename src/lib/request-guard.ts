import "server-only";

type BudgetRecord = { count: number; resetAt: number };
type CacheRecord<T> = { value: T; expiresAt: number };

const budgets = new Map<string, BudgetRecord>();
const responseCache = new Map<string, CacheRecord<unknown>>();

export function requestClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("x-real-ip") || "anonymous").slice(0, 128);
}

export function consumeRequestBudget({
  namespace,
  clientKey,
  limit,
  windowMs,
}: {
  namespace: string;
  clientKey: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();
  const key = `${namespace}:${clientKey}`;
  const current = budgets.get(key);

  if (!current || current.resetAt <= now) {
    budgets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

export function getCachedResponse<T>(key: string): T | null {
  const current = responseCache.get(key);
  if (!current) {
    return null;
  }
  if (current.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }
  return structuredClone(current.value) as T;
}

export function setCachedResponse<T>(key: string, value: T, ttlMs: number) {
  responseCache.set(key, {
    value: structuredClone(value),
    expiresAt: Date.now() + ttlMs,
  });
}

export function resetRequestGuardsForTests() {
  budgets.clear();
  responseCache.clear();
}
