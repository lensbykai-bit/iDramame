(() => {
  'use strict';
  function usdMoney(value) {
    const amount = Number(value || 0);
    const safe = Number.isFinite(amount) ? amount : 0;
    return `$${safe.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  try {
    if (typeof money === 'function') money = usdMoney;
  } catch {}
  window.idramaUsdMoney = usdMoney;
})();
