import type { Translation } from '../types';

/** English. Must have exactly the same keys as `vi.ts` (enforced by the type). */
import { enUi } from './en-ui';

export const en = {
  ui: enUi,
  app: {
    name: 'Kiemi',
    slogan: 'Let Kiemi do the checking.',
    version: 'Version {{version}}',
  },
  common: {
    run: 'Run',
    record: 'Record',
    save: 'Save',
    cancel: 'Cancel',
    undo: 'Undo',
    loading: 'Loading…',
  },
  errors: {
    stepPrefix: 'Step {{step}}: {{message}}',
    element: {
      generic: 'the element',
      named: '“{{name}}”',
      role: '{{role}} “{{name}}”',
      roleOnly: '{{role}}',
      label: 'field “{{value}}”',
      placeholder: 'field “{{value}}”',
      text: 'text “{{value}}”',
    },
    roles: {
      button: 'button',
      link: 'link',
      textbox: 'text box',
      checkbox: 'checkbox',
      radio: 'radio button',
      combobox: 'dropdown',
      option: 'option',
      heading: 'heading',
      cell: 'cell',
      row: 'row',
      tab: 'tab',
      menuitem: 'menu item',
      img: 'image',
      dialog: 'dialog',
      other: 'element',
    },
    values: {
      visible: 'visible',
      hidden: 'hidden',
      notExist: 'not on the page',
      'not visible': 'not visible',
    },
    codes: {
      UNKNOWN_ACTION: {
        message: 'Unknown action “{{action}}”.',
        hint: 'This test may come from a newer Kiemi. Please update the app.',
      },
      INVALID_PARAMS: {
        message: 'Some information of this step is missing or wrong.',
        hint: 'Open the step and fill in the fields marked in red.',
      },
      STEP_TIMEOUT: {
        message: 'The step did not finish within {{seconds}} seconds.',
        hint: 'The page may be slow. Increase the step timeout or add a “Wait until” step.',
      },
      STEP_FAILED: {
        message: 'The step failed: {{reason}}',
        hint: 'Run again. If it still fails, check the screenshot of this step.',
      },
      RUN_CANCELLED: { message: 'The run was stopped.', hint: 'Press Run to start again.' },
      ELEMENT_NOT_FOUND: {
        message: 'Could not find {{element}} after {{seconds}} seconds.',
        hint: 'Check the right page is open, or use “Pick element again” to point at it.',
      },
      ELEMENT_AMBIGUOUS: {
        message: '{{count}} places look like {{element}}; not sure which one to use.',
        hint: 'Choose “which one”, or add context such as “in the row with…” or “next to label…”.',
      },
      BROWSER_NOT_FOUND: {
        message: 'Browser {{browser}} is not installed.',
        hint: 'Install Edge or Chrome, or choose “Automatic” so Kiemi downloads a browser.',
      },
      BROWSER_DOWNLOAD_FAILED: {
        message: 'Could not download the browser.',
        hint: 'Check your internet connection and try again.',
      },
      BROWSER_LAUNCH_FAILED: {
        message: 'Could not start browser {{browser}}.',
        hint: 'Close some browser windows or restart the computer, then try again.',
      },
      UNKNOWN_DEVICE: {
        message: 'There is no device “{{device}}” to emulate.',
        hint: 'Pick a device from the list.',
      },
      NO_BROWSER: {
        message: 'This run has no browser open.',
        hint: 'Run again. If it still fails, send us an error report.',
      },
      PROXY_SECRET_MISSING: {
        message: 'The proxy password (secret “{{secret}}”) is missing.',
        hint: 'Go to Environment → Secrets to enter it.',
      },
      APP_NOT_AVAILABLE: {
        message: 'Product “{{product}}” is not set up in environment “{{environment}}”.',
        hint: 'Go to Environments and enter this product’s address in that environment’s column — or pick another environment when running.',
      },
      UNKNOWN_PRODUCT: {
        message: 'The project has no product “{{product}}”.',
        hint: 'Check the product name after “app.”, or add this product to the project.',
      },
      PROTECTED_ENVIRONMENT: {
        message:
          'Environment “{{environment}}” is protected, so Kiemi does not run tests with steps that write data (cleanup steps, API calls that add/change/delete).',
        hint: 'Run on another environment, or remove the data-writing steps from this test. Only turn protection off when you are sure.',
      },
      UNKNOWN_VARIABLE: {
        message: 'There is no variable “{{name}}”.',
        hint: 'Check the variable name, or add a “Save value to variable” step before this one.',
      },
      INVALID_EXPRESSION: {
        message: 'The formula is not valid: {{expression}}',
        hint: 'Check brackets, quotes and operators.',
      },
      CONSOLE_ERROR: {
        message: 'The web page reported an error: {{message}}',
        hint: 'The problem is in the web page, not the test. Tell the developers, or turn off “Stop when the page reports errors”.',
      },
      HTTP_ERROR: {
        message: 'A request from the page failed with {{status}}.',
        hint: 'The server may be failing. Tell the developers, or turn off “Stop when the server reports errors”.',
      },
      ASSERTION_FAILED: {
        message: 'Check failed: expected “{{expected}}” but found “{{actual}}”.',
        hint: 'If the new result is correct, update the expected value of the step.',
      },
      CONDITION_TIMEOUT: {
        message: 'After {{seconds}} seconds the condition is still not met.',
        hint: 'Increase the wait time, or check the condition.',
      },
      API_ERROR: {
        message: 'Could not call {{url}}.',
        hint: 'Check the address, network/VPN and the environment proxy.',
      },
      FILE_NOT_FOUND: {
        message: 'File {{file}} not found.',
        hint: 'Check the file still exists and the path is right.',
      },
      LOGIN_NOT_SAVED: {
        message: 'No saved login named “{{name}}”.',
        hint: 'First run a test with a “Save login” step using this name, or record and press “Save login”.',
      },
      LOGIN_EXPIRED: {
        message: 'The saved login “{{name}}” has expired.',
        hint: 'Run the test with the “Save login” step again to save a fresh session.',
      },
      TAB_NOT_FOUND: {
        message: 'Tab “{{value}}” not found.',
        hint: 'The tab may not be open yet. Add a wait before this step.',
      },
      UNKNOWN_SHARED_STEP: {
        message: 'Shared step “{{shared}}” not found.',
        hint: 'The shared step may have been deleted or renamed.',
      },
      ACTION_FAILED: {
        message: 'Could not do the action: {{reason}}',
        hint: 'Check the screenshot of the step to see the page state.',
      },
      ENGINE_ERROR: {
        message: 'Kiemi hit an unexpected problem.',
        hint: 'Run again. If it still fails, send us an error report.',
      },
      ENGINE_CRASHED: {
        message: 'The test runner stopped unexpectedly.',
        hint: 'The app is still working. Click Run to try again.',
      },
      SSH_FAILED: {
        message: 'Could not connect to the environment’s SSH server.',
        hint: 'Go to Environments → SSH and click “Test connection” for details.',
      },
    },
  },
  recorder: {
    recording: 'Recording',
    steps: '{{count}} steps',
    addCheck: 'Add check',
    saveValue: 'Save value',
    saveLogin: 'Save login',
    stop: 'Stop',
    pickHint: 'Click an element on the page · Esc to cancel',
    checkVisible: 'Is visible',
    checkText: 'Has text “{{value}}”',
    checkValue: 'Has value “{{value}}”',
    checkChecked: 'Is selected',
    saveText: 'Save text “{{value}}”',
    saveFieldValue: 'Save field value “{{value}}”',
    variableName: 'Variable name',
    invalidName: 'Use letters without accents, digits and _, not starting with a digit',
    loginName: 'Login session name',
    cancel: 'Cancel',
    matches: '{{count}} matching elements',
    suggestTitle: 'Suggested checks',
    suggestToast: 'Shows message “{{text}}”',
    suggestRow: 'Has row “{{text}}”',
    suggestVisible: 'Shows “{{text}}”',
    suggestUrl: 'Page address contains “{{text}}”',
    accept: 'Add',
    dismiss: 'Dismiss',
    picked: 'Selected',
  },
  settings: {
    language: 'Language',
    languages: {
      vi: 'Tiếng Việt',
      en: 'English',
    },
  },
} as const satisfies Translation;
