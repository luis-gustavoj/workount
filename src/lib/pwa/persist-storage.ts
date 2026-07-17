export type PersistableStorage = {
  persist: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
};

export type PersistStorageIfInstalledInput = {
  isStandalone: boolean;
  storage: PersistableStorage | undefined;
};

/**
 * ADR-0001's one accepted risk: IndexedDB is evictable under storage
 * pressure, mitigated by requesting persistent storage once installed. Only
 * fires in standalone mode — asking a browser tab is pointless noise, and
 * skips the request entirely if the browser already granted it.
 */
export async function persistStorageIfInstalled({
  isStandalone,
  storage,
}: PersistStorageIfInstalledInput): Promise<boolean> {
  if (!isStandalone || !storage) return false;
  if (storage.persisted && (await storage.persisted())) return true;
  return storage.persist();
}
