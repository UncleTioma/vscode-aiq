export interface ModelQuotaInfo {
  id: string;
  provider: 'antigravity' | 'claude' | 'codex';
  label: string;
  remainingFraction?: number;
  remainingPercentage?: number;
  isExhausted: boolean;
  resetTime: Date;
  timeUntilResetMs: number;
  timeUntilResetFormatted: string;
}

export interface ProviderSnapshot {
  provider: 'antigravity' | 'claude' | 'codex';
  models: ModelQuotaInfo[];
  lastUpdated: Date;
  error?: string;
}

export interface UnifiedQuotaSnapshot {
  timestamp: Date;
  providers: Record<'antigravity' | 'claude' | 'codex', ProviderSnapshot>;
}
