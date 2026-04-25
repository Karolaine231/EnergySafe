/* ============================================================
   Safe Energy • Financeiro — financeiro.js
   APIs usadas:
   - GET /locais/
   - GET /areas/
   - GET /faturas/
   - GET /faturas/{id}/rateio
   - POST /faturas/{id}/recalcular
   - GET /relatorios/rateio/{fatura_id}
   - GET /metas/
   ============================================================ */

const API = "https://backendsafe.onrender.com";

/* ── Utilitários HTTP ── */
async function apiFetch(path, opts = {}) {
  const url = API + path;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    ...opts
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${path}`);
  return res.json();
}

function asArray(p) {
  if (Array.isArray(p))          return p;
  if (Array.isArray(p?.items))   return p.items;
  if (Array.isArray(p?.results)) return p.results;
  if (Array.isArray(p?.data))    return p.data;
  return [];
}

/* ── Formatação ── */
function fmt(n, casas = 2) {
  return Number(n || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas
  });
}
function fmtBRL(n)  { return "R$ " + fmt(n, 2); }
function fmtKwh(n)  { return fmt(n, 1) + " kWh"; }
function fmtMes(s)  {
  if (!s) return "—";
  const d = new Date(s + "T12:00:00");
  return d.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });
}

/* ── UI helpers ── */
function setStatus(msg, tipo = "ok") {
  const el  = document.getElementById("statusTag"); if (!el) return;
  const dot = el.querySelector(".dot");
  const txt = el.querySelector("span:last-child");
  if (dot) dot.style.background = tipo === "ok" ? "#22c55e" : tipo === "warn" ? "#f59e0b" : "#ef4444";
  if (txt) txt.textContent = msg;
}

function showFeedback(msg, tipo = "info") {
  const b = document.getElementById("feedbackBox"); if (!b) return;
  b.style.display = "block"; b.textContent = msg; b.className = "feedback-bar " + tipo;
}
function hideFeedback() {
  const b = document.getElementById("feedbackBox"); if (!b) return;
  b.style.display = "none"; b.textContent = ""; b.className = "feedback-bar";
}

function exportCsv(filename, rows) {
  const csv  = rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* ── Estado global ── */
const CORES = ["#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#f97316","#ec4899","#84cc16","#6366f1"];

let charts = { evolucao: null, rateio: null, rateioArea: null, metas: null };

let locaisCache  = [];
let areasCache   = [];
let faturasCache = [];
let metasCache   = [];
let rateioCache  = {};    // { [fatura_id]: [...] }
let faturaAtualId = null;
let areasMapCache = {};   // { [area_id]: nome }

/* ── Carregamento inicial ── */
async function inicializar() {
  setStatus("Inicializando...", "warn");
  hideFeedback();

  try {
    // Carrega tudo em paralelo
    const [locais, areas, faturas, metas] = await Promise.all([
      apiFetch("/locais/").then(asArray).catch(() => []),
      apiFetch("/areas/").then(asArray).catch(() => []),
      apiFetch("/faturas/").then(asArray).catch(() => []),
      apiFetch("/metas/").then(asArray).catch(() => [])
    ]);

    locaisCache  = locais;
    areasCache   = areas;
    faturasCache = faturas.sort((a, b) => a.mes.localeCompare(b.mes)); // ordem cronológica
    metasCache   = metas;

    // Mapa de áreas para lookup rápido
    areasMapCache = {};
    areas.forEach(a => { areasMapCache[a.id] = a.nome || `Área ${a.id}`; });

    // Preenche selects
    preencherLocais();
    preencherAreas("");
    preencherSelFaturas();

    // Renderiza tudo
    renderKPIs();
    renderGraficoEvolucao();
    renderTabelaResumo();
    renderFaturasList();
    renderMetas();

    // Carrega rateio da fatura mais recente para o gráfico de visão geral
    if (faturasCache.length > 0) {
      const ultima = faturasCache[faturasCache.length - 1];
      await carregarRateio(ultima.id);
      renderRateioVisaoGeral(ultima.id);
    }

    setStatus("Atualizado agora", "ok");
  } catch (e) {
    console.error("inicializar:", e);
    showFeedback("Erro ao carregar dados: " + e.message, "error");
    setStatus("Erro", "error");
  }
}

/* ── Selects ── */
function preencherLocais() {
  const sel = document.getElementById("local"); if (!sel) return;
  sel.innerHTML = `<option value="">Todos os locais</option>` +
    locaisCache.map(l => `<option value="${l.id}">${l.nome}</option>`).join("");
}

function preencherAreas(localId = "") {
  const sel = document.getElementById("area"); if (!sel) return;
  const lista = localId
    ? areasCache.filter(a => String(a.local_id) === String(localId))
    : areasCache;
  sel.innerHTML = `<option value="">Todas as áreas</option>` +
    lista.map(a => `<option value="${a.id}">${a.nome}</option>`).join("");
}

function preencherSelFaturas() {
  const sel = document.getElementById("selFaturaRateio"); if (!sel) return;
  sel.innerHTML = faturasCache.map(f =>
    `<option value="${f.id}">${fmtMes(f.mes)} — ${f.descricao?.slice(0, 30) || "Fatura"}</option>`
  ).join("");
  if (faturasCache.length > 0) sel.value = faturasCache[faturasCache.length - 1].id;
}

/* ── KPIs ── */
function renderKPIs() {
  // Filtra por local se selecionado
  const localId = document.getElementById("local")?.value || "";
  const faturas = localId
    ? faturasCache.filter(f => String(f.local_id) === String(localId))
    : faturasCache;

  const totalKwh   = faturas.reduce((s, f) => s + Number(f.kwh_total  || 0), 0);
  const totalCusto = faturas.reduce((s, f) => s + Number(f.valor_total|| 0), 0);
  const tarifa     = totalKwh > 0 ? totalCusto / totalKwh : 0;

  document.getElementById("kpiKwh").textContent     = fmtKwh(totalKwh);
  document.getElementById("kpiKwhSub").textContent  = `${faturas.length} fatura(s)`;
  document.getElementById("kpiCusto").textContent   = fmtBRL(totalCusto);
  document.getElementById("kpiTarifa").textContent  = `R$ ${fmt(tarifa, 4)}`;
  document.getElementById("kpiFaturas").textContent = faturas.length;
}

/* ── Gráfico evolução mensal ── */
function renderGraficoEvolucao() {
  const ctx = document.getElementById("chartEvolucao"); if (!ctx) return;
  if (charts.evolucao) { charts.evolucao.destroy(); charts.evolucao = null; }

  const localId = document.getElementById("local")?.value || "";
  const modo    = document.getElementById("modoGrafico")?.value || "ambos";
  const faturas = (localId
    ? faturasCache.filter(f => String(f.local_id) === String(localId))
    : faturasCache
  ).sort((a, b) => a.mes.localeCompare(b.mes));

  if (!faturas.length) return;

  const labels = faturas.map(f => fmtMes(f.mes));
  const datasets = [];

  if (modo === "kwh" || modo === "ambos") {
    datasets.push({
      type: "bar",
      label: "Consumo (kWh)",
      data: faturas.map(f => Number(f.kwh_total || 0)),
      backgroundColor: "rgba(56,189,248,0.28)",
      borderColor: "#38bdf8",
      borderWidth: 2,
      borderRadius: 4,
      yAxisID: "yKwh"
    });
  }

  if (modo === "custo" || modo === "ambos") {
    datasets.push({
      type: "line",
      label: "Custo (R$)",
      data: faturas.map(f => Number(f.valor_total || 0)),
      borderColor: "#f59e0b",
      backgroundColor: "rgba(245,158,11,0.08)",
      borderWidth: 2,
      pointRadius: 4,
      tension: 0.3,
      fill: false,
      yAxisID: modo === "ambos" ? "yCusto" : "yKwh"
    });
  }

  const scales = {
    x: { ticks: { color: "rgba(234,240,255,.65)", maxRotation: 0 }, grid: { color: "rgba(255,255,255,.06)" } }
  };

  if (modo === "ambos") {
    scales.yKwh  = { position: "left",  beginAtZero: true, ticks: { color: "rgba(234,240,255,.65)" }, grid: { color: "rgba(255,255,255,.06)" }, title: { display: true, text: "kWh", color: "#38bdf8" } };
    scales.yCusto= { position: "right", beginAtZero: true, ticks: { color: "rgba(234,240,255,.65)" }, grid: { drawOnChartArea: false }, title: { display: true, text: "R$", color: "#f59e0b" } };
  } else {
    scales.yKwh  = { beginAtZero: true, ticks: { color: "rgba(234,240,255,.65)" }, grid: { color: "rgba(255,255,255,.06)" } };
  }

  charts.evolucao = new Chart(ctx, {
    data: { labels, datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: true, labels: { color: "rgba(234,240,255,.8)", boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: c => c.dataset.yAxisID === "yCusto" || c.dataset.label?.includes("Custo")
              ? ` ${c.dataset.label}: ${fmtBRL(c.parsed.y)}`
              : ` ${c.dataset.label}: ${fmtKwh(c.parsed.y)}`
          }
        }
      },
      scales
    }
  });
}

/* ── Tabela resumo ── */
function renderTabelaResumo() {
  const tbody = document.querySelector("#tableResumo tbody"); if (!tbody) return;
  const localId = document.getElementById("local")?.value || "";
  const faturas = (localId
    ? faturasCache.filter(f => String(f.local_id) === String(localId))
    : faturasCache
  ).sort((a, b) => b.mes.localeCompare(a.mes)); // mais recente primeiro

  tbody.innerHTML = "";
  let totalKwh = 0, totalCusto = 0;

  faturas.forEach(f => {
    const kwh   = Number(f.kwh_total   || 0);
    const custo = Number(f.valor_total || 0);
    const tarifa = kwh > 0 ? custo / kwh : 0;
    totalKwh   += kwh;
    totalCusto += custo;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${fmtMes(f.mes)}</td>
      <td>${fmtKwh(kwh)}</td>
      <td>${fmtBRL(custo)}</td>
      <td>R$ ${fmt(tarifa, 4)}</td>
    `;
    tbody.appendChild(tr);
  });

  const tarMediaGeral = totalKwh > 0 ? totalCusto / totalKwh : 0;
  document.getElementById("tTotalKwh").textContent   = fmtKwh(totalKwh);
  document.getElementById("tTotalCost").textContent  = fmtBRL(totalCusto);
  document.getElementById("tTotalTarifa").textContent= `R$ ${fmt(tarMediaGeral, 4)}`;
}

/* ── Rateio (cache) ── */
async function carregarRateio(faturaId) {
  if (rateioCache[faturaId]) return rateioCache[faturaId];
  try {
    const dados = asArray(await apiFetch(`/faturas/${faturaId}/rateio/`));
    rateioCache[faturaId] = dados;
    return dados;
  } catch { return []; }
}

/* ── Gráfico de rateio (visão geral) ── */
function renderRateioVisaoGeral(faturaId) {
  const dados = rateioCache[faturaId] || [];
  const ctx   = document.getElementById("chartRateio"); if (!ctx) return;
  if (charts.rateio) { charts.rateio.destroy(); charts.rateio = null; }

  const legend = document.getElementById("rateioLegend");

  if (!dados.length || dados.every(d => !d.kwh)) {
    if (legend) legend.innerHTML = `<p style="font-size:12px;color:var(--muted)">Rateio ainda não calculado. Acesse a aba Faturas e clique em "Recalcular rateio".</p>`;
    return;
  }

  const labels = dados.map(d => areasMapCache[d.area_id] || `Área ${d.area_id}`);
  const values = dados.map(d => Number(d.kwh || 0));
  const cores  = labels.map((_, i) => CORES[i % CORES.length]);

  charts.rateio = new Chart(ctx, {
    type: "doughnut",
    data: { labels, datasets: [{ data: values, backgroundColor: cores, borderColor: "transparent", hoverOffset: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${c.label}: ${fmtKwh(c.parsed)} (${Number(dados[c.dataIndex]?.percentual || 0).toFixed(1)}%)` } }
      }
    }
  });

  if (legend) {
    legend.innerHTML = labels.map((l, i) => `
      <div class="leg-item">
        <span class="leg-swatch" style="background:${cores[i]}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l}</span>
        <span style="font-weight:600">${Number(dados[i]?.percentual || 0).toFixed(1)}%</span>
      </div>`).join("");
  }
}

/* ── Lista de faturas ── */
function renderFaturasList() {
  const el = document.getElementById("faturasList"); if (!el) return;
  const localId = document.getElementById("local")?.value || "";
  const faturas = (localId
    ? faturasCache.filter(f => String(f.local_id) === String(localId))
    : faturasCache
  ).sort((a, b) => b.mes.localeCompare(a.mes));

  if (!faturas.length) {
    el.innerHTML = `<p style="color:var(--muted);font-size:13px">Nenhuma fatura encontrada.</p>`;
    return;
  }

  el.innerHTML = faturas.map(f => {
    const kwh    = Number(f.kwh_total   || 0);
    const custo  = Number(f.valor_total || 0);
    const tarifa = kwh > 0 ? custo / kwh : 0;
    return `
      <div class="fatura-card" data-id="${f.id}" onclick="selecionarFatura(${f.id})">
        <h3>${fmtMes(f.mes)} — ${f.descricao || "Fatura"}</h3>
        <div class="fatura-meta">
          <span>🔋 <strong>${fmtKwh(kwh)}</strong></span>
          <span>💰 <strong>${fmtBRL(custo)}</strong></span>
          <span>📊 <strong>R$ ${fmt(tarifa, 4)}/kWh</strong></span>
        </div>
      </div>`;
  }).join("");
}

async function selecionarFatura(faturaId) {
  faturaAtualId = faturaId;

  // Destaca card selecionado
  document.querySelectorAll(".fatura-card").forEach(c => {
    c.classList.toggle("selected", String(c.dataset.id) === String(faturaId));
  });

  const fatura = faturasCache.find(f => f.id === faturaId);
  const cardDetalhe = document.getElementById("cardDetalheFatura");
  cardDetalhe.style.display = "block";

  document.getElementById("detalheFaturaTitle").textContent = `Fatura: ${fmtMes(fatura?.mes)}`;
  document.getElementById("detalheFaturaDesc").textContent  = fatura?.descricao || "—";

  setStatus("Carregando rateio...", "warn");
  const dados = await carregarRateio(faturaId);
  renderTabelaRateioDetalhe(dados, fatura);
  setStatus("Atualizado agora", "ok");
}

function renderTabelaRateioDetalhe(dados, fatura) {
  const tbody = document.querySelector("#tableRateioDetalhe tbody"); if (!tbody) return;
  tbody.innerHTML = "";

  if (!dados.length || dados.every(d => !d.kwh)) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--muted)">Rateio vazio. Clique em "Recalcular rateio".</td></tr>`;
    document.getElementById("rTotalKwh").textContent   = "—";
    document.getElementById("rTotalValor").textContent = "—";
    return;
  }

  let totalKwh = 0, totalValor = 0;
  dados.forEach(d => {
    const kwh   = Number(d.kwh    || 0);
    const valor = Number(d.valor_rs|| 0);
    const pct   = Number(d.percentual || 0);
    totalKwh   += kwh;
    totalValor += valor;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${areasMapCache[d.area_id] || `Área ${d.area_id}`}</td>
      <td>${fmtKwh(kwh)}</td>
      <td>${fmt(pct, 1)}%</td>
      <td>${fmtBRL(valor)}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById("rTotalKwh").textContent   = fmtKwh(totalKwh);
  document.getElementById("rTotalValor").textContent = fmtBRL(totalValor);
}

/* ── Página Rateio por Área ── */
async function renderRateioAreaPage(faturaId) {
  if (!faturaId && faturasCache.length) faturaId = faturasCache[faturasCache.length - 1].id;
  if (!faturaId) return;

  const dados = await carregarRateio(faturaId);

  // Gráfico
  const ctx = document.getElementById("chartRateioArea"); if (!ctx) return;
  if (charts.rateioArea) { charts.rateioArea.destroy(); charts.rateioArea = null; }

  const legend = document.getElementById("rateioAreaLegend");

  if (!dados.length || dados.every(d => !d.kwh)) {
    if (legend) legend.innerHTML = `<p style="font-size:12px;color:var(--muted)">Rateio ainda não calculado.</p>`;
    return;
  }

  const labels = dados.map(d => areasMapCache[d.area_id] || `Área ${d.area_id}`);
  const values = dados.map(d => Number(d.kwh || 0));
  const cores  = labels.map((_, i) => CORES[i % CORES.length]);

  charts.rateioArea = new Chart(ctx, {
    type: "bar",
    data: { labels, datasets: [{ label: "kWh", data: values, backgroundColor: cores, borderRadius: 6, borderWidth: 0 }] },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: c => ` ${fmtKwh(c.parsed.x)}` } }
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: "rgba(234,240,255,.65)" }, grid: { color: "rgba(255,255,255,.06)" } },
        y: { ticks: { color: "rgba(234,240,255,.75)" }, grid: { display: false } }
      }
    }
  });

  if (legend) {
    legend.innerHTML = labels.map((l, i) => `
      <div class="leg-item">
        <span class="leg-swatch" style="background:${cores[i]}"></span>
        <span style="flex:1">${l}</span>
        <span style="font-weight:600">${Number(dados[i]?.percentual || 0).toFixed(1)}%</span>
      </div>`).join("");
  }

  // Tabela
  const tbody = document.querySelector("#tableRateioArea tbody"); if (!tbody) return;
  tbody.innerHTML = "";
  dados.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${areasMapCache[d.area_id] || `Área ${d.area_id}`}</td>
      <td>${fmtKwh(Number(d.kwh || 0))}</td>
      <td>${fmt(Number(d.percentual || 0), 1)}%</td>
      <td>${fmtBRL(Number(d.valor_rs || 0))}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ── Metas ── */
function renderMetas() {
  const tbody = document.querySelector("#tableMetas tbody"); if (!tbody) return;
  tbody.innerHTML = "";

  if (!metasCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--muted)">Nenhuma meta cadastrada. Use o Swagger para criar.</td></tr>`;
    return;
  }

  metasCache.forEach(m => {
    const baseline = Number(m.kwh_baseline || 0);
    const meta     = Number(m.kwh_meta     || 0);
    const hoje     = new Date();
    const fim      = m.data_fim ? new Date(m.data_fim) : null;
    const status   = !fim ? "Em aberto" : fim >= hoje ? "Ativa" : "Encerrada";
    const statusCls= status === "Ativa" ? "ok" : status === "Encerrada" ? "warn" : "";

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.descricao || "—"}</td>
      <td>${fmtKwh(baseline)}</td>
      <td>${fmtKwh(meta)}</td>
      <td>${m.data_inicio ? new Date(m.data_inicio + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
      <td>${m.data_fim   ? new Date(m.data_fim    + "T12:00:00").toLocaleDateString("pt-BR") : "—"}</td>
      <td><span class="tag ${statusCls}">${status}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // Gráfico de metas
  renderGraficoMetas();
}

function renderGraficoMetas() {
  const ctx = document.getElementById("chartMetas"); if (!ctx) return;
  if (charts.metas) { charts.metas.destroy(); charts.metas = null; }
  if (!metasCache.length) return;

  const labels    = metasCache.map(m => m.descricao || `Meta ${m.id}`);
  const baselines = metasCache.map(m => Number(m.kwh_baseline || 0));
  const metas     = metasCache.map(m => Number(m.kwh_meta     || 0));

  charts.metas = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Baseline (kWh)", data: baselines, backgroundColor: "rgba(56,189,248,0.35)", borderColor: "#38bdf8", borderWidth: 2, borderRadius: 4 },
        { label: "Meta (kWh)",     data: metas,     backgroundColor: "rgba(34,197,94,0.35)",  borderColor: "#22c55e", borderWidth: 2, borderRadius: 4 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: true, labels: { color: "rgba(234,240,255,.8)", boxWidth: 12 } },
        tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${fmtKwh(c.parsed.y)}` } }
      },
      scales: {
        x: { ticks: { color: "rgba(234,240,255,.65)" }, grid: { color: "rgba(255,255,255,.06)" } },
        y: { beginAtZero: true, ticks: { color: "rgba(234,240,255,.65)" }, grid: { color: "rgba(255,255,255,.06)" } }
      }
    }
  });
}

/* ── Exportação CSV ── */
function exportarCSV() {
  const localId = document.getElementById("local")?.value || "";
  const faturas = (localId
    ? faturasCache.filter(f => String(f.local_id) === String(localId))
    : faturasCache
  ).sort((a, b) => b.mes.localeCompare(a.mes));

  if (!faturas.length) { alert("Nenhum dado para exportar."); return; }

  const rows = [
    ["Mês", "Descrição", "kWh Total", "Valor Total (R$)", "Tarifa R$/kWh"],
    ...faturas.map(f => {
      const kwh    = Number(f.kwh_total   || 0);
      const custo  = Number(f.valor_total || 0);
      const tarifa = kwh > 0 ? custo / kwh : 0;
      return [fmtMes(f.mes), f.descricao || "—", kwh.toFixed(1), custo.toFixed(2), tarifa.toFixed(4)];
    })
  ];

  exportCsv(`safe-energy-financeiro-${new Date().toISOString().slice(0, 10)}.csv`, rows);
}

/* ── Impressão / relatório ── */
function gerarRelatorio() {
  const localId  = document.getElementById("local")?.value || "";
  const faturas  = (localId
    ? faturasCache.filter(f => String(f.local_id) === String(localId))
    : faturasCache
  ).sort((a, b) => b.mes.localeCompare(a.mes));

  const totalKwh   = faturas.reduce((s, f) => s + Number(f.kwh_total   || 0), 0);
  const totalCusto = faturas.reduce((s, f) => s + Number(f.valor_total || 0), 0);

  const linhas = faturas.map(f => `
    <tr>
      <td>${fmtMes(f.mes)}</td>
      <td>${fmtKwh(Number(f.kwh_total||0))}</td>
      <td>${fmtBRL(Number(f.valor_total||0))}</td>
      <td>R$ ${fmt(Number(f.kwh_total||0) > 0 ? Number(f.valor_total||0)/Number(f.kwh_total||0) : 0, 4)}</td>
    </tr>`).join("");

  const janela = window.open("", "_blank");
  janela.document.write(`<!doctype html><html lang="pt-BR"><head>
    <meta charset="utf-8">
    <title>Safe Energy • Relatório Financeiro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #222; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
      .kpis { display: flex; gap: 20px; margin-bottom: 28px; }
      .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; flex: 1; }
      .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; }
      .kpi-value { font-size: 22px; font-weight: bold; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th { background: #f3f4f6; padding: 10px 12px; text-align: left; border-bottom: 2px solid #ddd; }
      td { padding: 9px 12px; border-bottom: 1px solid #eee; }
      tfoot td { font-weight: bold; background: #f9fafb; border-top: 2px solid #ddd; }
      @media print { body { margin: 20px; } }
    </style>
  </head><body>
    <h1>Safe Energy • Relatório Financeiro</h1>
    <div class="meta">Gerado em: ${new Date().toLocaleString("pt-BR")}</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Consumo total</div><div class="kpi-value">${fmtKwh(totalKwh)}</div></div>
      <div class="kpi"><div class="kpi-label">Custo total</div><div class="kpi-value">${fmtBRL(totalCusto)}</div></div>
      <div class="kpi"><div class="kpi-label">Faturas</div><div class="kpi-value">${faturas.length}</div></div>
      <div class="kpi"><div class="kpi-label">Tarifa média</div><div class="kpi-value">R$ ${fmt(totalKwh > 0 ? totalCusto / totalKwh : 0, 4)}</div></div>
    </div>
    <table>
      <thead><tr><th>Mês</th><th>kWh</th><th>Valor (R$)</th><th>R$/kWh</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="4">Sem dados</td></tr>'}</tbody>
      <tfoot><tr><td>Total</td><td>${fmtKwh(totalKwh)}</td><td>${fmtBRL(totalCusto)}</td><td>—</td></tr></tfoot>
    </table>
    <script>window.onload = () => window.print();<\/script>
  </body></html>`);
  janela.document.close();
}

/* ── Recalcular rateio ── */
async function recalcularRateio() {
  if (!faturaAtualId) return;
  const btn = document.getElementById("btnRecalcular");
  if (btn) { btn.disabled = true; btn.textContent = "Calculando..."; }
  setStatus("Recalculando...", "warn");

  try {
    await apiFetch(`/faturas/${faturaAtualId}/recalcular/`, { method: "POST" });
    delete rateioCache[faturaAtualId]; // limpa cache
    const dados  = await carregarRateio(faturaAtualId);
    const fatura = faturasCache.find(f => f.id === faturaAtualId);
    renderTabelaRateioDetalhe(dados, fatura);
    renderRateioVisaoGeral(faturaAtualId);
    showFeedback("Rateio recalculado com sucesso!", "info");
    setStatus("Atualizado agora", "ok");
  } catch (e) {
    showFeedback("Erro ao recalcular: " + e.message, "error");
    setStatus("Erro", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = "↺ Recalcular rateio"; }
  }
}

/* ── Baixar PDF ── */
function baixarPdf() {
  if (!faturaAtualId) return;
  window.open(`${API}/relatorios/rateio/${faturaAtualId}/`, "_blank");
}

/* ── Eventos ── */
document.getElementById("local")?.addEventListener("change", () => {
  preencherAreas(document.getElementById("local").value);
  renderKPIs();
  renderGraficoEvolucao();
  renderTabelaResumo();
  renderFaturasList();
});

document.getElementById("area")?.addEventListener("change", () => {
  // Filtro de área afeta rateio — não faturas diretamente
});

document.getElementById("modoGrafico")?.addEventListener("change", renderGraficoEvolucao);

document.getElementById("selFaturaRateio")?.addEventListener("change", e => {
  renderRateioAreaPage(Number(e.target.value));
});

document.getElementById("btnAplicar")?.addEventListener("click", () => {
  renderKPIs();
  renderGraficoEvolucao();
  renderTabelaResumo();
  renderFaturasList();
});

document.getElementById("btnRefresh")?.addEventListener("click", inicializar);
document.getElementById("btnExportCsv")?.addEventListener("click", exportarCSV);
document.getElementById("btnPrint")?.addEventListener("click", gerarRelatorio);
document.getElementById("btnRecalcular")?.addEventListener("click", recalcularRateio);
document.getElementById("btnBaixarPdf")?.addEventListener("click", baixarPdf);

document.getElementById("btnNovaMetaInfo")?.addEventListener("click", () => {
  window.open(`${API}/docs#/Metas/criar_meta_metas__post`, "_blank");
});

/* ── Navegação: carregar dados da página ao trocar ── */
document.querySelectorAll(".nav-item").forEach(btn => {
  btn.addEventListener("click", () => {
    const page = btn.dataset.page;
    if (page === "rateio") {
      const sel = document.getElementById("selFaturaRateio");
      renderRateioAreaPage(sel ? Number(sel.value) : null);
    }
  });
});

/* ── Boot ── */
(async () => {
  await inicializar();
})();
