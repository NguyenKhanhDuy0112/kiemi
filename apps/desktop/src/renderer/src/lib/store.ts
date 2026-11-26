import { create } from 'zustand';
import {
  loadPrefs,
  type ProjectPrefs,
  savePrefs,
  togglePinned,
  touchRecent,
} from './recent-projects';

export type View =
  | 'tests'
  | 'history'
  | 'environments'
  | 'forms'
  | 'coverage'
  | 'formulas'
  | 'manual'
  | 'plans'
  | 'permissions'
  | 'elements'
  | 'settings';
export type ThemeChoice = 'light' | 'dark' | 'system';

interface AppState {
  view: View;
  projectId: string | null;
  /** Test open in the editor (inside the Tests view). */
  openTestId: string | null;
  /** Run / result screen shown over the current view [S-03, S-04]. */
  openRunId: string | null;
  /** Right detail panel (U-01). */
  detailOpen: boolean;
  paletteOpen: boolean;
  /** Recent and pinned projects [O-08]. */
  projectPrefs: ProjectPrefs;
  /** Recording to start as soon as this test is open in the editor (onboarding, S-08). */
  pendingRecord: { testId: string; url: string } | null;
  themeChoice: ThemeChoice;
  /** Resolved theme actually shown. */
  theme: 'light' | 'dark';
  setView(view: View): void;
  setProject(id: string): void;
  openTest(id: string | null): void;
  openRun(id: string | null): void;
  toggleDetail(): void;
  setPaletteOpen(open: boolean): void;
  togglePinProject(id: string): void;
  setPendingRecord(p: { testId: string; url: string } | null): void;
  setThemeChoice(choice: ThemeChoice): void;
}

const prefersDark = () => globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches === true;
const resolve = (c: ThemeChoice): 'light' | 'dark' =>
  c === 'system' ? (prefersDark() ? 'dark' : 'light') : c;

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

export const useAppStore = create<AppState>((set, get) => ({
  view: 'tests',
  projectId: null,
  openTestId: null,
  openRunId: null,
  detailOpen: true,
  paletteOpen: false,
  projectPrefs: loadPrefs(),
  pendingRecord: null,
  themeChoice: 'system',
  theme: resolve('system'),
  setView: (view) => set({ view, openRunId: null }),
  setProject: (projectId) => {
    const projectPrefs = touchRecent(get().projectPrefs, projectId);
    savePrefs(projectPrefs);
    set({ projectId, openTestId: null, openRunId: null, projectPrefs });
  },
  togglePinProject: (id) => {
    const projectPrefs = togglePinned(get().projectPrefs, id);
    savePrefs(projectPrefs);
    set({ projectPrefs });
  },
  openTest: (openTestId) => set({ openTestId, view: 'tests', openRunId: null }),
  openRun: (openRunId) => set({ openRunId }),
  toggleDetail: () => set({ detailOpen: !get().detailOpen }),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setPendingRecord: (pendingRecord) => set({ pendingRecord }),
  setThemeChoice: (themeChoice) => {
    const theme = resolve(themeChoice);
    applyTheme(theme);
    set({ themeChoice, theme });
  },
}));

/** Follows the OS theme while the choice is "system" (U-11). */
export function watchSystemTheme(): () => void {
  const mq = globalThis.matchMedia?.('(prefers-color-scheme: dark)');
  if (!mq) return () => undefined;
  const onChange = () => {
    const s = useAppStore.getState();
    if (s.themeChoice === 'system') s.setThemeChoice('system');
  };
  mq.addEventListener('change', onChange);
  applyTheme(useAppStore.getState().theme);
  return () => mq.removeEventListener('change', onChange);
}
