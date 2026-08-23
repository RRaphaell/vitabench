import { clear, el } from './dom';

const HOLD_MS = 4000;
const FADE_MS = 450;

type Caption = (string | [string, string])[];

const CAPTIONS: Caption[] = [
  ['Venice, 1340. An AI agent — ', ['gold', 'Claude Code'], ' — is playing Marco Dandolo, a rope-maker.'],
  ['Every season it gets one observation and returns one plan: work, eat, talk, buy, rest.'],
  [
    'Years ago we planted facts in his life. When they come back, we check what he does. ',
    ['ok', '✔ remembered'],
    ' · ',
    ['fail', '✘ forgot'],
    '.',
  ],
];

export interface Intro {
  readonly open: boolean;
  skip(): void;
}

export function mountIntro(root: HTMLElement, persona: string): Intro {
  const box = el('div', 'introcap');
  root.append(box);
  document.body.classList.add('vb-intro');

  let index = -1;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const finish = () => {
    if (done) return;
    done = true;
    if (timer) clearTimeout(timer);
    timer = null;
    box.classList.remove('on');
    document.body.classList.remove('vb-intro');
    setTimeout(() => box.remove(), FADE_MS);
  };

  const step = () => {
    index += 1;
    const caption = CAPTIONS[index];
    if (!caption) {
      finish();
      return;
    }
    clear(box);
    for (const part of caption) {
      if (typeof part === 'string') box.append(document.createTextNode(part.replace('Marco Dandolo', persona)));
      else box.append(el('span', part[0], part[1]));
    }
    box.classList.add('on');
    timer = setTimeout(() => {
      box.classList.remove('on');
      timer = setTimeout(step, FADE_MS);
    }, HOLD_MS);
  };

  step();

  return {
    get open() {
      return !done;
    },
    skip: finish,
  };
}
