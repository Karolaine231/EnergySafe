const API_BASE = "http://localhost:8000"; // troque pela URL do seu backend em produção

function $(id) {
  return document.getElementById(id);
}

async function getJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Erro HTTP ${response.status}`);
  return await response.json();
}

function brMoney(v) {
  return Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function brNumber(v, digits = 1) {
  return Number(v || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  });
}

function exportCsv(filename, rows) {
  const csv = rows
    .map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

let chartKwh   = null;
let chartRateio = null;
let resumoCache = [];
let serieCache  = [];
let alertasCache = [];

// ── helpers de período ──────────────────────────────────────────────────────

function getPeriodoParams() {
  const periodo = $("periodo").value;
  if (periodo === "custom") {
    return { inicio: $("dateFrom").value, fim: $("dateTo").value };
  }
  const fim   = new Date();
  const inicio = new Date();
  if (periodo === "7d")  inicio.setDate(fim.getDate() - 7);
  if (periodo === "30d") inicio.setDate(fim.getDate() - 30);
  if (periodo === "mtd") inicio.setDate(1);
  return {
    inicio: inicio.toISOString(),
    fim:    fim.toISOString()
  };
}

function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.append(k, v);
  });
  return search.toString();
}

// ── carregamento de selects ─────────────────────────────────────────────────

async function carregarLocais() {
  const select = $("local");
  select.innerHTML = `<option value="">Carregando...</option>`;

  const locais = await getJSON(`${API_BASE}/locais`);
  select.innerHTML = "";

  if (!locais.length) {
    select.innerHTML = `<option value="">Nenhum local encontrado</option>`;
    $("quadro").innerHTML   = `<option value="">Sem dados</option>`;
    $("circuito").innerHTML = `<option value="">Sem dados</option>`;
    return;
  }

  locais.forEach(local => {
    const option = document.createElement("option");
    option.value = local.id;
    option.textContent = local.nome;
    select.appendChild(option);
  });

  await carregarQuadros(select.value);
}

async function carregarQuadros(localId) {
  const select = $("quadro");
  select.innerHTML = `<option value="">Carregando...</option>`;

  if (!localId) {
    select.innerHTML   = `<option value="">Selecione um local</option>`;
    $("circuito").innerHTML = `<option value="">Selecione um quadro</option>`;
    return;
  }

  const quadros = await getJSON(`${API_BASE}/quadros?local_id=${localId}`);
  select.innerHTML = "";

  if (!quadros.length) {
    select.innerHTML   = `<option value="">Nenhum quadro encontrado</option>`;
    $("circuito").innerHTML = `<option value="">Sem circuitos</option>`;
    return;
  }

  quadros.forEach(q => {
    const option = document.createElement("option");
    option.value = q.id;
    option.textContent = q.nome;
    select.appendChild(option);
  });

  await carregarCircuitos(select.value);
}

async function carregarCircuitos(quadroId) {
  const select = $("circuito");
  select.innerHTML = `<option value="">Carregando...</option>`;

  if (!quadroId) {
    select.innerHTML = `<option value="">Selecione um quadro</option>`;
    return;
  }

  const canais = await getJSON(`${API_BASE}/canais?quadro_id=${quadroId}`);
  select.innerHTML = "";

  const optTodos = document.createElement("option");
  optTodos.value = "all";
  optTodos.textContent = "Todos";
  select.appendChild(optTodos);

  canais.forEach(canal => {
    const option = document.createElement("option");
    option.value = canal.id;
    option.textContent = canal.nome + (canal.fase ? ` — Fase ${canal.fase}` : "");
    select.appendChild(option);
  });
}

// ── KPIs ─────────────────────────────────────────────────────────────────────

async function carregarKPIs() {
  const tarifa  = Number($("tarifa").value || 0);
  const { inicio, fim } = getPeriodoParams();
  const canalId = $("circuito").value === "all" ? "" : $("circuito").value;

  const params = buildQuery({ canal_id: canalId, inicio, fim, limit: 1000 });
  const medicoes = await getJSON(`${API_BASE}/medicoes?${params}`);

  // kWh simples: soma dos valores assumindo que cada medição representa 1 leitura em W
  // ajuste a lógica conforme a granularidade real do seu hardware
  const totalW  = medicoes.reduce((acc, m) => acc + Number(m.corrente || 0), 0);
  const totalKwh = totalW / 1000;
  const picoW   = medicoes.length ? Math.max(...medicoes.map(m => Number(m.valor || 0))) : 0;

  $("kpiKwhPeriodo").textContent = `${brNumber(totalKwh, 1)} kWh`;
  $("kpiKwhPeriodoSub").textContent = `${medicoes.length} leituras no período`;
  $("kpiCusto").textContent = brMoney(totalKwh * tarifa);
  $("kpiPico").textContent  = `${brNumber(picoW, 0)} W`;
  $("kpiReducao").textContent = "—";
}

// ── Gráfico de série ──────────────────────────────────────────────────────────

async function carregarSerieConsumo() {
  const { inicio, fim } = getPeriodoParams();
  const canalId = $("circuito").value === "all" ? "" : $("circuito").value;

  const params = buildQuery({ canal_id: canalId, inicio, fim, limit: 1000 });
  const medicoes = await getJSON(`${API_BASE}/medicoes?${params}`);
  serieCache = medicoes;

  // Agrupa por dia
  const porDia = {};
  medicoes.forEach(m => {
    const dia = new Date(m.timestamp).toLocaleDateString("pt-BR");
    porDia[dia] = (porDia[dia] || 0) + Number(m.corrente || 0) / 1000;
  });

  const labels  = Object.keys(porDia);
  const valores = Object.values(porDia);

  if (chartKwh) chartKwh.destroy();

  chartKwh = new Chart($("chartKwh"), {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "kWh/dia",
        data: valores,
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
      plugins: { legend: { display: false }, tooltip: { mode: "index", intersect: false } },
      interaction: { mode: "index", intersect: false },
      scales: {
        x: { ticks: { color: "rgba(234,240,255,0.65)" }, grid: { color: "rgba(255,255,255,0.06)" } },
        y: { ticks: { color: "rgba(234,240,255,0.65)" }, grid: { color: "rgba(255,255,255,0.06)" } }
      }
    }
  });
}

// ── Rateio por canal ──────────────────────────────────────────────────────────

async function carregarRateio() {
  const tarifa = Number($("tarifa").value || 0);
  const quadroId = $("quadro").value;
  const { inicio, fim } = getPeriodoParams();

  if (!quadroId) return;

  const canais = await getJSON(`${API_BASE}/canais?quadro_id=${quadroId}`);

  const promessas = canais.map(async canal => {
    const params = buildQuery({ canal_id: canal.id, inicio, fim, limit: 1000 });
    const medicoes = await getJSON(`${API_BASE}/medicoes?${params}`);
    const kwh = medicoes.reduce((acc, m) => acc + Number(m.corrente || 0), 0) / 1000;
    return { area: canal.nome, kwh };
  });

  const data = await Promise.all(promessas);
  resumoCache = data;

  const total = data.reduce((acc, d) => acc + d.kwh, 0);
  const dataComPct = data.map(d => ({
    ...d,
    percentual: total > 0 ? (d.kwh / total) * 100 : 0
  }));

  const labels  = dataComPct.map(d => d.area);
  const valores = dataComPct.map(d => d.kwh);

  if (chartRateio) chartRateio.destroy();

  chartRateio = new Chart($("chartRateio"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{ data: valores, borderWidth: 0 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      cutout: "70%"
    }
  });

  renderRateioLegend(dataComPct);
  renderResumoTable(dataComPct, tarifa);
}

function renderRateioLegend(data) {
  const wrap = $("rateioLegend");
  wrap.innerHTML = "";
  data.forEach(item => {
    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `
      <div class="legend-left">
        <span class="swatch"></span>
        <span>${item.area}</span>
      </div>
      <div>
        <strong>${brNumber(item.kwh, 1)} kWh</strong>
        <span style="color:rgba(234,240,255,0.65);font-size:12px;"> • ${brNumber(item.percentual, 0)}%</span>
      </div>
    `;
    wrap.appendChild(div);
  });
}

function renderResumoTable(data, tarifa) {
  const tbody = $("tableResumo").querySelector("tbody");
  tbody.innerHTML = "";
  let totalKwh = 0, totalCost = 0;

  data.forEach(item => {
    const kwh  = item.kwh;
    const cost = kwh * tarifa;
    totalKwh  += kwh;
    totalCost += cost;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.area}</td>
      <td>${brNumber(kwh, 1)}</td>
      <td>${brNumber(item.percentual, 1)}%</td>
      <td>${brMoney(cost)}</td>
    `;
    tbody.appendChild(tr);
  });

  $("tTotalKwh").textContent  = brNumber(totalKwh, 1);
  $("tTotalCost").textContent = brMoney(totalCost);
}

// ── Alertas financeiros ───────────────────────────────────────────────────────

async function carregarAlertas() {
  const quadroId = $("quadro").value;
  if (!quadroId) { $("alertsList").innerHTML = ""; return; }

  const canais = await getJSON(`${API_BASE}/canais?quadro_id=${quadroId}`);
  const ul = $("alertsList");
  ul.innerHTML = "";

  if (!canais.length) {
    ul.innerHTML = `<li class="alert"><p>Nenhum canal encontrado neste quadro.</p></li>`;
    return;
  }

  const promessas = canais.map(c =>
    getJSON(`${API_BASE}/alertas?canal_id=${c.id}&resolvido=false&limit=10`)
  );
  const resultados = await Promise.all(promessas);
  const alertas = resultados.flat();
  alertasCache = alertas;

  if (!alertas.length) {
    ul.innerHTML = `<li class="alert"><p>Nenhum ponto de atenção encontrado.</p></li>`;
    return;
  }

  alertas.forEach(alerta => {
    const li = document.createElement("li");
    li.className = "alert";

    let nivelClass = "";
    const sev = String(alerta.nivel || "").toLowerCase();
    if (sev === "critica" || sev === "alta") nivelClass = "danger";
    if (sev === "media") nivelClass = "warn";

    li.innerHTML = `
      <div class="title">
        <span>${alerta.tipo}</span>
        <span class="tag ${nivelClass}">${alerta.nivel}</span>
      </div>
      <p>${alerta.mensagem || ""}</p>
    `;
    ul.appendChild(li);
  });
}

// ── painel completo ───────────────────────────────────────────────────────────

function atualizarSubtitulo() {
  const locText = $("local").selectedOptions[0]?.textContent || "-";
  const qText   = $("quadro").selectedOptions[0]?.textContent || "-";
  const cText   = $("circuito").selectedOptions[0]?.textContent || "Todos";
  $("subtitle").textContent = `Filtro: ${locText} • ${qText} • ${cText}`;
}

function handlePeriodo() {
  const p = $("periodo").value;
  $("customRange").style.display = (p === "custom") ? "grid" : "none";
}

async function carregarPainel() {
  atualizarSubtitulo();
  await carregarKPIs();
  await carregarSerieConsumo();
  await carregarRateio();
  await carregarAlertas();
  $("statusTag").querySelector("span:last-child").textContent = "Atualizado agora";
}

function configurarExportacao() {
  $("btnExportCsv").addEventListener("click", () => {
    const tarifa = Number($("tarifa").value || 0);
    const rows = [["Área", "kWh", "%", "Custo(R$)"]];
    resumoCache.forEach(item => {
      rows.push([
        item.area,
        Number(item.kwh || 0).toFixed(2),
        Number(item.percentual || 0).toFixed(2),
        (Number(item.kwh || 0) * tarifa).toFixed(2)
      ]);
    });
    exportCsv("financeiro_rateio.csv", rows);
  });

  $("btnPrint").addEventListener("click", () => window.print());
}

// ── init ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", async () => {
  try {
    handlePeriodo();
    await carregarLocais();
    await carregarPainel();

    $("periodo").addEventListener("change",   async () => { handlePeriodo(); await carregarPainel(); });
    $("local").addEventListener("change",     async (e) => { await carregarQuadros(e.target.value); await carregarPainel(); });
    $("quadro").addEventListener("change",    async (e) => { await carregarCircuitos(e.target.value); await carregarPainel(); });
    $("circuito").addEventListener("change",  async () => { await carregarPainel(); });
    $("btnAplicar").addEventListener("click", async () => { await carregarPainel(); });
    $("tarifa").addEventListener("change",    async () => { await carregarKPIs(); await carregarRateio(); });
    $("dateFrom").addEventListener("change",  async () => { if ($("periodo").value === "custom") await carregarPainel(); });
    $("dateTo").addEventListener("change",    async () => { if ($("periodo").value === "custom") await carregarPainel(); });

    configurarExportacao();

  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel financeiro.");
  }
});
