(() => {
  const AUTH_SESSION_KEY = 'idramaai_supabase_session_v1';

  function normalizeCambodiaPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('855')) return `+${digits}`;
    if (digits.startsWith('0')) digits = digits.slice(1);
    return `+855${digits}`;
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function validCambodiaPhone(value) {
    return /^\+855\d{8,10}$/.test(normalizeCambodiaPhone(value));
  }

  function cfg() {
    const c = window.IDRAMA_SUPABASE || {};
    return { url: c.url || '', key: c.publishableKey || '' };
  }

  function friendlyError(raw, status) {
    const text = String(raw || '');
    if (/phone.*disabled|sms.*disabled|provider.*disabled/i.test(text)) {
      return 'ការចុះឈ្មោះដោយលេខទូរស័ព្ទមិនទាន់បានបើកនៅ Supabase។ ត្រូវបើក Phone Auth និង SMS Provider ជាមុន។';
    }
    if (/invalid login credentials/i.test(text)) return 'Email/លេខទូរស័ព្ទ ឬ Password មិនត្រឹមត្រូវ។';
    if (/email not confirmed/i.test(text)) return 'សូមបញ្ជាក់ Email របស់អ្នកជាមុនសិន។';
    if (/phone not confirmed/i.test(text)) return 'លេខទូរស័ព្ទមិនទាន់បានបញ្ជាក់។ សូមបញ្ជាក់ OTP ជាមុនសិន។';
    if (/token.*expired|otp.*expired/i.test(text)) return 'លេខកូដ OTP ផុតកំណត់។ សូមស្នើលេខកូដថ្មី។';
    if (/invalid.*token|invalid.*otp|token.*invalid/i.test(text)) return 'លេខកូដ OTP មិនត្រឹមត្រូវ។';
    if (/user already registered/i.test(text)) return 'គណនីនេះមានរួចហើយ។ សូមចូលគណនី។';
    return text || `Account request failed (${status}).`;
  }

  async function authPost(path, body) {
    const { url, key } = cfg();
    if (!url || !key) throw new Error('Account service មិនទាន់បានភ្ជាប់។');

    const response = await fetch(`${url}/auth/v1/${path}`, {
      method: 'POST',
      headers: {
        apikey: key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const raw = data.msg || data.message || data.error_description || data.error;
      throw new Error(friendlyError(raw, response.status));
    }
    return data;
  }

  function storeSession(data) {
    if (!data?.access_token) return false;
    try {
      if (typeof saveSession === 'function') saveSession(data);
      else localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(data));
    } catch {
      localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(data));
    }
    return true;
  }

  function setAuthStatus(text, type = '') {
    const el = document.querySelector('#authStatus');
    if (!el) return;
    el.className = `status auth-status ${type}`.trim();
    el.textContent = text;
  }

  function signedInIdentity() {
    try {
      if (typeof currentUser !== 'undefined' && currentUser) {
        return currentUser.email || currentUser.phone || '';
      }
    } catch {}

    try {
      const saved = JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null');
      return saved?.user?.email || saved?.user?.phone || '';
    } catch {
      return '';
    }
  }

  function renderAccountSafe() {
    const btn = document.querySelector('#accountBtn');
    if (!btn) return;
    const identity = signedInIdentity();
    if (identity) {
      const label = identity.includes('@') ? identity.split('@')[0] : identity;
      btn.textContent = `👤 ${label}`;
      btn.classList.add('signed-in');
    } else {
      btn.textContent = '👤 ចូល / ចុះឈ្មោះ';
      btn.classList.remove('signed-in');
    }
  }

  function showOtp(phone) {
    const body = document.querySelector('#modalBody');
    if (!body) return;

    body.innerHTML = `
      <div class="eyebrow">PHONE VERIFICATION</div>
      <h2 class="modal-title">បញ្ជាក់លេខទូរស័ព្ទ</h2>
      <p class="modal-preview">លេខកូដ OTP ត្រូវបានផ្ញើទៅ <strong>${phone}</strong>។ សូមបញ្ចូលលេខកូដ 6 ខ្ទង់។</p>
      <form id="otpForm" class="auth-form otp-form">
        <label>
          <span class="auth-field-title">លេខកូដ OTP</span>
          <input id="otpCode" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="• • • • • •" required>
        </label>
        <button id="otpSubmit" class="buy-btn" type="submit">✅ បញ្ជាក់លេខទូរស័ព្ទ</button>
      </form>
      <div id="authStatus" class="status auth-status">📱 មិនទាន់ទទួល SMS? អ្នកអាចផ្ញើ OTP ម្តងទៀត។</div>
      <div class="otp-actions">
        <button id="resendOtp" class="text-btn" type="button">ផ្ញើ OTP ម្តងទៀត</button>
        <button id="backToSignup" class="text-btn" type="button">← ត្រឡប់ទៅចុះឈ្មោះ</button>
      </div>`;

    const form = document.querySelector('#otpForm');
    const codeInput = document.querySelector('#otpCode');
    const submit = document.querySelector('#otpSubmit');

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const token = String(codeInput?.value || '').replace(/\D/g, '');
      if (token.length !== 6) {
        setAuthStatus('សូមបញ្ចូល OTP 6 ខ្ទង់។', 'error');
        return;
      }

      submit.disabled = true;
      submit.textContent = 'កំពុងបញ្ជាក់…';
      setAuthStatus('⏳ កំពុងបញ្ជាក់លេខទូរស័ព្ទ…');

      try {
        const data = await authPost('verify', { type: 'sms', phone, token });
        if (!storeSession(data)) throw new Error('បញ្ជាក់លេខទូរស័ព្ទមិនបានសម្រេច។');
        setAuthStatus('✅ បានបញ្ជាក់រួច! កំពុងចូល Account…', 'success');
        setTimeout(() => location.reload(), 350);
      } catch (err) {
        setAuthStatus(`❌ ${err.message}`, 'error');
        submit.disabled = false;
        submit.textContent = '✅ បញ្ជាក់លេខទូរស័ព្ទ';
      }
    });

    document.querySelector('#resendOtp')?.addEventListener('click', async e => {
      const btn = e.currentTarget;
      btn.disabled = true;
      setAuthStatus('⏳ កំពុងផ្ញើ OTP ថ្មី…');
      try {
        await authPost('otp', { phone, create_user: false });
        setAuthStatus('✅ បានផ្ញើ OTP ថ្មី។', 'success');
      } catch (err) {
        setAuthStatus(`❌ ${err.message}`, 'error');
      } finally {
        setTimeout(() => { btn.disabled = false; }, 1500);
      }
    });

    document.querySelector('#backToSignup')?.addEventListener('click', () => showAccountModalSafe('signup'));
    setTimeout(() => codeInput?.focus(), 0);
  }

  function showAccountModalSafe(defaultMode = 'login') {
    const mode = defaultMode === 'signup' ? 'signup' : 'login';
    const body = document.querySelector('#modalBody');
    if (!body) return;

    const identity = signedInIdentity();
    if (identity) {
      body.innerHTML = `
        <div class="eyebrow">MY ACCOUNT</div>
        <h2 class="modal-title">គណនីរបស់ខ្ញុំ</h2>
        <div class="account-card">
          <div class="account-avatar">👤</div>
          <div><strong>${identity}</strong><p>រឿងដែលអ្នកទិញត្រូវបានរក្សាទុកក្នុង My Library។</p></div>
        </div>
        <button id="openLibraryBtn" class="buy-btn" type="button" style="width:100%;margin-top:14px">📚 មើលរឿងដែលបានទិញ</button>
        <button id="logoutBtn" class="secondary-btn auth-wide" type="button">ចាកចេញ</button>`;
      if (typeof openModal === 'function') openModal();

      document.querySelector('#openLibraryBtn')?.addEventListener('click', () => {
        if (typeof closeModal === 'function') closeModal();
        location.hash = '#library';
      });
      document.querySelector('#logoutBtn')?.addEventListener('click', async () => {
        try {
          if (typeof signOut === 'function') await signOut();
          else localStorage.removeItem(AUTH_SESSION_KEY);
        } finally {
          location.reload();
        }
      });
      return;
    }

    body.innerHTML = `
      <div class="eyebrow">IDRAMA.AI ACCOUNT</div>
      <h2 class="modal-title">${mode === 'signup' ? 'បង្កើតគណនី' : 'ចូលគណនី'}</h2>
      <p class="modal-preview">${mode === 'signup'
        ? 'បង្កើតគណនីដោយ Email ឬលេខទូរស័ព្ទ ដើម្បីរក្សារឿងដែលបានទិញក្នុង My Library។'
        : 'ចូលគណនីដោយ Email ឬលេខទូរស័ព្ទ ដើម្បីបើក My Library របស់អ្នក។'}</p>

      <form id="authForm" class="auth-form" data-auth-method="email">
        <div class="auth-method-tabs" role="tablist">
          <button class="auth-method-tab active" type="button" data-method="email" aria-selected="true">✉️ Email</button>
          <button class="auth-method-tab" type="button" data-method="phone" aria-selected="false">📱 លេខទូរស័ព្ទ</button>
        </div>
        <div id="authMethodHelp" class="auth-method-help">📧 ប្រើ Email ដែលអ្នកអាចទទួលសារបញ្ជាក់គណនីបាន។</div>

        <label>
          <span id="identityTitle" class="auth-field-title">Email</span>
          <input id="authIdentity" type="email" autocomplete="email" required placeholder="name@example.com">
        </label>
        <label>
          <span class="auth-field-title">Password</span>
          <input id="authPassword" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" minlength="6" required placeholder="យ៉ាងហោច 6 តួអក្សរ">
        </label>
        <button id="authSubmit" class="buy-btn" type="submit">${mode === 'signup' ? 'បង្កើតគណនី' : 'ចូលគណនី'}</button>
      </form>

      <div id="authStatus" class="status auth-status">🔐 Password ត្រូវបានគ្រប់គ្រងដោយ Supabase Auth។</div>
      <button id="authSwitch" class="text-btn" type="button">${mode === 'signup' ? 'មានគណនីរួច? ចូលគណនី' : 'មិនទាន់មានគណនី? ចុះឈ្មោះ'}</button>`;

    if (typeof openModal === 'function') openModal();

    const form = document.querySelector('#authForm');
    const identityInput = document.querySelector('#authIdentity');
    const identityTitle = document.querySelector('#identityTitle');
    const help = document.querySelector('#authMethodHelp');
    const passwordInput = document.querySelector('#authPassword');
    const submit = document.querySelector('#authSubmit');

    form?.querySelectorAll('.auth-method-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const method = tab.dataset.method === 'phone' ? 'phone' : 'email';
        form.dataset.authMethod = method;
        form.querySelectorAll('.auth-method-tab').forEach(btn => {
          const active = btn === tab;
          btn.classList.toggle('active', active);
          btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });

        identityInput.value = '';
        if (method === 'phone') {
          identityTitle.textContent = 'លេខទូរស័ព្ទ';
          identityInput.type = 'tel';
          identityInput.inputMode = 'tel';
          identityInput.autocomplete = 'tel';
          identityInput.placeholder = '012 345 678';
          help.textContent = '🇰🇭 ប្រើលេខកម្ពុជា ឧ. 012 345 678 — ប្រព័ន្ធបម្លែងទៅ +855 ដោយស្វ័យប្រវត្តិ។';
        } else {
          identityTitle.textContent = 'Email';
          identityInput.type = 'email';
          identityInput.inputMode = 'email';
          identityInput.autocomplete = 'email';
          identityInput.placeholder = 'name@example.com';
          help.textContent = '📧 ប្រើ Email ដែលអ្នកអាចទទួលសារបញ្ជាក់គណនីបាន។';
        }
        setAuthStatus('🔐 Password ត្រូវបានគ្រប់គ្រងដោយ Supabase Auth។');
        identityInput.focus();
      });
    });

    document.querySelector('#authSwitch')?.addEventListener('click', () => {
      showAccountModalSafe(mode === 'signup' ? 'login' : 'signup');
    });

    form?.addEventListener('submit', async e => {
      e.preventDefault();
      const method = form.dataset.authMethod || 'email';
      const identityValue = String(identityInput?.value || '').trim();
      const password = String(passwordInput?.value || '');

      if (password.length < 6) {
        setAuthStatus('Password ត្រូវមានយ៉ាងហោច 6 តួអក្សរ។', 'error');
        passwordInput?.focus();
        return;
      }

      let payload;
      if (method === 'phone') {
        if (!validCambodiaPhone(identityValue)) {
          setAuthStatus('លេខទូរស័ព្ទមិនត្រឹមត្រូវ។ ឧ. 012 345 678', 'error');
          identityInput?.focus();
          return;
        }
        payload = { phone: normalizeCambodiaPhone(identityValue), password };
      } else {
        if (!validEmail(identityValue)) {
          setAuthStatus('Email មិនត្រឹមត្រូវ។ ឧ. name@example.com', 'error');
          identityInput?.focus();
          return;
        }
        payload = { email: identityValue.toLowerCase(), password };
      }

      submit.disabled = true;
      submit.textContent = 'កំពុងដំណើរការ…';
      setAuthStatus('⏳ កំពុងភ្ជាប់ Account…');

      try {
        const path = mode === 'signup' ? 'signup' : 'token?grant_type=password';
        const data = await authPost(path, payload);

        if (storeSession(data)) {
          setAuthStatus('✅ ជោគជ័យ! កំពុងចូល Account…', 'success');
          setTimeout(() => location.reload(), 350);
          return;
        }

        if (mode === 'signup' && payload.phone) {
          showOtp(payload.phone);
          return;
        }

        setAuthStatus('✅ គណនីត្រូវបានបង្កើត។ សូមពិនិត្យ Email ដើម្បីបញ្ជាក់គណនី រួចចូលគណនី។', 'success');
      } catch (err) {
        setAuthStatus(`❌ ${err.message}`, 'error');
      } finally {
        if (document.body.contains(submit)) {
          submit.disabled = false;
          submit.textContent = mode === 'signup' ? 'បង្កើតគណនី' : 'ចូលគណនី';
        }
      }
    });

    setTimeout(() => identityInput?.focus(), 0);
  }

  try {
    showAccountModal = showAccountModalSafe;
  } catch {
    window.showAccountModal = showAccountModalSafe;
  }

  try {
    renderAccount = renderAccountSafe;
  } catch {
    window.renderAccount = renderAccountSafe;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderAccountSafe, { once: true });
  } else {
    renderAccountSafe();
  }
})();
