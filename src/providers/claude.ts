import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import { IQuotaProvider } from './provider';
import { ModelQuotaInfo, ProviderSnapshot } from '../types';
import { formatResetTime } from '../utils/time';

function findClaudeExecutable(): string | null {
  try {
    const cmd = process.platform === 'win32' ? 'where claude' : 'which claude';
    const out = execSync(cmd, { encoding: 'utf8' }).trim();
    const first = out.split('\n')[0].trim();
    if (fs.existsSync(first)) {
      return first;
    }
  } catch {}

  const localBin = path.join(os.homedir(), '.local', 'bin', process.platform === 'win32' ? 'claude.exe' : 'claude');
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  if (process.platform === 'win32') {
    const claudeData = path.join(os.homedir(), 'AppData', 'Local', 'Claude-Data');
    if (fs.existsSync(claudeData)) {
      try {
        const dirs = fs.readdirSync(claudeData).filter(d => d.startsWith('claude_'));
        for (const d of dirs) {
          const ccDir = path.join(claudeData, d, 'claude-code');
          if (fs.existsSync(ccDir)) {
            const vDirs = fs.readdirSync(ccDir);
            for (const vd of vDirs) {
              const hDirs = fs.readdirSync(path.join(ccDir, vd));
              for (const hd of hDirs) {
                const exe = path.join(ccDir, vd, hd, 'claude.exe');
                if (fs.existsSync(exe)) {
                  return exe;
                }
              }
            }
          }
        }
      } catch {}
    }
  }
  return null;
}

function queryClaudeUsageViaCli(claudeExe: string): Promise<any> {
  return new Promise((resolve, reject) => {
    let resolved = false;
    const proc = spawn(claudeExe, ['--output-format', 'stream-json', '--input-format', 'stream-json', '--verbose'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      shell: claudeExe.toLowerCase().endsWith('.cmd'),
    });

    let buffer = '';
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        proc.kill();
        reject(new Error('Claude usage query timeout'));
      }
    }, 4000);

    proc.stdout.on('data', chunk => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.trim()) {
          continue;
        }
        try {
          const p = JSON.parse(line);
          const reqId = p.response?.request_id || p.request_id;
          if (reqId === 'req_init') {
            proc.stdin.write(JSON.stringify({
              type: 'control_request',
              request_id: 'req_usage',
              request: { subtype: 'get_usage', skip_behaviors: true },
            }) + '\n');
          } else if (reqId === 'req_usage') {
            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              proc.kill();
              resolve(p.response?.response || p.response);
            }
          }
        } catch {}
      }
    });

    proc.on('error', err => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        reject(err);
      }
    });

    proc.stdin.write(JSON.stringify({
      type: 'control_request',
      request_id: 'req_init',
      request: { subtype: 'initialize', clientInfo: { name: 'aiq', version: '1.0' } },
    }) + '\n');
  });
}

export class ClaudeCodeProvider implements IQuotaProvider {
  readonly name = 'claude' as const;

  async fetchQuota(): Promise<ProviderSnapshot> {
    const claudeExe = findClaudeExecutable();
    if (claudeExe) {
      try {
        const usageData = await queryClaudeUsageViaCli(claudeExe);
        const rateLimits = usageData?.rate_limits;
        if (rateLimits && rateLimits.five_hour) {
          const models: ModelQuotaInfo[] = [];
          const fiveHour = rateLimits.five_hour;
          const usedPct = Number(fiveHour.utilization) || 0;
          const remPct = Math.max(0, 100 - usedPct);
          const remFraction = remPct / 100;
          const resetTime = fiveHour.resets_at ? new Date(fiveHour.resets_at) : new Date(Date.now() + 5 * 3600 * 1000);
          const diffMs = Math.max(0, resetTime.getTime() - Date.now());

          models.push({
            id: 'claude:5h-quota',
            provider: this.name,
            label: `Claude Code (5hr Session)`,
            remainingFraction: remFraction,
            remainingPercentage: remPct,
            isExhausted: remPct <= 0,
            resetTime,
            timeUntilResetMs: diffMs,
            timeUntilResetFormatted: formatResetTime(diffMs, resetTime),
          });

          if (rateLimits.seven_day) {
            const sevenDay = rateLimits.seven_day;
            const weekUsedPct = Number(sevenDay.utilization) || 0;
            const weekRemPct = Math.max(0, 100 - weekUsedPct);
            const weekResetTime = sevenDay.resets_at ? new Date(sevenDay.resets_at) : new Date(Date.now() + 7 * 86400 * 1000);
            const weekDiffMs = Math.max(0, weekResetTime.getTime() - Date.now());

            models.push({
              id: 'claude:7d-quota',
              provider: this.name,
              label: `Claude Code (7d Weekly)`,
              remainingFraction: weekRemPct / 100,
              remainingPercentage: weekRemPct,
              isExhausted: weekRemPct <= 0,
              resetTime: weekResetTime,
              timeUntilResetMs: weekDiffMs,
              timeUntilResetFormatted: formatResetTime(weekDiffMs, weekResetTime),
            });
          }

          return {
            provider: this.name,
            models,
            lastUpdated: new Date(),
          };
        }
      } catch {}
    }

    return {
      provider: this.name,
      models: [],
      lastUpdated: new Date(),
      error: claudeExe
        ? 'Unable to read Claude Code usage (is Claude Code logged in?)'
        : 'Claude Code executable not found',
    };
  }
}
