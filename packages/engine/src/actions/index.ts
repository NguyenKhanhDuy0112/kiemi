import { assertionActions } from '../assertions/actions';
import { type ActionDefinition, ActionRegistry } from '../define-action';
import { apiAction } from './api';
import {
  assertRequestAction,
  clipboardAction,
  networkAction,
  permissionAction,
} from './browser-env';
import { callAction } from './call';
import { checkAction } from './check';
import { clearAction } from './clear';
import { clearDataAction } from './clear-data';
import { clickAction } from './click';
import { clockAction } from './clock';
import { dialogAction } from './dialog';
import { downloadAction } from './download';
import { extractAction } from './extract';
import { extractTableAction } from './extract-table';
import {
  assertFieldUiAction,
  assertLeaveWarningAction,
  assertTabOrderAction,
  stripClientValidationAction,
} from './field-ui';
import { fillAction } from './fill';
import { generateFileAction } from './generate-file';
import { gotoAction } from './goto';
import { gridFilterAction, gridRowAction } from './grid';
import { hoverAction } from './hover';
import { ifAction } from './if';
import { markLiveAction } from './live';
import { loopAction } from './loop';
import { navigateAction } from './navigate';
import { observeAction } from './observe';
import { assertI18nAction, assertLayoutAction, assertSeoAction } from './page-audit';
import { pickDateAction, pickDateRangeAction } from './pick-date';
import { pickOptionAction } from './pick-option';
import { pressAction } from './press';
import { propagateAction } from './propagate';
import { queryDbAction } from './query-db';
import { saveSessionAction, useSessionAction } from './saved-login';
import { scrollAction } from './scroll';
import { selectAction } from './select';
import { switchSessionAction } from './switch-session';
import {
  assertTabCountAction,
  captureTabAction,
  closeTabAction,
  newTabAction,
  openInAction,
  switchTabAction,
} from './tabs';
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
  pickDateRangeAction,
  pickOptionAction,
  pressAction,
  scrollAction,
  uploadAction,
  navigateAction,
  newTabAction,
  switchTabAction,
  closeTabAction,
  captureTabAction,
  assertTabCountAction,
  openInAction,
  dialogAction,
  switchSessionAction,
  saveSessionAction,
  useSessionAction,
  clearDataAction,
  queryDbAction,
  clockAction,
  markLiveAction,
  networkAction,
  permissionAction,
  clipboardAction,
  assertRequestAction,
  stripClientValidationAction,
  assertFieldUiAction,
  assertTabOrderAction,
  assertLeaveWarningAction,
  assertSeoAction,
  assertI18nAction,
  assertLayoutAction,
  observeAction,
  propagateAction,
  gridRowAction,
  gridFilterAction,
  waitAction,
  extractAction,
  extractTableAction,
  downloadAction,
  generateFileAction,
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
