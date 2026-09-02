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
    if (/phone.*disabled|sms.*disabled|provider.*disabled/i.test(text)) return 'ការចុះឈ្មោះដោយលេខទូរស័ព្ទមិនទាន់អាចប្រើបានទេ។ សូមប្រើ Email ជាមុន។';
    if (/invalid login credentials/i.test(text)) return 'Email/លេខទូរស័ព្ទ ឬ Password មិនត្រឹមត្រូវ។';
    if (/email not confirmed/i.test(text)) return 'សូមបញ្ជាក់ Email របស់អ្នកជាមុនសិន។';
    if (/phone not confirmed/i.test(text)) return 'លេខទូរស័ព្ទមិនទាន់បានបញ្ជាក់។ សូមបញ្ចូល OTP ជាមុនសិន។';
    if (/token.*expired|otp.*expired/i.test(text)) return 'លេខកូដ OTP ផុតកំណត់។ សូមស្នើលេខកូដថ្មី។';
    if (/invalid.*token|invalid.*otp|token.*invalid/i.test(text)) return 'លេខកូដ OTP មិនត្រឹមត្រូវ។';
    if (/user already registered/i.test(text)) return 'គណនីនេះមានរួចហើយ។ សូមចូលគណនី។';
    if (/password.*short|password.*characters/i.test(text)) return 'Password ត្រូវមានយ៉ាងហោច 6 តួអក្សរ។';
    return text || `មិនអាចដំណើរការគណនីបាន (${status})។ សូមព្យាយាមម្តងទៀត។`;
  }

  async function authPost(path, body, token = '') {
    const { url, key } = config();
    if (!url || !key) throw new Error('ប្រព័ន្ធគណនីមិនទាន់រួចរាល់។ សូមព្យាយាមពេលក្រោយ។');

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

  function modalCard() {
    return $('#modal .cinema-modal-card');
  }

  function resetModalScroll() {
    const card = modalCard();
    if (card) card.scrollTop = 0;
  }

  function safeFocus(element) {
    if (!element) return;
    try { element.focus({ preventScroll: true }); }
    catch { element.focus(); resetModalScroll(); }
  }

  function openModalSafe() {
    const modal = $('#modal');
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => resetModalScroll());
  }

  function closeModalSafe() {
    const modal = $('#modal');
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    resetModalScroll();
  }

  function setStatus(text, type = '') {
    const status = $('#authStatus');
    if (!status) return;
    status.hidden = false;
    status.className = `auth-status-message ${type}`.trim();
    status.textContent = text;
  }

  function clearStatus() {
    const status = $('#authStatus');
    if (!status) return;
    status.hidden = true;
    status.textContent = '';
  }

  function syncAccountButton() {
    const button = $('#accountBtn');
    if (!button) return;
    const session = getSession();
    const identity = session?.user?.email || session?.user?.phone || '';
    if (!identity) {
      button.textContent = '👤 ចូល / ចុះឈ្មោះ';
      button.classList.remove('signed-in');
      return;
    }
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

  function addPasswordToggle() {
    const password = $('#stablePassword');
    const toggle = $('#stablePasswordToggle');
    if (!password || !toggle) return;

    toggle.addEventListener('click', () => {
      const show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      toggle.textContent = show ? '🙈' : '👁️';
      toggle.setAttribute('aria-label', show ? 'លាក់ Password' : 'បង្ហាញ Password');
      toggle.setAttribute('aria-pressed', show ? 'true' : 'false');
      safeFocus(password);
    });
  }

  function renderAccountView() {
    const body = $('#modalBody');
    const session = getSession();
    const identity = session?.user?.email || session?.user?.phone || 'Account';
    if (!body) return;

    body.innerHTML = `
      <div class="auth-shell auth-account-shell">
        <div class="auth-brandline">IDRAMA.AI ACCOUNT</div>
        <h2 class="auth-title">គណនីរបស់ខ្ញុំ</h2>
        <div class="account-card auth-account-card">
          <div class="account-avatar">👤</div>
          <div><strong>${escapeHtml(identity)}</strong><p>រឿងដែលបានទិញរបស់អ្នកស្ថិតក្នុង My Library។</p></div>
        </div>
        <button id="stableLibraryBtn" class="auth-primary-btn" type="button">📚 My Library</button>
        <button id="stableLogoutBtn" class="auth-secondary-btn" type="button">ចាកចេញ</button>
      </div>`;

    openModalSafe();
    resetModalScroll();
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
      <div class="auth-shell">
        <div class="auth-brandline">PHONE VERIFICATION</div>
        <h2 class="auth-title">បញ្ជាក់លេខទូរស័ព្ទ</h2>
        <p class="auth-subtitle">OTP ត្រូវបានផ្ញើទៅ <strong>${escapeHtml(phone)}</strong>។</p>
        <form id="stableOtpForm" class="auth-form premium-auth-form">
          <label class="auth-field">
            <span class="auth-field-title">លេខកូដ OTP 6 ខ្ទង់</span>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">🔢</span>
              <input id="stableOtp" class="otp-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" placeholder="• • • • • •" required>
            </div>
          </label>
          <button id="stableOtpSubmit" class="auth-primary-btn" type="submit">បញ្ជាក់លេខទូរស័ព្ទ</button>
        </form>
        <div id="authStatus" class="auth-status-message" hidden></div>
        <div class="otp-actions">
          <button id="stableResendOtp" class="auth-link-btn" type="button">ផ្ញើ OTP ម្តងទៀត</button>
          <button id="stableBackSignup" class="auth-link-btn" type="button">← ត្រឡប់</button>
        </div>
      </div>`;

    openModalSafe();
    resetModalScroll();

    $('#stableOtpForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const input = $('#stableOtp');
      const submit = $('#stableOtpSubmit');
      const token = String(input?.value || '').replace(/\D/g, '');
      if (token.length !== 6) {
        setStatus('សូមបញ្ចូល OTP 6 ខ្ទង់។', 'error');
        safeFocus(input);
        return;
      }
      submit.disabled = true;
      submit.textContent = 'កំពុងបញ្ជាក់…';
      setStatus('កំពុងបញ្ជាក់…');
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
      setStatus('កំពុងផ្ញើ OTP ថ្មី…');
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
    setTimeout(() => safeFocus($('#stableOtp')), 30);
  }

  function renderAuth(mode = 'login', method = 'email') {
    const body = $('#modalBody');
    if (!body) return;

    const signup = mode === 'signup';
    const phoneMode = method === 'phone';
    const heading = signup ? 'បង្កើតគណនី' : 'ចូលគណនី';
    const subtitle = signup ? 'បង្កើតគណនីសម្រាប់ My Library។' : 'ចូលគណនីដើម្បីបើក My Library។';

    body.innerHTML = `
      <div class="auth-shell">
        <div class="auth-brandline">IDRAMA.AI ACCOUNT</div>
        <h2 class="auth-title">${heading}</h2>
        <p class="auth-subtitle">${subtitle}</p>

        <div class="auth-method-tabs" role="tablist" aria-label="ជ្រើសរើសវិធីចូលគណនី">
          <button id="stableEmailTab" class="auth-method-tab ${phoneMode ? '' : 'active'}" type="button" role="tab" aria-selected="${phoneMode ? 'false' : 'true'}"><span>✉️</span>Email</button>
          <button id="stablePhoneTab" class="auth-method-tab ${phoneMode ? 'active' : ''}" type="button" role="tab" aria-selected="${phoneMode ? 'true' : 'false'}"><span>📱</span>លេខទូរស័ព្ទ</button>
        </div>

        <div class="auth-method-help">${phoneMode ? '🇰🇭 ឧ. 012 345 678 — បម្លែងជា +855 ដោយស្វ័យប្រវត្តិ។' : '✉️ ប្រើ Email ដែលអាចទទួលសារបញ្ជាក់បាន។'}</div>

        <form id="stableAuthForm" class="auth-form premium-auth-form">
          <label class="auth-field">
            <span class="auth-field-title">${phoneMode ? 'លេខទូរស័ព្ទ' : 'Email'}</span>
            <div class="auth-input-wrap">
              <span class="auth-input-icon">${phoneMode ? '📱' : '✉️'}</span>
              <input id="stableIdentifier" type="${phoneMode ? 'tel' : 'email'}" inputmode="${phoneMode ? 'tel' : 'email'}" autocomplete="${phoneMode ? 'tel' : 'email'}" placeholder="${phoneMode ? '012 345 678' : 'name@example.com'}" required>
            </div>
          </label>

          <label class="auth-field">
            <span class="auth-field-title">Password</span>
            <div class="auth-input-wrap password-input-wrap">
              <span class="auth-input-icon">🔒</span>
              <input id="stablePassword" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" placeholder="យ៉ាងហោច 6 តួអក្សរ" required>
              <button id="stablePasswordToggle" class="password-toggle" type="button" aria-label="បង្ហាញ Password" aria-pressed="false">👁️</button>
            </div>
          </label>

          <button id="stableSubmit" class="auth-primary-btn" type="submit">${heading}</button>
        </form>

        <div id="authStatus" class="auth-status-message" hidden></div>

        <div class="auth-switch-row">
          <span>${signup ? 'មានគណនីរួច?' : 'មិនទាន់មានគណនី?'}</span>
          <button id="stableModeSwitch" class="auth-switch-btn" type="button">${signup ? 'ចូលគណនី' : 'ចុះឈ្មោះ'}</button>
        </div>
      </div>`;

    openModalSafe();
    resetModalScroll();
    clearStatus();
    addPasswordToggle();

    $('#stableEmailTab')?.addEventListener('click', () => renderAuth(mode, 'email'), { once: true });
    $('#stablePhoneTab')?.addEventListener('click', () => renderAuth(mode, 'phone'), { once: true });
    $('#stableModeSwitch')?.addEventListener('click', () => renderAuth(signup ? 'login' : 'signup', method), { once: true });

    $('#stableAuthForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const identifierInput = $('#stableIdentifier');
      const passwordInput = $('#stablePassword');
      const submit = $('#stableSubmit');
      const identifier = String(identifierInput?.value || '').trim();
      const password = String(passwordInput?.value || '');

      if (phoneMode) {
        if (!validPhone(identifier)) {
          setStatus('❌ លេខទូរស័ព្ទមិនត្រឹមត្រូវ។ ឧ. 012 345 678', 'error');
          safeFocus(identifierInput);
          return;
        }
      } else if (!validEmail(identifier)) {
        setStatus('❌ Email មិនត្រឹមត្រូវ។ ឧ. name@example.com', 'error');
        safeFocus(identifierInput);
        return;
      }

      if (password.length < 6) {
        setStatus('❌ Password ត្រូវមានយ៉ាងហោច 6 តួអក្សរ។', 'error');
        safeFocus(passwordInput);
        return;
      }

      submit.disabled = true;
      submit.textContent = 'កំពុងដំណើរការ…';
      setStatus('កំពុងដំណើរការ…');

      const credentials = phoneMode
        ? { phone: normalizePhone(identifier), password }
        : { email: identifier.toLowerCase(), password };

      try {
        const path = signup ? 'signup' : 'token?grant_type=password';
        const data = await authPost(path, credentials);

        if (data.access_token) {
          saveSession(data);
          setStatus('✅ ជោគជ័យ!', 'success');
          setTimeout(() => location.reload(), 350);
          return;
        }

        if (signup && phoneMode) {
          renderOtp(credentials.phone);
          return;
        }

        if (signup) setStatus('✅ គណនីត្រូវបានបង្កើត។ សូមពិនិត្យ Email ដើម្បីបញ្ជាក់គណនី។', 'success');
        else setStatus('✅ ជោគជ័យ។', 'success');
      } catch (error) {
        setStatus(`❌ ${error.message}`, 'error');
      } finally {
        if (document.body.contains(submit)) {
          submit.disabled = false;
          submit.textContent = heading;
        }
      }
    });

    setTimeout(() => {
      resetModalScroll();
      safeFocus($('#stableIdentifier'));
      resetModalScroll();
    }, 30);
  }

  function showStableAccountModal(mode = 'login') {
    if (getSession()) renderAccountView();
    else renderAuth(mode, 'email');
  }

  document.addEventListener('click', event => {
    const rawTarget = event.target;
    if (!(rawTarget instanceof Element)) return;
    const target = rawTarget.closest('#accountBtn, #libraryLoginBtn, #buyBtn');
    if (!target) return;

    const needsLoginBuy = target.id === 'buyBtn' && !getSession();
    const isAuthButton = target.id === 'accountBtn' || target.id === 'libraryLoginBtn';
    if (!needsLoginBuy && !isAuthButton) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    showStableAccountModal('login');
  }, true);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', syncAccountButton, { once: true });
  } else {
    syncAccountButton();
  }
})();
