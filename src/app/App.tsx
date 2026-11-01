import { DealsPanel } from '../components/panels/DealsPanel';
import { PopulationPanel } from '../components/panels/PopulationPanel';
import { ExplanationPanel } from '../components/panels/ExplanationPanel';
import { DecisionsPanel } from '../components/panels/DecisionsPanel';
import { FdiPanel } from '../components/panels/FdiPanel';
import { StandingPanel } from '../components/panels/StandingPanel';
import { SettingsPanel } from '../components/panels/SettingsPanel';
import { SCENARIOS } from '../data/scenarios';
import { CAMPAIGN_LENGTHS, type CampaignMonths } from '../data/boom';
import { EconomyWindow } from '../components/panels/EconomyWindow';
import { ControlsPanel } from '../components/panels/ControlsPanel';
import { OilPanel } from '../components/panels/OilPanel';
import { CommoditiesPanel } from '../components/panels/CommoditiesPanel';
import { FiscalPanel } from '../components/panels/FiscalPanel';
import { PartnersPanel } from '../components/panels/PartnersPanel';
import { GdpHistoryPanel } from '../components/panels/GdpHistoryPanel';
import { RivalsBoard } from '../components/hud/RivalsBoard';
import { SoePanel } from '../components/panels/SoePanel';
import { InfrastructurePanel } from '../components/panels/InfrastructurePanel';
import { Component, useEffect, useState, type ReactNode } from 'react';
import { BottomBar } from '../components/hud/BottomBar';
import { LeftRail } from '../components/hud/LeftRail';
import { Toasts } from '../components/hud/Toasts';
import { TopBar } from '../components/hud/TopBar';
import { CompanyPanel } from '../components/markets/CompanyPanel';
import { FundPanel } from '../components/markets/FundPanel';
import { MarketsPanel } from '../components/markets/MarketsPanel';
import { DebtPanel } from '../components/panels/DebtPanel';
import { EconomyPanel } from '../components/panels/EconomyPanel';
import { ObjectivesPanel } from '../components/panels/ObjectivesPanel';
import { OverviewPanel } from '../components/panels/OverviewPanel';
import { PolicyPanel } from '../components/panels/PolicyPanel';
import { ProjectsPanel } from '../components/panels/ProjectsPanel';
import { TradePanel } from '../components/panels/TradePanel';
import { TradeMinistryPanel } from '../components/panels/TradeMinistryPanel';
import { CentralBankPanel } from '../components/panels/CentralBankPanel';
import { SourcesPanel } from '../components/panels/SourcesPanel';
import { ReportsPanel } from '../components/panels/ReportsPanel';
import { MapView } from '../map/MapView';
import { readSlot } from '../persistence/storage';
import { startGameLoop, useGame, type PanelId } from '../store/game-store';
import type { ScenarioId } from '../types/game';

const PANELS: Record<PanelId, () => ReactNode> = {
  deals: () => <DealsPanel />,
  explain: () => <ExplanationPanel />,
  decisions: () => <DecisionsPanel />,
  fdi: () => <FdiPanel />,
  standing: () => <StandingPanel />,
  settings: () => <SettingsPanel />,
  population: () => <PopulationPanel />,
  // Rendered as a centred window rather than in the inspector slot.
  finance: () => null,
  controls: () => <ControlsPanel />,
  fiscal: () => <FiscalPanel />,
  commodities: () => <CommoditiesPanel />,
  oil: () => <OilPanel />,
  partners: () => <PartnersPanel />,
  soe: () => <SoePanel />,
  gdphistory: () => <GdpHistoryPanel />,
  infra: () => <InfrastructurePanel />,
  trade: () => <TradePanel />,
  ministry: () => <TradeMinistryPanel />,
  central: () => <CentralBankPanel />,
  sources: () => <SourcesPanel />,
  overview: () => <OverviewPanel />,
  policies: () => <PolicyPanel />,
  projects: () => <ProjectsPanel />,
  debt: () => <DebtPanel />,
  markets: () => <MarketsPanel />,
  fund: () => <FundPanel />,
  economy: () => <EconomyPanel />,
  reports: () => <ReportsPanel />,
  objectives: () => <ObjectivesPanel />,
};

class ErrorBoundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error)
      return (
        <div className="glass pointer-events-auto rounded-2xl p-4 text-[13px]">
          <div className="font-bold text-rose-300">{this.props.label} crashed</div>
          <div className="mt-1 text-slate-400">{this.state.error.message}</div>
          <button className="btn mt-2" onClick={() => this.setState({ error: null })}>Retry</button>
        </div>
      );
    return this.props.children;
  }
}

export function App() {
  useEffect(() => startGameLoop(), []);
  const [menuOpen, setMenuOpen] = useState(false);
  const panel = useGame((s) => s.panel);
  const selection = useGame((s) => s.selection);
  const showNewGame = useGame((s) => s.showNewGame);
  const showHelp = useGame((s) => s.showHelp);
  return (
    <div className="relative h-full w-full overflow-hidden">
      <ErrorBoundary label="Map">
        <MapView />
      </ErrorBoundary>
      <div className="game-overlay pointer-events-none absolute inset-0 z-10 flex flex-col">
        <TopBar menuOpen={menuOpen} onToggleMenu={() => {
          if (menuOpen) {
            useGame.getState().setPanel(null);
            useGame.getState().select(null);
          }
          setMenuOpen(!menuOpen);
        }} />
        <div className="workspace flex min-h-0 flex-1 items-start gap-3">
          {menuOpen && <LeftRail />}
          <div className={`panel-slot min-h-0 ${panel === 'markets' ? 'panel-slot-wide' : ''}`}>
            {panel && <ErrorBoundary label="Panel">{PANELS[panel]()}</ErrorBoundary>}
          </div>
          <div className="ml-auto flex min-h-0 shrink-0 flex-col items-end gap-2">
            <ErrorBoundary label="Rival economies"><RivalsBoard /></ErrorBoundary>
            {selection?.kind === 'company' && <div className="company-slot min-h-0"><ErrorBoundary label="Company panel"><CompanyPanel key={selection.id} id={selection.id} /></ErrorBoundary></div>}
          </div>
        </div>
        {panel === 'finance' && <ErrorBoundary label="Economy window"><EconomyWindow /></ErrorBoundary>}
        <div className="bottom-dock pointer-events-auto">
          <BottomBar />
        </div>
      </div>
      <Toasts />
      {showNewGame && <NewGameModal />}
      {showHelp && <HelpModal />}
    </div>
  );
}

function NewGameModal() {
  const { newGame, load, setShowNewGame } = useGame.getState();
  const started = useGame((s) => s.game.scheduler.ticks > 0 || s.game.actions.length > 0);
  const [scenario, setScenario] = useState<ScenarioId>('balanced');
  const [seed, setSeed] = useState(20270101);
  const [months, setMonths] = useState<CampaignMonths>(24);
  const [boom, setBoom] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(false);
  const [hasRecovery, setHasRecovery] = useState(false);
  useEffect(() => {
    void readSlot('autosave').then((j) => setHasAutosave(!!j));
    void readSlot('recovery').then((j) => setHasRecovery(!!j));
  }, []);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="new-game">
      <div className="glass w-[560px] max-h-[92vh] overflow-y-auto rounded-3xl p-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Alternate history · 2027</div>
        <h1 className="mt-1 text-[28px] font-black tracking-tight text-white">KL Economic Empire</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
          Lead a fictional Malaysian presidency from the Kuala Lumpur skyline. New campaigns start with dated Malaysian GDP, federal debt and operating budget figures. Set taxes and budgets, build infrastructure, and run a sovereign wealth fund across 60 simulated Malaysian and US equities. Can you make Malaysia richer and more livable — without a fiscal or financial crisis?
        </p>
        <p className="mt-2 rounded-lg bg-amber-400/10 p-2 text-[11.5px] text-amber-200 ring-1 ring-amber-300/20">
          Alternate-history powers and all future outcomes are fictional. Official starting figures have different reference dates; see Baseline & sources. Company names and tickers are real; every price, financial statement and event is simulated. Not investment advice.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {SCENARIOS.map(({ id, title, description }) => (
            <button key={id} onClick={() => setScenario(id)} aria-pressed={scenario === id} disabled={boom && id !== 'balanced'} title={boom && id !== 'balanced' ? 'Boom mode always starts from the balanced opening.' : undefined} className={`rounded-xl p-3 text-left ring-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${scenario === id ? 'bg-emerald-500/15 ring-emerald-400/50' : 'bg-slate-800/50 ring-slate-600/30 hover:bg-slate-700/50'}`} data-testid={`scenario-${id}`}>
              <div className="text-[13.5px] font-bold text-white">{title}</div>
              <div className="text-[11.5px] text-slate-400">{description}</div>
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-xl bg-slate-800/50 p-3 ring-1 ring-slate-600/30">
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-300">
            <span className="font-semibold text-white">Term length</span>
            {CAMPAIGN_LENGTHS.map((m) => <button key={m} onClick={() => setMonths(m)} aria-pressed={months === m} data-testid={`term-${m}`}
              className={`rounded-md px-2.5 py-1 font-semibold ${months === m ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/50' : 'bg-slate-700/50 text-slate-300'}`}>{m / 12} years</button>)}
            <span className="text-slate-400">≈ {((m) => `${(m * 0.205).toFixed(0)} hours at 3×, ${(m * 0.123).toFixed(0)} at 5×`)(months)}</span>
          </div>
          <label className="mt-3 flex items-start gap-2 text-[12px] text-slate-300">
            <input type="checkbox" className="mt-0.5" checked={boom} onChange={(e) => { setBoom(e.target.checked); if (e.target.checked) setScenario('balanced'); }} data-testid="boom-mode" />
            <span><b className="text-amber-200">Boom mode (sandbox, for fun)</b> — removes realistic speed limits: a productivity and investment boom, migrants arriving with jobs, foreign demand that grows with capacity, a ringgit that strengthens as the economy outgrows its size, mega FDI pledges and Deal Room offers for the whole term. Aim for US$2tn by year 3 and the world's largest economy by year 10. Always starts from the balanced opening, with no recession or shock scenario. Not a realistic forecast.</span>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-400">
          Seed
          <input className="input num !w-36" type="number" value={seed} onChange={(e) => setSeed(Math.floor(Number(e.target.value)) || 1)} />
          <span>Same seed + same decisions = same history.</span>
        </label>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {started && <button className="btn" onClick={() => setShowNewGame(false)}>Back to game</button>}
          {hasRecovery && <button className="btn btn-primary" onClick={() => void load('recovery')} data-testid="restore-session">Restore previous session</button>}
          {hasAutosave && <button className="btn" onClick={() => void load('autosave')} data-testid="continue">Continue autosave</button>}
          <button className="btn btn-primary !px-5 !py-2 !text-[14px]" onClick={() => newGame(seed, scenario, { months, boom })} data-testid="start-campaign">Begin presidency</button>
        </div>
      </div>
    </div>
  );
}

function HelpModal() {
  const setShowHelp = useGame.getState().setShowHelp;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/60" onClick={() => setShowHelp(false)} role="dialog" aria-modal="true">
      <div className="glass w-[520px] rounded-2xl p-5 text-[13px] text-slate-300" onClick={(e) => e.stopPropagation()}>
        <div className="mb-2 text-[16px] font-bold text-white">How time works</div>
        <p>The clock runs continuously: 1× = 20 game minutes per real second, 2× = 40, 3× = 60, 5× = 100 (keys 1, 2, 3, 5). While paused you can use Skip 15 days or Skip to month close: they run the same hourly ticks one game day per frame, stop early for critical alerts, decisions and the term end, Pause cancels them, and Undo skip restores the state from before. A 2-year term takes ~4.9 hours of play at 3× or ~2.9 at 5× (10 years ≈ 25 or 15 hours). The game auto-pauses when the tab is hidden and never catches up offline.</p>
        <div className="mb-1 mt-3 font-semibold text-white">Shortcuts</div>
        <ul className="space-y-0.5">
          <li><kbd className="chip bg-slate-700">Space</kbd> pause / resume</li>
          <li><kbd className="chip bg-slate-700">1</kbd> <kbd className="chip bg-slate-700">2</kbd> <kbd className="chip bg-slate-700">3</kbd> speed</li>
          <li><kbd className="chip bg-slate-700">Esc</kbd> close panel</li>
          <li><kbd className="chip bg-slate-700">?</kbd> this help</li>
        </ul>
        <div className="mb-1 mt-3 font-semibold text-white">Accounting rules</div>
        <p>Trades swap cash for shares (only costs reduce NAV). Bonds bring cash and debt. Treasury⇄fund transfers are not revenue. GDP is value added, so share trading never moves it. Taxes start the next month; projects pay off on completion.</p>
        <div className="mb-1 mt-3 font-semibold text-white">Campaign score</div>
        <p>Growth uses actual calendar days and a small external-shock adjustment. Wealth is CPI-adjusted; gains earn less credit when real income, output or services fall. Open Objectives for the calculation and final fiscal report. Victory needs 75 points, 60 approval and solvency; the threshold still needs human playtesting.</p>
        <p className="mt-2 text-[11px] text-amber-200">{useGame.getState().pauseOnDialogs ? 'Clock paused while help is open.' : 'Clock continues: deliberation pause is disabled in Save / Load.'} Speed shortcuts are disabled in dialogs.</p>
        <button className="btn mt-4" onClick={() => setShowHelp(false)}>Close</button>
      </div>
    </div>
  );
}
