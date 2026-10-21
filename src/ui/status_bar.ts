import * as vscode from 'vscode';
import { ModelQuotaInfo, UnifiedQuotaSnapshot } from '../types';

const ABBREVIATIONS: Record<string, string> = {
  'Claude Opus 5.5 (High)': 'CO5.5(H)',
  'Claude Opus 5.5 (Low)': 'CO5.5(L)',
  'Claude Opus 5.5 (Medium)': 'CO5.5(M)',
  'Claude Sonnet 5.5 (High)': 'CS5.5(H)',
  'Claude Sonnet 5.5 (Low)': 'CS5.5(L)',
  'Claude Sonnet 5.5 (Medium)': 'CS5.5(M)',
  'Gemini 3.8 Flash (High)': 'G3FH',
  'Gemini 3.8 Flash (Low)': 'G3FL',
  'Gemini 3.8 Flash (Medium)': 'G3FM',
  'Gemini 3.1 Pro (High)': 'G3.1PH',
  'Gemini 3.1 Pro (Low)': 'G3.1PL',
};

function getAbbreviation(label: string): string {
  if (ABBREVIATIONS[label]) {
    return ABBREVIATIONS[label];
  }
  if (label.startsWith('Claude Code')) {
    return label.includes('Weekly') ? 'Claude(7d)' : 'Claude(5h)';
  }
  if (label.startsWith('Codex')) {
    return label.includes('Weekly') ? 'Codex(7d)' : 'Codex(5h)';
  }
  return label
    .split(/[\s\-_()]+/)
    .filter(Boolean)
    .map(w => {
      const match = w.match(/^([A-Za-z]?)(.*)$/);
      if (match) {
        return match[1].toUpperCase() + (w.match(/\d+/) || [''])[0];
      }
      return w[0]?.toUpperCase() || '';
    })
    .join('')
    .slice(0, 5);
}

export class StatusBarManager {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'aiq.showMenu';
    this.item.text = '$(sync~spin) AIQ';
    this.item.tooltip = 'Click to view Antigravity, Claude Code & Codex quotas';
    this.item.show();
  }

  showLoading(): void {
    this.item.text = '$(sync~spin) AIQ';
    this.item.show();
  }

  update(snapshot: UnifiedQuotaSnapshot, pinnedIds: string[]): void {
    const allModels: ModelQuotaInfo[] = [
      ...(snapshot.providers.antigravity?.models || []),
      ...(snapshot.providers.claude?.models || []),
      ...(snapshot.providers.codex?.models || []),
    ];

    let pinnedModels = allModels.filter(m => pinnedIds.includes(m.id));

    if (pinnedModels.length === 0) {
      const firstAg = snapshot.providers.antigravity?.models?.[0];
      const firstClaude = snapshot.providers.claude?.models?.[0];
      const firstCodex = snapshot.providers.codex?.models?.[0];
      pinnedModels = [firstAg, firstClaude, firstCodex].filter((m): m is ModelQuotaInfo => !!m);
    }

    if (pinnedModels.length === 0) {
      this.item.text = '$(rocket) AIQ';
      this.item.show();
      return;
    }

    const parts: string[] = [];
    for (const m of pinnedModels) {
      const pct = m.remainingPercentage !== undefined ? `${m.remainingPercentage.toFixed(0)}%` : 'N/A';
      const statusIcon = m.isExhausted ? '$(error)' : m.remainingPercentage !== undefined && m.remainingPercentage < 20 ? '$(warning)' : '$(check)';
      const abbrev = getAbbreviation(m.label);
      parts.push(`${statusIcon} ${abbrev}: ${pct}`);
    }

    this.item.text = parts.join('  ');
    this.item.show();
  }

  dispose(): void {
    this.item.dispose();
  }
}
