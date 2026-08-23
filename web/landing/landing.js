const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const loop = document.getElementById('loop');
if (loop) {
  const start = () => {
    const played = loop.play();
    if (played && typeof played.catch === 'function') played.catch(() => {});
  };
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
}

const lightbox = document.getElementById('lightbox');
const lbInner = document.getElementById('lb-inner');
const fullBtn = document.getElementById('full-btn');

function closeLightbox() {
  lightbox.hidden = true;
  lbInner.replaceChildren();
  document.body.style.overflow = '';
}

if (fullBtn) {
  fullBtn.addEventListener('click', () => {
    const video = document.createElement('video');
    video.src = 'media/demo_720.mp4';
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.poster = 'media/demo_poster.jpg';
    lbInner.replaceChildren(video);
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
  });
  document.getElementById('lb-close').addEventListener('click', closeLightbox);
  lightbox.addEventListener('click', (e) => {
    if (e.target === lightbox) closeLightbox();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
  });
}

for (const button of document.querySelectorAll('.copy')) {
  button.addEventListener('click', async () => {
    const source = document.getElementById(button.dataset.copy);
    if (!source) return;
    try {
      await navigator.clipboard.writeText(source.innerText.trim());
      button.textContent = 'copied';
      button.classList.add('done');
      setTimeout(() => {
        button.textContent = 'copy';
        button.classList.remove('done');
      }, 1600);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(source);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }
  });
}

const revealed = document.querySelectorAll('.sec-head, .step-text, .step .shot, .table-scroll, .delay, .findings, .pair figure, .code-card, .note, .limits li, .closer h2, .closer .cta-row, .closer-hint');
if (!reduce && 'IntersectionObserver' in window) {
  for (const el of revealed) el.classList.add('reveal');
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 }
  );
  for (const el of revealed) observer.observe(el);
}
