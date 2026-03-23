// financeiro.js (somente front-end, mock)

const MOCK = {
  structure: [
    {
      id: "predio_admin",
      name: "Prédio Administrativo",
      boards: [
        { id: "q1", name: "QDG-01", circuits: [
          { id: "c1", name: "Salas (novas)" },
          { id: "c2", name: "Setores Administrativos (1º andar)" },
          { id: "c3", name: "Coordenações (2º andar)" }
        ]}
      ]
    },
    {
      id: "predio_principal",
      name: "Prédio Principal",
      boards: [
        { id: "q2", name: "QDG-02", circuits: [
          { id: "c4", name: "Biblioteca" },
          { id: "c5", name: "Laboratório de Informática" },
          { id: "c6", name: "Ambulatório" }
        ]}
      ]
    }
  ],
  rateioAreas: [
    { area: "Ambulatório", pct: 0.28 },
    { area: "Laboratórios", pct: 0.24 },
    { area: "Administrativo", pct: 0.20 },
    { area: "Biblioteca", pct: 0.14 },
    { area: "Outros", pct: 0.14 }
  ],
  alerts: [
    { title: "Consumo fora do horário", tag: "Atenção", kind: "warn", msg: "Detecção de consumo após horário padrão (mock)." },
    { title: "Pico acima do limite", tag: "Crítico", kind: "danger", msg: "Pico registrado acima do limite configurado (mock)." },
    { title: "Possível anomalia", tag: "Atenção", kind: "warn", msg: "Variação súbita vs. média recente (mock)." }
  ]
};

function $(id){ return document.getElementById(id); }

function brMoney(v){
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function brNumber(v, digits=1){
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function makeDailySeries(days){
  // gera uma série de kWh/dia com variação
  const base = 380; // kWh/dia (mock)
  const points = [];
  const labels = [];
  const now = new Date();
  for (let i = days-1; i >= 0; i--){
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const label = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    labels.push(label);
    const noise = (Math.random() - 0.5) * 80;
    const trend = (days - i) * 0.2;
    const value = Math.max(120, base + noise + trend);
    points.push(Number(value.toFixed(1)));
  }
  return { labels, points };
}

function sum(arr){ return arr.reduce((a,b)=>a+b,0); }
function max(arr){ return arr.reduce((a,b)=>Math.max(a,b), -Infinity); }

let chartKwh = null;
let chartRateio = null;

function fillStructure(){
  const localSel = $("local");
  const boardSel = $("quadro");
  const circSel  = $("circuito");

  localSel.innerHTML = "";
  for (const loc of MOCK.structure){
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    localSel.appendChild(opt);
  }

  function fillBoards(){
    const loc = MOCK.structure.find(x => x.id === localSel.value) || MOCK.structure[0];
    boardSel.innerHTML = "";
    for (const b of loc.boards){
      const opt = document.createElement("option");
      opt.value = b.id;
      opt.textContent = b.name;
      boardSel.appendChild(opt);
    }
    fillCircuits();
  }

  function fillCircuits(){
    const loc = MOCK.structure.find(x => x.id === localSel.value) || MOCK.structure[0];
    const board = loc.boards.find(x => x.id === boardSel.value) || loc.boards[0];
    circSel.innerHTML = "";
    const all = document.createElement("option");
    all.value = "all";
    all.textContent = "Todos";
    circSel.appendChild(all);

    for (const c of board.circuits){
      const opt = document.createElement("option");
      opt.value = c.id;
      opt.textContent = c.name;
      circSel.appendChild(opt);
    }
  }

  localSel.addEventListener("change", fillBoards);
  boardSel.addEventListener("change", fillCircuits);
  fillBoards();
}

function handlePeriodo(){
  const p = $("periodo").value;
  $("customRange").style.display = (p === "custom") ? "grid" : "none";
}

function renderAlerts(){
  const ul = $("alertsList");
  ul.innerHTML = "";
  for (const a of MOCK.alerts){
    const li = document.createElement("li");
    li.className = "alert";
    li.innerHTML = `
      <div class="title">
        <span>${a.title}</span>
        <span class="tag ${a.kind}">${a.tag}</span>
      </div>
      <p>${a.msg}</p>
    `;
    ul.appendChild(li);
  }
}

function renderRateioLegend(totalKwh, tarifa){
  const wrap = $("rateioLegend");
  wrap.innerHTML = "";
  for (const r of MOCK.rateioAreas){
    const kwh = totalKwh * r.pct;
    const cost = kwh * tarifa;

    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `
      <div class="legend-left">
        <span class="swatch"></span>
        <span>${r.area}</span>
      </div>
      <div>
        <strong>${brNumber(kwh,1)} kWh</strong>
        <span style="color: rgba(234,240,255,0.65); font-size: 12px;"> • ${brNumber(r.pct*100,0)}%</span>
      </div>
    `;
    wrap.appendChild(div);
  }
}

function renderResumoTable(totalKwh, tarifa){
  const tbody = $("tableResumo").querySelector("tbody");
  tbody.innerHTML = "";

  let sumKwh = 0;
  let sumCost = 0;

  for (const r of MOCK.rateioAreas){
    const kwh = totalKwh * r.pct;
    const pct = r.pct * 100;
    const cost = kwh * tarifa;

    sumKwh += kwh;
    sumCost += cost;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.area}</td>
      <td>${brNumber(kwh,1)}</td>
      <td>${brNumber(pct,0)}%</td>
      <td>${brMoney(cost)}</td>
    `;
    tbody.appendChild(tr);
  }

  $("tTotalKwh").textContent = brNumber(sumKwh,1);
  $("tTotalCost").textContent = brMoney(sumCost);
}

function getDaysFromPeriodo(){
  const p = $("periodo").value;
  if (p === "7d") return 7;
  if (p === "30d") return 30;
  if (p === "mtd") return 20; // mock
  if (p === "custom") return 14; // mock
  return 30;
}

function computeMockKPIs(series, tarifa){
  const totalKwh = sum(series.points);
  const cost = totalKwh * tarifa;

  const picoW = Math.round(2500 + Math.random()*1800); // mock
  const baseline = totalKwh * (1.0 + (Math.random()*0.18)); // baseline maior que atual
  const reducaoPct = ((baseline - totalKwh) / baseline) * 100;

  return { totalKwh, cost, picoW, reducaoPct };
}

function updateSubtitle(){
  const locText = $("local").selectedOptions[0]?.textContent || "";
  const qText = $("quadro").selectedOptions[0]?.textContent || "";
  const cText = $("circuito").selectedOptions[0]?.textContent || "Todos";

  $("subtitle").textContent = `Filtro: ${locText} • ${qText} • ${cText} (mock)`;
}

function buildCharts(series){
  // Chart consumo diário
  const ctx1 = $("chartKwh");
  if (chartKwh) chartKwh.destroy();

  chartKwh = new Chart(ctx1, {
    type: "line",
    data: {
      labels: series.labels,
      datasets: [{
        label: "kWh/dia",
        data: series.points,
        tension: 0.25,
        pointRadius: 2,
        pointHoverRadius: 4,
        borderWidth: 2,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false }
      },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: {
          ticks: { color: "rgba(234,240,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          ticks: { color: "rgba(234,240,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });

  // Chart rateio (doughnut)
  const ctx2 = $("chartRateio");
  if (chartRateio) chartRateio.destroy();

  chartRateio = new Chart(ctx2, {
    type: "doughnut",
    data: {
      labels: MOCK.rateioAreas.map(x => x.area),
      datasets: [{
        data: MOCK.rateioAreas.map(x => Math.round(x.pct * 100)),
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      cutout: "70%"
    }
  });
}

function setKpis(kpis){
  $("kpiKwhPeriodo").textContent = `${brNumber(kpis.totalKwh,1)} kWh`;
  $("kpiKwhPeriodoSub").textContent = `Consolidado do período selecionado`;
  $("kpiCusto").textContent = brMoney(kpis.cost);
  $("kpiPico").textContent = `${kpis.picoW.toLocaleString("pt-BR")} W`;
  $("kpiReducao").textContent = `${brNumber(kpis.reducaoPct,1)}%`;
}

function exportCsv(series, tarifa){
  const rows = [];
  rows.push(["Data", "kWh", "Tarifa(R$/kWh)", "Custo(R$)"]);

  for (let i=0; i<series.labels.length; i++){
    const kwh = series.points[i];
    const cost = kwh * tarifa;
    rows.push([series.labels[i], kwh, tarifa, cost.toFixed(2)]);
  }

  const csv = rows.map(r => r.join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "energia_verde_financeiro.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function main(){
  fillStructure();
  renderAlerts();

  $("periodo").addEventListener("change", handlePeriodo);
  handlePeriodo();

  function refresh(){
    updateSubtitle();

    const days = getDaysFromPeriodo();
    const series = makeDailySeries(days);

    const tarifa = Number($("tarifa").value || 0);
    const kpis = computeMockKPIs(series, tarifa);

    setKpis(kpis);
    buildCharts(series);
    renderRateioLegend(kpis.totalKwh, tarifa);
    renderResumoTable(kpis.totalKwh, tarifa);

    // status
    $("statusTag").querySelector("span:last-child").textContent = "Atualizado agora";
  }

  $("btnAplicar").addEventListener("click", refresh);

  $("tarifa").addEventListener("change", () => {
    // só recalcula custo/rateio/tabela sem regenerar série
    refresh();
  });

  $("btnExportCsv").addEventListener("click", () => {
    const days = getDaysFromPeriodo();
    const series = makeDailySeries(days);
    const tarifa = Number($("tarifa").value || 0);
    exportCsv(series, tarifa);
  });

  $("btnPrint").addEventListener("click", () => window.print());

  refresh();
}

document.addEventListener("DOMContentLoaded", main);