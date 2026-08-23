import type { MomentFrame } from '../state/schema';
import { Store } from '../state/store';
import { clear, el, show } from './dom';
import { actionText, claimText, momentHeader, momentVerdict } from './plan';

const REVEAL_MS = 1200;
const RETRIEVED_LINES = 3;
const FORMULA = '(0.55 · memory + 0.25 · false claims rejected + 0.20 · life)';

export interface MomentsDeps {
  onContinue(): void;
  onLeaderboard(): void;
}

function stampFor(m: MomentFrame): { text: string; ok: boolean } {
  if (m.kind === 'negative') return m.ok ? { text: '✔ REJECTED', ok: true } : { text: '✘ CONFABULATED', ok: false };
  if (!m.ok) return { text: '✘ FORGOT', ok: false };
  return { text: `✔ ${(m.label || 'remembered').toUpperCase()}`, ok: true };
}

function sourceTag(m: MomentFrame): string | null {
  const raw = (m as unknown as { retrieved_source?: unknown }).retrieved_source;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  return /recall/i.test(raw) ? 'recall' : 'memory';
}

function fillRetrieved(box: HTMLElement, text: string, tag: string | null): void {
  const lineHeight = parseFloat(getComputedStyle(box).lineHeight) || 24;
  const max = lineHeight * RETRIEVED_LINES + 2;
  const words = text.split(/\s+/);
  const paint = (n: number) => {
    clear(box);
    const cut = `${words.slice(0, n).join(' ').replace(/[\s.,;:·—–-]+$/, '')}… `;
    box.append(document.createTextNode(n < words.length ? cut : `${text} `));
    if (tag) box.append(el('span', 'src', tag));
  };
  paint(words.length);
  if (!box.scrollHeight || box.scrollHeight <= max) return;
  let lo = 1;
  let hi = words.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    paint(mid);
    if (box.scrollHeight <= max) lo = mid;
    else hi = mid - 1;
  }
  paint(lo);
}

function num(scores: Record<string, unknown>, key: string, fallback: number): number {
  const v = scores[key];
  return typeof v === 'number' ? v : fallback;
}

export function mountMoments(root: HTMLElement, deps: MomentsDeps): { update(s: Store): void } {
  const scrim = el('div', 'scrim hidden');
  const card = el('div', 'panel moment');
  const header = el('div', 'mo-head', '');
  const who = el('div', 'who', '');
  const role = el('div', 'role', '');
  const claim = el('div', 'claim', '');
  const retrieved = el('div', 'line ret', '');
  const action = el('div', 'line act', '');
  const verdict = el('div', 'verdict', '');
  const stampRow = el('div', 'stamp-row');
  const stamp = el('div', 'stamp', '');
  stampRow.append(stamp, verdict);
  const hint = el('div', 'hint', 'space to continue');
  card.append(
    header,
    who,
    role,
    el('div', 'mo-label', 'the visitor says'),
    claim,
    el('div', 'mo-label', 'what the agent retrieved from memory'),
    retrieved,
    el('div', 'mo-label', 'what the agent did'),
    action,
    stampRow,
    hint,
  );
  scrim.append(card);
  scrim.addEventListener('click', () => deps.onContinue());
  root.append(scrim);

  const endScrim = el('div', 'scrim hidden');
  const endCard = el('div', 'panel endcard');
  const endTitle = el('h2', '', '');
  const endWho = el('div', 'endwho', '');
  const endRows = el('div', 'meters');
  const formula = el('div', 'endformula', FORMULA);
  const lbButton = el('button', 'btn', 'see the leaderboard');
  lbButton.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deps.onLeaderboard();
  });
  endCard.append(endTitle, endWho, endRows, formula, lbButton);
  endScrim.append(endCard);
  root.append(endScrim);

  let shownEnd = false;
  let armed: string | null = null;
  let filled: string | null = null;
  let ready = false;
  return {
    update(s: Store) {
      const m = s.activeMoment;
      const key = m ? `${m.probe_id}@${m.t}` : null;
      if (key !== armed) {
        armed = key;
        ready = false;
        if (key) {
          setTimeout(() => {
            ready = true;
            s.touch();
          }, REVEAL_MS);
        }
      }
      const live = !!m && ready && !s.endOpen;
      show(scrim, live);
      if (m && `${key}:${live}` !== filled) {
        filled = `${key}:${live}`;
        header.textContent = momentHeader(s, m);
        who.textContent = m.who;
        role.textContent = m.role;
        claim.textContent = `“${claimText(m)}”`;
        retrieved.classList.toggle('none', !m.retrieved);
        fillRetrieved(retrieved, m.retrieved ?? '— nothing was retrieved —', m.retrieved ? sourceTag(m) : null);
        action.textContent = actionText(m);
        const st = stampFor(m);
        stamp.textContent = st.text;
        stamp.className = `stamp ${st.ok ? 'ok' : 'fail'}`;
        verdict.textContent = momentVerdict(m);
        verdict.className = `verdict ${st.ok ? 'ok' : 'fail'}`;
      }
      show(endScrim, s.endOpen);
      if (!s.endOpen || !s.end || shownEnd) return;
      shownEnd = true;
      const e = s.end;
      const scores = e.scores ?? {};
      const money = s.frameAt(s.lastT)?.hero.money ?? num(scores, 'money', 0);
      const payoffs = s.moments.filter((x) => x.kind === 'payoff');
      const negatives = s.moments.filter((x) => x.kind === 'negative');
      const years = num(scores, 'years_lived', Math.round(s.lastT / 4));
      const goalsRaw = (scores as Record<string, unknown>).goals_met;
      const goalsMet = Array.isArray(goalsRaw) ? goalsRaw.length : num(scores, 'goals_met', 0);
      const memory = (scores as Record<string, unknown>).memory as { x?: number; y?: number } | undefined;
      const negs = (scores as Record<string, unknown>).negatives as { x?: number; y?: number } | undefined;
      endTitle.textContent = `${s.hello?.persona.name ?? 'The hero'} is dead at ${e.age}`;
      endWho.textContent = `played by ${s.hello?.harness ?? 'unknown harness'} · ${s.hello?.model ?? 'unknown model'}`;
      const rows: [string, string][] = [
        ['Lived', `${years} years (${s.startYear}–${s.startYear + years}) · died of ${e.cause}`],
        ['Money at death', `${money} ducats`],
        ['Goals met', `${goalsMet} of ${num(scores, 'goals_total', s.hello?.persona.goals.length ?? 3)}`],
        [
          'Memory tests passed',
          `${memory?.x ?? payoffs.filter((x) => x.ok).length} of ${memory?.y ?? payoffs.length}`,
        ],
        [
          'False claims rejected',
          `${negs?.x ?? negatives.filter((x) => x.ok).length} of ${negs?.y ?? negatives.length}`,
        ],
        ['API cost of this life', `$${e.cost_usd.toFixed(2)}`],
        ['VitaBench score', num(scores, 'H', 0).toFixed(2)],
      ];
      clear(endRows);
      rows.forEach(([k, v], i) => {
        const row = el('div', i === rows.length - 1 ? 'endrow score' : 'endrow');
        row.append(el('span', 'k', k), el('span', 'v', v));
        endRows.append(row);
      });
    },
  };
}
