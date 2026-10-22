const status = document.getElementById('data-status');
async function update() {
  const d = await chrome.runtime.sendMessage({ type: 'GET_DATA' });
  const count = Array.isArray(d?.zamzamCapitalRows) ? d.zamzamCapitalRows.length : 0;
  if (count) status.textContent = `${count} records loaded · ${d.zamzamCapitalUpdatedAt ? new Date(d.zamzamCapitalUpdatedAt).toLocaleString() : 'update time unavailable'}`;
  else status.textContent = `No records loaded yet.${d?.zamzamCapitalError ? ' Error: ' + d.zamzamCapitalError : ''}`;
}
document.getElementById('refresh').addEventListener('click', async () => {
  status.textContent = 'Refreshing…';
  const result = await chrome.runtime.sendMessage({ type: 'REFRESH_DATA' });
  await update();
  if (result && !result.ok) status.textContent = `Refresh failed: ${result.error}`;
});
update();