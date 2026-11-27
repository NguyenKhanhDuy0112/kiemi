import { describe, expect, it } from 'vitest';
import { createMemoryServices, fakeCipher } from './testing';

const base = {
  enabled: true,
  kind: 'claude' as const,
  model: 'm1',
  taskModels: {},
  baseUrl: '',
  localOnly: false,
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
});
