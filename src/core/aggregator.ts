import { IQuotaProvider } from '../providers/provider';
import { AntigravityProvider } from '../providers/antigravity';
import { ClaudeCodeProvider } from '../providers/claude';
import { CodexProvider } from '../providers/codex';
import { ModelQuotaInfo, ProviderSnapshot, UnifiedQuotaSnapshot } from '../types';

export class QuotaAggregator {
  private providers: IQuotaProvider[];
  private currentSnapshot: UnifiedQuotaSnapshot | null = null;
  private updateCallbacks: Array<(snapshot: UnifiedQuotaSnapshot) => void> = [];
  private pollingTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.providers = [
      new AntigravityProvider(),
      new ClaudeCodeProvider(),
      new CodexProvider(),
    ];
  }

  onUpdate(callback: (snapshot: UnifiedQuotaSnapshot) => void): void {
    this.updateCallbacks.push(callback);
  }

  startPolling(intervalMs: number): void {
    this.stopPolling();
    this.refresh();
    this.pollingTimer = setInterval(() => {
      this.refresh();
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  async refresh(): Promise<UnifiedQuotaSnapshot> {
    const results = await Promise.allSettled(
      this.providers.map(p => p.fetchQuota())
    );

    const defaultSnapshot = (provider: 'antigravity' | 'claude' | 'codex'): ProviderSnapshot => ({
      provider,
      models: [],
      lastUpdated: new Date(),
    });

    const snapshotMap: Record<'antigravity' | 'claude' | 'codex', ProviderSnapshot> = {
      antigravity: defaultSnapshot('antigravity'),
      claude: defaultSnapshot('claude'),
      codex: defaultSnapshot('codex'),
    };

    results.forEach((res, index) => {
      const providerName = this.providers[index].name;
      if (res.status === 'fulfilled') {
        snapshotMap[providerName] = res.value;
      } else {
        snapshotMap[providerName] = {
          provider: providerName,
          models: [],
          lastUpdated: new Date(),
          error: res.reason?.message || 'Failed to fetch',
        };
      }
    });

    const unified: UnifiedQuotaSnapshot = {
      timestamp: new Date(),
      providers: snapshotMap,
    };

    this.currentSnapshot = unified;
    for (const cb of this.updateCallbacks) {
      cb(unified);
    }

    return unified;
  }

  getCurrentSnapshot(): UnifiedQuotaSnapshot | null {
    return this.currentSnapshot;
  }

  getAllModels(): ModelQuotaInfo[] {
    if (!this.currentSnapshot) {
      return [];
    }
    const agModels = this.currentSnapshot.providers.antigravity?.models || [];
    const claudeModels = this.currentSnapshot.providers.claude?.models || [];
    const codexModels = this.currentSnapshot.providers.codex?.models || [];
    return [...agModels, ...claudeModels, ...codexModels];
  }
}
