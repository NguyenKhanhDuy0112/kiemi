import { assertionActions } from '../assertions/actions';
import { type ActionDefinition, ActionRegistry } from '../define-action';
import { apiAction } from './api';
import { callAction } from './call';
import { checkAction } from './check';
import { clearAction } from './clear';
import { clearDataAction } from './clear-data';
import { clickAction } from './click';
import { dialogAction } from './dialog';
import { extractAction } from './extract';
import { extractTableAction } from './extract-table';
import { fillAction } from './fill';
import { gotoAction } from './goto';
import { hoverAction } from './hover';
import { ifAction } from './if';
import { loopAction } from './loop';
import { navigateAction } from './navigate';
import { pickDateAction } from './pick-date';
import { pressAction } from './press';
import { saveSessionAction, useSessionAction } from './saved-login';
import { scrollAction } from './scroll';
import { selectAction } from './select';
import { switchSessionAction } from './switch-session';
import { closeTabAction, newTabAction, switchTabAction } from './tabs';
import { uploadAction } from './upload';
import { waitAction } from './wait';
import { waitUntilAction } from './wait-until';

export { readPath } from './api';
export { normalizeKeys } from './press';

/** Every built-in action, in "add step" menu order. */
export const builtinActions: ActionDefinition[] = [
  gotoAction,
  fillAction,
  clearAction,
  clickAction,
  hoverAction,
  selectAction,
  checkAction,
  pickDateAction,
  pressAction,
  scrollAction,
  uploadAction,
  navigateAction,
  newTabAction,
  switchTabAction,
  closeTabAction,
  dialogAction,
  switchSessionAction,
  saveSessionAction,
  useSessionAction,
  clearDataAction,
  waitAction,
  extractAction,
  extractTableAction,
  callAction,
  waitUntilAction,
  ifAction,
  loopAction,
  apiAction,
  ...assertionActions,
];

export function createDefaultRegistry(): ActionRegistry {
  return new ActionRegistry(builtinActions);
}
