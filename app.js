// ===== КОНСТАНТЫ =====
const seasonShares = [0.02, 0.06, 0.10, 0.11, 0.11, 0.12, 0.13, 0.13, 0.09, 0.05, 0.04, 0.02];
const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

const $ = id => document.getElementById(id);
let chartInstance = null;

// ===== РАСПРЕДЕЛЕНИЕ ЦЕЛОГО ПО ДОЛЯМ (метод наибольших остатков) =====
function distribute(total, shares) {
  const raw = shares.map(s => total * s);
  const floors = raw.map(v => Math.floor(v));
  let remainder = total - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .sort((a, b) => b.frac - a.frac)
    .map(o => o.i);

  const result = [...floors];
  for (let k = 0; k < remainder; k++) {
    result[order[k]] += 1;
  }
  return result;
}

// ===== РАСЧЁТЫ =====
function calc() {
  const revenue  = +$('revenue').value;
  const avg      = +$('avg').value;
  const convLead = +$('conv_lead').value / 100;
  const convMeas = +$('conv_meas').value / 100;
  const measMgr  = +$('meas_mgr').value;

  const contracts    = Math.ceil(revenue / avg);
  const measurements = Math.ceil(contracts / convMeas);
  const leads        = Math.ceil(measurements / convLead);

  // Распределяем договоры по месяцам так, чтобы сумма = contracts
  const monthlyContracts = distribute(contracts, seasonShares);

  // Помесячный план: замеры и лиды — вверх от договоров, менеджеры — по замерам
  const rows = seasonShares.map((share, i) => {
    const c = monthlyContracts[i];
    const m = Math.ceil(c / convMeas) || 0;
    const l = Math.ceil(m / convLead) || 0;
    const managersMonth = Math.ceil(m / measMgr);

    return {
      month: monthNames[i],
      share,
      contracts: c,
      measurements: m,
      leads: l,
      managersMonth
    };
  });

  const peakManagers = Math.max(...rows.map(r => r.managersMonth));
  const peakMonth    = rows.find(r => r.managersMonth === peakManagers)?.month || '—';

  // --- Вывод в карточки ---
  $('rev_val').textContent      = revenue;
  $('avg_val').textContent      = avg.toFixed(2);
  $('conv_lead_val').textContent = (convLead * 100).toFixed(0);
  $('conv_meas_val').textContent = (convMeas * 100).toFixed(0);
  $('meas_mgr_val').textContent = measMgr;

  $('contracts').textContent    = contracts;
  $('measurements').textContent = measurements;
  $('leads').textContent        = leads;
  $('managers').textContent     = peakManagers;
  $('mgr_detail').textContent   = `пик — ${peakMonth}`;

  $('cp_jun').textContent = Math.ceil(contracts * 0.50);
  $('cp_aug').textContent = Math.ceil(contracts * 0.80);

  renderTable(rows);
  renderChart(rows);

  return {
    revenue, avg,
    convLead: convLead * 100, convMeas: convMeas * 100,
    measMgr,
    contracts, measurements, leads,
    peakManagers, peakMonth, rows
  };
}

// ===== ТАБЛИЦА =====
function renderTable(rows) {
  const tbody = $('monthly-table');
  tbody.innerHTML = '';

  const peak = Math.max(...rows.map(r => r.managersMonth));

  rows.forEach(r => {
    const isPeak = r.managersMonth === peak;
    const tr = document.createElement('tr');
    if (isPeak) tr.style.background = '#FEF3C7';
    tr.innerHTML = `
      <td>${r.month}${isPeak ? ' ⚠️' : ''}</td>
      <td>${r.contracts}</td>
      <td>${r.measurements}</td>
      <td>${r.leads}</td>
      <td><b>${r.managersMonth}</b></td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== ГРАФИК =====
function renderChart(rows) {
  const ctx = document.getElementById('chart').getContext('2d');
  if (chartInstance) chartInstance.destroy();
  chartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: rows.map(r => r.month.slice(0, 3)),
      datasets: [
        { label: 'Договоры', data: rows.map(r => r.contracts),    backgroundColor: '#2E5AAC', borderRadius: 4 },
        { label: 'Замеры',   data: rows.map(r => r.measurements), backgroundColor: '#14B8A6', borderRadius: 4 },
        { label: 'Лиды',     data: rows.map(r => r.leads),        backgroundColor: '#D97706', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, title: { display: true, text: 'Количество, шт' } } }
    }
  });
}

// ===== ЭКСПОРТ В EXCEL =====
function exportToExcel() {
  const data = calc();

  const ws_data = [
    ['Финансовая модель 2027 — параметры', ''],
    ['План выручки, млн ₽',               data.revenue],
    ['Средний чек, млн ₽',                data.avg],
    ['Конверсия лид → замер, %',          data.convLead.toFixed(0)],
    ['Конверсия замер → договор, %',      data.convMeas.toFixed(0)],
    ['Замеров на менеджера в месяц',      data.measMgr],
    [],
    ['Итоговые потребности', ''],
    ['Нужно договоров, шт',               data.contracts],
    ['Нужно замеров, шт',                 data.measurements],
    ['Нужно лидов, шт',                   data.leads],
    ['Нужно менеджеров в пик, чел',       data.peakManagers],
    ['Пиковый месяц',                     data.peakMonth],
    [],
    ['Месяц', 'Доля года, %', 'Договоров', 'Замеров', 'Лидов', 'Нужно менеджеров']
  ];

  data.rows.forEach(r => ws_data.push([
    r.month,
    (r.share * 100).toFixed(0),
    r.contracts,
    r.measurements,
    r.leads,
    r.managersMonth
  ]));

  // Строка ИТОГО
  ws_data.push([
    'ИТОГО',
    '100',
    data.rows.reduce((s, r) => s + r.contracts, 0),
    data.rows.reduce((s, r) => s + r.measurements, 0),
    data.rows.reduce((s, r) => s + r.leads, 0),
    ''
  ]);

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  ws['!cols'] = [
    { wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'План 2027');
  XLSX.writeFile(wb, 'План_2027.xlsx');
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
['revenue','avg','conv_lead','conv_meas','meas_mgr'].forEach(id => {
  $(id).addEventListener('input', calc);
});
calc();