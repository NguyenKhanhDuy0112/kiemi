import { AppSidebar } from '@renderer/components/app-sidebar';
import { CommandPalette } from '@renderer/components/command-palette';
import { Button } from '@renderer/components/ui/button';
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@renderer/components/ui/sidebar';
import { Skeleton } from '@renderer/components/ui/skeleton';
import { Toaster } from '@renderer/components/ui/sonner';
import { TooltipProvider } from '@renderer/components/ui/tooltip';
import { CurrentEnvironmentBadge } from '@renderer/features/environments/environment-badge';
import { WelcomeDialog } from '@renderer/features/onboarding/welcome-dialog';
import { ProtectedConfirmDialog } from '@renderer/features/run/confirm-protected';
import { TestsScreen } from '@renderer/features/tests/tests-screen';
import { UpdateNotice } from '@renderer/features/update/update-notice';
import { useT } from '@renderer/i18n/use-t';
import { applyReduceMotion } from '@renderer/lib/motion';
import { hideSplash } from '@renderer/lib/splash';
import { useAppStore, watchSystemTheme } from '@renderer/lib/store';
import { trpc } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery } from '@tanstack/react-query';
import { PanelRight } from 'lucide-react';
import { lazy, Suspense, useEffect } from 'react';

/** Secondary screens load on first use: less code to parse at start-up (N-05). */
const ElementsScreen = lazy(() =>
  import('@renderer/features/elements/elements-screen').then((m) => ({
    default: m.ElementsScreen,
  })),
);
const EnvironmentsScreen = lazy(() =>
  import('@renderer/features/environments/environments-screen').then((m) => ({
    default: m.EnvironmentsScreen,
  })),
);
const CoverageScreen = lazy(() =>
  import('@renderer/features/test-coverage/coverage-screen').then((m) => ({
    default: m.CoverageScreen,
  })),
);
const FormulasScreen = lazy(() =>
  import('@renderer/features/formulas/formulas-screen').then((m) => ({
    default: m.FormulasScreen,
  })),
);
const FormsScreen = lazy(() =>
  import('@renderer/features/forms/forms-screen').then((m) => ({ default: m.FormsScreen })),
);
const HistoryScreen = lazy(() =>
  import('@renderer/features/history/history-screen').then((m) => ({ default: m.HistoryScreen })),
);
const RunScreen = lazy(() =>
  import('@renderer/features/run/run-screen').then((m) => ({ default: m.RunScreen })),
);
const SettingsScreen = lazy(() =>
  import('@renderer/features/settings/settings-screen').then((m) => ({
    default: m.SettingsScreen,
  })),
);
/** Shown for the split second a screen's code loads (U-09). */
function ScreenSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4" aria-busy="true">
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-full max-w-xl" />
      <Skeleton className="h-4 w-full max-w-lg" />
    </div>
  );
}

/** App shell (U-01): sidebar · main area · detail panel (inside screens). */
export function App() {
  const tx = useTx();
  const { language, setLanguage } = useT();
  const info = useQuery(trpc.app.info.queryOptions());
  const settings = useQuery(trpc.system.settings.queryOptions());
  const view = useAppStore((s) => s.view);
  const openRunId = useAppStore((s) => s.openRunId);
  const projectId = useAppStore((s) => s.projectId);
  const setProject = useAppStore((s) => s.setProject);
  const toggleDetail = useAppStore((s) => s.toggleDetail);

  useEffect(() => watchSystemTheme(), []);
  const reduceMotion = settings.data?.reduceMotion;
  useEffect(() => {
    if (reduceMotion !== undefined) applyReduceMotion(reduceMotion);
  }, [reduceMotion]);
  // Launch splash [U-18]: gone as soon as settings are known; first launch waves hello first.
  const settingsReady = settings.isSuccess || settings.isError;
  const firstRun = settings.data ? !settings.data.onboardingDone : false;
  useEffect(() => {
    if (settingsReady) void hideSplash({ firstRun, hello: tx('ui.splash.hello') });
  }, [settingsReady, firstRun, tx]);
  // First load: the default project, and the saved language/theme (S-07).
  useEffect(() => {
    if (!projectId && info.data?.defaultProjectId) setProject(info.data.defaultProjectId);
  }, [info.data, projectId, setProject]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: apply stored settings only when they change, not on every language switch.
  useEffect(() => {
    if (!settings.data) return;
    useAppStore.getState().setThemeChoice(settings.data.theme);
    if (settings.data.language !== language) void setLanguage(settings.data.language);
  }, [settings.data?.theme, settings.data?.language]);

  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider className="h-screen">
        <AppSidebar />
        <SidebarInset className="flex min-h-0 flex-col">
          <div className="flex items-center gap-1 border-b px-2 py-1">
            <SidebarTrigger />
            <span className="text-sm font-medium">{tx(`ui.nav.${view}`)}</span>
            <span className="ml-auto" />
            {projectId && !openRunId && <CurrentEnvironmentBadge />}
            <UpdateNotice />
            <span data-testid="app-version" className="text-xs text-muted-foreground">
              {info.data ? tx('app.version', { version: info.data.version }) : tx('common.loading')}
            </span>
            {view === 'tests' && !openRunId && (
              <Button
                variant="ghost"
                size="icon"
                aria-label={tx('ui.nav.toggleDetail')}
                onClick={toggleDetail}
              >
                <PanelRight />
              </Button>
            )}
          </div>
          <Suspense fallback={<ScreenSkeleton />}>
            {projectId && openRunId ? (
              <main key={`run-${openRunId}`} className="screen-enter flex min-h-0 flex-1 flex-col">
                <RunScreen key={openRunId} runId={openRunId} />
              </main>
            ) : projectId ? (
              <main key={view} className="screen-enter flex min-h-0 flex-1 flex-col">
                {view === 'tests' && <TestsScreen />}
                {view === 'environments' && <EnvironmentsScreen />}
                {view === 'forms' && <FormsScreen />}
                {view === 'coverage' && <CoverageScreen />}
                {view === 'formulas' && <FormulasScreen />}
                {view === 'elements' && <ElementsScreen />}
                {view === 'settings' && <SettingsScreen />}
                {view === 'history' && <HistoryScreen />}
              </main>
            ) : null}
          </Suspense>
        </SidebarInset>
        <CommandPalette />
        <WelcomeDialog />
        <ProtectedConfirmDialog />
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  );
}
