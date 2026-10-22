(() => {
  if (window.__zamzamCapitalCheckerLoaded) return;
  window.__zamzamCapitalCheckerLoaded = true;

  const PANEL_ID = 'zamzam-capital-shariah-panel';
  const $ = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  let rows = [];
  let updatedAt = null;
  let currentSymbol = '';
  let debounceTimer;

  const panel = $('section', 'zc-panel');
  panel.id = PANEL_ID;
  const header = $('div', 'zc-header');
  const brand = $('div', 'zc-brand');
  const mark = $('div', 'zc-mark', 'ZC');
  const brandText = $('div', 'zc-brand-text');
  brandText.append($('strong', '', 'ZAMZAM CAPITAL'),$('small', '', 'SHARIAH CHECKER'));
  brand.append(mark, brandText);

  const controls = $('div', 'zc-controls');
  const themeBtn = $('button', 'zc-icon-btn', '◐');
  themeBtn.title = 'Toggle light/dark mode';
  const minimizeBtn = $('button', 'zc-icon-btn', '−');
  minimizeBtn.title = 'Minimize panel';
  controls.append(themeBtn, minimizeBtn);
  header.append(brand, controls);

  const content = $('div', 'zc-content');
  const symbolLabel = $('div', 'zc-eyebrow', 'ACTIVE TRADINGVIEW SYMBOL');
  const symbol = $('div', 'zc-symbol', 'Detecting…');
  const company = $('div', 'zc-company', 'Waiting for chart symbol');
  const status = $('div', 'zc-status zc-unknown');
  const statusDot = $('span', 'zc-dot');
  const statusText = $('strong', '', 'CHECKING');
  status.append(statusDot, statusText);

  const detailGrid = $('div', 'zc-details');
  const industryCard = $('div', 'zc-detail');
  industryCard.append($('span', '', 'INDUSTRY'));
  const industry = $('strong', '', 'Not Available');
  industryCard.append(industry);

  const sectorCard = $('div', 'zc-detail');
  sectorCard.append($('span', '', 'SECTOR'));
  const sector = $('strong', '', 'Not Available');
  sectorCard.append(sector);
  detailGrid.append(industryCard, sectorCard);

  const note = $('p', 'zc-note', 'Compliance status is shown only when a matching record exists in your connected dataset.');
  const footer = $('div', 'zc-footer');
  const updated = $('span', '', 'Data not loaded');
  const refreshBtn = $('button', 'zc-refresh', '↻ Refresh');
  footer.append(updated, refreshBtn);

  content.append(symbolLabel, symbol, company, status, detailGrid, note, footer);
  panel.append(header, content);
  document.documentElement.append(panel);

  function norm(value) {
    return String(value ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function normCompany(value) {
    return String(value ?? '')
      .toUpperCase()
      .replace(/&/g, 'AND')
      .replace(/\bLIMITED\b/g, 'LTD')
      .replace(/\bPRIVATE\b/g, 'PVT')
      .replace(/\bCORPORATION\b/g, 'CORP')
      .replace(/\bCOMPANY\b/g, 'CO')
      .replace(/[^A-Z0-9]/g, '');
  }

  function first(obj, keys) {
    for (const key of keys) {
      if (obj && obj[key] !== undefined && obj[key] !== null && String(obj[key]).trim() !== '') {
        return obj[key];
      }
    }
    return '';
  }

  function getRowTicker(row) {
    return String(
      first(row, ['ticker', 'symbol', 'Trading Symbol', 'TradingSymbol', 'stock_symbol', 'Stock Symbol', 'Symbol', 'scrip', 'tradingsymbol'])
    ).trim().toUpperCase();
  }

  function getRowCompany(row) {
    return String(
      first(row, ['company_name', 'companyName', 'Company Name', 'company', 'name', 'Name', 'Stock Name', 'stock_name'])
    ).trim();
  }

  function matchCompanyToRow(companyText) {
    const target = normCompany(companyText);
    if (!target || target.length < 4 || !rows.length) return null;
    const matches = rows.filter(row => {
      const cNorm = normCompany(getRowCompany(row));
      return cNorm.length >= 4 && (target === cNorm || target.startsWith(cNorm) || cNorm.startsWith(target));
    }).sort((a, b) => normCompany(getRowCompany(b)).length - normCompany(getRowCompany(a)).length);
    return matches[0] || null;
  }

  function getSymbol() {
    const parseExchangeTicker = (value) => {
      const text = String(value || '').trim();
      if (!text) return null;
      const m = text.match(/(?:^|\b)(NASDAQ|NYSE|AMEX|NSE|BSE|BINANCE|FOREXCOM|OANDA|CME|MCX|BATS|TSX|LSE):\s*([A-Z0-9][A-Z0-9._&-]{0,19})\b/i);
      return m ? { exchange: m[1].toUpperCase(), ticker: m[2].toUpperCase() } : null;
    };

    const isVisible = (el) => {
      if (!el || !el.isConnected || panel.contains(el)) return false;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) > 0
      );
    };

    const tickerOnly = (value) => {
      const text = String(value || '').trim().replace(/\s+/g, ' ');
      if (!/^[A-Z0-9][A-Z0-9._&-]{0,19}$/.test(text)) return null;
      if (
        /^(?:1|3|5|10|15|30|45|60|120|180|240)(?:S|M|H|D|W|Y)?$/i.test(text) ||
        /^(?:D|W|M|Y|1D|1W|1M|3M|6M|1Y|5Y|ALL|ADJ|LOG|LIN|NSE|BSE|INDIA|UNNAMED|SAVE|REPLAY|INDICATORS|ALERT|COMPARE|ZC)$/i.test(text)
      ) {
        return null;
      }
      return { exchange: '', ticker: text.toUpperCase() };
    };

    let legendCompany = '';
    const legendSelectors = [
      '[data-name="legend-source-title"]',
      '[data-name="legend-source-item"] [class*="title"]',
      '[data-name="legend"] [class*="title"]',
      '[data-testid*="legend"] [class*="title"]'
    ];
    const legends = [];
    for (const selector of legendSelectors) {
      for (const el of document.querySelectorAll(selector)) {
        if (!isVisible(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.top > 260 || r.left > Math.max(650, innerWidth * 0.55)) continue;
        const txt = String(el.innerText || el.textContent || '').trim().split(/\r?\n/)[0].trim();
        if (txt && txt.length < 180) legends.push({ el, txt, area: r.width * r.height, top: r.top });
      }
    }
    legends.sort((a, b) => a.top - b.top || a.area - b.area);
    if (legends.length) {
      legendCompany = legends[0].txt.split('·')[0].trim();
    }

    // 1. Top-left symbol search button (#header-toolbar-symbol-search)
    const symbolControls = [
      '#header-toolbar-symbol-search',
      '[id*="header-toolbar-symbol-search"]',
      '[data-name="header-toolbar-symbol-search"]',
      'button[data-name*="symbol-search"]',
      '[data-testid*="symbol-search"]'
    ];
    const controlCandidates = [];
    for (const selector of symbolControls) {
      for (const root of document.querySelectorAll(selector)) {
        if (!isVisible(root)) continue;
        const nodes = [root, ...root.querySelectorAll('span, div, input, button')];
        for (const el of nodes) {
          if (!isVisible(el)) continue;
          const r = el.getBoundingClientRect();
          if (r.top < 0 || r.top > 180 || r.left > 450) continue;
          const values = [
            el.getAttribute('data-symbol'),
            el.value,
            el.innerText,
            el.textContent
          ];
          for (const value of values) {
            const parsed = parseExchangeTicker(value) || tickerOnly(value);
            if (parsed) {
              controlCandidates.push({ parsed, area: r.width * r.height, x: r.left, y: r.top });
            }
          }
        }
      }
    }
    controlCandidates.sort((a, b) => a.area - b.area || a.x - b.x);
    if (controlCandidates.length) {
      return { ...controlCandidates[0].parsed, legendCompany };
    }

    // 2. Live browser tab title ("TICKER PRICE ...")
    const titleMatch = String(document.title || '').match(
      /^\s*(?:(NASDAQ|NYSE|AMEX|NSE|BSE|BINANCE|FOREXCOM|OANDA|CME|MCX|BATS|TSX|LSE):)?([A-Z0-9][A-Z0-9._&-]{0,19})\s+\d+(?:[.,]\d+)?/i
    );
    if (titleMatch) {
      const candidate = tickerOnly(titleMatch[2]);
      if (candidate) {
        return {
          exchange: (titleMatch[1] || '').toUpperCase(),
          ticker: candidate.ticker,
          legendCompany
        };
      }
    }

    // 3. Top-left toolbar coordinate scan
    const headerCandidates = [];
    for (const el of document.querySelectorAll('button, [role="button"], span, div')) {
      if (!isVisible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.left < 30 || r.left > 260 || r.top < 0 || r.top > 120) continue;
      const txt = String(el.innerText || el.textContent || '').trim();
      const parsed = parseExchangeTicker(txt) || tickerOnly(txt);
      if (!parsed) continue;
      headerCandidates.push({ parsed, area: r.width * r.height, x: r.left, y: r.top });
    }
    headerCandidates.sort((a, b) => a.area - b.area || a.y - b.y || a.x - b.x);
    if (headerCandidates.length) {
      return { ...headerCandidates[0].parsed, legendCompany };
    }

    // 4. Chart legend direct ticker or dataset company-name resolution
    for (const item of legends) {
      const direct = parseExchangeTicker(item.txt) || tickerOnly(item.txt);
      if (direct) return { ...direct, legendCompany };
      const matchedRow = matchCompanyToRow(item.txt);
      if (matchedRow) {
        const t = getRowTicker(matchedRow);
        if (t) return { exchange: '', ticker: t, legendCompany };
      }
    }

    // 5. Initial URL fallback
    if (!currentSymbol) {
      try {
        const urlSym = new URL(location.href).searchParams.get('symbol');
        const parsedUrl = parseExchangeTicker(urlSym) || tickerOnly(urlSym);
        if (parsedUrl) return { ...parsedUrl, legendCompany };
      } catch (_) {}
    }

    return currentSymbol
      ? { exchange: '', ticker: currentSymbol, legendCompany }
      : { exchange: '', ticker: '', legendCompany };
  }

  function lookup(ticker, legendCompany) {
    const wanted = norm(ticker);
    if (wanted) {
      const exact = rows.find(r => {
        const rowRaw = getRowTicker(r);
        const stripped = rowRaw
          .replace(/^(?:NSE|BSE|NASDAQ|NYSE|AMEX):/i, '')
          .replace(/\.(?:NS|BO)$/i, '')
          .replace(/-(?:EQ|BE|BZ)$/i, '');
        return norm(rowRaw) === wanted || norm(stripped) === wanted;
      });
      if (exact) return exact;
    }
    if (legendCompany) {
      return matchCompanyToRow(legendCompany);
    }
    return null;
  }

  function classifyComplianceValue(val) {
    if (val === true || val === 1) return 'compliant';
    if (val === false || val === 0) return 'non-compliant';
    if (val === null || val === undefined) return null;

    if (typeof val === 'object') {
      for (const nested of Object.values(val)) {
        const res = classifyComplianceValue(nested);
        if (res) return res;
      }
      return null;
    }

    const s = String(val).trim().toLowerCase();
    if (!s) return null;
    const clean = s.replace(/[^a-z0-9]/g, '');

    // Check Non-Halal / Non-Compliant FIRST (since "non-halal" contains "halal")
    if (
      /^(no|false|0|n|f|nonhalal|nothalal|unhalal|noncompliant|noncomplaint|notcompliant|nonshariah|notshariah|haram|fail|failed|doubtful|rejected|excluded|impermissible|prohibited)$/.test(clean) ||
      /(?:non|not|un|in)[\s\-_–—‑.]*(?:halal|compli|complai|sharia|permiss)|haram|fail|doubt|reject|exclud|prohibit/i.test(s)
    ) {
      return 'non-compliant';
    }

    // Check Halal / Compliant SECOND
    if (
      /^(yes|true|1|y|t|halal|compliant|complaint|shariahcompliant|shariah|pass|passed|approved|certified|permissible|halalcertified)$/.test(clean) ||
      /\b(?:halal|compliant|shariah\s*compliant|pass(?:ed)?|approved|certified|permissible)\b/i.test(s)
    ) {
      return 'compliant';
    }

    if (/^(na|n\/a|notavailable|unknown|pending|none|-)$/.test(clean)) {
      return 'not-available';
    }

    return null;
  }

  function resolveRowCompliance(row) {
    const priorityKeys = [
      'shariahStatus', 'shariah_status', 'Shariah Status', 'ShariahStatus',
      'shariahCompliance', 'shariah_compliance', 'Shariah Compliance',
      'complianceStatus', 'compliance_status', 'Compliance Status',
      'halalStatus', 'halal_status', 'Halal Status',
      'halal', 'Halal', 'isHalal', 'is_halal',
      'compliance', 'Compliance', 'isCompliant', 'is_compliant',
      'status', 'Status', 'result', 'Result', 'verdict', 'Verdict',
      'classification', 'Classification', 'badge', 'Badge', 'label', 'Label'
    ];

    let sawNotAvailable = false;

    for (const key of priorityKeys) {
      if (Object.prototype.hasOwnProperty.call(row, key)) {
        const res = classifyComplianceValue(row[key]);
        if (res === 'compliant' || res === 'non-compliant') return res;
        if (res === 'not-available') sawNotAvailable = true;
      }
    }

    // Fallback: inspect any other property on the row (excluding metadata fields)
    const ignoreKeys = /^(ticker|symbol|tradingsymbol|stock_symbol|scrip|company|companyname|company_name|name|stock_name|sector|sector_name|industry|industry_name|id|_id|isin|exchange|marketcap|market_cap|price)$/i;
    for (const [key, value] of Object.entries(row)) {
      if (ignoreKeys.test(key.replace(/\s+/g, ''))) continue;
      const res = classifyComplianceValue(value);
      if (res === 'compliant' || res === 'non-compliant') return res;
      if (res === 'not-available') sawNotAvailable = true;
    }

    // On screener.zamzam-capital.com, every stock in the dataset that is not Halal is Non-Halal
    return sawNotAvailable ? 'not-available' : 'non-compliant';
  }

  function setStatus(label, kind) {
    status.className = `zc-status zc-${kind}`;
    statusText.textContent = label;
  }

  function render() {
    const detected = getSymbol();
    currentSymbol = detected.ticker || '';
    symbol.textContent = currentSymbol || 'Not Available';

    if (!currentSymbol && !detected.legendCompany) {
      company.textContent = 'Not Available';
      setStatus('Not Available', 'unknown');
      industry.textContent = sector.textContent = 'Not Available';
      return;
    }

    const row = lookup(currentSymbol, detected.legendCompany);
    if (!row) {
      company.textContent = detected.legendCompany
        ? `${detected.legendCompany} (Not Available)`
        : 'Not Available';
      setStatus('Not Available', 'unknown');
      industry.textContent = sector.textContent = 'Not Available';
      note.textContent = 'This ticker is not available in the screener dataset.';
      return;
    }

    const resolvedTicker = getRowTicker(row);
    if (!currentSymbol && resolvedTicker) {
      currentSymbol = resolvedTicker;
      symbol.textContent = currentSymbol;
    }

    company.textContent = getRowCompany(row) || detected.legendCompany || currentSymbol;
    industry.textContent = first(row, ['industry', 'Industry', 'industry_name', 'Industry Name']) || 'Not Available';
    sector.textContent = first(row, ['sector', 'Sector', 'sector_name', 'Sector Name']) || 'Not Available';

    const verdict = resolveRowCompliance(row);
    if (verdict === 'compliant') {
      setStatus('Compliant', 'good');
      note.textContent = 'Status is based on the matching screener record. Verify methodology and update date before making decisions.';
    } else if (verdict === 'non-compliant') {
      setStatus('Non-Complaint', 'bad');
      note.textContent = 'Status is based on the matching screener record. Verify methodology and update date before making decisions.';
    } else {
      setStatus('Not Available', 'unknown');
      note.textContent = 'A matching record exists, but its compliance status is not available.';
    }
  }

  function refreshFooter() {
    updated.textContent = updatedAt ? `Updated ${new Date(updatedAt).toLocaleString()}` : 'Data not loaded';
  }

  async function loadData(force = false) {
    if (force) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = 'Loading…';
    }
    try {
      if (force) await chrome.runtime.sendMessage({ type: 'REFRESH_DATA' });
      const data = await chrome.runtime.sendMessage({ type: 'GET_DATA' });
      rows = Array.isArray(data?.zamzamCapitalRows) ? data.zamzamCapitalRows : [];
      updatedAt = data?.zamzamCapitalUpdatedAt || null;
      refreshFooter();
      if (!rows.length && data?.zamzamCapitalError) {
        note.textContent = `Could not load screener data: ${data.zamzamCapitalError}`;
      }
      render();
    } catch (e) {
      note.textContent = 'Could not read extension data. Reload the extension and TradingView tab.';
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = '↻ Refresh';
    }
  }

  themeBtn.addEventListener('click', () => {
    panel.classList.toggle('zc-light');
    chrome.storage.local.set({ zamzamCapitalLight: panel.classList.contains('zc-light') });
  });

  minimizeBtn.addEventListener('click', () => {
    panel.classList.toggle('zc-minimized');
    minimizeBtn.textContent = panel.classList.contains('zc-minimized') ? '+' : '−';
  });

  refreshBtn.addEventListener('click', () => loadData(true));

  chrome.storage.local.get('zamzamCapitalLight').then(v => {
    if (v.zamzamCapitalLight) panel.classList.add('zc-light');
  });

  let drag = null;
  header.addEventListener('pointerdown', e => {
    if (e.target.closest('button')) return;
    const r = panel.getBoundingClientRect();
    drag = { x: e.clientX, y: e.clientY, left: r.left, top: r.top };
    header.setPointerCapture(e.pointerId);
  });
  header.addEventListener('pointermove', e => {
    if (!drag) return;
    panel.style.left = `${Math.max(0, Math.min(innerWidth - panel.offsetWidth, drag.left + e.clientX - drag.x))}px`;
    panel.style.top = `${Math.max(0, Math.min(innerHeight - 60, drag.top + e.clientY - drag.y))}px`;
    panel.style.right = 'auto';
  });
  header.addEventListener('pointerup', () => {
    drag = null;
  });

  const scheduleRender = (delay = 120) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, delay);
  };

  const observer = new MutationObserver((mutations) => {
    if (mutations.every(m => panel.contains(m.target))) return;
    scheduleRender(120);
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['title', 'class', 'data-name', 'aria-label', 'data-symbol']
  });

  window.addEventListener('click', () => scheduleRender(150), true);
  window.addEventListener('keyup', () => scheduleRender(200), true);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
  window.addEventListener('focus', render);
  window.addEventListener('popstate', () => scheduleRender(100));
  setInterval(render, 500);
  loadData(false);
})();