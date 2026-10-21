import * as vscode from 'vscode';
import { ModelQuotaInfo, UnifiedQuotaSnapshot } from '../types';
import { drawProgressBar } from '../utils/time';

interface QuotaQuickPickItem extends vscode.QuickPickItem {
  modelId?: string;
}

export class QuickPickMenu {
  static show(
    snapshot: UnifiedQuotaSnapshot,
    onTogglePin: (modelId: string) => Promise<void>,
    isPinned: (modelId: string) => boolean
  ): void {
    const pick = vscode.window.createQuickPick<QuotaQuickPickItem>();
    pick.title = 'AI Quota Monitor';
    pick.placeholder = 'Click a model to toggle its visibility in the status bar';
    pick.matchOnDescription = false;
    pick.matchOnDetail = false;
    pick.canSelectMany = false;

    const buildItems = (): QuotaQuickPickItem[] => {
      const items: QuotaQuickPickItem[] = [];

      const renderSection = (title: string, models: ModelQuotaInfo[], error?: string) => {
        items.push({
          label: title,
          kind: vscode.QuickPickItemKind.Separator,
        });

        if (models.length === 0) {
          items.push({
            label: '$(info) No data available',
            description: error || 'Not detected or offline',
          });
          return;
        }

        for (const m of models) {
          const pct = m.remainingPercentage;
          const pctDisplay = pct !== undefined ? `${pct.toFixed(1)}%` : 'N/A';
          const bar = pct !== undefined ? drawProgressBar(pct) : '░'.repeat(10);
          const pinned = isPinned(m.id);

          const selectionIcon = pinned ? '$(check)' : '$(circle-outline)';
          const statusIcon = m.isExhausted ? '$(error)' : pct !== undefined && pct < 20 ? '$(warning)' : '';

          items.push({
            label: `${selectionIcon} ${statusIcon ? statusIcon + ' ' : ''}${m.label}`,
            description: `${bar} ${pctDisplay}`,
            detail: `    Resets in: ${m.timeUntilResetFormatted}`,
            modelId: m.id,
          });
        }
      };

      renderSection('Antigravity Models', snapshot.providers.antigravity?.models || [], snapshot.providers.antigravity?.error);
      renderSection('Claude Code', snapshot.providers.claude?.models || [], snapshot.providers.claude?.error);
      renderSection('OpenAI Codex', snapshot.providers.codex?.models || [], snapshot.providers.codex?.error);

      return items;
    };

    pick.items = buildItems();

    let activeItem: QuotaQuickPickItem | undefined;
    pick.onDidChangeActive(items => {
      activeItem = items[0];
    });

    pick.onDidAccept(async () => {
      if (activeItem && activeItem.modelId) {
        await onTogglePin(activeItem.modelId);
        pick.items = buildItems();
      }
    });

    pick.onDidHide(() => {
      pick.dispose();
    });

    pick.show();
  }
}
