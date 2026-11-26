import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@renderer/components/ui/command';
import { orderProjects } from '@renderer/lib/recent-projects';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Crosshair,
  FilePlus2,
  FileText,
  FolderKanban,
  FolderPlus,
  Globe,
  Layers,
  Moon,
  Settings,
} from 'lucide-react';
import { useEffect } from 'react';

/** Ctrl/⌘ K: find a test, create one, jump to a screen (U-10). */
export function CommandPalette() {
  const tx = useTx();
  const qc = useQueryClient();
  const open = useAppStore((s) => s.paletteOpen);
  const setOpen = useAppStore((s) => s.setPaletteOpen);
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const openTest = useAppStore((s) => s.openTest);
  const setView = useAppStore((s) => s.setView);
  const theme = useAppStore((s) => s.theme);
  const setThemeChoice = useAppStore((s) => s.setThemeChoice);
  const setProject = useAppStore((s) => s.setProject);
  const prefs = useAppStore((s) => s.projectPrefs);
  // Names of the whole workspace, filtered as you type [O-08].
  const index = useQuery({ ...trpc.search.index.queryOptions(), enabled: open }).data;
  const projects = orderProjects(index?.projects ?? [], prefs);
  const other = (pid: string | null) => (pid && pid !== projectId ? pid : null);
  const where = (name: string | null) => (name ? <CommandShortcut>{name}</CommandShortcut> : null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(!useAppStore.getState().paletteOpen);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  const go = (fn: () => void | Promise<void>) => {
    setOpen(false);
    void fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={tx('ui.palette.hint')}
      description={tx('ui.palette.placeholder')}
    >
      <CommandInput placeholder={tx('ui.palette.placeholder')} />
      <CommandList>
        <CommandEmpty>{tx('ui.palette.empty')}</CommandEmpty>
        <CommandGroup heading={tx('ui.palette.commands')}>
          <CommandItem
            onSelect={() =>
              go(async () => {
                const t = await trpcClient.testCases.create.mutate({
                  projectId,
                  name: tx('ui.tree.defaultTestName'),
                });
                await qc.invalidateQueries({ queryKey: trpc.testCases.list.queryKey() });
                openTest(t.id);
              })
            }
          >
            <FilePlus2 /> {tx('ui.palette.newTest')}
          </CommandItem>
          <CommandItem
            onSelect={() =>
              go(async () => {
                await trpcClient.folders.create.mutate({
                  projectId,
                  name: tx('ui.tree.defaultFolderName'),
                });
                await qc.invalidateQueries({ queryKey: trpc.folders.list.queryKey({ projectId }) });
                setView('tests');
              })
            }
          >
            <FolderPlus /> {tx('ui.palette.newFolder')}
          </CommandItem>
          <CommandItem onSelect={() => go(() => setView('environments'))}>
            <Globe /> {tx('ui.palette.goEnvironments')}
          </CommandItem>
          <CommandItem onSelect={() => go(() => setView('settings'))}>
            <Settings /> {tx('ui.palette.goSettings')}
          </CommandItem>
          <CommandItem
            onSelect={() => go(() => setThemeChoice(theme === 'dark' ? 'light' : 'dark'))}
          >
            <Moon /> {tx('ui.palette.toggleTheme')}
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading={tx('ui.palette.projects')}>
          {projects.map((p) => (
            <CommandItem
              key={p.id}
              value={`${tx('ui.palette.project')} ${p.name} ${p.id}`}
              onSelect={() => go(() => setProject(p.id))}
            >
              <FolderKanban /> {p.name}
              {p.id === projectId && <CommandShortcut>{tx('ui.palette.current')}</CommandShortcut>}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={tx('ui.palette.tests')}>
          {(index?.tests ?? []).map((t) => (
            <CommandItem
              key={t.id}
              value={`${t.name} ${t.tags.join(' ')} ${t.projectName} ${t.id}`}
              onSelect={() =>
                go(() => {
                  if (other(t.projectId)) setProject(t.projectId);
                  openTest(t.id);
                })
              }
            >
              <FileText /> {t.name}
              {where(other(t.projectId) ? t.projectName : null)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={tx('ui.palette.elements')}>
          {(index?.elements ?? []).map((e) => (
            <CommandItem
              key={e.id}
              value={`${tx('ui.palette.element')} ${e.name} ${e.projectName} ${e.id}`}
              onSelect={() =>
                go(() => {
                  if (other(e.projectId)) setProject(e.projectId);
                  setView('elements');
                })
              }
            >
              <Crosshair /> {e.name}
              {where(e.projectName)}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={tx('ui.palette.sharedSteps')}>
          {(index?.sharedSteps ?? []).map((s) => (
            <CommandItem
              key={s.id}
              value={`${tx('ui.palette.step')} ${s.name} ${s.projectName ?? ''} ${s.id}`}
              onSelect={() =>
                go(() => {
                  if (other(s.projectId)) setProject(s.projectId as string);
                  setView('elements');
                })
              }
            >
              <Layers /> {s.name}
              {where(s.projectName ?? tx('ui.palette.library'))}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
