import { describe, expect, it } from 'vitest';
import { emptyPrefs, orderProjects, togglePinned, touchRecent } from './recent-projects';

const projects = [
  { id: 'a', name: 'Alpha' },
  { id: 'b', name: 'Beta' },
  { id: 'c', name: 'Cổng' },
  { id: 'd', name: 'Delta' },
];

describe('project quick switcher [O-08]', () => {
  it('keeps most recent first without duplicates and caps the list', () => {
    let p = emptyPrefs();
    for (const id of ['a', 'b', 'a', 'c']) p = touchRecent(p, id);
    expect(p.recent).toEqual(['c', 'a', 'b']);
    for (let i = 0; i < 20; i++) p = touchRecent(p, `x${i}`);
    expect(p.recent).toHaveLength(8);
  });

  it('toggles pins', () => {
    const p = togglePinned(emptyPrefs(), 'b');
    expect(p.pinned).toEqual(['b']);
    expect(togglePinned(p, 'b').pinned).toEqual([]);
  });

  it('orders pinned, then recent, then the rest by name; drops deleted projects', () => {
    const prefs = { pinned: ['d', 'gone'], recent: ['c', 'd', 'a'] };
    expect(orderProjects(projects, prefs).map((p) => p.id)).toEqual(['d', 'c', 'a', 'b']);
  });
});
