import { useState } from 'react';
import { COMPANY_BY_ID } from '../../data/companies';
import { displayMinutes } from '../../engine/clock';
import { useGame, useGameState } from '../../store/game-store';
import { PanelShell } from '../panels/PanelShell';
import { ExchangeStatusChips } from './ExchangeStatusChips';
import { MarketBrowser, type MarketTab } from './MarketBrowser';

/** Markets panel: Phase 2's MarketBrowser inside the shell; selecting a row opens SecurityDetail on the right. */
export function MarketsPanel() {
  const g = useGameState();
  const rev = useGame((s) => s.rev);
  const selection = useGame((s) => s.selection);
  const select = useGame.getState().select;
  const selected = selection?.kind === 'company' ? selection.id : null;
  const [tab, setTab] = useState<MarketTab>(() => (selected ? COMPANY_BY_ID[selected].exchange : 'MY'));
  return (
    <PanelShell title="Stock markets" subtitle="20 Bursa Malaysia (MYR) + 20 S&P 500 (USD) names · fictional prices" width={1120} bodyLayout="fill" right={<ExchangeStatusChips game={g} nowMin={displayMinutes(g.clock)} />}>
      <MarketBrowser game={g} rev={rev} tab={tab} onTab={setTab} selected={selected} onSelect={(id) => select({ kind: 'company', id })} />
    </PanelShell>
  );
}
