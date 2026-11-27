import { EnvSchema } from '@kiemi/schema';
import { describe, expect, it } from 'vitest';
import { clientCertsFor } from './proxy';

const env = (clientCerts: unknown) => EnvSchema.parse({ id: 'e', name: 'UAT', clientCerts });

describe('client certificates [W-02]', () => {
  it('gives Playwright the files and the passphrase from the secrets', () => {
    const e = env([
      { origin: 'https://bank.example.com', pfxPath: '/c/a.pfx', passphraseSecret: 'certPass' },
      { origin: 'https://b.example.com', certPath: '/c/b.pem', keyPath: '/c/b.key' },
    ]);
    expect(clientCertsFor(e, { certPass: 's3cret' })).toEqual([
      { origin: 'https://bank.example.com', pfxPath: '/c/a.pfx', passphrase: 's3cret' },
      { origin: 'https://b.example.com', certPath: '/c/b.pem', keyPath: '/c/b.key' },
    ]);
  });

  it('says which secret is missing; nothing configured → undefined', () => {
    const e = env([{ origin: 'https://x.example.com', pfxPath: '/a.pfx', passphraseSecret: 'p' }]);
    expect(() => clientCertsFor(e, {})).toThrow(/Secret "p"/);
    expect(clientCertsFor(env(undefined), {})).toBeUndefined();
  });

  it('refuses an entry without a PFX or a cert + key pair', () => {
    expect(() => env([{ origin: 'https://x.example.com', certPath: '/only.pem' }])).toThrow();
  });
});
