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

  function displayIdentity(user) {
    const metadataPhone = user?.user_metadata?.login_phone || user?.user_metadata?.display_phone || '';
    if (metadataPhone) return metadataPhone;
    if (user?.phone) return user.phone;
    return user?.email || '';
  }

  function friendlyError(raw, status) {
    const text = String(raw || '');
    if (/already|registered|exists/i.test(text)) return 'គណនីនេះមានរួចហើយ។ សូមចូលគណនី។';
    if (/invalid login credentials|invalid.*credentials/i.test(text)) return 'គណនី ឬ Password មិនត្រឹមត្រូវ។';
    if (/email not confirmed/i.test(text)) return 'សូមបញ្ជាក់ Email របស់អ្នកជាមុនសិន។';
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

  async function phoneAuthPost(action, phone, password) {
    const { url, key } = config();
    if (!url || !key) throw new Error('ប្រព័ន្ធគណនីមិនទាន់រួចរាល់។ សូមព្យាយាមពេលក្រោយ។');

    const response = await fetch(`${url}/functions/v1/idrama-phone-auth`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, phone, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.session?.access_token) {
      throw new Error(data.error || 'មិនអាចដំណើរការគណនីបាន។ សូមព្យាយាមម្តងទៀត។');
    }
    return data.session;
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
    requestAnimationFrame(resetModalScroll);
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

  function syncPhoneUi() {
    const session = getSession();
    const identity = displayIdentity(session?.user);
    const button = $('#accountBtn');

    if (button) {
      if (identity) {
        const label = identity.includes('@') ? identity.split('@')[0] : identity;
        button.textContent = `👤 ${label}`;
        button.classList.add('signed-in');
      } else {
        button.textContent = '👤 ចូល / ចុះឈ្មោះ';
        button.classList.remove('signed-in');
      }
    }

    const phone = session?.user?.user_metadata?.login_phone || session?.user?.user_metadata?.display_phone || '';
    const meta = $('#libraryMeta');
    if (phone && meta && /@accounts\.idrama\.ai|Account Library/i.test(meta.textContent || '')) {
      meta.textContent = phone;
    }
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
    const identity = displayIdentity(session?.user) || 'Account';
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
      setTimeout(syncPhoneUi, 250);
    }, { once: true });
    $('#stableLogoutBtn')?.addEventListener('click', signOutStable, { once: true });
  }

  function renderAuth(mode = 'login', method = 'email') {
    const body = $('#modalBody');
    if (!body) return;

    const signup = mode === 'signup';
    const phoneMode = method === 'phone';
    const heading = signup ? 'បង្កើតគណនី' : 'ចូលគណនី';
    const subtitle = signup ? 'បង្កើតគណនីសម្រាប់ My Library។' : 'ចូលគណនីដើម្បីបើក My Library។';
    const help = phoneMode
      ? '🇰🇭 ប្រើលេខទូរស័ព្ទកម្ពុជា + Password — មិនត្រូវការ OTP។'
      : '✉️ ប្រើ Email របស់អ្នកដើម្បីចូលគណនី។';

    body.innerHTML = `
      <div class="auth-shell">
        <div class="auth-brandline">IDRAMA.AI ACCOUNT</div>
        <h2 class="auth-title">${heading}</h2>
        <p class="auth-subtitle">${subtitle}</p>

        <div class="auth-method-tabs" role="tablist" aria-label="ជ្រើសរើសវិធីចូលគណនី">
          <button id="stableEmailTab" class="auth-method-tab ${phoneMode ? '' : 'active'}" type="button" role="tab" aria-selected="${phoneMode ? 'false' : 'true'}"><span>✉️</span>Email</button>
          <button id="stablePhoneTab" class="auth-method-tab ${phoneMode ? 'active' : ''}" type="button" role="tab" aria-selected="${phoneMode ? 'true' : 'false'}"><span>📱</span>លេខទូរស័ព្ទ</button>
        </div>

        <div class="auth-method-help">${help}</div>

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
              <input id="stablePassword" type="password" autocomplete="${signup ? 'new-password' : 'current-password'}" minlength="6" maxlength="72" placeholder="យ៉ាងហោច 6 តួអក្សរ" required>
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

      if (password.length < 6 || password.length > 72) {
        setStatus('❌ Password ត្រូវមានពី 6 ដល់ 72 តួអក្សរ។', 'error');
        safeFocus(passwordInput);
        return;
      }

      submit.disabled = true;
      submit.textContent = 'កំពុងដំណើរការ…';
      setStatus('កំពុងដំណើរការ…');

      try {
        if (phoneMode) {
          const session = await phoneAuthPost(signup ? 'signup' : 'login', normalizePhone(identifier), password);
          saveSession(session);
          setStatus(signup ? '✅ បង្កើតគណនីជោគជ័យ!' : '✅ ចូលគណនីជោគជ័យ!', 'success');
          setTimeout(() => location.reload(), 350);
          return;
        }

        const credentials = { email: identifier.toLowerCase(), password };
        const path = signup ? 'signup' : 'token?grant_type=password';
        const data = await authPost(path, credentials);

        if (data.access_token) {
          saveSession(data);
          setStatus('✅ ជោគជ័យ!', 'success');
          setTimeout(() => location.reload(), 350);
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

  const initialSync = () => {
    syncPhoneUi();
    setTimeout(syncPhoneUi, 350);
    setTimeout(syncPhoneUi, 1200);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialSync, { once: true });
  else initialSync();

  window.addEventListener('load', () => setTimeout(syncPhoneUi, 100), { once: true });
  window.addEventListener('hashchange', () => setTimeout(syncPhoneUi, 250));
})();