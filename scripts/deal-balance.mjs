import { createServer } from 'vite';
import { mkdir, writeFile } from 'node:fs/promises';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
try {
  const { playDeals, DEAL_STRATEGIES } = await server.ssrLoadModule('/tools/deal-campaigns.ts');
  const rows = [];
  for (const group of ['development', 'held-out'])
    for (let i = 0; i < 12; i++)
      for (const strategy of DEAL_STRATEGIES) {
        const seed = (group === 'development' ? 1801 : 1901) + i;
        rows.push({ group, ...playDeals(seed, strategy).row });
      }
  const summary = [];
  for (const group of ['development', 'held-out'])
    for (const strategy of DEAL_STRATEGIES) {
      const sample = rows.filter((r) => r.group === group && r.strategy === strategy);
      const mean = (k) => sample.reduce((a, r) => a + r[k], 0) / sample.length;
      summary.push({
        group,
        strategy,
        score: mean('score'),
        wealthBn: mean('wealth') / 1e9,
        outputBn: mean('output') / 1e9,
        income: mean('income'),
        commitmentsBn: mean('commitments') / 1e9,
        guaranteesBn: mean('guarantees') / 1e9,
      });
    }
  for (const group of ['development', 'held-out']) {
    const selected = summary.find((r) => r.group === group && r.strategy === 'selective'),
      all = summary.find((r) => r.group === group && r.strategy === 'accept_all');
    if (!(selected.wealthBn > all.wealthBn)) throw new Error('Accept-all wealth trade-off failed');
  }
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/deal-balance.json', JSON.stringify({ summary, rows }, null, 2) + '\n');
  console.table(summary);
} finally {
  await server.close();
}
