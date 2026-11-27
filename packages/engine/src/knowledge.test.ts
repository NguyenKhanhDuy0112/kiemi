import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from './actions';
import { buildKnowledge, checkSteps, knowledgeText } from './knowledge';

const registry = createDefaultRegistry();

describe('knowledge pack [AI-15]', () => {
  it('lists every registered action with a JSON Schema, so a new action appears by itself', () => {
    const k = buildKnowledge(registry, (key) => `L:${key}`);
    expect(k.actions.map((a) => a.type).sort()).toEqual(
      registry
        .list()
        .map((a) => a.type)
        .sort(),
    );
    const fill = k.actions.find((a) => a.type === 'fill');
    expect(fill?.label).toBe('L:actions.fill');
    expect(JSON.stringify(fill?.params)).toContain('properties');
    const extra = createDefaultRegistry().register({
      type: 'brandNew',
      params: registry.get('clearData')?.params as never,
      ui: { label: 'x', icon: 'x', group: 'x' },
      execute() {},
    });
    expect(knowledgeText(buildKnowledge(extra))).toContain('brandNew');
  });

  it('includes techniques and field rules in the text', () => {
    const t = knowledgeText(buildKnowledge(registry));
    expect(t).toContain('boundary');
    expect(t).toContain('vn-phone');
    expect(t).toContain('Action catalog');
  });

  it('rejects steps outside the catalog or with bad params, including nested ones', () => {
    const ok = { id: 'a', action: 'goto', params: { url: 'https://x.vn' } };
    expect(checkSteps(registry, [ok])).toEqual([]);
    expect(
      checkSteps(registry, [{ id: 'b', action: 'hackTheWorld', params: {} }])[0]?.message,
    ).toMatch(/Unknown action/);
    expect(checkSteps(registry, [{ id: 'c', action: 'goto', params: {} }])[0]?.at).toBe('1');
    const nested = checkSteps(registry, [
      {
        id: 'd',
        action: 'if',
        params: { condition: { var: 'x' }, then: [{ id: 'e', action: 'nope', params: {} }] },
      },
    ]);
    expect(nested.some((p) => p.at === '1.1')).toBe(true);
    expect(checkSteps(registry, 'x')).toHaveLength(1);
  });
});
