window.IDRAMA_SUPABASE = Object.freeze({
  url: 'https://kbanmyaqodtfoqikzwou.supabase.co',
  publishableKey: 'sb_publishable_7iqItoUm3UU8Vn24VZvC7Q_0AoTUrzo',
  checkoutFunction: 'https://kbanmyaqodtfoqikzwou.supabase.co/functions/v1/idrama-checkout'
});

// Customer-facing auth cleanup fallback.
// This runs without observers/loops and only removes legacy technical copy.
(() => {
  function cleanLegacyAuthCopy() {
    const body = document.querySelector('#modalBody');
    if (!body) return;

    body.querySelectorAll('.modal-preview, .auth-subtitle, .auth-status, .status').forEach((el) => {
      const text = String(el.textContent || '').trim();
      const technicalPasswordCopy = /Supabase\s+Auth|iDramaAi\s+server/i.test(text);
      const legacyLibraryCopy = text.includes('ចូលគណនីដោយ Email ឬលេខទូរស័ព្ទ ដើម្បីបើក My Library របស់អ្នក');

      if (technicalPasswordCopy || legacyLibraryCopy) {
        el.textContent = '';
        el.hidden = true;
        el.style.display = 'none';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', cleanLegacyAuthCopy, { once: true });
  document.addEventListener('click', () => setTimeout(cleanLegacyAuthCopy, 0), true);
  document.addEventListener('submit', () => setTimeout(cleanLegacyAuthCopy, 0), true);
})();
