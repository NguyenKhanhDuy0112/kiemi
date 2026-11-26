import { CURRENT_SCHEMA_VERSION } from '@kiemi/schema';
import { eq } from 'drizzle-orm';
import { newId, type Repo } from '../repo';
import type { Services } from '../services';
import { products as productsTable, secrets as secretsTable, testCases } from '../tables';
import type { ProjectSnapshot } from './format';

/** Reads what the project folder must contain from the database. */
export function readSnapshot(services: Services, projectId: string): ProjectSnapshot {
  const p = services.projects.get(projectId);
  return {
    project: {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      variables: p.variables ?? {},
      popupRules: p.popupRules ?? [],
      formSpecs: p.formSpecs ?? [],
      messageCatalog: p.messageCatalog ?? {},
      pages: p.pages ?? [],
    },
    products: services.products.list(projectId).map((x) => ({
      id: x.id,
      key: x.key,
      name: x.name,
      kind: x.kind,
      sortOrder: x.sortOrder,
      variables: x.variables ?? {},
    })),
    folders: services.folders.list(projectId).map((f) => ({
      id: f.id,
      productId: f.productId,
      parentId: f.parentId,
      name: f.name,
      sortOrder: f.sortOrder,
    })),
    tests: services.testCases.repo.list(eq(testCases.projectId, projectId)).map((t) => ({
      id: t.id,
      productId: t.productId,
      folderId: t.folderId,
      content: t.content,
    })),
    environments: services.environments.list(projectId).map((e) => ({
      id: e.id,
      name: e.name,
      type: e.type,
      color: e.color,
      protected: e.protected,
      cells: services.environments.cells(e.id).map((c) => ({
        productId: c.productId,
        url: c.url,
        variables: c.variables,
        proxy: c.proxy,
        ssh: c.ssh,
      })),
      variables: services.environments.variables(e.id),
      secretNames: services.environments.secretNames(e.id),
      sortOrder: e.sortOrder,
    })),
    elements: services.elements.list(projectId).map((e) => ({
      id: e.id,
      productId: e.productId,
      name: e.name,
      locator: e.locator,
      pageUrl: e.pageUrl,
    })),
    sharedSteps: services.sharedSteps.list(projectId).map((x) => ({
      id: x.id,
      productId: x.productId,
      name: x.name,
      params: x.params,
      steps: x.steps,
    })),
    datasets: services.datasets.list(projectId).map((d) => ({
      id: d.id,
      name: d.name,
      columns: d.columns,
      rows: d.rows,
      children: d.children ?? [],
      source: d.source,
      envRows: d.envRows ?? {},
    })),
    suites: services.suites.list(projectId).map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      variables: s.variables,
      environmentId: s.environmentId,
      items: services.suites.listItems(s.id).map((i) => ({
        testCaseId: i.testCaseId,
        datasetId: i.datasetId,
        enabled: i.enabled,
      })),
    })),
  };
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Replaces ids (deep) — used when a file brings an id already used by another project. */
function remapIds(value: unknown, map: ReadonlyMap<string, string>): unknown {
  if (map.size === 0) return value;
  if (typeof value === 'string') return map.get(value) ?? value;
  if (Array.isArray(value)) return value.map((v) => remapIds(v, map));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, remapIds(v, map)]),
  );
}

interface Row {
  id: string;
  projectId?: string;
  deletedAt: Date | null;
}

/**
 * Makes the database match the snapshot (ids kept): creates, updates, restores
 * soft-deleted rows that came back, soft-deletes rows no longer in the files.
 * Runs in one transaction. Ids taken by ANOTHER project get new ids.
 */
export function applySnapshot(services: Services, input: ProjectSnapshot): void {
  const projectId = input.project.id;
  const repos: Repo<never>[] = [
    services.products.repo,
    services.folders.repo,
    services.testCases.repo,
    services.environments.repo,
    services.elements.repo,
    services.sharedSteps.repo,
    services.datasets.repo,
    services.suites.repo,
  ] as unknown as Repo<never>[];
  const foreign = new Map<string, string>();
  const all = [
    ...input.products,
    ...input.folders,
    ...input.tests,
    ...input.environments,
    ...input.elements,
    ...input.sharedSteps,
    ...input.datasets,
    ...input.suites,
  ];
  for (const x of all) {
    for (const repo of repos) {
      const row = repo.find(x.id, true) as Row | undefined;
      if (row && row.projectId !== projectId) foreign.set(x.id, newId());
    }
  }
  const s = remapIds(input, foreign) as ProjectSnapshot;
  // The project id itself is never remapped (checked by the caller).
  s.project.id = projectId;

  services.ctx.db.transaction(() => {
    const project = services.projects.repo.get(projectId);
    if (
      project.name !== s.project.name ||
      (project.description ?? null) !== s.project.description ||
      !same(project.variables ?? {}, s.project.variables ?? {}) ||
      !same(project.popupRules ?? [], s.project.popupRules ?? []) ||
      !same(project.formSpecs ?? [], s.project.formSpecs ?? []) ||
      !same(project.messageCatalog ?? {}, s.project.messageCatalog ?? {}) ||
      !same(project.pages ?? [], s.project.pages ?? [])
    )
      services.projects.repo.update(projectId, {
        name: s.project.name,
        description: s.project.description,
        variables: s.project.variables ?? {},
        popupRules: s.project.popupRules ?? [],
        formSpecs: s.project.formSpecs ?? [],
        messageCatalog: s.project.messageCatalog ?? {},
        pages: s.project.pages ?? [],
      });

    /** Generic reconcile of one table. `values` = columns from the file. */
    const reconcile = <V extends Record<string, unknown>>(
      repo: Repo<never>,
      existing: { id: string }[],
      wanted: { id: string; values: V }[],
      after?: (id: string, created: boolean) => void,
    ) => {
      const keep = new Set<string>();
      for (const w of wanted) {
        keep.add(w.id);
        const row = repo.find(w.id, true) as (Row & Record<string, unknown>) | undefined;
        if (!row) {
          repo.create({ id: w.id, projectId, ...w.values } as never);
          after?.(w.id, true);
          continue;
        }
        if (row.deletedAt) repo.restore(w.id);
        const changed = Object.entries(w.values).some(([k, v]) => !same(row[k] ?? null, v ?? null));
        if (changed) repo.update(w.id, w.values as never);
        after?.(w.id, false);
      }
      for (const e of existing) if (!keep.has(e.id)) repo.remove(e.id);
    };

    // Products first: everything else points at them. A project keeps at least one.
    if (!s.products.length) {
      const d = services.products.defaultFor(projectId);
      s.products = [
        {
          id: d.id,
          key: d.key,
          name: d.name,
          kind: d.kind,
          sortOrder: d.sortOrder,
          variables: d.variables ?? {},
        },
      ];
    }
    reconcile(
      services.products.repo as unknown as Repo<never>,
      services.products.repo.list(eq(productsTable.projectId, projectId)),
      s.products.map((p) => ({
        id: p.id,
        values: {
          key: p.key,
          name: p.name,
          kind: p.kind,
          sortOrder: p.sortOrder,
          variables: Object.keys(p.variables ?? {}).length ? p.variables : null,
        },
      })),
    );
    const productIds = new Set(s.products.map((p) => p.id));
    const first = s.products[0]?.id as string;
    const known = (id: string | null | undefined) => (id && productIds.has(id) ? id : first);
    // Sub-folders follow their top folder's product.
    const byId = new Map(s.folders.map((f) => [f.id, f]));
    const folderProduct = (id: string | null, depth = 0): string => {
      const f = id ? byId.get(id) : undefined;
      if (!f) return first;
      if (f.parentId && byId.has(f.parentId) && depth < 64)
        return folderProduct(f.parentId, depth + 1);
      return known(f.productId);
    };
    reconcile(
      services.folders.repo as unknown as Repo<never>,
      services.folders.list(projectId),
      s.folders.map((f) => ({
        id: f.id,
        values: {
          productId: folderProduct(f.id),
          parentId: f.parentId,
          name: f.name,
          sortOrder: f.sortOrder,
        },
      })),
    );

    const tests = services.testCases.repo;
    reconcile(
      tests as unknown as Repo<never>,
      tests.list(eq(testCases.projectId, projectId)),
      s.tests.map((t) => {
        const content = { ...t.content, id: t.id };
        return {
          id: t.id,
          values: {
            productId: t.folderId ? folderProduct(t.folderId) : known(t.productId),
            folderId: t.folderId,
            name: content.name,
            description: content.description ?? null,
            tags: content.tags,
            content,
            schemaVersion: content.schemaVersion ?? CURRENT_SCHEMA_VERSION,
          },
        };
      }),
    );

    const envs = services.environments;
    reconcile(
      envs.repo as unknown as Repo<never>,
      envs.list(projectId),
      s.environments.map((e) => ({
        id: e.id,
        values: {
          name: e.name,
          type: e.type,
          color: e.color ?? null,
          protected: e.protected,
          sortOrder: e.sortOrder,
          secretNames: [...new Set(e.secretNames)].sort(),
        },
      })),
      (id) => {
        const e = s.environments.find((x) => x.id === id);
        if (!e) return;
        if (!same(envs.variables(id), e.variables)) envs.setVariables(id, e.variables);
        // Cells by product; files from before M9-05 carry one URL for the first product.
        const legacy =
          !e.cells.length && (e.baseUrl || e.proxy || e.ssh)
            ? [{ productId: first, url: e.baseUrl, variables: {}, proxy: e.proxy, ssh: e.ssh }]
            : [];
        const seen = new Set<string>();
        const cells = [...e.cells, ...legacy].filter(
          (c) => productIds.has(c.productId) && !seen.has(c.productId) && seen.add(c.productId),
        );
        envs.setCells(
          id,
          cells.map((c) => ({
            productId: c.productId,
            url: c.url && /^[a-z][a-z0-9+.-]*:\/\//i.test(c.url) ? c.url : null,
            variables: c.variables,
            proxy: c.proxy ?? null,
            ssh: c.ssh ?? null,
          })),
        );
        // A secret removed by a teammate: drop this machine's value too.
        const names = new Set(e.secretNames);
        for (const sec of envs.secrets.list(eq(secretsTable.environmentId, id)))
          if (!names.has(sec.name)) envs.secrets.remove(sec.id);
      },
    );

    reconcile(
      services.elements.repo as unknown as Repo<never>,
      services.elements.list(projectId),
      s.elements.map((e) => ({
        id: e.id,
        values: {
          productId: known(e.productId),
          name: e.name,
          locator: e.locator,
          pageUrl: e.pageUrl ?? null,
        },
      })),
    );
    reconcile(
      services.sharedSteps.repo as unknown as Repo<never>,
      services.sharedSteps.list(projectId),
      s.sharedSteps.map((x) => ({
        id: x.id,
        values: {
          productId: x.productId && productIds.has(x.productId) ? x.productId : null,
          name: x.name,
          params: x.params,
          steps: x.steps,
        },
      })),
    );
    reconcile(
      services.datasets.repo as unknown as Repo<never>,
      services.datasets.list(projectId),
      s.datasets.map((d) => ({
        id: d.id,
        values: {
          name: d.name,
          columns: d.columns,
          rows: d.rows,
          children: d.children?.length ? d.children : null,
          source: d.source,
          envRows: Object.keys(d.envRows ?? {}).length ? d.envRows : null,
        },
      })),
    );
    reconcile(
      services.suites.repo as unknown as Repo<never>,
      services.suites.list(projectId),
      s.suites.map((x) => ({
        id: x.id,
        values: {
          name: x.name,
          description: x.description ?? null,
          variables: x.variables,
          environmentId: x.environmentId ?? null,
        },
      })),
      (id) => {
        const x = s.suites.find((y) => y.id === id);
        if (!x) return;
        const cur = services.suites.listItems(id).map((i) => ({
          testCaseId: i.testCaseId,
          datasetId: i.datasetId ?? null,
          enabled: i.enabled,
        }));
        const next = x.items.map((i) => ({
          testCaseId: i.testCaseId,
          datasetId: i.datasetId ?? null,
          enabled: i.enabled,
        }));
        if (!same(cur, next)) services.suites.setItems(id, next);
      },
    );
  });
}
