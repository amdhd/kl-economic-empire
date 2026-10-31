import { PopulationPanel } from '../components/panels/PopulationPanel';
import { EconomyWindow } from '../components/panels/EconomyWindow';
import { ControlsPanel } from '../components/panels/ControlsPanel';
import { CommoditiesPanel } from '../components/panels/CommoditiesPanel';
import { FiscalPanel } from '../components/panels/FiscalPanel';
import { PartnersPanel } from '../components/panels/PartnersPanel';
import { SoePanel } from '../components/panels/SoePanel';
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
import { SourcesPanel } from '../components/panels/SourcesPanel';
import { ReportsPanel } from '../components/panels/ReportsPanel';
import { MapView } from '../map/MapView';
import { readSlot } from '../persistence/storage';
import { startGameLoop, useGame, type PanelId } from '../store/game-store';
import type { ScenarioId } from '../types/game';

const PANELS: Record<PanelId, () => ReactNode> = {
  population: () => <PopulationPanel />,
  // Rendered as a centred window rather than in the inspector slot.
  finance: () => null,
  controls: () => <ControlsPanel />,
  fiscal: () => <FiscalPanel />,
  commodities: () => <CommoditiesPanel />,
  partners: () => <PartnersPanel />,
  soe: () => <SoePanel />,
  trade: () => <TradePanel />,
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
          {selection?.kind === 'company' && <div className="company-slot min-h-0 ml-auto"><ErrorBoundary label="Company panel"><CompanyPanel key={selection.id} id={selection.id} /></ErrorBoundary></div>}
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
  const [hasAutosave, setHasAutosave] = useState(false);
  useEffect(() => {
    void readSlot('autosave').then((j) => setHasAutosave(!!j));
  }, []);
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/70 backdrop-blur-sm" role="dialog" aria-modal="true" data-testid="new-game">
      <div className="glass w-[560px] rounded-3xl p-6">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-300">Alternate history · 2027</div>
        <h1 className="mt-1 text-[28px] font-black tracking-tight text-white">KL Economic Empire</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-slate-300">
          Lead a fictional Malaysian presidency from the Kuala Lumpur skyline. New campaigns start with dated Malaysian GDP, federal debt and operating budget figures. Set taxes and budgets, build infrastructure, and run a sovereign wealth fund across 40 simulated Malaysian and US equities. Can you make Malaysia richer and more livable in 24 months — without a fiscal or financial crisis?
        </p>
        <p className="mt-2 rounded-lg bg-amber-400/10 p-2 text-[11.5px] text-amber-200 ring-1 ring-amber-300/20">
          Alternate-history powers and all future outcomes are fictional. Official starting figures have different reference dates; see Baseline & sources. Company names and tickers are real; every price, financial statement and event is simulated. Not investment advice.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {([['balanced', 'Balanced start', 'Calm global backdrop; seeded random events.'], ['recession', 'Adverse: global recession', 'Begins in a global slowdown and credit crunch.']] as const).map(([id, t, d]) => (
            <button key={id} onClick={() => setScenario(id)} className={`rounded-xl p-3 text-left ring-1 transition ${scenario === id ? 'bg-emerald-500/15 ring-emerald-400/50' : 'bg-slate-800/50 ring-slate-600/30 hover:bg-slate-700/50'}`} data-testid={`scenario-${id}`}>
              <div className="text-[13.5px] font-bold text-white">{t}</div>
              <div className="text-[11.5px] text-slate-400">{d}</div>
            </button>
          ))}
        </div>
        <label className="mt-3 flex items-center gap-2 text-[12px] text-slate-400">
          Seed
          <input className="input num !w-36" type="number" value={seed} onChange={(e) => setSeed(Math.floor(Number(e.target.value)) || 1)} />
          <span>Same seed + same decisions = same history.</span>
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          {started && <button className="btn" onClick={() => setShowNewGame(false)}>Back to game</button>}
          {hasAutosave && <button className="btn" onClick={() => void load('autosave')} data-testid="continue">Continue autosave</button>}
          <button className="btn btn-primary !px-5 !py-2 !text-[14px]" onClick={() => newGame(seed, scenario)} data-testid="start-campaign">Begin presidency</button>
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
        <p>The clock runs continuously: 1× = 20 game minutes per real second, 2× = 40, 3× = 60. There is no skip — a 24-month term takes ~4.9 hours of play at 3×. The game auto-pauses when the tab is hidden and never catches up offline.</p>
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
