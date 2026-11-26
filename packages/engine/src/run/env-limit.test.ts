import type { Env } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { environmentSkip } from './env-limit';

const prod = { id: 'e1', name: 'Chính thức', type: 'production' } as Pick<
  Env,
  'id' | 'name' | 'type'
>;
const uat = { id: 'e2', name: 'UAT', type: 'uat' } as Pick<Env, 'id' | 'name' | 'type'>;

describe('environmentSkip [O-06]', () => {
  it('runs when there is no limit or no environment', () => {
    expect(environmentSkip({}, prod)).toBeNull();
    expect(environmentSkip({ environments: { except: ['production'] } }, undefined)).toBeNull();
  });

  it('skips on an excluded environment, matching by type, name or id', () => {
    const tc = { environments: { except: ['Production'], reason: 'Ghi dữ liệu thật' } };
    expect(environmentSkip(tc, prod)).toEqual({
      environment: 'Chính thức',
      reason: 'Ghi dữ liệu thật',
    });
    expect(environmentSkip({ environments: { except: ['uat'] } }, uat)).toEqual({
      environment: 'UAT',
    });
    expect(environmentSkip({ environments: { except: ['e2'] } }, uat)).not.toBeNull();
    expect(environmentSkip(tc, uat)).toBeNull();
  });

  it('skips when the environment is not in `only`', () => {
    expect(environmentSkip({ environments: { only: ['uat'] } }, prod)).not.toBeNull();
    expect(environmentSkip({ environments: { only: ['UAT', 'dev'] } }, uat)).toBeNull();
    expect(environmentSkip({ environments: { only: [] } }, uat)).toBeNull();
  });
});
