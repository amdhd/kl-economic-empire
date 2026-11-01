import type { PanelId } from '../../store/game-store';

/** A window in the Info views rail: one button, with sibling panels shown as tabs along the top once it is open. */
export interface WindowDef {
  /** The panel the rail button opens first; its testid stays `nav-<id>`. */
  id: PanelId;
  label: string;
  color: string;
  tabs: { id: PanelId; label: string }[];
}

const win = (id: PanelId, label: string, color: string, tabs: [PanelId, string][] = [[id, label]]): WindowDef => ({ id, label, color, tabs: tabs.map(([t, l]) => ({ id: t, label: l })) });

export const WINDOW_GROUPS: { title: string; items: WindowDef[] }[] = [
  { title: 'Presidency', items: [
    win('overview', 'Briefing', '#76d7ef'),
    win('finance', 'Finances', '#8fe3a0'),
    win('population', 'Population', '#78c9ec'),
    win('objectives', 'Objectives', '#edce79'),
    win('standing', 'Global standing', '#f5d98b'),
  ] },
  { title: 'Government', items: [
    win('controls', 'Policy', '#a6d582', [['controls', 'Economic controls'], ['decisions', 'Policy decisions']]),
    win('debt', 'Money & debt', '#aebdf1', [['debt', 'Treasury & debt'], ['fiscal', 'Fiscal rules'], ['reforms', 'Fiscal reforms'], ['central', 'Central bank']]),
    win('projects', 'Build', '#ecb77d', [['projects', 'Projects'], ['infra', 'Infrastructure']]),
  ] },
  { title: 'Trade & resources', items: [
    win('ministry', 'Trade', '#7cc4f2', [['ministry', 'Trade ministry'], ['partners', 'Trading partners'], ['trade', 'Tariffs & FX']]),
    win('commodities', 'Resources', '#e8a86a', [['commodities', 'Commodities'], ['oil', 'Oil & PETRONAS']]),
    win('deals', 'Deals & investment', '#b6a2ee', [['deals', 'Deal Room'], ['fdi', 'Investment & FDI']]),
  ] },
  { title: 'Markets & analysis', items: [
    win('markets', 'Stock markets', '#a7d782'),
    win('fund', 'Funds & state firms', '#c0a8ed', [['fund', 'Sovereign fund'], ['soe', 'State enterprises']]),
    win('economy', 'Economy & data', '#75c9e6', [['economy', 'Economy'], ['reports', 'Reports & log'], ['sources', 'Baseline & sources']]),
  ] },
];

export const WINDOWS: WindowDef[] = WINDOW_GROUPS.flatMap((g) => g.items);

/** The window a panel belongs to, or undefined for a panel with no rail button (settings, explain and so on). */
export const windowOf = (panel: PanelId | null): WindowDef | undefined => (panel ? WINDOWS.find((w) => w.tabs.some((t) => t.id === panel)) : undefined);
