import { ENV_TYPE_COLORS, type EnvType } from '@kiemi/schema';

/** Colour of an environment: its own, else its type's [O-03]. */
export function envColor(e: { type?: EnvType | null; color?: string | null }): string {
  return e.color || ENV_TYPE_COLORS[e.type ?? 'other'];
}
