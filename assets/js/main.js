'use strict';
/* ===== 시작 (모든 스크립트가 로드된 뒤 실행) ===== */
(function init() {
  try { localStorage.removeItem('theme'); } catch (e) { /* 무시 (다크모드 삭제) */ }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.user) location.reload(); });
  (async () => {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { renderLogin(); return; }
      S.user = session.user;
      await afterLogin();
    } catch (e) { renderFatal(e); }
  })();
})();

/* ===== 빠른 이동 버튼 (맨 위 · 목록 · 맨 아래) — 지원자가 많아 페이지가 길어졌을 때 한 번에 이동 ===== */
(function quickJump() {
  const box = document.createElement('div');
  box.className = 'qjump hide';
  box.innerHTML = `<button type="button" title="맨 위로" data-j="top">▲<span>맨 위</span></button>
    <button type="button" title="지원자 목록으로" data-j="list">☰<span>목록</span></button>
    <button type="button" title="맨 아래로" data-j="bottom">▼<span>맨 아래</span></button>`;
  document.body.appendChild(box);
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    const j = b.dataset.j;
    if (j === 'top') window.scrollTo({ top: 0, behavior: 'auto' });
    else if (j === 'bottom') window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'auto' });
    else {
      const el = document.getElementById('listPanel') || document.querySelector('#main .tbl-wrap, #main table');
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 8, behavior: 'auto' });
    }
  });
  const upd = () => {
    const long = document.documentElement.scrollHeight > window.innerHeight * 1.6;
    const busy = document.querySelector('.backdrop');  // 팝업 창이 열려 있으면 숨김
    box.classList.toggle('hide', !long || !!busy || !S.user);
    const lp = box.querySelector('[data-j="list"]');
    if (lp) lp.style.display = document.getElementById('listPanel') || document.querySelector('#main table') ? '' : 'none';
  };
  window.addEventListener('scroll', upd, { passive: true });
  window.addEventListener('resize', upd);
  new MutationObserver(upd).observe(document.body, { childList: true, subtree: true });
})();
