export function nextVersion(existingVersions: Array<{ version?: number }>) {
  return Math.max(0, ...existingVersions.map((item) => item.version ?? 0)) + 1;
}

export function markOldVersionsInactive<T extends { is_latest?: boolean; status?: string }>(items: T[]) {
  return items.map((item) => ({ ...item, is_latest: false, status: "inactive" }));
}
