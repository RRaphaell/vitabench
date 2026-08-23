import type { MomentFrame } from '../state/schema';
import { Store } from '../state/store';
import { clear, el, show } from './dom';

const REVEAL_MS = 1200;

export interface MomentsDeps {
  onContinue(): void;
  onLeaderboard(): void;
}

function stampFor(m: MomentFrame): { text: string; ok: boolean } {
  if (m.kind === 'negative') return m.ok ? { text: '✔ REJECTED', ok: true } : { text: '✘ CONFABULATED', ok: false };
  if (!m.ok) return { text: '✘ FORGOT', ok: false };
  return { text: `✔ ${(m.label || 'remembered').toUpperCase()}`, ok: true };
}

function num(scores: Record<string, unknown>, key: string, fallback: number): number {
  const v = scores[key];
  return typeof v === 'number' ? v : fallback;
}

export function mountMoments(root: HTMLElement, deps: MomentsDeps): { update(s: Store): void } {
  const scrim = el('div', 'scrim hidden');
  const card = el('div', 'panel moment');
  const who = el('div', 'who', '');
  const role = el('div', 'role', '');
  const claim = el('div', 'claim', '');
  const retrieved = el('div', 'line', '');
  const action = el('div', 'line act', '');
  const stamp = el('div', 'stamp', '');
  const hint = el('div', 'hint', 'space to continue');
  card.append(who, role, claim, retrieved, action, stamp, hint);
  scrim.append(card);
  scrim.addEventListener('click', () => deps.onContinue());
  root.append(scrim);

  const endScrim = el('div', 'scrim hidden');
  const endCard = el('div', 'panel endcard');
  const endTitle = el('h2', '', '');
  const endWho = el('div', 'endwho', '');
  const endRows = el('div', 'meters');
  const lbButton = el('button', 'btn', 'leaderboard');
  lbButton.addEventListener('click', (ev) => {
    ev.stopPropagation();
    deps.onLeaderboard();
  });
  endCard.append(endTitle, endWho, endRows, lbButton);
  endScrim.append(endCard);
  root.append(endScrim);

  let shownEnd = false;
  let armed: string | null = null;
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
      show(scrim, !!m && ready && !s.endOpen);
      if (m) {
        who.textContent = m.who;
        role.textContent = m.role;
        claim.textContent = `“${m.claim}”`;
        retrieved.textContent = m.retrieved ? `harness retrieved: ${m.retrieved}` : '— nothing retrieved —';
        retrieved.classList.toggle('none', !m.retrieved);
        action.textContent = `agent: ${m.action}`;
        const st = stampFor(m);
        stamp.textContent = st.text;
        stamp.className = `stamp ${st.ok ? 'ok' : 'fail'}`;
      }
      show(endScrim, s.endOpen);
      if (!s.endOpen || !s.end || shownEnd) return;
      shownEnd = true;
      const e = s.end;
      const scores = e.scores ?? {};
      const money = s.frameAt(s.lastT)?.hero.money ?? 0;
      const payoffs = s.moments.filter((x) => x.kind === 'payoff');
      const negatives = s.moments.filter((x) => x.kind === 'negative');
      endTitle.textContent = `${s.hello?.persona.name ?? 'The hero'} died at ${e.age}, of ${e.cause}`;
      endWho.textContent = `${s.hello?.harness ?? 'unknown harness'} · ${s.hello?.model ?? 'unknown model'}`;
      const rows: [string, string][] = [
        ['years lived', String(Math.round(s.lastT / 4))],
        ['ducats at death', String(money)],
        ['goals met', `${Array.isArray((scores as Record<string, unknown>).goals_met) ? ((scores as Record<string, unknown>).goals_met as unknown[]).length : num(scores, 'goals_met', 0)} / ${num(scores, 'goals_total', s.hello?.persona.goals.length ?? 3)}`],
        ['memory', `${num(scores, 'memory_passed', payoffs.filter((x) => x.ok).length)} / ${num(scores, 'memory_total', payoffs.length)}`],
        ['false claims rejected', `${num(scores, 'negatives_rejected', negatives.filter((x) => x.ok).length)} / ${num(scores, 'negatives_total', negatives.length)}`],
        ['cost', `$${e.cost_usd.toFixed(2)}`],
        ['H score', num(scores, 'H', 0).toFixed(3)],
      ];
      clear(endRows);
      for (const [k, v] of rows) {
        const row = el('div', 'endrow');
        row.append(el('span', 'k', k), el('span', 'v', v));
        endRows.append(row);
      }
    },
  };
}
