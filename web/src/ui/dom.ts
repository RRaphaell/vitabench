export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function show(node: HTMLElement, visible: boolean): void {
  node.classList.toggle('hidden', !visible);
}

export function fitLines(node: HTMLElement, text: string, lines: number): void {
  node.textContent = text;
  const lineHeight = parseFloat(getComputedStyle(node).lineHeight) || 18;
  const max = lineHeight * lines + 2;
  if (!node.scrollHeight || node.scrollHeight <= max) return;
  const words = text.split(/\s+/);
  let lo = 1;
  let hi = words.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    node.textContent = `${words.slice(0, mid).join(' ')}…`;
    if (node.scrollHeight <= max) lo = mid;
    else hi = mid - 1;
  }
  node.textContent = `${words.slice(0, lo).join(' ')}…`;
}
