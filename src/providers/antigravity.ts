import * as http from 'http';
import * as https from 'https';
import { IQuotaProvider } from './provider';
import { ModelQuotaInfo, ProviderSnapshot } from '../types';
import { findAntigravityProcesses, getListeningPorts } from '../utils/process';
import { formatResetTime } from '../utils/time';

export class AntigravityProvider implements IQuotaProvider {
  readonly name = 'antigravity' as const;
  private activeTarget: { port: number; scheme: 'https' | 'http' } | null = null;

  async fetchQuota(): Promise<ProviderSnapshot> {
    try {
      const procs = await findAntigravityProcesses();
      if (procs.length === 0) {
        return {
          provider: this.name,
          models: [],
          lastUpdated: new Date(),
          error: 'Antigravity process not found',
        };
      }

      let responseData: any = null;
      for (const proc of procs) {
        const ports = await getListeningPorts(proc.pid);
        const active = this.activeTarget;
        const targets: Array<{ port: number; scheme: 'https' | 'http' }> = [];
        if (active && ports.includes(active.port)) {
          targets.push(active);
        }
        for (const port of ports) {
          for (const scheme of ['https', 'http'] as const) {
            if (!(active && active.port === port && active.scheme === scheme)) {
              targets.push({ port, scheme });
            }
          }
        }
        for (const target of targets) {
          try {
            responseData = await this.queryPort(target.scheme, target.port, proc.csrfToken);
            this.activeTarget = target;
            break;
          } catch {
            continue;
          }
        }
        if (responseData) {
          break;
        }
      }

      if (!responseData) {
        return {
          provider: this.name,
          models: [],
          lastUpdated: new Date(),
          error: 'Unable to query Antigravity status endpoint',
        };
      }

      const rawConfigs = responseData?.userStatus?.cascadeModelConfigData?.clientModelConfigs || [];
      const models: ModelQuotaInfo[] = [];

      for (const raw of rawConfigs) {
        const label: string = raw.label || 'Unknown Model';
        const modelId: string = raw.modelOrAlias?.model || raw.model_or_alias?.model || label;
        const quotaInfo = raw.quotaInfo ?? raw.quota_info;

        const remainingFraction: number | undefined = quotaInfo?.remainingFraction ?? quotaInfo?.remaining_fraction;
        const resetTimeRaw = quotaInfo?.resetTime ?? quotaInfo?.reset_time;
        const resetTime = resetTimeRaw ? new Date(resetTimeRaw) : new Date(0);
        const timeUntilResetMs = Math.max(0, resetTime.getTime() - Date.now());

        models.push({
          id: `ag:${modelId}`,
          provider: this.name,
          label,
          remainingFraction,
          remainingPercentage: remainingFraction !== undefined ? remainingFraction * 100 : undefined,
          isExhausted: remainingFraction === 0,
          resetTime,
          timeUntilResetMs,
          timeUntilResetFormatted: quotaInfo ? formatResetTime(timeUntilResetMs, resetTime) : 'N/A',
        });
      }

      models.sort((a, b) => a.label.localeCompare(b.label));

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
        error: err.message || 'Error fetching Antigravity quota',
      };
    }
  }

  private queryPort(scheme: 'https' | 'http', port: number, csrfToken: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        metadata: {
          ideName: 'antigravity',
          extensionName: 'antigravity',
          locale: 'en',
        },
      });

      const options: https.RequestOptions & http.RequestOptions = {
        hostname: '127.0.0.1',
        port,
        path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Connect-Protocol-Version': '1',
          'X-Codeium-Csrf-Token': csrfToken,
        },
        rejectUnauthorized: false,
        timeout: 2500,
      };

      const req = (scheme === 'https' ? https : http).request(options, res => {
        let body = '';
        res.on('data', chunk => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            resolve(parsed);
          } catch {
            reject(new Error('Invalid response'));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Timeout'));
      });

      req.write(payload);
      req.end();
    });
  }
}
