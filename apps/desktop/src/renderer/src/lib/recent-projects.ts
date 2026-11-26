/** Recent and pinned projects for the quick switcher [O-08]. Kept per machine (localStorage). */
export interface ProjectPrefs {
  /** Most recent first. */
  recent: string[];
  pinned: string[];
}

const KEY = 'kiemi.projectPrefs';
const MAX_RECENT = 8;

export const emptyPrefs = (): ProjectPrefs => ({ recent: [], pinned: [] });

export function touchRecent(prefs: ProjectPrefs, id: string): ProjectPrefs {
  return { ...prefs, recent: [id, ...prefs.recent.filter((x) => x !== id)].slice(0, MAX_RECENT) };
}

export function togglePinned(prefs: ProjectPrefs, id: string): ProjectPrefs {
  return {
    ...prefs,
    pinned: prefs.pinned.includes(id)
      ? prefs.pinned.filter((x) => x !== id)
      : [...prefs.pinned, id],
  };
}

/** Pinned first (in pin order), then recent, then the rest by name. Unknown ids are dropped. */
export function orderProjects<T extends { id: string; name: string }>(
  projects: readonly T[],
  prefs: ProjectPrefs,
): T[] {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const out: T[] = [];
  const seen = new Set<string>();
  for (const id of [...prefs.pinned, ...prefs.recent]) {
    const p = byId.get(id);
    if (p && !seen.has(id)) {
      seen.add(id);
      out.push(p);
    }
  }
  const rest = projects.filter((p) => !seen.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  return [...out, ...rest];
}

export function loadPrefs(): ProjectPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ProjectPrefs> | null;
    const strings = (v: unknown) =>
      Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    return raw ? { recent: strings(raw.recent), pinned: strings(raw.pinned) } : emptyPrefs();
  } catch {
    return emptyPrefs();
  }
}

export function savePrefs(prefs: ProjectPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // Private mode or blocked storage: the switcher still works, it just forgets.
  }
}
