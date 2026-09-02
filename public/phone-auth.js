(() => {
  const SESSION_KEY = 'idramaai_supabase_session_v1';
  let lastMethod = 'email';

  function normalizeCambodiaPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('855')) return `+${digits}`;
    if (digits.startsWith('0')) digits = digits.slice(1);
    return `+855${digits}`;
  }

  function displayPhone(phone) {
    const normalized = normalizeCambodiaPhone(phone);
    return normalized || String(phone || '');
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

  function friendlyError(raw, status) {
    const text = String(raw || '');
    if (/phone.*disabled|sms.*disabled|provider.*disabled/i.test(text)) {
      return 'ការចុះឈ្មោះដោយលេខទូរស័ព្ទមិនទាន់បានបើកនៅ Supabase។ ត្រូវបើក Phone Auth និង SMS Provider ជាមុន។';
    }
    if (/invalid login credentials/i.test(text)) {
      return 'Email/លេខទូរស័ព្ទ ឬ Password មិនត្រឹមត្រូវ។';
    }
    if (/email not confirmed/i.test(text)) {
      return 'សូមបញ្ជាក់ Email របស់អ្នកជាមុនសិន រួចចូលគណនីម្ដងទៀត។';
    }
    if (/phone not confirmed/i.test(text)) {
      return 'លេខទូរស័ព្ទមិនទាន់បានបញ្ជាក់។ សូមបញ្ជាក់ OTP ជាមុនសិន។';
    }
    if (/token.*expired|otp.*expired/i.test(text)) {
      return 'លេខកូដ OTP ផុតកំណត់។ សូមស្នើលេខកូដថ្មី។';
    }
    if (/invalid.*token|invalid.*otp|token.*invalid/i.test(text)) {
      return 'លេខកូដ OTP មិនត្រឹមត្រូវ។ សូមពិនិត្យម្ដងទៀត។';
    }
    if (/user already registered/i.test(text)) {
      return 'គណនីនេះមានរួចហើយ។ សូមចូលគណនី។';
    }
    return text || `Account request failed (${status}).`;
  }

  async function authFetch(path, body) {
    const { url, key } = authConfig();
    if (!url || !key) throw new Error('Account service មិនទាន់បានភ្ជាប់។');

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
      const raw = data.msg || data.message || data.error_description || data.error;
      throw new Error(friendlyError(raw, res.status));
    }
    return data;
  }

  function saveSession(data) {
    if (data?.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  }

  function loadSavedIdentity() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return s?.user?.email || s?.user?.phone || '';
    } catch {
      return '';
    }
  }

  function refreshAccountButton() {
    const btn = document.querySelector('#accountBtn');
    if (!btn) return;
    const identity = loadSavedIdentity();
    if (!identity) return;
    const label = identity.includes('@') ? identity.split('@')[0] : identity;
    btn.textContent = `👤 ${label}`;
    btn.classList.add('signed-in');
  }

  function setStatus(text, type = '') {
    const status = document.querySelector('#authStatus');
    if (!status) return;
    status.className = `status auth-status ${type}`.trim();
    status.textContent = text;
  }

  function setMethod(form, method) {
    lastMethod = method === 'phone' ? 'phone' : 'email';
    form.dataset.authMethod = lastMethod;

    const input = form.querySelector('#authEmail');
    if (!input) return;

    document.querySelectorAll('.auth-method-tab').forEach(btn => {
      const active = btn.dataset.method === lastMethod;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    const label = input.closest('label');
    const labelText = label?.querySelector('.auth-field-title');

    if (lastMethod === 'phone') {
      if (labelText) labelText.textContent = 'លេខទូរស័ព្ទ';
      input.type = 'tel';
      input.inputMode = 'tel';
      input.autocomplete = 'tel';
      input.placeholder = '012 345 678';
      input.setAttribute('aria-label', 'លេខទូរស័ព្ទកម្ពុជា');
      document.querySelector('#authMethodHelp')?.replaceChildren(document.createTextNode('🇰🇭 ប្រើលេខកម្ពុជា ឧ. 012 345 678 — ប្រព័ន្ធបម្លែងទៅ +855 ដោយស្វ័យប្រវត្តិ។'));
    } else {
      if (labelText) labelText.textContent = 'Email';
      input.type = 'email';
      input.inputMode = 'email';
      input.autocomplete = 'email';
      input.placeholder = 'name@example.com';
      input.setAttribute('aria-label', 'Email');
      document.querySelector('#authMethodHelp')?.replaceChildren(document.createTextNode('📧 ប្រើ Email ដែលអ្នកអាចទទួលសារបញ្ជាក់គណនីបាន។'));
    }

    input.value = '';
    setStatus('🔐 Password ត្រូវបានគ្រប់គ្រងដោយ Supabase Auth។');
    setTimeout(() => input.focus(), 0);
  }

  function showPhoneOtp(phone) {
    const body = document.querySelector('#modalBody');
    if (!body) return;

    body.innerHTML = `
      <div class="eyebrow">PHONE VERIFICATION</div>
      <h2 class="modal-title">បញ្ជាក់លេខទូរស័ព្ទ</h2>
      <p class="modal-preview">យើងបានផ្ញើលេខកូដ OTP ទៅ <strong>${displayPhone(phone)}</strong>។ សូមបញ្ចូលលេខកូដ 6 ខ្ទង់ខាងក្រោម។</p>
      <form id="otpForm" class="auth-form otp-form">
        <label>
          <span class="auth-field-title">លេខកូដ OTP</span>
          <input id="otpCode" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="• • • • • •" required>
        </label>
        <button id="otpSubmit" class="buy-btn" type="submit">✅ បញ្ជាក់លេខទូរស័ព្ទ</button>
      </form>
      <div id="authStatus" class="status auth-status">📱 ប្រសិនបើមិនឃើញ SMS សូមរង់ចាំបន្តិច រួចស្នើលេខកូដថ្មី។</div>
      <div class="otp-actions">
        <button id="resendOtp" class="text-btn" type="button">ផ្ញើ OTP ម្ដងទៀត</button>
        <button id="backToSignup" class="text-btn" type="button">← ត្រឡប់ទៅចុះឈ្មោះ</button>
      </div>`;

    const form = document.querySelector('#otpForm');
    const input = document.querySelector('#otpCode');
    const submit = document.querySelector('#otpSubmit');

    form.onsubmit = async (e) => {
      e.preventDefault();
      const token = String(input.value || '').replace(/\D/g, '');
      if (token.length !== 6) {
        setStatus('សូមបញ្ចូល OTP 6 ខ្ទង់។', 'error');
        return;
      }

      submit.disabled = true;
      submit.innerHTML = '<span class="spinner"></span>កំពុងបញ្ជាក់…';
      setStatus('⏳ កំពុងបញ្ជាក់លេខទូរស័ព្ទ…');

      try {
        const data = await authFetch('verify', { type: 'sms', phone, token });
        if (!data.access_token) throw new Error('បញ្ជាក់លេខទូរស័ព្ទមិនបានសម្រេច។');
        saveSession(data);
        setStatus('✅ បានបញ្ជាក់រួច! កំពុងចូល Account…', 'success');
        setTimeout(() => location.reload(), 350);
      } catch (err) {
        setStatus(`❌ ${err.message}`, 'error');
        submit.disabled = false;
        submit.textContent = '✅ បញ្ជាក់លេខទូរស័ព្ទ';
      }
    };

    document.querySelector('#resendOtp').onclick = async () => {
      const btn = document.querySelector('#resendOtp');
      btn.disabled = true;
      setStatus('⏳ កំពុងផ្ញើ OTP ថ្មី…');
      try {
        await authFetch('otp', { phone, create_user: false });
        setStatus('✅ បានផ្ញើ OTP ថ្មីទៅលេខទូរស័ព្ទរបស់អ្នក។', 'success');
      } catch (err) {
        setStatus(`❌ ${err.message}`, 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; }, 1500);
      }
    };

    document.querySelector('#backToSignup').onclick = () => {
      if (typeof showAccountModal === 'function') showAccountModal('signup');
    };

    setTimeout(() => input.focus(), 0);
  }

  async function handleSubmit(event) {
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const heading = document.querySelector('#modalBody .modal-title');
    const isSignup = heading?.textContent.includes('បង្កើតគណនី');
    const form = document.querySelector('#authForm');
    const identifierInput = document.querySelector('#authEmail');
    const passwordInput = document.querySelector('#authPassword');
    const submit = document.querySelector('#authSubmit');
    if (!form || !identifierInput || !passwordInput || !submit) return false;

    const method = form.dataset.authMethod || lastMethod;
    const identifier = identifierInput.value.trim();
    const password = passwordInput.value;

    if (!identifier) {
      setStatus(method === 'phone' ? 'សូមបញ្ចូលលេខទូរស័ព្ទ។' : 'សូមបញ្ចូល Email។', 'error');
      identifierInput.focus();
      return false;
    }
    if (password.length < 6) {
      setStatus('Password ត្រូវមានយ៉ាងហោច 6 តួអក្សរ។', 'error');
      passwordInput.focus();
      return false;
    }

    let body;
    if (method === 'phone') {
      if (!isPhone(identifier)) {
        setStatus('លេខទូរស័ព្ទមិនត្រឹមត្រូវ។ ឧ. 012 345 678', 'error');
        identifierInput.focus();
        return false;
      }
      body = { phone: normalizeCambodiaPhone(identifier), password };
    } else {
      if (!isEmail(identifier)) {
        setStatus('Email មិនត្រឹមត្រូវ។ ឧ. name@example.com', 'error');
        identifierInput.focus();
        return false;
      }
      body = { email: identifier.toLowerCase(), password };
    }

    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>កំពុងដំណើរការ…';
    setStatus('⏳ កំពុងភ្ជាប់ Account…');

    try {
      const path = isSignup ? 'signup' : 'token?grant_type=password';
      const data = await authFetch(path, body);

      if (data.access_token) {
        saveSession(data);
        setStatus('✅ ជោគជ័យ! កំពុងចូល Account…', 'success');
        setTimeout(() => location.reload(), 350);
        return false;
      }

      if (isSignup && body.phone) {
        showPhoneOtp(body.phone);
        return false;
      }

      setStatus(
        isSignup
          ? '✅ គណនីត្រូវបានបង្កើត។ សូមពិនិត្យ Email របស់អ្នក ដើម្បីបញ្ជាក់គណនី រួចចូលគណនី។'
          : '✅ ដំណើរការជោគជ័យ។',
        'success'
      );
    } catch (err) {
      setStatus(`❌ ${err.message}`, 'error');
    } finally {
      if (document.body.contains(submit)) {
        submit.disabled = false;
        submit.textContent = isSignup ? 'បង្កើតគណនី' : 'ចូលគណនី';
      }
    }

    return false;
  }

  function enhanceAuthForm() {
    const form = document.querySelector('#authForm');
    const input = document.querySelector('#authEmail');
    const password = document.querySelector('#authPassword');
    const submit = document.querySelector('#authSubmit');
    if (!form || !input || !password || !submit) return;

    const heading = document.querySelector('#modalBody .modal-title');
    const isSignup = heading?.textContent.includes('បង្កើតគណនី');
    const preview = document.querySelector('#modalBody .modal-preview');
    if (preview) {
      preview.textContent = isSignup
        ? 'បង្កើតគណនីដោយ Email ឬលេខទូរស័ព្ទ ដើម្បីរក្សារឿងដែលបានទិញក្នុង My Library។'
        : 'ចូលគណនីដោយ Email ឬលេខទូរស័ព្ទ ដើម្បីបើក My Library របស់អ្នក។';
    }

    const label = input.closest('label');
    if (label && !label.querySelector('.auth-field-title')) {
      for (const node of [...label.childNodes]) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) node.remove();
      }
      const span = document.createElement('span');
      span.className = 'auth-field-title';
      span.textContent = 'Email';
      label.insertBefore(span, input);
    }

    if (!form.querySelector('.auth-method-tabs')) {
      const tabs = document.createElement('div');
      tabs.className = 'auth-method-tabs';
      tabs.setAttribute('role', 'tablist');
      tabs.innerHTML = `
        <button class="auth-method-tab" type="button" data-method="email" role="tab">✉️ Email</button>
        <button class="auth-method-tab" type="button" data-method="phone" role="tab">📱 លេខទូរស័ព្ទ</button>`;
      form.insertBefore(tabs, form.firstChild);

      const help = document.createElement('div');
      help.id = 'authMethodHelp';
      help.className = 'auth-method-help';
      tabs.insertAdjacentElement('afterend', help);

      tabs.addEventListener('click', e => {
        const btn = e.target.closest('[data-method]');
        if (!btn) return;
        setMethod(form, btn.dataset.method);
      });
    }

    password.autocomplete = isSignup ? 'new-password' : 'current-password';
    submit.textContent = isSignup ? 'បង្កើតគណនី' : 'ចូលគណនី';

    form.onsubmit = handleSubmit;
    submit.onclick = (e) => {
      e.preventDefault();
      handleSubmit(e);
    };

    if (!form.dataset.authEnhanced) {
      form.dataset.authEnhanced = '1';
      setMethod(form, lastMethod);
    }
  }

  const observer = new MutationObserver(() => {
    enhanceAuthForm();
    refreshAccountButton();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      enhanceAuthForm();
      refreshAccountButton();
    });
  } else {
    enhanceAuthForm();
    refreshAccountButton();
  }
})();
