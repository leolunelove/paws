// Keep modal scrolling separate from the Home underneath, preserving its place.
const root = document.documentElement;
let locked = false;
let savedY = 0;
function lockScroll() {
  if (locked) return;
  savedY = window.scrollY;
  locked = true;
  document.body.style.top = `-${savedY}px`;
  root.classList.add('modal-open');
}
export function openDialog(dialog) {
  lockScroll();
  try { dialog.showModal(); } catch (error) { syncModalScroll(); throw error; }
}
function syncModalScroll() {
  if (document.querySelector('dialog[open]')) { lockScroll(); return; }
  if (!locked) return;
  locked = false;
  root.classList.remove('modal-open');
  document.body.style.removeProperty('top');
  window.scrollTo(0, savedY);
}
for (const dialog of document.querySelectorAll('dialog')) {
  new MutationObserver(syncModalScroll).observe(dialog, {attributes:true, attributeFilter:['open']});
}
syncModalScroll();
// The software keyboard can shrink the visual viewport without changing dvh.
function syncViewport() {
  const view = window.visualViewport;
  if (!view || view.scale !== 1) return;
  root.style.setProperty('--view-height', `${view.height}px`);
  root.style.setProperty('--view-top', `${view.offsetTop}px`);
  root.style.setProperty('--keyboard-bottom', `${Math.max(0, window.innerHeight-view.height-view.offsetTop)}px`);
}
window.visualViewport?.addEventListener('resize', syncViewport);
window.visualViewport?.addEventListener('scroll', syncViewport);
window.addEventListener('resize', syncViewport);
syncViewport();
