// Reactive news (D-146). Every person and organisation here is FICTIONAL, invented for the game. No real official,
// union, party, association or fund is quoted, and no quote is a real statement.
import type { PollGroup, VoiceId } from '../types/game';

export interface VoiceDef { name: string; role: string; short: string }

export const VOICES: Record<VoiceId, VoiceDef> = {
  union: { name: 'Rosnah Abdullah', role: "president, Malaysian Workers' Front (fictional)", short: 'Workers’ Front' },
  opposition: { name: 'Daniel Lim', role: 'opposition finance spokesman (fictional)', short: 'Opposition' },
  business: { name: 'Datuk Arif Hamzah', role: 'chair, National Business Council (fictional)', short: 'Business Council' },
  developers: { name: 'Tan Mei Ling', role: "head, Property Builders' Association (fictional)", short: 'Builders' },
  economist: { name: 'Dr Kavitha Raman', role: 'chief economist, Merdeka Policy Institute (fictional)', short: 'Economist' },
  consumers: { name: 'Faizal Osman', role: 'director, Consumer Voice (fictional)', short: 'Consumer Voice' },
  investors: { name: 'Sarah Whitford', role: 'Asia strategist, Harbour Ridge Capital (fictional)', short: 'Global investors' },
};

export const POLL_GROUPS: { id: PollGroup; label: string; who: string }[] = [
  { id: 'b40', label: 'B40', who: 'Lower-income 40% of households' },
  { id: 'm40', label: 'M40', who: 'Middle-income 40%' },
  { id: 't20', label: 'T20', who: 'Top 20% of earners' },
  { id: 'business', label: 'Business', who: 'Domestic firms and employers' },
  { id: 'investors', label: 'Foreign investors', who: 'Global funds and multinationals' },
];

type Line = { voice: VoiceId; stance: 'for' | 'against' | 'warn'; lines: string[] };

/**
 * Reactions by topic. `{x}` placeholders are filled by the engine: {from}, {to}, {pct}, {sector}, {project}, {network}.
 * Two or three lines per voice; the engine picks one deterministically from the day and topic (no random draw).
 */
export const REACTIONS: Record<string, Line[]> = {
  'corporate:up': [
    { voice: 'business', stance: 'against', lines: ['Raising corporate tax to {to} tells every board in Asia to build somewhere else.', 'Firms were planning to expand. At {to}, many will now wait.'] },
    { voice: 'union', stance: 'for', lines: ['Big companies can afford {to}. Put it into hospitals and schools.', 'About time the most profitable firms paid more.'] },
  ],
  'corporate:down': [
    { voice: 'business', stance: 'for', lines: ['A {to} rate puts us back in the race for regional investment.', 'Good news for hiring. Firms will reinvest the difference.'] },
    { voice: 'opposition', stance: 'against', lines: ['A tax cut for the biggest companies, paid for by everyone else.', 'Who fills the hole in the budget when the rate falls to {to}?'] },
  ],
  'consumption:up': [
    { voice: 'consumers', stance: 'against', lines: ['A levy of {to} lands hardest on families who spend every ringgit they earn.', 'Every trip to the shops just got more expensive.'] },
    { voice: 'opposition', stance: 'against', lines: ['The government is taxing groceries to fix its own budget.'] },
  ],
  'consumption:down': [
    { voice: 'consumers', stance: 'for', lines: ['A lower levy is real relief at the checkout.', 'Families will notice this one.'] },
    { voice: 'economist', stance: 'warn', lines: ['Shoppers gain, but the treasury loses one of its steadiest revenue lines.'] },
  ],
  'incomeTax:up': [
    { voice: 'investors', stance: 'against', lines: ['Higher personal tax makes it harder to attract senior talent to KL.'] },
    { voice: 'union', stance: 'for', lines: ['A progressive system means those at the top pay more. That is fair.'] },
  ],
  'incomeTax:down': [
    { voice: 'consumers', stance: 'for', lines: ['More take-home pay, finally.'] },
    { voice: 'economist', stance: 'warn', lines: ['Income tax cuts are popular, but they need a plan for the lost revenue.'] },
  ],
  'property:up': [
    { voice: 'developers', stance: 'against', lines: ['A higher property levy will be passed straight through to rents.'] },
  ],
  'property:down': [
    { voice: 'developers', stance: 'for', lines: ['Lower holding costs will help bring more space to market.'] },
  ],
  'minimumWage:up': [
    { voice: 'union', stance: 'for', lines: ['RM{to} a month is a step towards a wage people can live on.', 'Workers have waited a long time for RM{to}.'] },
    { voice: 'business', stance: 'against', lines: ['Small firms cannot absorb RM{to} overnight. Expect fewer new hires.', 'Wages should follow productivity, not politics.'] },
  ],
  'minimumWage:down': [
    { voice: 'union', stance: 'against', lines: ['Cutting the minimum wage is a pay cut for the lowest-paid workers in the country.'] },
    { voice: 'business', stance: 'for', lines: ['This gives smaller employers room to hire again.'] },
  ],
  'workerLevy:up': [
    { voice: 'business', stance: 'against', lines: ['Factories and building sites rely on foreign workers. This raises their costs again.'] },
    { voice: 'union', stance: 'for', lines: ['A higher levy makes employers look at local workers first.'] },
  ],
  'workerLevy:down': [
    { voice: 'business', stance: 'for', lines: ['Cheaper permits mean projects can be staffed on time.'] },
  ],
  'workerFreeze:on': [
    { voice: 'developers', stance: 'against', lines: ['Freezing intake while sites are short-staffed will delay every project in the pipeline.'] },
    { voice: 'union', stance: 'for', lines: ['Local workers first. We support the freeze.'] },
  ],
  'cashAid:up': [
    { voice: 'consumers', stance: 'for', lines: ['Direct cash aid reaches the households who need it most.'] },
    { voice: 'opposition', stance: 'against', lines: ['Handouts before a vote. Where is the long-term plan?'] },
  ],
  'subsidyTargeting:up': [
    { voice: 'economist', stance: 'for', lines: ['Targeting subsidies is overdue. Blanket fuel subsidies mostly help the well-off.'] },
    { voice: 'consumers', stance: 'against', lines: ['Middle-income families will pay more at the pump and get nothing back.'] },
  ],
  'topTaxes:up': [
    { voice: 'investors', stance: 'against', lines: ['Wealth and top-band taxes send capital to Singapore and Dubai.', 'Mobile money will move. It always does.'] },
    { voice: 'union', stance: 'for', lines: ['The richest can pay a little more. Nobody will miss it.'] },
  ],
  'topTaxes:down': [
    { voice: 'investors', stance: 'for', lines: ['A friendlier regime for capital. Funds will take notice.'] },
    { voice: 'opposition', stance: 'against', lines: ['Tax breaks for the wealthiest while prices rise for everyone else.'] },
  ],
  'carbonTax:up': [
    { voice: 'economist', stance: 'for', lines: ['A carbon price is the cheapest way to cut emissions. Phase it in steadily.'] },
    { voice: 'business', stance: 'against', lines: ['Heavy industry will struggle with a carbon price our neighbours do not have.'] },
  ],
  'hub:on': [
    { voice: 'investors', stance: 'for', lines: ['A serious pitch for regional headquarters. We will be looking at KL.', 'Malaysia is competing with Singapore now.'] },
    { voice: 'opposition', stance: 'against', lines: ['Special rules for foreign firms while local businesses pay full price.'] },
  ],
  'buildProductivity:up': [
    { voice: 'developers', stance: 'for', lines: ['Fast-track permits and prefab credits are exactly what sites need.'] },
  ],
  'opr:up': [
    { voice: 'developers', stance: 'against', lines: ['A higher OPR at {to} hits buyers just as they were coming back.'] },
    { voice: 'consumers', stance: 'against', lines: ['Mortgage payments are going up again.'] },
    { voice: 'economist', stance: 'warn', lines: ['A rise to {to} should cool prices, but expect slower borrowing.'] },
  ],
  'opr:down': [
    { voice: 'developers', stance: 'for', lines: ['Cheaper credit at {to}. Expect showrooms to fill up.'] },
    { voice: 'economist', stance: 'warn', lines: ['Cutting to {to} supports growth, but watch inflation.'] },
  ],
  'budget:down': [
    { voice: 'union', stance: 'against', lines: ['Cuts like these show up as longer queues at clinics and bigger classes.'] },
    { voice: 'opposition', stance: 'against', lines: ['The budget is being balanced on the backs of public services.'] },
  ],
  'budget:up': [
    { voice: 'economist', stance: 'warn', lines: ['More spending is fine if it is funded. Markets will watch the deficit.'] },
  ],
  // Conditions in the economy.
  'overheat:prop': [
    { voice: 'developers', stance: 'warn', lines: ['Every contractor we know is fully booked. {project} will be lucky to finish on time.', 'There are not enough crews or cranes for this much work. Building costs are up {pct}.'] },
    { voice: 'economist', stance: 'warn', lines: ['Demand for construction is well above what the sector can build. The extra mostly becomes higher prices.'] },
  ],
  'overheat:other': [
    { voice: 'business', stance: 'warn', lines: ['{sector} firms cannot keep up with orders. Customers are waiting and prices are rising.'] },
    { voice: 'economist', stance: 'warn', lines: ['{sector} is running far beyond capacity. More demand here mostly becomes inflation.'] },
  ],
  'housing:up': [
    { voice: 'consumers', stance: 'against', lines: ['House prices are up {pct} in three months. First-time buyers are being priced out.', 'Young families cannot keep up with prices rising this fast.'] },
    { voice: 'developers', stance: 'warn', lines: ['Prices are rising because supply cannot keep up. We need land and permits.'] },
  ],
  'housing:down': [
    { voice: 'developers', stance: 'warn', lines: ['Prices are down {pct} in three months. Buyers are waiting and launches are being delayed.'] },
    { voice: 'consumers', stance: 'for', lines: ['A cooler market gives first-time buyers a chance.'] },
  ],
  'inflation:high': [
    { voice: 'consumers', stance: 'against', lines: ['Prices are rising {pct} a year. Wages are not keeping up.', 'Rice, petrol, rent: everything costs more than last year.'] },
    { voice: 'opposition', stance: 'against', lines: ['Inflation at {pct} is a tax on every family.'] },
  ],
  'inflation:negative': [
    { voice: 'economist', stance: 'warn', lines: ['Falling prices sound good, but they can mean demand is too weak.'] },
  ],
  'jobs:worse': [
    { voice: 'union', stance: 'against', lines: ['Unemployment is now {to}. Behind that number are families without a paycheque.'] },
    { voice: 'opposition', stance: 'against', lines: ['Jobless numbers keep climbing. Where is the jobs plan?'] },
  ],
  'jobs:tight': [
    { voice: 'business', stance: 'warn', lines: ['Unemployment at {to}: we simply cannot find workers.'] },
    { voice: 'union', stance: 'for', lines: ['A tight labour market means workers can finally ask for raises.'] },
  ],
  'fx:weaker': [
    { voice: 'consumers', stance: 'against', lines: ['A weaker ringgit means imported food and fuel cost more.'] },
    { voice: 'business', stance: 'for', lines: ['Exporters will welcome the cheaper ringgit.'] },
  ],
  'fx:stronger': [
    { voice: 'investors', stance: 'for', lines: ['The ringgit is up {pct} this month. Malaysian assets are back in favour.'] },
    { voice: 'business', stance: 'warn', lines: ['A strong ringgit squeezes exporters’ margins.'] },
  ],
  'market:up': [
    { voice: 'investors', stance: 'for', lines: ['Bursa is up {pct} in a month. We are adding to Malaysia.'] },
  ],
  'market:down': [
    { voice: 'investors', stance: 'against', lines: ['Bursa is down {pct} in a month. Confidence is fragile.'] },
  ],
  'approval:fall': [
    { voice: 'opposition', stance: 'against', lines: ['The public has noticed. Approval has fallen to {to}.', 'Support is collapsing. Change course before it is too late.'] },
  ],
  'approval:low': [
    { voice: 'opposition', stance: 'against', lines: ['Thousands rallied outside Parliament today. This government has lost the public.'] },
    { voice: 'union', stance: 'against', lines: ['Our members are angry. We will keep marching until we are heard.'] },
  ],
  'rating:down': [
    { voice: 'investors', stance: 'against', lines: ['The downgrade will raise Malaysia’s borrowing costs. We are reducing exposure.'] },
    { voice: 'opposition', stance: 'against', lines: ['A downgrade is a verdict on this government’s finances.'] },
  ],
  'rating:up': [
    { voice: 'investors', stance: 'for', lines: ['An upgrade puts Malaysia on more fund mandates.'] },
  ],
  'infra:power': [
    { voice: 'business', stance: 'against', lines: ['Factories are losing shifts to power cuts. Data centres need reliable power.'] },
  ],
  'infra:transport': [
    { voice: 'business', stance: 'against', lines: ['Ports are congested and lorries sit in traffic. Deliveries are late.'] },
  ],
  'infra:housing': [
    { voice: 'union', stance: 'against', lines: ['Workers cannot find homes near the jobs. Rents in worker housing have doubled.'] },
  ],
};
