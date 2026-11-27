import { type ClientCert, ClientCertSchema } from '@kiemi/schema';
import { Button } from '@renderer/components/ui/button';
import { Input } from '@renderer/components/ui/input';
import { Label } from '@renderer/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/components/ui/select';
import { useTx } from '@renderer/lib/tx';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

const NONE = '__none__';

/** Client certificates for sites that ask for one (mutual TLS): file paths + passphrase secret [W-02]. */
export function ClientCertsForm({
  value,
  secretNames,
  onSave,
}: {
  value: ClientCert[] | null | undefined;
  secretNames: string[];
  onSave: (next: ClientCert[]) => void;
}) {
  const tx = useTx();
  const list = value ?? [];
  const [origin, setOrigin] = useState('');
  const [pfx, setPfx] = useState('');
  const [cert, setCert] = useState('');
  const [key, setKey] = useState('');
  const [secret, setSecret] = useState(NONE);
  const candidate = {
    origin: origin.trim(),
    ...(pfx.trim()
      ? { pfxPath: pfx.trim() }
      : { certPath: cert.trim() || undefined, keyPath: key.trim() || undefined }),
    ...(secret !== NONE ? { passphraseSecret: secret } : {}),
  };
  const parsed = ClientCertSchema.safeParse(candidate);
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3" data-testid="client-certs">
      <div>
        <p className="text-sm font-medium">{tx('ui.environments.certs.title')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{tx('ui.environments.certs.hint')}</p>
      </div>
      {list.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {list.map((c) => (
            <li key={c.origin} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate">
                {c.origin} · {c.pfxPath ?? c.certPath}
              </span>
              <Button
                size="icon"
                variant="ghost"
                aria-label={tx('ui.actions.delete')}
                onClick={() => onSave(list.filter((x) => x.origin !== c.origin))}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="cert-origin">{tx('ui.environments.certs.origin')}</Label>
          <Input
            id="cert-origin"
            value={origin}
            placeholder={tx('ui.examples.certOrigin')}
            onChange={(e) => setOrigin(e.target.value)}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="cert-pfx">{tx('ui.environments.certs.pfx')}</Label>
          <Input id="cert-pfx" value={pfx} onChange={(e) => setPfx(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cert-pem">{tx('ui.environments.certs.cert')}</Label>
          <Input
            id="cert-pem"
            value={cert}
            disabled={pfx !== ''}
            onChange={(e) => setCert(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cert-key">{tx('ui.environments.certs.key')}</Label>
          <Input
            id="cert-key"
            value={key}
            disabled={pfx !== ''}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="cert-secret">{tx('ui.environments.certs.passphrase')}</Label>
          <Select value={secret} onValueChange={setSecret}>
            <SelectTrigger id="cert-secret" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{tx('ui.environments.noSecret')}</SelectItem>
              {secretNames.map((n) => (
                <SelectItem key={n} value={n}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button
        size="sm"
        className="self-start"
        disabled={!parsed.success}
        onClick={() => {
          if (!parsed.success) return;
          onSave([...list.filter((c) => c.origin !== parsed.data.origin), parsed.data]);
          setOrigin('');
          setPfx('');
          setCert('');
          setKey('');
          setSecret(NONE);
        }}
      >
        {tx('ui.environments.certs.add')}
      </Button>
    </div>
  );
}
