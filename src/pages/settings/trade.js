function tradeHistorySettingsHtml() {
  const count = tradeHistoryRecords().length;
  return `<div class="settings-section">${menuCardHtml('clearTradeHistoryRow', ICONS.history, 'Clear trade history', count ? `${count} completed trade${count === 1 ? '' : 's'} saved` : 'No completed trades saved')}</div>`;
}

function wireTradeHistorySettings() {
  const row = document.getElementById('clearTradeHistoryRow');
  if (!row) return;
  const paint = () => {
    const count = tradeHistoryRecords().length;
    row.disabled = !count;
    row.querySelector('.l2').textContent = count
      ? `${count} completed trade${count === 1 ? '' : 's'} saved`
      : 'No completed trades saved';
  };
  paint();
  row.addEventListener('click', () => {
    openInAppConfirm(
      'Remove all saved completed trades? Your current trade and collection will be kept. This change is included in account sync.',
      (ok) => {
        if (ok && clearTradeHistory()) {
          paint();
          toast('Trade history cleared.');
        }
      },
      { title: 'Clear trade history', ok: 'Clear history', cancel: 'Cancel', danger: true },
    );
  });
}
