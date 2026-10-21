import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IQuotaProvider } from './provider';
import { ModelQuotaInfo, ProviderSnapshot } from '../types';
import { formatResetTime } from '../utils/time';

interface RateWindow {
  used_percent?: number;
  window_minutes?: number;
  resets_at?: number;
}

interface RateLimits {
  primary?: RateWindow;
  secondary?: RateWindow;
  plan_type?: string;
}

const TAIL_BYTES = 512 * 1024;
const MAX_FILES_TO_SCAN = 15;

async function listSessionFiles(baseDir: string): Promise<Array<{ file: string; mtimeMs: number }>> {
  const files: Array<{ file: string; mtimeMs: number }> = [];
  const queue: string[] = [baseDir];
  while (queue.length > 0) {
    const current = queue.shift()!;
    try {
      const entries = await fs.promises.readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          queue.push(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
          const stat = await fs.promises.stat(fullPath);
          files.push({ file: fullPath, mtimeMs: stat.mtimeMs });
        }
      }
    } catch {
      continue;
    }
  }
  return files.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function readTail(file: string): Promise<string> {
  const handle = await fs.promises.open(file, 'r');
  try {
    const { size } = await handle.stat();
    const length = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(length);
    await handle.read(buf, 0, length, size - length);
    return buf.toString('utf8');
  } finally {
    await handle.close();
  }
}

async function findLatestRateLimits(baseDir: string): Promise<{ limits: RateLimits; timestamp: number } | null> {
  const files = (await listSessionFiles(baseDir)).slice(0, MAX_FILES_TO_SCAN);
  let best: { limits: RateLimits; timestamp: number } | null = null;
  for (const { file } of files) {
    const lines = (await readTail(file)).split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"rate_limits"')) {
        continue;
      }
      try {
        const parsed = JSON.parse(lines[i]);
        const limits: RateLimits | undefined = parsed.payload?.rate_limits;
        if (parsed.payload?.type === 'token_count' && limits && (limits.primary || limits.secondary)) {
          const timestamp = new Date(parsed.timestamp).getTime();
          if (!best || timestamp > best.timestamp) {
            best = { limits, timestamp };
          }
          break;
        }
      } catch {
        continue;
      }
    }
  }
  return best;
}

export class CodexProvider implements IQuotaProvider {
  readonly name = 'codex' as const;

  async fetchQuota(): Promise<ProviderSnapshot> {
    try {
      const sessionsDir = path.join(os.homedir(), '.codex', 'sessions');
      if (!fs.existsSync(sessionsDir)) {
        return {
          provider: this.name,
          models: [],
          lastUpdated: new Date(),
          error: 'Codex sessions not found (~/.codex/sessions)',
        };
      }

      const found = await findLatestRateLimits(sessionsDir);
      if (!found) {
        return {
          provider: this.name,
          models: [],
          lastUpdated: new Date(),
          error: 'No Codex rate limit data yet (run a Codex request first)',
        };
      }

      const plan = (found.limits.plan_type || '').toUpperCase();
      const planSuffix = plan ? ` (${plan})` : '';
      const models: ModelQuotaInfo[] = [];

      for (const win of [found.limits.primary, found.limits.secondary]) {
        if (!win || win.used_percent === undefined || !win.window_minutes) {
          continue;
        }
        const isWeekly = win.window_minutes >= 24 * 60;
        const resetTime = win.resets_at ? new Date(win.resets_at * 1000) : new Date(found.timestamp + win.window_minutes * 60000);
        // The window already rolled over since the last logged event: usage is back to zero.
        const expired = resetTime.getTime() <= Date.now();
        const remainingPercentage = expired ? 100 : Math.max(0, 100 - win.used_percent);
        const timeUntilResetMs = Math.max(0, resetTime.getTime() - Date.now());

        models.push({
          id: isWeekly ? 'codex:7d-quota' : 'codex:5h-quota',
          provider: this.name,
          label: `Codex ${isWeekly ? '7d Weekly' : '5h Session'}${planSuffix}`,
          remainingFraction: remainingPercentage / 100,
          remainingPercentage,
          isExhausted: remainingPercentage <= 0,
          resetTime,
          timeUntilResetMs,
          timeUntilResetFormatted: formatResetTime(timeUntilResetMs, resetTime),
        });
      }

      models.sort((a, b) => (a.id === 'codex:5h-quota' ? -1 : b.id === 'codex:5h-quota' ? 1 : 0));

      return {
        provider: this.name,
        models,
        lastUpdated: new Date(),
      };
    } catch (err: any) {
      return {
        provider: this.name,
        models: [],
        lastUpdated: new Date(),
        error: err.message || 'Error fetching Codex quota',
      };
    }
  }
}
