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
