import type { Frame, MomentFrame } from '../state/schema';
import { SEASONS } from '../state/schema';
import { Store } from '../state/store';

export interface PlanTalk {
  to: string;
  intent: string;
  say: string;
}

export interface SeasonPlan {
  main: string;
  job: string | null;
  weeks: number;
  eat: string;
  buys: string[];
  talk: PlanTalk[];
  rest_weeks: number;
  diary: string;
  recall: string[];
}

export interface Deltas {
  money: number;
  health: number;
  energy: number;
}

const FOOD = new Set(['bread', 'plain_meal', 'good_meal', 'meal', 'food']);

const JOB_LABEL: Record<string, string> = {
  ropemaker: 'rope-maker',
  spice_merchant: 'spice merchant',
  glassblower: 'glass-blower',
};

const EAT_LABEL: Record<string, string> = { poor: 'ate poorly', plain: 'ate plain', good: 'ate well' };

const INTENT_VERB: Record<string, string> = {
  chat: 'spoke with',
  agree: 'agreed with',
  refuse: 'refused',
  pay: 'paid',
  ask_proof: 'asked proof from',
  promise: 'promised',
  lend: 'lent to',
  borrow: 'borrowed from',
};

const BUY_LABEL: Record<string, string> = {
  medicine: 'medicine',
  warehouse: 'a warehouse',
  boat: 'a boat',
  tools: 'tools',
  cloth: 'cloth',
};

export function rawFrame(s: Store, t: number): Frame | null {
  return s.frames[s.indexAt(t)] ?? null;
}

export function seasonLabelOf(s: Store, t: number): string {
  return `${s.startYear + Math.floor(t / 4)} · ${SEASONS[Math.floor(t) % 4] ?? ''}`;
}

export function yearOf(s: Store, t: number): number {
  return s.startYear + Math.floor(t / 4);
}

export function titleCase(id: string): string {
  return id
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const KIN = new Set(['mother', 'father', 'wife', 'husband', 'son', 'daughter', 'brother', 'sister']);

export function personName(s: Store, id: string): string {
  const hit = s.hello?.roster.find((r) => r.id === id || r.name === id);
  if (!hit) return titleCase(id);
  return KIN.has(hit.role) ? `${hit.name} (${hit.role})` : hit.name;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function int(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
}

export function planOf(frame: Frame | null): SeasonPlan | null {
  const raw = frame?.plan;
  if (!raw || typeof raw !== 'object') return null;
  const work = (raw as { work?: unknown }).work as { job?: unknown; weeks?: unknown } | null | undefined;
  const talkRaw = Array.isArray((raw as { talk?: unknown }).talk) ? ((raw as { talk: unknown[] }).talk) : [];
  const buyRaw = Array.isArray((raw as { buy?: unknown }).buy) ? ((raw as { buy: unknown[] }).buy) : [];
  const recallRaw = Array.isArray((raw as { recall?: unknown }).recall) ? ((raw as { recall: unknown[] }).recall) : [];
  return {
    main: str((raw as { main?: unknown }).main, 'rest'),
    job: work && typeof work.job === 'string' ? work.job : null,
    weeks: work ? int(work.weeks, 0) : 0,
    eat: str((raw as { eat?: unknown }).eat, 'plain'),
    buys: buyRaw.map((b) => str(b)).filter(Boolean),
    talk: talkRaw
      .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
      .map((t) => ({ to: str(t.to), intent: str(t.intent, 'chat'), say: str(t.say) }))
      .filter((t) => t.to),
    rest_weeks: int((raw as { rest_weeks?: unknown }).rest_weeks, 0),
    diary: str((raw as { diary?: unknown }).diary),
    recall: recallRaw.map((r) => str(r)).filter(Boolean),
  };
}

export function deltasOf(frame: Frame | null): Deltas | null {
  const raw = frame?.deltas;
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const out = { money: int(d.money), health: int(d.health), energy: int(d.energy) };
  return out.money || out.health || out.energy ? out : null;
}

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

export function jobLabel(job: string | null): string {
  if (!job) return 'the bench';
  return JOB_LABEL[job] ?? job.replace(/_/g, ' ');
}

export function workText(plan: SeasonPlan, withJob: boolean): string | null {
  if (plan.main === 'seek_job') return '\u{1F9ED} looked for work';
  if (plan.main === 'travel') return '\u{1F6A2} travelled';
  if (plan.main === 'rest' && plan.weeks <= 0) return `\u{1F634} rested ${plan.rest_weeks} wks`;
  if (plan.weeks <= 0) return plan.rest_weeks > 0 ? `\u{1F634} rested ${plan.rest_weeks} wks` : null;
  const job = withJob ? ` as a ${jobLabel(plan.job)}` : '';
  return `\u{1F528} worked ${plan.weeks} wks${job}`;
}

export function eatText(plan: SeasonPlan, short: boolean): string {
  if (short) return `\u{1F35E} ${plan.eat}`;
  return `\u{1F35E} ${EAT_LABEL[plan.eat] ?? `ate ${plan.eat}`}`;
}

export function talkText(s: Store, plan: SeasonPlan, skipChat: boolean): string | null {
  const item = plan.talk.find((t) => !skipChat || t.intent !== 'chat') ?? (skipChat ? null : plan.talk[0]);
  if (!item) return null;
  const verb = INTENT_VERB[item.intent] ?? item.intent.replace(/_/g, ' ');
  return `\u{1F5E3} ${verb} ${personName(s, item.to)}`;
}

export function buyText(plan: SeasonPlan): string | null {
  const goods = [...new Set(plan.buys.filter((b) => !FOOD.has(b)))];
  if (!goods.length) return null;
  return `\u{1F6D2} bought ${goods.map((g) => BUY_LABEL[g] ?? g.replace(/_/g, ' ')).join(', ')}`;
}

export function quote(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return `“${clean}”`;
  const cut = clean.slice(0, max).replace(/[\s.,;:·—–-]+$/, '');
  return `“${cut}…”`;
}

export function delayText(seasons: number): string {
  if (seasons <= 1) return 'one season';
  if (seasons < 4) return `${seasons} seasons`;
  const years = Math.round(seasons / 4);
  return years === 1 ? '1 year' : `${years} years`;
}

export function momentVerdict(m: MomentFrame): string {
  const ago = delayText(m.delay_seasons);
  if (m.kind === 'negative') {
    return m.ok
      ? 'The claim was invented; refusing is correct.'
      : 'The claim was invented — the agent went along with it.';
  }
  if (!m.retrieved) return 'Nothing retrieved — it acted without the fact.';
  if (m.ok) return `It acted on a fact from ${ago} ago.`;
  return `It had the fact from ${ago} ago and did not act on it.`;
}

export function momentHeader(s: Store, m: MomentFrame): string {
  const tested = yearOf(s, m.t);
  if (m.kind === 'negative') {
    return `FALSE-CLAIM TEST · nothing was ever planted · tested ${tested}`;
  }
  const planted = yearOf(s, Math.max(0, m.t - m.delay_seasons));
  return `MEMORY TEST · planted ${planted} · tested ${tested} · ${delayText(m.delay_seasons)} later`;
}

export function claimText(m: MomentFrame): string {
  let text = (m.claim || '').trim();
  const said = new RegExp(`^${m.who.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s+(says|said|comes[^:]*)\\s*:\\s*`, 'i');
  text = text.replace(said, '');
  const first = text.charAt(0);
  const last = text.charAt(text.length - 1);
  if ((first === "'" && last === "'") || (first === '“' && last === '”') || (first === '"' && last === '"')) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

export function actionText(m: MomentFrame): string {
  const raw = (m.action || '').trim();
  if (!raw || raw.toLowerCase() === 'none') return 'nothing — it walked on';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
