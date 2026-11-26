import { describe, expect, it } from 'vitest';
import { buildTree, orphanCount } from './dataset-tree';

const ds = {
  columns: ['maBo', 'ten'],
  rows: [
    { maBo: 'B1', ten: 'Một' },
    { maBo: 'B2', ten: 'Hai' },
  ],
  children: [
    {
      name: 'SanPham',
      key: 'maBo',
      parentKey: 'maBo',
      columns: ['maSp', 'maBo'],
      rows: [
        { maSp: 'S1', maBo: 'B1' },
        { maSp: 'S2', maBo: 'B1' },
        { maSp: 'S9', maBo: 'B?' },
      ],
    },
  ],
};

describe('dataset tree [P-01]', () => {
  it('groups child rows under their parent row', () => {
    const t = buildTree(ds);
    expect(t.map((r) => [r.label, r.children[0]?.rows.length])).toEqual([
      ['B1', 2],
      ['B2', 0],
    ]);
  });
  it('counts child rows that match no parent', () => {
    expect(orphanCount(ds)).toEqual({ SanPham: 1 });
    expect(orphanCount({ rows: ds.rows })).toEqual({});
  });
});
