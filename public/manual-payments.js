/* iDrama.ai manual KHQR approval override */

createOrder = async function (storyId) {
  stopPaymentPolling();
  const btn = $('#buyBtn');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>កំពុងបង្កើត KHQR…';
  }

  try {
    const data = await edgeCall('create', { storyId });

    if (data.alreadyPurchased && data.watchUrl) {
      await renderLibrary();
      modalBody.innerHTML = `
        <div class="eyebrow">MY LIBRARY</div>
        <h2 class="modal-title">អ្នកបានទិញរឿងនេះរួចហើយ</h2>
        <div class="status success">✅ មិនចាំបាច់បង់ម្តងទៀតទេ។</div>
        <a class="buy-btn auth-link" href="${esc(data.watchUrl)}">▶️ មើលរឿងពេញ</a>`;
      return;
    }

    activeOrder = data.orderId;

    modalBody.innerHTML = `
      <div class="eyebrow">iDrama.ai • BAKONG KHQR</div>
      <h2 class="modal-title">${esc(data.title)}</h2>
      <div class="pay-box">
        <div class="amount-row"><span>ត្រូវបង់</span><strong class="price">${money(data.amount)}</strong></div>
        ${data.qrDataUrl ? `<div class="qr-wrap"><img src="${data.qrDataUrl}" alt="iDrama.ai Bakong KHQR"></div>` : ''}
        <div class="order-id">Order: ${esc(data.orderId)}</div>
        <div id="status" class="status">📱 សូម Scan KHQR និងបង់ប្រាក់។ បន្ទាប់មកចុច “ខ្ញុំបានបង់រួច” ដើម្បីផ្ញើឱ្យ Admin ពិនិត្យ។</div>
        <button id="submitPaidBtn" class="buy-btn" style="width:100%;margin-top:13px">✅ ខ្ញុំបានបង់រួច</button>
        <button id="checkBtn" class="check-btn" style="width:100%;margin-top:9px">🔎 ពិនិត្យស្ថានភាព Approval</button>
      </div>
      <p class="small">ការទូទាត់មិន Unlock ដោយស្វ័យប្រវត្តិទេ។ Admin ត្រូវពិនិត្យ Bakong និង Approve ជាមុន។</p>`;

    $('#submitPaidBtn').onclick = submitManualPayment;
    $('#checkBtn').onclick = () => checkPayment({ manual: true });
  } catch (err) {
    if (btn && document.body.contains(btn)) {
      btn.disabled = false;
      btn.textContent = '💳 ទិញតាម Bakong KHQR';
    }
    modalBody.insertAdjacentHTML('beforeend', `<div class="status error">${esc(err.message)}</div>`);
  }
};

async function submitManualPayment() {
  if (!activeOrder) return;
  const submit = $('#submitPaidBtn');
  const status = $('#status');
  if (submit) {
    submit.disabled = true;
    submit.innerHTML = '<span class="spinner"></span>កំពុងផ្ញើទៅ Admin…';
  }
  try {
    const data = await edgeCall('submit', { orderId: activeOrder });
    if (status) {
      status.className = data.status === 'rejected' ? 'status error' : 'status success';
      status.textContent = data.status === 'rejected'
        ? '❌ Order នេះត្រូវបាន Admin បដិសេធ។ សូមទាក់ទង Admin។'
        : '🕒 បានផ្ញើរួច។ កំពុងរង់ចាំ Admin ពិនិត្យ និង Approve។';
    }
    if (submit) submit.textContent = '🕒 រង់ចាំ Admin Approve';
  } catch (err) {
    if (status) {
      status.className = 'status error';
      status.textContent = err.message;
    }
    if (submit) {
      submit.disabled = false;
      submit.textContent = '✅ ខ្ញុំបានបង់រួច';
    }
  }
}

checkPayment = async function ({ manual = false } = {}) {
  if (!activeOrder || checkingPayment) return;
  checkingPayment = true;
  const btn = $('#checkBtn');
  const status = $('#status');

  if (manual && btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>កំពុងពិនិត្យ…';
  }

  try {
    const data = await edgeCall('check', { orderId: activeOrder });
    if (data.paid && data.watchUrl) {
      await renderLibrary();
      if (status) {
        status.className = 'status success';
        status.textContent = '✅ Admin បាន Approve រួច។ អ្នកអាចមើលរឿងពេញបាន។';
      }
      const submit = $('#submitPaidBtn');
      if (submit) submit.remove();
      if (btn) {
        btn.disabled = false;
        btn.textContent = '▶️ មើលរឿងពេញ';
        btn.onclick = () => { location.href = data.watchUrl; };
      }
      return;
    }

    if (status) {
      if (data.rejected || data.status === 'rejected') {
        status.className = 'status error';
        status.textContent = '❌ Admin បានបដិសេធ Order នេះ។ សូមពិនិត្យការទូទាត់ ឬទាក់ទង Admin។';
      } else if (data.status === 'awaiting_review') {
        status.className = 'status';
        status.textContent = '🕒 កំពុងរង់ចាំ Admin ពិនិត្យ និង Approve។';
      } else {
        status.className = 'status';
        status.textContent = '📱 សូមបង់ប្រាក់ ហើយចុច “ខ្ញុំបានបង់រួច”។';
      }
    }
  } catch (err) {
    if (status) {
      status.className = 'status error';
      status.textContent = err.message;
    }
  } finally {
    checkingPayment = false;
    if (manual && btn && document.body.contains(btn) && !btn.textContent.includes('មើលរឿងពេញ')) {
      btn.disabled = false;
      btn.textContent = '🔎 ពិនិត្យស្ថានភាព Approval';
    }
  }
};
