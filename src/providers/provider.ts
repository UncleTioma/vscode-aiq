import { ProviderSnapshot } from '../types';

export interface IQuotaProvider {
  readonly name: 'antigravity' | 'claude' | 'codex';
  fetchQuota(): Promise<ProviderSnapshot>;
}
