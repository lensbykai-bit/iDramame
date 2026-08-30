(() => {
  const PHONE_ID = 'authPhone';

  function normalizeCambodiaPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('855')) return `+${digits}`;
    if (digits.startsWith('0')) digits = digits.slice(1);
    return `+855${digits}`;
  }

  function validCambodiaPhone(value) {
    return /^\+855\d{8,10}$/.test(normalizeCambodiaPhone(value));
  }

  function injectPhoneField() {
    const form = document.querySelector('#authForm');
    if (!form || document.getElementById(PHONE_ID)) return;

    const heading = document.querySelector('#modalBody .modal-title');
    const isSignup = heading && heading.textContent.includes('បង្កើតគណនី');
    if (!isSignup) return;

    const passwordInput = document.querySelector('#authPassword');
    const passwordLabel = passwordInput?.closest('label');
    if (!passwordLabel) return;

    const label = document.createElement('label');
    label.className = 'phone-field-label';
    label.innerHTML = `លេខទូរស័ព្ទ
      <div class="phone-input-wrap">
        <span class="phone-prefix">🇰🇭 +855</span>
        <input id="${PHONE_ID}" type="tel" inputmode="tel" autocomplete="tel" required placeholder="12 345 678" aria-label="លេខទូរស័ព្ទ" />
      </div>
      <small class="phone-help">ឧទាហរណ៍៖ 012 345 678</small>`;

    passwordLabel.parentNode.insertBefore(label, passwordLabel);
  }

  function showSavedPhone() {
    const accountCard = document.querySelector('#modalBody .account-card');
    if (!accountCard || accountCard.querySelector('.account-phone')) return;
    const phone = window.currentUser?.user_metadata?.phone_number || window.currentUser?.user_metadata?.phone || '';
    if (!phone) return;
    const target = accountCard.querySelector('div:last-child');
    if (!target) return;
    const line = document.createElement('div');
    line.className = 'account-phone';
    line.textContent = `📱 ${phone}`;
    target.appendChild(line);
  }

  function installSignupOverride() {
    if (typeof window.signUp !== 'function' || typeof window.authRequest !== 'function') return;

    window.signUp = async function signUpWithPhone(email, password) {
      const phoneInput = document.getElementById(PHONE_ID);
      const rawPhone = phoneInput?.value || '';
      const phone = normalizeCambodiaPhone(rawPhone);

      if (!validCambodiaPhone(rawPhone)) {
        throw new Error('សូមបញ្ចូលលេខទូរស័ព្ទកម្ពុជាឱ្យបានត្រឹមត្រូវ។ ឧ. 012 345 678');
      }

      const data = await window.authRequest('signup', {
        method: 'POST',
        body: {
          email,
          password,
          data: {
            phone_number: phone,
            phone,
            country: 'KH'
          }
        }
      });

      if (data.access_token) {
        window.saveSession(data);
        await window.loadUser();
        return { signedIn: true };
      }
      return { signedIn: false };
    };
  }

  function enhanceModal() {
    injectPhoneField();
    showSavedPhone();
  }

  const observer = new MutationObserver(enhanceModal);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      installSignupOverride();
      enhanceModal();
    });
  } else {
    installSignupOverride();
    enhanceModal();
  }
})();
