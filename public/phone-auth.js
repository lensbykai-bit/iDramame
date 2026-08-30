(() => {
  const SESSION_KEY = 'idramaai_supabase_session_v1';

  function normalizeCambodiaPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('855')) return `+${digits}`;
    if (digits.startsWith('0')) digits = digits.slice(1);
    return `+855${digits}`;
  }

  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function isPhone(value) {
    return /^\+855\d{8,10}$/.test(normalizeCambodiaPhone(value));
  }

  function authConfig() {
    const cfg = window.IDRAMA_SUPABASE || {};
    return { url: cfg.url || '', key: cfg.publishableKey || '' };
  }

  async function authFetch(path, body) {
    const { url, key } = authConfig();
    if (!url || !key) throw new Error('Account service is not configured.');

    const res = await fetch(`${url}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.msg || data.message || data.error_description || 'Account request failed.');
    }
    return data;
  }

  function saveSession(data) {
    if (data?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function enhanceAuthForm() {
    const form = document.querySelector('#authForm');
    const input = document.querySelector('#authEmail');
    if (!form || !input) return;

    const label = input.closest('label');
    if (label) {
      for (const node of label.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
          node.textContent = 'Email / លេខទូរស័ព្ទ';
          break;
        }
      }
    }

    input.type = 'text';
    input.inputMode = 'email';
    input.autocomplete = 'username';
    input.placeholder = 'Email ឬ 012 345 678';
    input.setAttribute('aria-label', 'Email ឬ លេខទូរស័ព្ទ');

    document.querySelector('.phone-field-label')?.remove();

    const heading = document.querySelector('#modalBody .modal-title');
    const isSignup = heading?.textContent.includes('បង្កើតគណនី');
    const submit = document.querySelector('#authSubmit');
    if (submit && isSignup) submit.textContent = 'បង្កើតគណនី';

    if (!form.dataset.identifierAuthInstalled) {
      form.dataset.identifierAuthInstalled = '1';
      form.addEventListener('submit', handleSubmit, true);
    }
  }

  async function handleSubmit(event) {
    const heading = document.querySelector('#modalBody .modal-title');
    const isSignup = heading?.textContent.includes('បង្កើតគណនី');
    const identifierInput = document.querySelector('#authEmail');
    const passwordInput = document.querySelector('#authPassword');
    const submit = document.querySelector('#authSubmit');
    const status = document.querySelector('#authStatus');
    if (!identifierInput || !passwordInput || !submit || !status) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;
    let body;

    if (isEmail(identifier)) {
      body = { email: identifier, password };
    } else if (isPhone(identifier)) {
      body = { phone: normalizeCambodiaPhone(identifier), password };
    } else {
      status.className = 'status error auth-status';
      status.textContent = 'សូមបញ្ចូល Email ឬលេខទូរស័ព្ទកម្ពុជាឱ្យបានត្រឹមត្រូវ។';
      return;
    }

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>កំពុងដំណើរការ…';
    status.className = 'status auth-status';
    status.textContent = '⏳ កំពុងភ្ជាប់ Account…';

    try {
      const path = isSignup ? 'signup' : 'token?grant_type=password';
      const data = await authFetch(path, body);

      if (data.access_token) {
        saveSession(data);
        location.reload();
        return;
      }

      status.className = 'status success auth-status';
      status.textContent = isSignup
        ? (body.phone
          ? '✅ គណនីត្រូវបានបង្កើត។ ប្រសិនបើតម្រូវឱ្យបញ្ជាក់លេខ សូមពិនិត្យ SMS។'
          : '✅ គណនីត្រូវបានបង្កើត។ សូមពិនិត្យ Email ដើម្បីបញ្ជាក់គណនី។')
        : '✅ ដំណើរការជោគជ័យ។';
    } catch (err) {
      status.className = 'status error auth-status';
      status.textContent = err.message;
    } finally {
      submit.disabled = false;
      submit.textContent = isSignup ? 'បង្កើតគណនី' : 'ចូលគណនី';
    }
  }

  const observer = new MutationObserver(enhanceAuthForm);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhanceAuthForm);
  } else {
    enhanceAuthForm();
  }
})();
