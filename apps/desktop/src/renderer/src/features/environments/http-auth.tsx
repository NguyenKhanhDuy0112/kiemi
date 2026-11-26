import type { HttpAuth } from '@kiemi/schema';
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
import { useState } from 'react';

const NONE = '__none__';

/**
 * HTTP Basic / NTLM / Windows login of an environment: user name + the secret that
 * holds the password, optionally limited to one site [W-01].
 */
export function HttpAuthForm({
  value,
  secretNames,
  onSave,
}: {
  value: HttpAuth | null | undefined;
  secretNames: string[];
  onSave: (next: HttpAuth | null) => void;
}) {
  const tx = useTx();
  const [username, setUsername] = useState(value?.username ?? '');
  const [secret, setSecret] = useState(value?.passwordSecret ?? NONE);
  const [origin, setOrigin] = useState(value?.origin ?? '');
  const originOk = origin === '' || /^https?:\/\/[^\s/]+$/.test(origin);
  const ready = username.trim() !== '' && secret !== NONE && originOk;
  return (
    <div className="flex flex-col gap-3 rounded-md border p-3">
      <div>
        <p className="text-sm font-medium">{tx('ui.environments.httpAuth.title')}</p>
        <p className="mt-1 text-xs text-muted-foreground">{tx('ui.environments.httpAuth.hint')}</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="http-auth-user">{tx('ui.environments.httpAuth.username')}</Label>
          <Input
            id="http-auth-user"
            value={username}
            onChange={(ev) => setUsername(ev.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="http-auth-secret">{tx('ui.environments.httpAuth.password')}</Label>
          <Select value={secret} onValueChange={setSecret}>
            <SelectTrigger id="http-auth-secret" className="w-full">
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
        <div className="col-span-2 flex flex-col gap-1.5">
          <Label htmlFor="http-auth-origin">{tx('ui.environments.httpAuth.origin')}</Label>
          <Input
            id="http-auth-origin"
            value={origin}
            placeholder={tx('ui.examples.httpAuthOrigin')}
            aria-invalid={!originOk}
            onChange={(ev) => setOrigin(ev.target.value)}
          />
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={!ready}
          onClick={() =>
            onSave({
              username: username.trim(),
              passwordSecret: secret,
              ...(origin ? { origin } : {}),
            })
          }
        >
          {tx('ui.actions.save')}
        </Button>
        {value && (
          <Button size="sm" variant="outline" onClick={() => onSave(null)}>
            {tx('ui.environments.httpAuth.remove')}
          </Button>
        )}
      </div>
    </div>
  );
}
