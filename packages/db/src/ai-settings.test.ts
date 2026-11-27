import { describe, expect, it } from 'vitest';
import { createMemoryServices, fakeCipher } from './testing';

const base = {
  enabled: true,
  kind: 'claude' as const,
  model: 'm1',
  taskModels: {},
  baseUrl: '',
  localOnly: false,
  limitTokens: null,
  priceIn: null,
  priceOut: null,
};

describe('AiSettingsService', () => {
  it('is off until configured, keeps the key secret and keeps it when omitted', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const s = services.aiSettings;
    expect(s.get(p)).toBeNull();
    expect(s.forUse(p)).toBeNull();

    const info = s.save(p, base, 'sk-123');
    expect(info.hasKey).toBe(true);
    expect(JSON.stringify(info)).not.toContain('sk-123');
    expect(s.forUse(p)?.apiKey).toBe('sk-123');

    s.save(p, { ...base, model: 'm2', taskModels: { classify: 'small' } });
    expect(s.forUse(p)).toMatchObject({
      apiKey: 'sk-123',
      model: 'm2',
      taskModels: { classify: 'small' },
    });

    s.save(p, base, '');
    expect(s.get(p)?.hasKey).toBe(false);
  });

  it('disabled project gives no settings for use, unless asked for a test', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    services.aiSettings.save(p, { ...base, enabled: false }, 'k');
    expect(services.aiSettings.forUse(p)).toBeNull();
    expect(services.aiSettings.forUse(p, { even: true })?.apiKey).toBe('k');
  });

  it('refuses to store a key when encryption is unavailable', () => {
    const { services, defaultProjectId: p } = createMemoryServices(fakeCipher(false));
    expect(() => services.aiSettings.save(p, base, 'k')).toThrow(/encryption/);
    expect(services.aiSettings.save(p, base).hasKey).toBe(false);
  });

  it('keeps the month total (resets on a new month) and the last 200 audit rows', () => {
    const { services, defaultProjectId: p } = createMemoryServices();
    const s = services.aiSettings;
    s.save(p, { ...base, limitTokens: 1000, priceIn: 1, priceOut: 2 });
    expect(s.get(p)).toMatchObject({ limitTokens: 1000, priceIn: 1, priceOut: 2 });
    s.saveUsage(p, { month: '2026-11', tokens: 50, cost: 1, calls: 2 });
    expect(s.usageOf(p, '2026-11').tokens).toBe(50);
    expect(s.usageOf(p, '2026-12')).toEqual({ month: '2026-12', tokens: 0, cost: 0, calls: 0 });
    for (let i = 0; i < 205; i++) s.addAudit(p, { at: String(i), action: 'save', allowed: false });
    const log = s.audit(p);
    expect(log).toHaveLength(200);
    expect(log[0]?.at).toBe('204');
  });
});
