const issuerAliases = {
  KALA: ['کالا', 'kala'], NAN: ['نان', 'nan'], FMLI: ['فملی', 'fmli'],
  SHASTA: ['شستا', 'shasta'], BMLT: ['وبملت', 'bmlt'], FOOLAD: ['فولاد', 'foolad'],
  KHODRO: ['خودرو', 'khodro'], NOURI: ['نوری', 'nouri'], DABID: ['دعبید', 'dabid'],
  AKHABER: ['اخابر', 'akhaber'],
};

export function runIdempotentLegacyMigration(storage?: Storage): void {
  try {
    const target = storage ?? localStorage;
    if (target.getItem('migration_v1_to_v2_done') === 'true') return;
    for (const [issuer, aliases] of Object.entries(issuerAliases)) {
      for (const [oldSuffix, newSuffix] of [
        ['interpretive_notes_v11', 'user_notes_v2'],
        ['fundamental_data_v11', 'user_overrides_v2'],
      ]) {
        const key = `ISS_${issuer}_${newSuffix}`;
        if (target.getItem(key) !== null) continue;
        for (const alias of aliases) {
          const value = target.getItem(`${alias}_${oldSuffix}`);
          if (value === null) continue;
          try { JSON.parse(value); } catch { continue; }
          target.setItem(key, value);
          break;
        }
      }
    }
    target.setItem('migration_v1_to_v2_done', 'true');
  } catch {
    // A blocked or full storage can retry next time without overwriting completed copies.
  }
}

export function readUserStorage<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    return value === null ? undefined : JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}
