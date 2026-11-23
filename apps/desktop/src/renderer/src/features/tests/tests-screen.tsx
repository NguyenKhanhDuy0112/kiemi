import { EmptyState } from '@renderer/components/empty-state';
import { NameDialog, type NameDialogState } from '@renderer/components/name-dialog';
import { Badge } from '@renderer/components/ui/badge';
import { Button } from '@renderer/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@renderer/components/ui/dropdown-menu';
import { Input } from '@renderer/components/ui/input';
import { EditorScreen } from '@renderer/features/editor/editor-screen';
import { errorMessage } from '@renderer/lib/errors';
import { useAppStore } from '@renderer/lib/store';
import { trpc, trpcClient } from '@renderer/lib/trpc';
import { useTx } from '@renderer/lib/tx';
import { cn } from '@renderer/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  Boxes,
  ChevronDown,
  ChevronRight,
  Copy,
  FilePlus2,
  FileText,
  Folder,
  FolderPlus,
  Layers,
  MoreHorizontal,
  Pencil,
  Play,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import { Fragment, type ReactNode, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useOpenSamples } from '../onboarding/onboarding';
import { useStartRun } from '../run/run-dialog';
import { SuiteDialog } from './suite-dialog';

const fold = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

interface FolderNode {
  id: string;
  name: string;
  parentId: string | null;
  productId: string | null;
}

interface ProductNode {
  id: string;
  name: string;
  version: number;
}

/** Tests view: list (S-01) or, when a test is open, the editor. */
export function TestsScreen() {
  const openTestId = useAppStore((s) => s.openTestId);
  return openTestId ? <EditorScreen testId={openTestId} /> : <TestTree />;
}

function useInvalidate() {
  const qc = useQueryClient();
  const projectId = useAppStore((s) => s.projectId);
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: trpc.testCases.list.queryKey() }),
      qc.invalidateQueries({
        queryKey: trpc.folders.list.queryKey({ projectId: projectId ?? '' }),
      }),
      qc.invalidateQueries({ queryKey: trpc.suites.list.queryKey({ projectId: projectId ?? '' }) }),
      qc.invalidateQueries({
        queryKey: trpc.products.list.queryKey({ projectId: projectId ?? '' }),
      }),
    ]);
}

/** Project → folders → tests / suites, with search, tags and quick actions (S-01). */
export function TestTree() {
  const tx = useTx();
  const projectId = useAppStore((s) => s.projectId) ?? '';
  const openTest = useAppStore((s) => s.openTest);
  const invalidate = useInvalidate();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<NameDialogState | null>(null);
  const [confirm, setConfirm] = useState<{
    title: string;
    name: string;
    run: () => Promise<void>;
  } | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openSuite, setOpenSuite] = useState<string | null>(null);
  const startRun = useStartRun();
  const openSamples = useOpenSamples();

  const tests = useQuery({
    ...trpc.testCases.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const folders = useQuery({
    ...trpc.folders.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const products = useQuery({
    ...trpc.products.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const productList: ProductNode[] = products.data ?? [];
  const firstProductId = productList[0]?.id ?? null;
  const allTags = useMemo(
    () =>
      [...new Set((tests.data ?? []).flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b)),
    [tests.data],
  );
  const suites = useQuery({
    ...trpc.suites.list.queryOptions({ projectId }),
    enabled: !!projectId,
  });
  const createTest = useMutation(trpc.testCases.create.mutationOptions());
  const createFolder = useMutation(trpc.folders.create.mutationOptions());
  const createSuite = useMutation(trpc.suites.create.mutationOptions());

  const run = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await invalidate();
    } catch (err) {
      toast.error(errorMessage(err, tx));
    }
  };

  const newTest = (folderId: string | null = null, productId = firstProductId) =>
    setDialog({
      title: tx('ui.tree.newTest'),
      initial: tx('ui.tree.defaultTestName'),
      onSubmit: (name) =>
        run(async () => {
          const t = await createTest.mutateAsync({ projectId, productId, folderId, name });
          openTest(t.id);
        }),
    });
  const newFolder = (parentId: string | null = null, productId = firstProductId) =>
    setDialog({
      title: tx('ui.tree.newFolder'),
      initial: tx('ui.tree.defaultFolderName'),
      onSubmit: (name) =>
        run(() => createFolder.mutateAsync({ projectId, productId, parentId, name })),
    });
  const newProduct = () =>
    setDialog({
      title: tx('ui.product.newProduct'),
      initial: tx('ui.product.defaultName'),
      onSubmit: (name) => run(() => trpcClient.products.create.mutate({ projectId, name })),
    });
  const newSuite = () =>
    setDialog({
      title: tx('ui.tree.newSuite'),
      initial: tx('ui.tree.defaultSuiteName'),
      onSubmit: (name) => run(() => createSuite.mutateAsync({ projectId, name })),
    });

  const q = fold(query.trim());
  const visibleTests = useMemo(
    () =>
      (tests.data ?? []).filter(
        (t) => !q || fold(t.name).includes(q) || t.tags.some((tag) => fold(tag).includes(q)),
      ),
    [tests.data, q],
  );
  const folderList: FolderNode[] = folders.data ?? [];
  const productOf = (productId: string | null) =>
    productList.some((p) => p.id === productId) ? productId : firstProductId;
  /** Sub-folders of a folder, or the top folders of a product (`parentId` null). */
  const childrenOf = (parentId: string | null, productId?: string | null) =>
    folderList.filter(
      (f) =>
        (f.parentId ?? null) === parentId &&
        (parentId !== null || productOf(f.productId) === productId),
    );
  const testsIn = (folderId: string | null, productId?: string | null) =>
    visibleTests.filter(
      (t) =>
        (t.folderId ?? null) === folderId &&
        (folderId !== null || productOf(t.productId) === productId),
    );
  const hasContent = (folderId: string): boolean =>
    testsIn(folderId).length > 0 || childrenOf(folderId).some((f) => hasContent(f.id));
  const productHasContent = (productId: string) =>
    testsIn(null, productId).length > 0 ||
    childrenOf(null, productId).some((f) => hasContent(f.id));
  const toggle = (id: string) =>
    setCollapsed((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const deleteTest = (t: { id: string; name: string }) =>
    run(async () => {
      await trpcClient.testCases.remove.mutate({ id: t.id });
      toast(tx('ui.actions.deleted', { name: t.name }), {
        action: {
          label: tx('common.undo'),
          onClick: () => void run(() => trpcClient.testCases.restore.mutate({ id: t.id })),
        },
      });
    });

  // Render helpers (not components): they close over the tree's state.
  const testRow = (t: (typeof visibleTests)[number], depth: number) => (
    <li
      key={t.id}
      className="group flex items-center gap-2 rounded-md py-1 pr-1 hover:bg-accent"
      style={{ paddingLeft: depth * 20 + 8 }}
    >
      <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left text-sm"
        onClick={() => openTest(t.id)}
      >
        {t.name}
      </button>
      {t.tags.map((tag) => (
        <Badge key={tag} variant="secondary">
          {tag}
        </Badge>
      ))}
      <span className="text-xs text-muted-foreground">
        {tx('ui.tree.steps', { count: t.stepCount })}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            aria-label={tx('ui.actions.more')}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() =>
              setDialog({
                title: tx('ui.actions.rename'),
                initial: t.name,
                tags: t.tags,
                onSubmit: (name, tags) =>
                  run(async () => {
                    const row = await trpcClient.testCases.get.query({ id: t.id });
                    await trpcClient.testCases.save.mutate({
                      id: t.id,
                      version: row.version,
                      content: { ...row.content, name, tags },
                    });
                  }),
              })
            }
          >
            <Pencil /> {tx('ui.actions.rename')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => void run(() => trpcClient.testCases.duplicate.mutate({ id: t.id }))}
          >
            <Copy /> {tx('ui.actions.duplicate')}
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Folder /> {tx('ui.tree.moveTo')}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {productList.length > 1 ? (
                productList.map((p) => (
                  <DropdownMenuItem
                    key={p.id}
                    onSelect={() =>
                      void run(() =>
                        trpcClient.testCases.move.mutate({
                          id: t.id,
                          folderId: null,
                          productId: p.id,
                        }),
                      )
                    }
                  >
                    {tx('ui.product.rootOf', { name: p.name })}
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem
                  onSelect={() =>
                    void run(() => trpcClient.testCases.move.mutate({ id: t.id, folderId: null }))
                  }
                >
                  {tx('ui.tree.root')}
                </DropdownMenuItem>
              )}
              {folderList.map((f) => (
                <DropdownMenuItem
                  key={f.id}
                  onSelect={() =>
                    void run(() => trpcClient.testCases.move.mutate({ id: t.id, folderId: f.id }))
                  }
                >
                  {f.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => void deleteTest(t)}>
            <Trash2 /> {tx('ui.actions.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );

  const folderBranch = (f: FolderNode, depth: number): ReactNode => {
    if (q && !hasContent(f.id)) return null;
    const open = q !== '' || !collapsed.has(f.id);
    return (
      <Fragment key={f.id}>
        <li
          className="group flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-accent"
          style={{ paddingLeft: depth * 20 + 4 }}
        >
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 text-left text-sm font-medium"
            aria-expanded={open}
            onClick={() => toggle(f.id)}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <Folder className="size-4 text-muted-foreground" aria-hidden />
            <span className="truncate">{f.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={tx('ui.actions.more')}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => newTest(f.id)}>
                <FilePlus2 /> {tx('ui.tree.newTest')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => newFolder(f.id)}>
                <FolderPlus /> {tx('ui.tree.newFolder')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setDialog({
                    title: tx('ui.actions.rename'),
                    initial: f.name,
                    onSubmit: (name) =>
                      run(() => trpcClient.folders.rename.mutate({ id: f.id, name })),
                  })
                }
              >
                <Pencil /> {tx('ui.actions.rename')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  setConfirm({
                    title: tx('ui.actions.delete'),
                    name: f.name,
                    run: () => run(() => trpcClient.folders.remove.mutate({ id: f.id })),
                  })
                }
              >
                <Trash2 /> {tx('ui.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
        {open && (
          <>
            {childrenOf(f.id).map((c) => folderBranch(c, depth + 1))}
            {testsIn(f.id).map((t) => testRow(t, depth + 1))}
          </>
        )}
      </Fragment>
    );
  };

  const productBranch = (p: ProductNode): ReactNode => {
    if (q && !productHasContent(p.id)) return null;
    const open = q !== '' || !collapsed.has(p.id);
    return (
      <Fragment key={p.id}>
        <li className="group flex items-center gap-1 rounded-md py-1 pr-1 hover:bg-accent">
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1 pl-1 text-left text-sm font-semibold"
            aria-expanded={open}
            title={tx('ui.product.hint')}
            onClick={() => toggle(p.id)}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            <Boxes className="size-4 text-primary" aria-hidden />
            <span className="truncate">{p.name}</span>
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={tx('ui.actions.more')}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => newTest(null, p.id)}>
                <FilePlus2 /> {tx('ui.tree.newTest')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => newFolder(null, p.id)}>
                <FolderPlus /> {tx('ui.tree.newFolder')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  setDialog({
                    title: tx('ui.product.rename'),
                    initial: p.name,
                    onSubmit: (name) =>
                      run(() =>
                        trpcClient.products.update.mutate({
                          id: p.id,
                          version: p.version,
                          patch: { name },
                        }),
                      ),
                  })
                }
              >
                <Pencil /> {tx('ui.actions.rename')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={productList.length <= 1}
                title={productList.length <= 1 ? tx('ui.product.lastProduct') : undefined}
                onSelect={() =>
                  setConfirm({
                    title: tx('ui.actions.delete'),
                    name: p.name,
                    run: () => run(() => trpcClient.products.remove.mutate({ id: p.id })),
                  })
                }
              >
                <Trash2 /> {tx('ui.actions.delete')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </li>
        {open && (
          <>
            {childrenOf(null, p.id).map((f) => folderBranch(f, 1))}
            {testsIn(null, p.id).map((t) => testRow(t, 1))}
          </>
        )}
      </Fragment>
    );
  };

  const empty =
    (tests.data?.length ?? 0) === 0 && folderList.length === 0 && productList.length <= 1;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <div className="relative w-72">
          <Search
            className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder={tx('ui.tree.searchPlaceholder')}
            aria-label={tx('ui.actions.search')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={newProduct}>
            <Boxes /> {tx('ui.product.newProduct')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => newFolder()}>
            <FolderPlus /> {tx('ui.tree.newFolder')}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Tag /> {tx('ui.suite.runTag')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allTags.length === 0 ? (
                <DropdownMenuItem disabled>{tx('ui.suite.noTags')}</DropdownMenuItem>
              ) : (
                allTags.map((tag) => (
                  <DropdownMenuItem
                    key={tag}
                    onSelect={() => void startRun({ kind: 'tag', projectId, tag })}
                  >
                    <Play /> {tag}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" onClick={newSuite}>
            <Layers /> {tx('ui.tree.newSuite')}
          </Button>
          <Button size="sm" onClick={() => newTest()}>
            <FilePlus2 /> {tx('ui.tree.newTest')}
          </Button>
        </div>
      </header>
      {empty ? (
        <EmptyState
          icon={FileText}
          title={tx('ui.tree.emptyTitle')}
          text={tx('ui.tree.emptyText')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => newTest()}>
                <FilePlus2 /> {tx('ui.tree.emptyAction')}
              </Button>
              <Button variant="outline" onClick={() => void run(openSamples)}>
                <BookOpen /> {tx('ui.onboarding.sampleAction')}
              </Button>
            </div>
          }
        />
      ) : (
        <div className="flex-1 overflow-auto p-3">
          <ul className="flex flex-col" aria-label={tx('ui.nav.tests')}>
            {productList.map((p) => productBranch(p))}
          </ul>
          {q && visibleTests.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">{tx('ui.tree.noMatch', { query })}</p>
          )}
          {(suites.data?.length ?? 0) > 0 && (
            <section className="mt-6">
              <h2 className="mb-1 px-2 text-xs font-semibold text-muted-foreground uppercase">
                {tx('ui.tree.suites')}
              </h2>
              <ul className="flex flex-col">
                {(suites.data ?? []).map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      'group flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent',
                    )}
                  >
                    <Layers className="size-4 text-muted-foreground" aria-hidden />
                    <button
                      type="button"
                      className="flex-1 truncate text-left text-sm"
                      title={tx('ui.suite.edit')}
                      onClick={() => setOpenSuite(s.id)}
                    >
                      {s.name}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      aria-label={tx('ui.suite.run')}
                      onClick={() => void startRun({ kind: 'suite', suiteId: s.id })}
                    >
                      <Play />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                      aria-label={tx('ui.actions.delete')}
                      onClick={() =>
                        setConfirm({
                          title: tx('ui.actions.delete'),
                          name: s.name,
                          run: () => run(() => trpcClient.suites.remove.mutate({ id: s.id })),
                        })
                      }
                    >
                      <Trash2 />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <NameDialog state={dialog} onClose={() => setDialog(null)} />
      {openSuite && (
        <SuiteDialog projectId={projectId} suiteId={openSuite} onClose={() => setOpenSuite(null)} />
      )}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirm?.title}</DialogTitle>
            <DialogDescription>
              {tx('ui.actions.deleteConfirm', { name: confirm?.name ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              {tx('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await confirm?.run();
                setConfirm(null);
              }}
            >
              {tx('ui.actions.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
