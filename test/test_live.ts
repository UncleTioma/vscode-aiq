import { AntigravityProvider } from '../src/providers/antigravity';
import { ClaudeCodeProvider } from '../src/providers/claude';
import { CodexProvider } from '../src/providers/codex';
import { drawProgressBar } from '../src/utils/time';

async function main() {
  const ag = new AntigravityProvider();
  const cl = new ClaudeCodeProvider();
  const cx = new CodexProvider();

  const [resAg, resCl, resCx] = await Promise.all([
    ag.fetchQuota(),
    cl.fetchQuota(),
    cx.fetchQuota(),
  ]);

  console.log('=== ANTIGRAVITY QUOTA ===');
  console.log('Error:', resAg.error || 'None');
  console.log('Models Found:', resAg.models.length);
  for (const m of resAg.models) {
    const pct = m.remainingPercentage !== undefined ? `${m.remainingPercentage.toFixed(1)}%` : 'N/A';
    const bar = m.remainingPercentage !== undefined ? drawProgressBar(m.remainingPercentage) : '░'.repeat(10);
    console.log(`  - ${m.label.padEnd(30)} ${bar} ${pct.padStart(6)} (Resets in: ${m.timeUntilResetFormatted})`);
  }

  console.log('\n=== CLAUDE CODE QUOTA ===');
  console.log('Error:', resCl.error || 'None');
  for (const m of resCl.models) {
    const pct = m.remainingPercentage !== undefined ? `${m.remainingPercentage.toFixed(1)}%` : 'N/A';
    const bar = m.remainingPercentage !== undefined ? drawProgressBar(m.remainingPercentage) : '░'.repeat(10);
    console.log(`  - ${m.label.padEnd(30)} ${bar} ${pct.padStart(6)} (Resets in: ${m.timeUntilResetFormatted})`);
  }

  console.log('\n=== OPENAI CODEX QUOTA ===');
  console.log('Error:', resCx.error || 'None');
  for (const m of resCx.models) {
    const pct = m.remainingPercentage !== undefined ? `${m.remainingPercentage.toFixed(1)}%` : 'N/A';
    const bar = m.remainingPercentage !== undefined ? drawProgressBar(m.remainingPercentage) : '░'.repeat(10);
    console.log(`  - ${m.label.padEnd(30)} ${bar} ${pct.padStart(6)} (Resets in: ${m.timeUntilResetFormatted})`);
  }
}

main().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
