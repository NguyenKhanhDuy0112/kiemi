import { describe, expect, it } from 'vitest';
import { draftProblem, fieldsOf, newDraft } from './notify-form';

describe('notification form [X-03]', () => {
  it('asks for the missing piece of each kind', () => {
    const slack = newDraft('slack');
    expect(draftProblem(slack)).toBe('name');
    expect(draftProblem({ ...slack, name: 'QA' })).toBe('secret');
    expect(draftProblem({ ...slack, name: 'QA', secret: 'https://x' })).toBeNull();
    // editing keeps the stored secret
    expect(draftProblem({ ...slack, name: 'QA', hasSecret: true })).toBeNull();

    const tg = { ...newDraft('telegram'), name: 'T', secret: '1:abc' };
    expect(draftProblem(tg)).toBe('chatId');
    expect(draftProblem({ ...tg, config: { ...tg.config, chatId: '-1' } })).toBeNull();

    const mail = { ...newDraft('email'), name: 'M' };
    expect(draftProblem(mail)).toBe('host');
    expect(draftProblem({ ...mail, config: { ...mail.config, host: 'h' } })).toBe('addresses');
    expect(
      draftProblem({ ...mail, config: { ...mail.config, host: 'h', from: 'a@x', to: 'b@x' } }),
    ).toBeNull();
  });
  it('shows chat id only for Telegram and SMTP fields only for email', () => {
    expect(fieldsOf('slack')).toEqual([]);
    expect(fieldsOf('telegram')).toEqual(['chatId']);
    expect(fieldsOf('email')).toEqual(['smtp']);
  });
});
