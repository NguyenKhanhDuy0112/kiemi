import { DEFAULT_MESSAGES, type MessageCatalog } from '@kiemi/schema';

/** Only the messages the tester changed are kept; empty or equal-to-default ones are dropped. */
export function changedMessages(draft: MessageCatalog): MessageCatalog {
  const out: MessageCatalog = {};
  for (const [k, v] of Object.entries(draft)) {
    const t = v.trim();
    if (t && t !== DEFAULT_MESSAGES[k]) out[k] = t;
  }
  return out;
}
