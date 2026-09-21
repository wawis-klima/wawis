export function getOrCreateRefreshPayloadRequest(registry, key, requestId, requestFactory) {
  const existing = registry.get(key);
  if (existing) return existing;
  let entry = null;
  const request = Promise.resolve().then(requestFactory).finally(() => {
    if (registry.get(key) === entry) registry.delete(key);
  });
  entry = { request, requestId };
  registry.set(key, entry);
  return entry;
}

export function persistedSnapshotCoversCursor(snapshot, nextCursor) {
  return Number(snapshot?.change_cursor || 0) >= Number(nextCursor || 0);
}
