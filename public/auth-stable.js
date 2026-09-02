(() => {
  'use strict';

  const SESSION_KEY = 'idramaai_supabase_session_v1';
  const $ = (selector, root = document) => root.querySelector(selector);

  function config() {
    const c = window.IDRAMA_SUPABASE || {};
    return { url: c.url || '', key: c.publishableKey || '' };
  }

  function getSession() {
    try {
      const value = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
      return value && value.access_token ? value : null;
    } catch {
      return null;
    }
  }

  function saveSession(value) {
    if (value && value.access_token) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  }

  function normalizePhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('855')) return `+${digits}`;
    if (digits.startsWith('0')) digits = digits.slice(1);
    return `+855${digits}`;
  }

  function validPhone(value) {
    return /^\+855\d{8,10}$/.test(normalizePhone(value));
  }

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
  }

  function friendlyError(raw, status) {
    const text = String(raw || '');
    if (/phone.*disabled|sms.*disabled|provider.*disabled/i.test(text)) {
      return 'លេខទូរស័ព្ទមិនទាន់បានបើកនៅ Supabase។ ត្រូវបើក Phone Auth និង SMS Provider ជាមុន។';
    }
    if (/invalid login credentials/i.test(text)) return 'Email/លេខទូរស័ព្ទ ឬ Password មិនត្រឹមត្រូវ។';
    if (/email not confirmed/i.test(text)) return 'សូមបញ្ជាក់ Email របស់អ្នកជាមុនសិន។';
    if (/phone not confirmed/i.test(text)) return 'លេខទូរស័ព្ទមិនទាន់បានបញ្ជាក់។ សូមបញ្ជាក់ OTP ជាមុនសិន។';
    if (/token.*expired|otp.*expired/i.test(text)) return 'លេខកូដ OTP ផុតកំណត់។ សូមស្នើលេខកូដថ្មី។';
    if (/invalid.*token|invalid.*otp|token.*invalid/i.test(text)) return 'លេខកូដ OTP មិនត្រឹមត្រូវ។';
    if (/user already registered/i.test(text)) return 'គណនីនេះមានរួចហើយ។ សូមចូលគណនី។';
    if (/password.*short|password.*characters/i.test(text)) return 'Password ត្រូវមានយ៉ាងហោច 6 តួអក្សរ។';
    return text || `Account request failed (${status}).`;
  }

  async function authPost(path, body, token = '') {
    const { url, key } = config();
    if (!url || !key) throw new Error('Account service មិនទាន់បានភ្ជាប់។');

    const headers = { apikey: key, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(`${url}/auth/v1/${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const raw = data.msg || data.message || data.error_description || data.error;
      throw new Error(friendlyError(raw, response.status));
    }
    return data;
  }

  function openModalSafe() {
    if (typeof window.openModal === 'function') {
      window.openModal();
      return;
    }
    const modal = $('#modal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModalSafe() {
    if (typeof window.closeModal === 'function') {
      window.closeModal();
      return;
    }
    const modal = $('#modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function setStatus(text, type = '') {
    const status = $('#authStatus');
    if (!status) return;
    status.className = `status auth-status ${type}`.trim();
    status.textContent = text;
  }

  function syncAccountButton() {
    const button = $('#accountBtn');
    if (!button) return;
    const session = getSession();
    const identity = session?.user?.email || session?.user?.phone || '';
    if (!identity) return;
    const label = identity.includes('@') ? identity.split('@')[0] : identity;
    button.textContent = `👤 ${label}`;
    button.classList.add('signed-in');
  }

  async function signOutStable() {
    const session = getSession();
    try {
      if (session?.access_token) await authPost('logout', null, session.access_token);
    } catch {}
    saveSession(null);
    location.reload();
  }

  function renderAccountView() {
    const body = $('#modalBody');
    const session = getSession();
    const identity = session?.user?.email || session?.user?.phone || 'Account';
    if (!body) return;

    body.innerHTML = `
      <div class="eyebrow">MY ACCOUNT</div>
      <h2 class="modal-title">គណនីរបស់ខ្ញុំ</h2>
      <div class="account-card">
        <div class="account-avatar">👤</div>
        <div><strong>${escapeHtml(identity)}</strong><p>រឿងដែលអ្នកបានទិញត្រូវបានរក្សាទុកក្នុង My Library។</p></div>
      </div>
      <button id="stableLibraryBtn" class="buy-btn" type="button" style="width:100%;margin-top:14px">📚 មើលរឿងដែលបានទិញ</button>
      <button id="stableLogoutBtn" class="secondary-btn auth-wide" type="button">ចាកចេញ</button>`;

    openModalSafe();
    $('#stableLibraryBtn')?.addEventListener('click', () => {
      closeModalSafe();
      location.hash = '#library';
    }, { once: true });
    $('#stableLogoutBtn')?.addEventListener('click', signOutStable, { once: true });
  }

  function renderOtp(phone) {
    const body = $('#modalBody');
    if (!body) return;

    body.innerHTML = `
      <div class="eyebrow">PHONE VERIFICATION</div>
      <h2 class="modal-title">បញ្ជាក់លេខទូរស័ព្ទ</h2>
      <p class="modal-preview">លេខកូដ OTP ត្រូវបានផ្ញើទៅ <strong>${escapeHtml(phone)}</strong>។</p>
      <form id="stableOtpForm" class="auth-form otp-form">
        <label><span class="auth-field-title">លេខកូដ OTP 6 ខ្ទង់</span>
          <input id="stableOtp" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="• • • • • •" required>
        </label>
        <button id="stableOtpSubmit" class="buy-btn" type="submit">បញ្ជាក់លេខទូរស័ព្ទ</button>
      </form>
      <div id="authStatus" class="status auth-status">📱 សូមបញ្ចូល OTP ដែលអ្នកទទួលបានតាម SMS។</div>
      <div class="otp-actions">
        <button id="stableResendOtp" class="text-btn" type="button">ផ្ញើ OTP ម្តងទៀត</button>
        <button id="stableBackSignup" class="text-btn" type="button">← ត្រឡប់ទៅចុះឈ្មោះ</button>
      </div>`;

    $('#stableOtpForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const input = $('#stableOtp');
      const submit = $('#stableOtpSubmit');
      const token = String(input?.value || '').replace(/\D/g, '');
      if (token.length !== 6) {
        setStatus('សូមបញ្ចូល OTP 6 ខ្ទង់។', 'error');
        input?.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = 'កំពុងបញ្ជាក់…';
      setStatus('⏳ កំពុងបញ្ជាក់លេខទូរស័ព្ទ…');
      try {
        const data = await authPost('verify', { type: 'sms', phone, token });
        if (!data.access_token) throw new Error('មិនអាចបញ្ជាក់លេខទូរស័ព្ទបាន។');
        saveSession(data);
        setStatus('✅ បានបញ្ជាក់រួច។', 'success');
        setTimeout(() => location.reload(), 350);
      } catch (error) {
        setStatus(`❌ ${error.message}`, 'error');
        submit.disabled = false;
        submit.textContent = 'បញ្ជាក់លេខទូរស័ព្ទ';
      }
    });

    $('#stableResendOtp')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      setStatus('⏳ កំពុងផ្ញើ OTP ថ្មី…');
      try {
        await authPost('otp', { phone, create_user: false });
        setStatus('✅ បានផ្ញើ OTP ថ្មី។', 'success');
      } catch (error) {
        setStatus(`❌ ${error.message}`, 'error');
      } finally {
        setTimeout(() => { button.disabled = false; }, 1200);
      }
    });

    $('#stableBackSignup')?.addEventListener('click', () => renderAuth('signup', 'phone'), { once: true });
    setTimeout(() => $('#stableOtp')?.focus(), 0);
  }

  function renderAuth(mode = 'login', method = 'email') {
    const body = $('#modalBody');
    if (!body) return;

    const signup = mode === 'signup';
    const phoneMode = method === 'phone';

    body.innerHTML = `
      <div class="eyebrow">IDRAMA.AI ACCOUNT</div>
      <h2 class="modal-title">${signup ? 'បង្កើតគណនី' : 'ចូលគណនី'}</h2>
      <p class="modal-preview">${signup ? 'បង្កើតគណនី' : 'ចូលគណនី'}ដោយ Email ឬលេខទូរស័ព្ទ ដើម្បីរក្សា និងមើលរឿងដែលបានទិញ។</p>
      <div class="auth-method-tabs" role="tablist">
        <button id="stableEmailTab" class="auth-method-tab ${phoneMode ? '' : 'active'}" type="button" role="tab" aria-selected="${phoneMode ? 'false' : 'true'}">✉️ Email</button>
        <button id="stablePhoneTab" class="auth-method-tab ${phoneMode ? 'active' : ''}" type="button" role="tab" aria-selected="${phoneMode ? 'true' : 'false'}">📱 លេខទូរស័ព្ទ</button>
      </div>
      <div class="auth-method-help">${phoneMode ? '🇰🇭 ឧ. 012 345 678 — ប្រព័ន្ធបម្លែងទៅ +855 ដោយស្វ័យប្រវត្តិ។' : '📧 ប្រើ Email ដែលអ្នកអាចទទួលសារបញ្ជាក់គណនីបាន។'}</div>
      <form id="stableAuthForm" class="auth-form">
        <label><span class="auth-field-title">${phoneMode ? 'លេខទូរស័ព្ទ' : 'Email'}</span>
          <input id="stableIdentifier" type="${phoneMode ? 'tel' : 'email'}" inputmode="${phoneMode ? 'tel' : 'email'}" autocomplete="${phoneMode ? 'tel' : 'email'}" placeholder="${phoneMode ? '012 345 678' : 'name@example.com'}" required>
        </label>
        <label><span class="auth-field-title">Password</span>
          <input id="stablePassword" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" placeholder="យ៉ាងហោច 6 តួអក្សរ" required>
        </label>
        <button id="stableAuthSubmit" class="buy-btn" type="submit">${signup ? 'បង្កើតគណនី' : 'ចូលគណនី'}</button>
      </form>
      <div id="authStatus" class="status auth-status">🔐 Password ត្រូវបានគ្រប់គ្រងដោយ Supabase Auth។</div>
      <button id="stableAuthSwitch" class="text-btn" type="button">${signup ? 'មានគណនីរួច? ចូលគណនី' : 'មិនទាន់មានគណនី? ចុះឈ្មោះ'}</button>`;

    openModalSafe();

    $('#stableEmailTab')?.addEventListener('click', () => renderAuth(mode, 'email'), { once: true });
    $('#stablePhoneTab')?.addEventListener('click', () => renderAuth(mode, 'phone'), { once: true });
    $('#stableAuthSwitch')?.addEventListener('click', () => renderAuth(signup ? 'login' : 'signup', method), { once: true });

    $('#stableAuthForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const identifierInput = $('#stableIdentifier');
      const passwordInput = $('#stablePassword');
      const submit = $('#stableAuthSubmit');
      const identifier = String(identifierInput?.value || '').trim();
      const password = String(passwordInput?.value || '');

      if (phoneMode) {
        if (!validPhone(identifier)) {
          setStatus('លេខទូរស័ព្ទមិនត្រឹមត្រូវ។ ឧ. 012 345 678', 'error');
          identifierInput?.focus();
          return;
        }
      } else if (!validEmail(identifier)) {
        setStatus('Email មិនត្រឹមត្រូវ។ ឧ. name@example.com', 'error');
        identifierInput?.focus();
        return;
      }

      if (password.length < 6) {
        setStatus('Password ត្រូវមានយ៉ាងហោច 6 តួអក្សរ។', 'error');
        passwordInput?.focus();
        return;
      }

      const credentials = phoneMode
        ? { phone: normalizePhone(identifier), password }
        : { email: identifier.toLowerCase(), password };

      submit.disabled = true;
      submit.textContent = 'កំពុងដំណើរការ…';
      setStatus('⏳ កំពុងភ្ជាប់ Account…');

      try {
        const data = await authPost(signup ? 'signup' : 'token?grant_type=password', credentials);
        if (data.access_token) {
          saveSession(data);
          setStatus('✅ ជោគជ័យ។ កំពុងចូល Account…', 'success');
          setTimeout(() => location.reload(), 350);
          return;
        }

        if (signup && phoneMode) {
          renderOtp(credentials.phone);
          return;
        }

        if (signup) {
          setStatus('✅ គណនីត្រូវបានបង្កើត។ សូមពិនិត្យ Email ដើម្បីបញ្ជាក់គណនី រួចចូលគណនី។', 'success');
        } else {
          setStatus('✅ ចូលគណនីបានជោគជ័យ។', 'success');
        }
      } catch (error) {
        setStatus(`❌ ${error.message}`, 'error');
      } finally {
        if (document.body.contains(submit)) {
          submit.disabled = false;
          submit.textContent = signup ? 'បង្កើតគណនី' : 'ចូលគណនី';
        }
      }
    });

    setTimeout(() => $('#stableIdentifier')?.focus(), 0);
  }

  function showStableAccountModal(defaultMode = 'login') {
    if (getSession()) renderAccountView();
    else renderAuth(defaultMode === 'signup' ? 'signup' : 'login', 'email');
  }

  // Replace the old global account modal function used by app.js.
  window.showAccountModal = showStableAccountModal;

  // Keep the account label correct for both email and phone accounts.
  if (typeof window.renderAccount === 'function') {
    window.renderAccount = function renderAccountStable() {
      const button = $('#accountBtn');
      if (!button) return;
      const identity = window.currentUser?.email || window.currentUser?.phone || getSession()?.user?.email || getSession()?.user?.phone || '';
      if (identity) {
        const label = identity.includes('@') ? identity.split('@')[0] : identity;
        button.textContent = `👤 ${label}`;
        button.classList.add('signed-in');
      } else {
        button.textContent = '👤 ចូល / ចុះឈ្មោះ';
        button.classList.remove('signed-in');
      }
    };
  }

  // Capture auth-related clicks before the old app.js handlers can open the legacy form.
  document.addEventListener('click', event => {
    const target = event.target.closest('#accountBtn, #libraryLoginBtn, #buyBtn');
    if (!target) return;

    const needsLoginBuy = target.id === 'buyBtn' && !getSession();
    const isAuthButton = target.id === 'accountBtn' || target.id === 'libraryLoginBtn';
    if (!needsLoginBuy && !isAuthButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showStableAccountModal('login');
  }, true);

  // Run once only. No MutationObserver, no polling, no DOM loop.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAccountButton, { once: true });
  } else {
    syncAccountButton();
  }
})();
