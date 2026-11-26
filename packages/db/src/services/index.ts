import type { RepoContext } from '../repo';
import { DatasetService } from './datasets';
import { ElementService } from './elements';
import { EnvironmentService, type SecretCipher } from './environments';
import { NotifyChannelService } from './notify-channels';
import { ProductService } from './products';
import { FolderService, ProjectService } from './projects';
import { RunService } from './runs';
import { SavedLoginService } from './saved-logins';
import { SettingsService } from './settings';
import { SharedResourceService } from './shared-resources';
import { SharedStepService } from './shared-steps';
import { SuiteService } from './suites';
import { TestCaseService } from './test-cases';

export * from './datasets';
export * from './elements';
export * from './environments';
export * from './notify-channels';
export * from './products';
export * from './projects';
export * from './runs';
export * from './saved-logins';
export * from './settings';
export * from './shared-resources';
export * from './shared-steps';
export * from './suites';
export * from './test-cases';
export * from './workspace';

export interface Services {
  readonly ctx: RepoContext;
  readonly projects: ProjectService;
  readonly products: ProductService;
  readonly folders: FolderService;
  readonly testCases: TestCaseService;
  readonly suites: SuiteService;
  readonly sharedSteps: SharedStepService;
  readonly sharedResources: SharedResourceService;
  readonly elements: ElementService;
  readonly environments: EnvironmentService;
  readonly datasets: DatasetService;
  readonly settings: SettingsService;
  readonly runs: RunService;
  readonly savedLogins: SavedLoginService;
  readonly notifyChannels: NotifyChannelService;
}

/** All data services of one workspace. */
export function createServices(ctx: RepoContext, cipher: SecretCipher): Services {
  return {
    ctx,
    projects: new ProjectService(ctx),
    products: new ProductService(ctx),
    folders: new FolderService(ctx),
    testCases: new TestCaseService(ctx),
    suites: new SuiteService(ctx),
    sharedSteps: new SharedStepService(ctx),
    sharedResources: new SharedResourceService(ctx),
    elements: new ElementService(ctx),
    environments: new EnvironmentService(ctx, cipher),
    datasets: new DatasetService(ctx),
    settings: new SettingsService(ctx),
    runs: new RunService(ctx),
    savedLogins: new SavedLoginService(ctx, cipher),
    notifyChannels: new NotifyChannelService(ctx, cipher),
  };
}
