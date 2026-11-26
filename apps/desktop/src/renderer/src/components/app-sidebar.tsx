import { Mascot } from '@renderer/components/mascot/mascot';
import { NameDialog, type NameDialogState } from '@renderer/components/name-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@renderer/components/ui/sidebar';
import { ProjectFolderDialogs } from '@renderer/features/projects/folder-dialogs';
import { openProjectFolder, useProjectFolder } from '@renderer/features/projects/project-folder';
import { errorMessage } from '@renderer/lib/errors';
import { orderProjects } from '@renderer/lib/recent-projects';
import { useAppStore, type View } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronsUpDown,
  ClipboardList,
  Crosshair,
  FileText,
  FolderOpen,
  FolderSearch,
  Gauge,
  Globe,
  History,
  Pin,
  PinOff,
  Plus,
  Search,
  Settings,
  Sigma,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const NAV: { view: View; icon: typeof FileText }[] = [
  { view: 'tests', icon: FileText },
  { view: 'history', icon: History },
  { view: 'environments', icon: Globe },
  { view: 'forms', icon: ClipboardList },
  { view: 'coverage', icon: Gauge },
  { view: 'formulas', icon: Sigma },
  { view: 'elements', icon: Crosshair },
  { view: 'settings', icon: Settings },
];

/** Left sidebar (U-01): project switcher + main sections. */
export function AppSidebar() {
  const tx = useTx();
  const qc = useQueryClient();
  const view = useAppStore((s) => s.view);
  const setView = useAppStore((s) => s.setView);
  const projectId = useAppStore((s) => s.projectId);
  const setProject = useAppStore((s) => s.setProject);
  const setPaletteOpen = useAppStore((s) => s.setPaletteOpen);
  const prefs = useAppStore((s) => s.projectPrefs);
  const togglePin = useAppStore((s) => s.togglePinProject);
  const projects = useQuery(trpc.projects.list.queryOptions());
  const [dialog, setDialog] = useState<NameDialogState | null>(null);
  const current = projects.data?.find((p) => p.id === projectId);
  const folder = useProjectFolder(projectId, tx);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" aria-label={tx('ui.nav.switchProject')}>
                  <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-secondary">
                    <Mascot size={26} />
                  </div>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-xs text-muted-foreground">
                      {tx('ui.nav.project')}
                    </span>
                    <span className="truncate font-semibold">{current?.name ?? '…'}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-60">
                {orderProjects(projects.data ?? [], prefs).map((p) => (
                  <DropdownMenuItem key={p.id} onSelect={() => setProject(p.id)}>
                    <span className="flex-1 truncate">{p.name}</span>
                    <button
                      type="button"
                      className="rounded p-1 hover:bg-accent"
                      aria-label={tx(
                        prefs.pinned.includes(p.id) ? 'ui.nav.unpinProject' : 'ui.nav.pinProject',
                      )}
                      aria-pressed={prefs.pinned.includes(p.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        togglePin(p.id);
                      }}
                    >
                      {prefs.pinned.includes(p.id) ? (
                        <PinOff className="size-3.5" />
                      ) : (
                        <Pin className="size-3.5 opacity-50" />
                      )}
                    </button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() =>
                    setDialog({
                      title: tx('ui.nav.newProject'),
                      initial: tx('ui.nav.newProject'),
                      onSubmit: async (name) => {
                        try {
                          const p = await trpcClient.projects.create.mutate({ name });
                          await qc.invalidateQueries({ queryKey: trpc.projects.list.queryKey() });
                          setProject(p.id);
                        } catch (err) {
                          toast.error(errorMessage(err, tx));
                        }
                      },
                    })
                  }
                >
                  <Plus /> {tx('ui.nav.newProject')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void openProjectFolder(qc, tx, setProject)}>
                  <FolderSearch /> {tx('ui.projectFolder.open')}
                </DropdownMenuItem>
                {current && folder?.path ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={() =>
                        void trpcClient.projects.revealFolder
                          .mutate({ id: current.id })
                          .catch((err: unknown) => toast.error(errorMessage(err, tx)))
                      }
                    >
                      <FolderOpen /> {tx('ui.projectFolder.reveal')}
                    </DropdownMenuItem>
                    <DropdownMenuLabel
                      className="truncate text-xs font-normal text-muted-foreground"
                      title={folder.path}
                    >
                      {tx('ui.projectFolder.savedIn', { path: folder.path })}
                    </DropdownMenuLabel>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={tx('ui.palette.hint')}
                onClick={() => setPaletteOpen(true)}
              >
                <Search />
                <span>{tx('ui.actions.search')}</span>
                <kbd className="ml-auto rounded border px-1 text-xs text-muted-foreground">⌘K</kbd>
              </SidebarMenuButton>
            </SidebarMenuItem>
            {NAV.map(({ view: v, icon: Icon }) => (
              <SidebarMenuItem key={v}>
                <SidebarMenuButton
                  isActive={view === v}
                  tooltip={tx(`ui.nav.${v}`)}
                  onClick={() => setView(v)}
                >
                  <Icon />
                  <span>{tx(`ui.nav.${v}`)}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <p className="truncate px-2 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
          {tx('app.slogan')}
        </p>
      </SidebarFooter>
      <NameDialog state={dialog} onClose={() => setDialog(null)} />
      <ProjectFolderDialogs status={folder} />
    </Sidebar>
  );
}
