import * as vscode from 'vscode';
import { QuotaAggregator } from './core/aggregator';
import { StatusBarManager } from './ui/status_bar';
import { QuickPickMenu } from './ui/quick_pick';

let aggregator: QuotaAggregator | null = null;
let statusBar: StatusBarManager | null = null;

export function activate(context: vscode.ExtensionContext): void {
  aggregator = new QuotaAggregator();
  statusBar = new StatusBarManager();

  const getPinnedItems = (): string[] => {
    return vscode.workspace.getConfiguration('aiq').get<string[]>('pinnedItems') || [];
  };

  const togglePinnedItem = async (modelId: string): Promise<void> => {
    const config = vscode.workspace.getConfiguration('aiq');
    const pinned = [...getPinnedItems()];
    const idx = pinned.indexOf(modelId);
    if (idx >= 0) {
      pinned.splice(idx, 1);
    } else {
      pinned.push(modelId);
    }
    await config.update('pinnedItems', pinned, vscode.ConfigurationTarget.Global);
    const snap = aggregator?.getCurrentSnapshot();
    if (snap && statusBar) {
      statusBar.update(snap, pinned);
    }
  };

  aggregator.onUpdate(snapshot => {
    if (statusBar) {
      statusBar.update(snapshot, getPinnedItems());
    }
  });

  const config = vscode.workspace.getConfiguration('aiq');
  const refreshInterval = config.get<number>('refreshInterval') || 60000;
  aggregator.startPolling(refreshInterval);

  context.subscriptions.push(
    vscode.commands.registerCommand('aiq.showMenu', async () => {
      let snap = aggregator?.getCurrentSnapshot();
      if (!snap) {
        statusBar?.showLoading();
        snap = await aggregator?.refresh() || null;
      }
      if (snap) {
        QuickPickMenu.show(
          snap,
          togglePinnedItem,
          (id: string) => getPinnedItems().includes(id)
        );
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('aiq.refresh', async () => {
      statusBar?.showLoading();
      await aggregator?.refresh();
      vscode.window.showInformationMessage('AI Quotas refreshed');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('aiq.pinnedItems')) {
        const snap = aggregator?.getCurrentSnapshot();
        if (snap && statusBar) {
          statusBar.update(snap, getPinnedItems());
        }
      }
      if (e.affectsConfiguration('aiq.refreshInterval')) {
        const newInterval = vscode.workspace.getConfiguration('aiq').get<number>('refreshInterval') || 60000;
        aggregator?.startPolling(newInterval);
      }
    })
  );

  context.subscriptions.push({
    dispose: () => {
      aggregator?.stopPolling();
      statusBar?.dispose();
    },
  });
}

export function deactivate(): void {
  aggregator?.stopPolling();
  statusBar?.dispose();
}
