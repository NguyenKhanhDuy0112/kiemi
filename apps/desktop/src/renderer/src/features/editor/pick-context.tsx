import type { HighlightResult } from '@kiemi/recorder';
import type { Locator } from '@kiemi/schema';
import { createContext, useContext } from 'react';

/**
 * Where "Chọn phần tử" / "Xem phần tử" point: the recording browser of the
 * editor by default, or the page of a paused run on the Run screen [C-06, FX-03].
 */
export interface PickSource {
  pick(): Promise<Locator | null>;
  highlight(locator: Locator): Promise<HighlightResult>;
}

export const PickSourceContext = createContext<PickSource | null>(null);

export const usePickSource = () => useContext(PickSourceContext);
