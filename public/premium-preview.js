'use strict';

// Premium cinematic Trailer / Purchase modal for iDrama.ai.
// Keeps the existing auth + checkout logic and only replaces story preview presentation.
(() => {
  const modalCard = document.querySelector('.cinema-modal-card');

  function usdPrice(value) {
    const n = Number(value || 0);
    return `$${Number.isFinite(n) ? n.toFixed(2) : '0.00'}`;
  }

  function phoneFromInternalEmail(email = '') {
    const match = String(email).match(/^p(855\d+)@accounts\.idrama\.ai$/i);
    return match ? `+${match[1]}` : '';
  }

  function displayIdentity() {
    if (!currentUser) return '';
    const metaPhone = currentUser?.user_metadata?.login_phone || currentUser?.user_metadata?.display_phone || currentUser?.phone || '';
    const derivedPhone = phoneFromInternalEmail(currentUser?.email || '');
    const phone = String(metaPhone || derivedPhone || '').trim();
    if (phone) return phone;
    return String(currentUser?.email || 'Account').trim();
  }

  function removePremiumCardMode() {
    modalCard?.classList.remove('premium-preview-card');
  }

  function premiumShowStory(id) {
    stopPaymentPolling();
    const s = stories.find(x => x.id === id);
    if (!s) return;
    activeStory = s;

    const checkoutReady = Boolean(meta.testMode || meta.checkout);
    const identity = displayIdentity();
    const poster = s.cover_url
      ? `<img src="${esc(s.cover_url)}" alt="${esc(s.title)}">`
      : '<div class="premium-poster-fallback">iD</div>';

    const trailer = s.preview_video_url
      ? `<video controls playsinline preload="metadata" controlsList="nodownload noremoteplayback" disablePictureInPicture src="${esc(s.preview_video_url)}"></video>`
      : `<div class="premium-trailer-empty"><span>🎞️ រឿងនេះមិនទាន់មាន Trailer ទេ។</span><span class="premium-free-pill">FREE PREVIEW</span></div>`;

    const accountBlock = currentUser
      ? `<div class="premium-account-card">
          <div class="premium-account-icon">👤</div>
          <div class="premium-account-copy"><small>គណនីដែលកំពុងប្រើ</small><strong>${esc(identity)}</strong></div>
          <span class="premium-account-state">បានចូល ✓</span>
        </div>`
      : `<div class="premium-account-card">
          <div class="premium-account-icon">👤</div>
          <div class="premium-account-copy"><small>មុនពេលទិញ</small><strong>សូម Login ដើម្បីរក្សារឿងក្នុង My Library</strong></div>
          <span class="premium-account-state warn">ត្រូវ Login</span>
        </div>`;

    const action = checkoutReady
      ? `<button class="premium-buy-btn" id="buyBtn" type="button">${currentUser ? '▦ ទូទាត់តាម Bakong KHQR  →' : '👤 Login ដើម្បីទិញ'}</button>`
      : '<div class="premium-unavailable">Bakong KHQR មិនទាន់បានកំណត់នៅលើ Server ទេ។</div>';

    modalBody.innerHTML = `
      <div class="premium-story-modal">
        <div class="premium-preview-grid">
          <div class="premium-poster-shell">${poster}</div>
          <div class="premium-preview-main">
            <div class="premium-preview-kicker">🎬 TRAILER / PREVIEW</div>
            <h2 class="premium-preview-title">${esc(s.title)}</h2>
            <div class="premium-title-rule"></div>
            <div class="premium-trailer-box">${trailer}</div>
            <div id="premiumDescription" class="premium-description">${esc(s.preview || 'មើល Trailer ដោយឥតគិតថ្លៃ ហើយទិញរឿងពេញតាម Bakong KHQR។')}</div>
            <button id="premiumMoreBtn" class="premium-more-btn" type="button">បង្ហាញបន្ថែម⌄</button>
          </div>
        </div>

        <div class="premium-purchase-area">
          <div class="premium-price-card">
            <div class="premium-price-copy">
              <div class="premium-price-icon">🏷️</div>
              <div><strong>តម្លៃរឿងពេញ</strong><small>ទិញម្តង • រក្សាទុកក្នុង My Library</small></div>
            </div>
            <div class="premium-price-value">${usdPrice(s.price_khr)}</div>
          </div>
          ${accountBlock}
          ${action}
          <div class="premium-trust-row">
            <div><b>🛡️ Secure Checkout</b>Bakong KHQR</div>
            <div><b>🔐 Protected Access</b>មើលតាមគណនីរបស់អ្នក</div>
            <div><b>📚 My Library</b>រក្សាទុកបន្ទាប់ពីទិញ</div>
          </div>
        </div>
      </div>`;

    modalCard?.classList.add('premium-preview-card');
    openModal();

    const moreBtn = document.getElementById('premiumMoreBtn');
    const desc = document.getElementById('premiumDescription');
    if (moreBtn && desc) {
      // Hide the toggle when the description is already short.
      requestAnimationFrame(() => {
        if (desc.scrollHeight <= desc.clientHeight + 4) moreBtn.hidden = true;
      });
      moreBtn.addEventListener('click', () => {
        const expanded = desc.classList.toggle('expanded');
        moreBtn.textContent = expanded ? 'បង្រួមអត្ថបទ⌃' : 'បង្ហាញបន្ថែម⌄';
      });
    }

    document.getElementById('buyBtn')?.addEventListener('click', () => {
      if (!currentUser) {
        removePremiumCardMode();
        return showAccountModal('login');
      }
      removePremiumCardMode();
      createOrder(s.id);
    });
  }

  if (typeof showStory === 'function') {
    showStory = premiumShowStory;
    try { window.showStory = premiumShowStory; } catch {}
  }

  // Keep account/payment dialogs at their normal size.
  if (typeof showAccountModal === 'function' && !showAccountModal.__premiumPreviewWrapped) {
    const originalShowAccountModal = showAccountModal;
    const wrapped = function (...args) {
      removePremiumCardMode();
      return originalShowAccountModal.apply(this, args);
    };
    wrapped.__premiumPreviewWrapped = true;
    showAccountModal = wrapped;
    try { window.showAccountModal = wrapped; } catch {}
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-close]')) setTimeout(removePremiumCardMode, 0);
  }, true);
})();
