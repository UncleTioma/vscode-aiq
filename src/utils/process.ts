import { exec } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProcessTargetInfo {
  pid: number;
  csrfToken: string;
  extensionPort: number;
  httpPort?: number;
  httpsPort?: number;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    return err?.code === 'EPERM';
  }
}

async function findAntigravityDaemonHubs(): Promise<ProcessTargetInfo[]> {
  const daemonDir = path.join(os.homedir(), '.gemini', 'antigravity', 'daemon');
  try {
    const entries = await fs.promises.readdir(daemonDir, { withFileTypes: true });
    const hubFiles = await Promise.all(
      entries
        .filter(entry => entry.isFile() && /^hub_\d+\.json$/.test(entry.name))
        .map(async entry => {
          const filePath = path.join(daemonDir, entry.name);
          const stat = await fs.promises.stat(filePath);
          return { filePath, mtimeMs: stat.mtimeMs };
        })
    );
    hubFiles.sort((a, b) => b.mtimeMs - a.mtimeMs);

    const result: ProcessTargetInfo[] = [];
    for (const { filePath } of hubFiles) {
      try {
        const raw = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
        const pid = Number(raw?.pid);
        const csrfToken = typeof raw?.csrfToken === 'string' ? raw.csrfToken : '';
        const httpPort = Number(raw?.httpPort) || 0;
        const httpsPort = Number(raw?.httpsPort) || 0;
        if (!csrfToken || (!httpPort && !httpsPort) || !isProcessAlive(pid)) {
          continue;
        }
        result.push({
          pid,
          csrfToken,
          extensionPort: httpPort,
          httpPort: httpPort || undefined,
          httpsPort: httpsPort || undefined,
        });
      } catch {
        continue;
      }
    }
    return result;
  } catch {
    return [];
  }
}

export async function findAntigravityProcesses(): Promise<ProcessTargetInfo[]> {
  const hubs = await findAntigravityDaemonHubs();
  const legacy = process.platform === 'win32'
    ? await findAntigravityProcessesWindows()
    : await findAntigravityProcessesUnix();
  const seenPids = new Set(hubs.map(h => h.pid));
  for (const proc of legacy) {
    if (!seenPids.has(proc.pid)) {
      seenPids.add(proc.pid);
      hubs.push(proc);
    }
  }
  return hubs;
}

async function findAntigravityProcessesWindows(): Promise<ProcessTargetInfo[]> {
  try {
    const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"name like 'language_server%' or name = 'agy.exe'\\" | Select-Object ProcessId, CommandLine | ConvertTo-Json"`;
    const { stdout } = await execAsync(cmd);
    const trimmed = stdout.trim();
    if (!trimmed) {
      return [];
    }
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    const result: ProcessTargetInfo[] = [];
    for (const item of list) {
      const line: string = item.CommandLine || '';
      const tokenMatch = line.match(/--csrf_token[=\s]+([a-zA-Z0-9\-]+)/);
      const portMatch = line.match(/--(?:extension_server_port|hub-port)[=\s]+(\d+)/);
      if (tokenMatch && tokenMatch[1]) {
        result.push({
          pid: Number(item.ProcessId),
          csrfToken: tokenMatch[1],
          extensionPort: portMatch ? Number(portMatch[1]) : 0,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

async function findAntigravityProcessesUnix(): Promise<ProcessTargetInfo[]> {
  try {
    const cmd = process.platform === 'darwin'
      ? 'LC_ALL=C pgrep -fl "language_server|agy"'
      : 'LC_ALL=C pgrep -af "language_server|agy"';
    const { stdout } = await execAsync(cmd);
    const result: ProcessTargetInfo[] = [];
    for (const line of stdout.split('\n')) {
      if (!line.includes('--csrf_token')) {
        continue;
      }
      const pid = Number(line.trim().split(/\s+/)[0]);
      const tokenMatch = line.match(/--csrf_token[=\s]+([a-zA-Z0-9\-]+)/);
      const portMatch = line.match(/--(?:extension_server_port|hub-port)[=\s]+(\d+)/);
      if (tokenMatch && tokenMatch[1] && !isNaN(pid)) {
        result.push({
          pid,
          csrfToken: tokenMatch[1],
          extensionPort: portMatch ? Number(portMatch[1]) : 0,
        });
      }
    }
    return result;
  } catch {
    return [];
  }
}

export async function getListeningPorts(pid: number): Promise<number[]> {
  const platform = process.platform;
  if (platform === 'win32') {
    return getListeningPortsWindows(pid);
  }
  return getListeningPortsUnix(pid);
}

async function getListeningPortsWindows(pid: number): Promise<number[]> {
  try {
    const cmd = `powershell -NoProfile -Command "Get-NetTCPConnection -OwningProcess ${pid} -State Listen | Select-Object -ExpandProperty LocalPort | ConvertTo-Json"`;
    const { stdout } = await execAsync(cmd);
    const trimmed = stdout.trim();
    if (!trimmed) {
      return [];
    }
    const parsed = JSON.parse(trimmed);
    const rawPorts: number[] = Array.isArray(parsed) ? parsed : [parsed];
    const ports = Array.from(new Set(rawPorts.filter(p => typeof p === 'number')));
    return ports.sort((a, b) => a - b);
  } catch {
    return [];
  }
}

async function getListeningPortsUnix(pid: number): Promise<number[]> {
  try {
    const cmd = process.platform === 'darwin'
      ? `lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid}`
      : `ss -tlnp 2>/dev/null | grep "pid=${pid}" || lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null`;
    const { stdout } = await execAsync(cmd);
    const ports: number[] = [];
    const regex = /(?:127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):(\d+)/g;
    let match;
    while ((match = regex.exec(stdout)) !== null) {
      const port = Number(match[1]);
      if (!ports.includes(port)) {
        ports.push(port);
      }
    }
    return ports.sort((a, b) => a - b);
  } catch {
    return [];
  }
}
