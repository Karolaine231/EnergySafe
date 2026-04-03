/* ============================================================
   Safe Energy • Financeiro — financeiro.js
   Integração completa com a API: https://backendsafe.onrender.com
   ============================================================ */

const API = "https://backendsafe.onrender.com";

// ── Referências DOM ──────────────────────────────────────────
const selPeriodo    = document.getElementById("periodo");
const selLocal      = document.getElementById("local");
const selQuadro     = document.getElementById("quadro");
const selCircuito   = document.getElementById("circuito");
const customRange   = document.getElementById("customRange");
const inputFrom     = document.getElementById("dateFrom");
const inputTo       = document.getElementById("dateTo");
const btnAplicar    = document.getElementById("btnAplicar");
const btnExportCsv  = document.getElementById("btnExportCsv");
const btnPrint      = document.getElementById("btnPrint");
const tarifaInput   = document.getElementById("tarifa");

// KPIs
const kpiKwhPeriodo    = document.getElementById("kpiKwhPeriodo");
const kpiKwhPeriodoSub = document.getElementById("kpiKwhPeriodoSub");
const kpiCusto         = document.getElementById("kpiCusto");
const kpiPico          = document.getElementById("kpiPico");
const kpiReducao       = document.getElementById("kpiReducao");

// Tabela
const tbodyResumo = document.querySelector("#tableResumo tbody");
const tTotalKwh   = document.getElementById("tTotalKwh");
const tTotalCost  = document.getElementById("tTotalCost");

// Alertas
const alertsList = document.getElementById("alertsList");

// Status
const statusTag = document.getElementById("statusTag");
const subtitle  = document.getElementById("subtitle");

// ── Estado global ────────────────────────────────────────────
let chartKwh    = null;
let chartRateio = null;

// Dados carregados para exportação
let dadosExport = [];

// ── Utilitários ──────────────────────────────────────────────

/** Formata número pt-BR com casas decimais */
function fmt(n, casas = 2) {
  return Number(n).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/** Formata moeda R$ */
function fmtBRL(n) {
  return "R$ " + fmt(n, 2);
}

/** Retorna { inicio, fim } em ISO 8601 conforme período selecionado */
function getPeriodo() {
  const tipo = selPeriodo.value;
  const agora = new Date();
  let inicio, fim;

  if (tipo === "custom") {
    inicio = new Date(inputFrom.value + "T00:00:00");
    fim    = new Date(inputTo.value   + "T23:59:59");
  } else if (tipo === "7d") {
    fim    = new Date(agora);
    inicio = new Date(agora);
    inicio.setDate(inicio.getDate() - 7);
  } else if (tipo === "mtd") {
    inicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
    fim    = new Date(agora);
  } else {
    // 30d (padrão)
    fim    = new Date(agora);
    inicio = new Date(agora);
    inicio.setDate(inicio.getDate() - 30);
  }

  return {
    inicio: inicio.toISOString(),
    fim:    fim.toISOString(),
  };
}

/** Converte potência (W) para kWh considerando intervalo em horas */
function wattsParaKwh(medicoes) {
  if (!medicoes || medicoes.length < 2) return 0;
  let totalKwh = 0;
  for (let i = 1; i < medicoes.length; i++) {
    const dt = (new Date(medicoes[i].timestamp) - new Date(medicoes[i - 1].timestamp)) / 3_600_000; // horas
    const wMedia = ((medicoes[i].potencia || 0) + (medicoes[i - 1].potencia || 0)) / 2;
    totalKwh += (wMedia / 1000) * dt;
  }
  return totalKwh;
}

/** Agrupa medições por dia (YYYY-MM-DD) → soma kWh */
function agruparPorDia(medicoes) {
  const mapa = {};
  if (!medicoes || medicoes.length < 2) return mapa;

  for (let i = 1; i < medicoes.length; i++) {
    const dt = (new Date(medicoes[i].timestamp) - new Date(medicoes[i - 1].timestamp)) / 3_600_000;
    const wMedia = ((medicoes[i].potencia || 0) + (medicoes[i - 1].potencia || 0)) / 2;
    const kwh = (wMedia / 1000) * dt;
    const dia = medicoes[i].timestamp.slice(0, 10);
    mapa[dia] = (mapa[dia] || 0) + kwh;
  }
  return mapa;
}

/** Mostra/esconde indicador de status */
function setStatus(msg, tipo = "ok") {
  const dot = statusTag.querySelector(".dot");
  dot.style.background = tipo === "ok" ? "#22c55e" : tipo === "warn" ? "#f59e0b" : "#ef4444";
  statusTag.querySelector("span:last-child").textContent = msg;
}

// ── Fetch helpers ────────────────────────────────────────────

async function apiFetch(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`Erro ${res.status} em ${path}`);
  return res.json();
}

// ── Inicialização dos selects ────────────────────────────────

async function carregarLocais() {
  selLocal.innerHTML = '<option value="">Carregando...</option>';
  try {
    const locais = await apiFetch("/locais/");
    selLocal.innerHTML = '<option value="">Todos os locais</option>' +
      locais.map(l => `<option value="${l.id}">${l.nome}</option>`).join("");
  } catch (e) {
    selLocal.innerHTML = '<option value="">Erro ao carregar</option>';
    console.error("carregarLocais:", e);
  }
}

async function carregarQuadros(localId) {
  selQuadro.innerHTML   = '<option value="">Todos os quadros</option>';
  selCircuito.innerHTML = '<option value="">Selecione um quadro</option>';
  if (!localId) return;

  selQuadro.innerHTML = '<option value="">Carregando...</option>';
  try {
    const quadros = await apiFetch(`/quadros?local_id=${localId}`);
    selQuadro.innerHTML = '<option value="">Todos os quadros</option>' +
      quadros.map(q => `<option value="${q.id}">${q.nome || "Quadro " + q.id}</option>`).join("");
  } catch (e) {
    selQuadro.innerHTML = '<option value="">Erro ao carregar</option>';
    console.error("carregarQuadros:", e);
  }
}

async function carregarCanais(quadroId) {
  selCircuito.innerHTML = '<option value="">Todos os circuitos</option>';
  if (!quadroId) return;

  selCircuito.innerHTML = '<option value="">Carregando...</option>';
  try {
    // Busca dispositivos do quadro, depois canais de cada dispositivo
    const dispositivos = await apiFetch(`/dispositivos?quadro_id=${quadroId}`);
    const canaisPromises = dispositivos.map(d => apiFetch(`/canais?dispositivo_id=${d.id}`));
    const canaisArray = await Promise.all(canaisPromises);
    const canais = canaisArray.flat();

    selCircuito.innerHTML = '<option value="">Todos os circuitos</option>' +
      canais.map(c => {
        const label = `Fase ${c.fase || "?"} • ${c.tipo || "canal"} (ID ${c.id})`;
        return `<option value="${c.id}">${label}</option>`;
      }).join("");
  } catch (e) {
    selCircuito.innerHTML = '<option value="">Erro ao carregar</option>';
    console.error("carregarCanais:", e);
  }
}

// ── Carregamento principal de dados ─────────────────────────

async function carregarDados() {
  setStatus("Carregando...", "warn");
  btnAplicar.disabled = true;
  btnAplicar.textContent = "Carregando...";

  const { inicio, fim } = getPeriodo();
  const localId   = selLocal.value;
  const quadroId  = selQuadro.value;
  const canalId   = selCircuito.value;
  const tarifa    = parseFloat(tarifaInput.value) || 0.95;

  // Atualiza subtitle
  const d1 = new Date(inicio).toLocaleDateString("pt-BR");
  const d2 = new Date(fim).toLocaleDateString("pt-BR");
  subtitle.textContent = `${d1} → ${d2}`;

  try {
    // ── 1. Coleta de canais relevantes ───────────────────────
    let canaisIds = [];

    if (canalId) {
      canaisIds = [parseInt(canalId)];
    } else if (quadroId) {
      const dispositivos = await apiFetch(`/dispositivos?quadro_id=${quadroId}`);
      const canaisArr = await Promise.all(dispositivos.map(d => apiFetch(`/canais?dispositivo_id=${d.id}`)));
      canaisIds = canaisArr.flat().map(c => c.id);
    } else if (localId) {
      const quadros = await apiFetch(`/quadros?local_id=${localId}`);
      for (const q of quadros) {
        const dispositivos = await apiFetch(`/dispositivos?quadro_id=${q.id}`);
        const canaisArr = await Promise.all(dispositivos.map(d => apiFetch(`/canais?dispositivo_id=${d.id}`)));
        canaisIds.push(...canaisArr.flat().map(c => c.id));
      }
    } else {
      // Tudo: busca todos locais → quadros → canais
      const locais = await apiFetch("/locais");
      for (const loc of locais) {
        const quadros = await apiFetch(`/quadros?local_id=${loc.id}`);
        for (const q of quadros) {
          const dispositivos = await apiFetch(`/dispositivos?quadro_id=${q.id}`);
          const canaisArr = await Promise.all(dispositivos.map(d => apiFetch(`/canais?dispositivo_id=${d.id}`)));
          canaisIds.push(...canaisArr.flat().map(c => c.id));
        }
      }
    }

    // Remove duplicatas
    canaisIds = [...new Set(canaisIds)];

    if (canaisIds.length === 0) {
      mostrarVazio();
      setStatus("Sem dados", "warn");
      return;
    }

    // ── 2. Busca medições de todos os canais ─────────────────
    const medicoesPorCanal = {};
    await Promise.all(canaisIds.map(async (id) => {
      const url = `/medicoes?canal_id=${id}&inicio=${encodeURIComponent(inicio)}&fim=${encodeURIComponent(fim)}&valido=true`;
      try {
        medicoesPorCanal[id] = await apiFetch(url);
      } catch {
        medicoesPorCanal[id] = [];
      }
    }));

    // ── 3. Busca alertas do período ──────────────────────────
    let alertas = [];
    try {
      // Tenta buscar alertas dos canais relevantes
      const alertasArr = await Promise.all(
        canaisIds.slice(0, 10).map(id => apiFetch(`/alertas?canal_id=${id}&resolvido=false`))
      );
      alertas = alertasArr.flat();
    } catch { /* alertas opcionais */ }

    // ── 4. Processa dados ────────────────────────────────────
    processarEExibir(medicoesPorCanal, alertas, tarifa, inicio, fim, canaisIds);

    setStatus("Atualizado agora", "ok");
  } catch (e) {
    console.error("carregarDados:", e);
    setStatus("Erro ao carregar", "error");
  } finally {
    btnAplicar.disabled = false;
    btnAplicar.textContent = "Aplicar filtros";
  }
}

// ── Processamento e exibição ─────────────────────────────────

function processarEExibir(medicoesPorCanal, alertas, tarifa, inicio, fim, canaisIds) {
  const canais = Object.keys(medicoesPorCanal);
  if (canais.length === 0) { mostrarVazio(); return; }

  // Agrega todas as medições para KPIs globais
  const todasMedicoes = Object.values(medicoesPorCanal).flat();
  todasMedicoes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Pico de potência
  const pico = Math.max(...todasMedicoes.map(m => m.potencia || 0), 0);

  // kWh total (por canal e soma)
  const kwhPorCanal = {};
  let kwhTotal = 0;
  for (const [id, meds] of Object.entries(medicoesPorCanal)) {
    const k = wattsParaKwh(meds);
    kwhPorCanal[id] = k;
    kwhTotal += k;
  }

  const custoTotal = kwhTotal * tarifa;

  // Agrupa por dia (soma de todos canais)
  const kwhPorDiaMapa = {};
  for (const meds of Object.values(medicoesPorCanal)) {
    const agrupado = agruparPorDia(meds);
    for (const [dia, kwh] of Object.entries(agrupado)) {
      kwhPorDiaMapa[dia] = (kwhPorDiaMapa[dia] || 0) + kwh;
    }
  }
  const diasOrdenados = Object.keys(kwhPorDiaMapa).sort();
  const valoresDia    = diasOrdenados.map(d => kwhPorDiaMapa[d]);

  // Indicador de redução (compara primeira vs última metade do período)
  let reducaoText = "—";
  if (diasOrdenados.length >= 4) {
    const meio   = Math.floor(diasOrdenados.length / 2);
    const antes  = valoresDia.slice(0, meio).reduce((a, b) => a + b, 0);
    const depois = valoresDia.slice(meio).reduce((a, b) => a + b, 0);
    if (antes > 0) {
      const diff = ((depois - antes) / antes) * 100;
      reducaoText = (diff <= 0 ? "↓ " : "↑ +") + fmt(Math.abs(diff), 1) + "%";
    }
  }

  // ── Atualiza KPIs ──────────────────────────────────────────
  kpiKwhPeriodo.textContent    = fmt(kwhTotal, 1) + " kWh";
  kpiKwhPeriodoSub.textContent = diasOrdenados.length + " dias analisados";
  kpiCusto.textContent         = fmtBRL(custoTotal);
  kpiPico.textContent          = fmt(pico, 0) + " W";
  kpiReducao.textContent       = reducaoText;

  // ── Gráfico de consumo diário ──────────────────────────────
  const labelsDia = diasOrdenados.map(d => {
    const [, m, dia] = d.split("-");
    return `${dia}/${m}`;
  });

  renderChartKwh(labelsDia, valoresDia, tarifa);

  // ── Rateio por canal ───────────────────────────────────────
  // Tenta nomear canais (usa ID como fallback)
  const labelsRateio = canais.map(id => `Canal ${id}`);
  const valoresRateio = canais.map(id => kwhPorCanal[id]);

  renderChartRateio(labelsRateio, valoresRateio, kwhTotal);

  // ── Tabela resumo ──────────────────────────────────────────
  dadosExport = [];
  tbodyResumo.innerHTML = "";

  canais.forEach((id, i) => {
    const kwh  = kwhPorCanal[id];
    const pct  = kwhTotal > 0 ? (kwh / kwhTotal) * 100 : 0;
    const custo = kwh * tarifa;

    dadosExport.push({ area: labelsRateio[i], kwh, pct, custo });

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${labelsRateio[i]}</td>
      <td>${fmt(kwh, 2)}</td>
      <td>${fmt(pct, 1)}%</td>
      <td>${fmtBRL(custo)}</td>
    `;
    tbodyResumo.appendChild(tr);
  });

  tTotalKwh.textContent  = fmt(kwhTotal, 2);
  tTotalCost.textContent = fmtBRL(custoTotal);

  // ── Alertas ────────────────────────────────────────────────
  renderAlertas(alertas);
}

function mostrarVazio() {
  kpiKwhPeriodo.textContent = "—";
  kpiCusto.textContent      = "—";
  kpiPico.textContent       = "—";
  kpiReducao.textContent    = "—";
  tbodyResumo.innerHTML     = '<tr><td colspan="4" style="text-align:center;color:var(--color-text-tertiary,#888)">Sem dados para o período</td></tr>';
  alertsList.innerHTML      = '<li style="color:var(--color-text-tertiary,#888)">Nenhum alerta encontrado</li>';
  if (chartKwh)    { chartKwh.data.labels = []; chartKwh.data.datasets[0].data = []; chartKwh.update(); }
  if (chartRateio) { chartRateio.data.labels = []; chartRateio.data.datasets[0].data = []; chartRateio.update(); }
}

// ── Chart.js ─────────────────────────────────────────────────

const CORES = [
  "#10b981","#3b82f6","#f59e0b","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#ec4899","#84cc16","#6366f1",
];

function renderChartKwh(labels, valores, tarifa) {
  const ctx = document.getElementById("chartKwh").getContext("2d");

  if (chartKwh) chartKwh.destroy();

  chartKwh = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "kWh",
          data: valores,
          backgroundColor: "rgba(16,185,129,0.25)",
          borderColor: "#10b981",
          borderWidth: 2,
          borderRadius: 4,
          yAxisID: "yKwh",
        },
        {
          label: "Custo (R$)",
          data: valores.map(v => +(v * tarifa).toFixed(2)),
          type: "line",
          borderColor: "#f59e0b",
          backgroundColor: "rgba(245,158,11,0.08)",
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.4,
          yAxisID: "yCusto",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { position: "top" },
        tooltip: {
          callbacks: {
            label: ctx => {
              if (ctx.dataset.yAxisID === "yCusto")
                return " " + fmtBRL(ctx.parsed.y);
              return " " + fmt(ctx.parsed.y, 2) + " kWh";
            },
          },
        },
      },
      scales: {
        yKwh: {
          position: "left",
          title: { display: true, text: "kWh" },
          beginAtZero: true,
        },
        yCusto: {
          position: "right",
          title: { display: true, text: "R$" },
          beginAtZero: true,
          grid: { drawOnChartArea: false },
        },
      },
    },
  });
}

function renderChartRateio(labels, valores, total) {
  const ctx = document.getElementById("chartRateio").getContext("2d");
  if (chartRateio) chartRateio.destroy();

  const cores = labels.map((_, i) => CORES[i % CORES.length]);

  chartRateio = new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: valores,
        backgroundColor: cores,
        borderColor: "transparent",
        hoverOffset: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: "68%",
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => {
              const pct = total > 0 ? ((ctx.parsed / total) * 100).toFixed(1) : 0;
              return ` ${fmt(ctx.parsed, 2)} kWh (${pct}%)`;
            },
          },
        },
      },
    },
  });

  // Legenda customizada
  const legend = document.getElementById("rateioLegend");
  legend.innerHTML = labels.map((l, i) => {
    const pct = total > 0 ? ((valores[i] / total) * 100).toFixed(1) : 0;
    return `
      <div class="leg-item" style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:13px">
        <span style="width:12px;height:12px;border-radius:3px;background:${cores[i]};flex-shrink:0"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${l}</span>
        <span style="font-weight:500">${pct}%</span>
      </div>`;
  }).join("");
}

function renderAlertas(alertas) {
  alertsList.innerHTML = "";

  if (!alertas || alertas.length === 0) {
    alertsList.innerHTML = '<li style="color:var(--color-text-secondary,#666);padding:8px 0">✓ Nenhum alerta ativo no período</li>';
    return;
  }

  const icones = {
    sobrecorrente:      { ico: "⚡", cor: "#ef4444" },
    consumo_fora_horario: { ico: "🌙", cor: "#f59e0b" },
    queda_brusca:       { ico: "📉", cor: "#3b82f6" },
  };

  alertas.slice(0, 20).forEach(a => {
    const info = icones[a.tipo] || { ico: "⚠", cor: "#888" };
    const ts   = a.timestamp ? new Date(a.timestamp).toLocaleString("pt-BR") : "";
    const li   = document.createElement("li");
    li.style.cssText = `display:flex;gap:10px;align-items:flex-start;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06)`;
    li.innerHTML = `
      <span style="font-size:16px;flex-shrink:0">${info.ico}</span>
      <div>
        <div style="font-weight:500;color:${info.cor};font-size:13px">${a.tipo?.replace(/_/g," ") ?? "Alerta"} — Nível: ${a.nivel ?? "?"}</div>
        <div style="font-size:12px;color:#666">Canal ${a.canal_id} • Valor: ${fmt(a.valor ?? 0,1)} • Limite: ${fmt(a.limite ?? 0,1)}</div>
        <div style="font-size:11px;color:#999">${ts}</div>
      </div>`;
    alertsList.appendChild(li);
  });

  if (alertas.length > 20) {
    const mais = document.createElement("li");
    mais.style.cssText = "font-size:12px;color:#888;padding:6px 0";
    mais.textContent = `+ ${alertas.length - 20} alertas adicionais`;
    alertsList.appendChild(mais);
  }
}

// ── Exportação CSV ───────────────────────────────────────────

function exportarCSV() {
  if (dadosExport.length === 0) {
    alert("Nenhum dado para exportar. Aplique os filtros primeiro.");
    return;
  }

  const { inicio, fim } = getPeriodo();
  const linhas = [
    ["Área", "kWh (período)", "% do total", "Custo estimado (R$)"],
    ...dadosExport.map(r => [
      r.area,
      r.kwh.toFixed(3),
      r.pct.toFixed(2) + "%",
      r.custo.toFixed(2),
    ]),
    [],
    ["", "Total:", dadosExport.reduce((s, r) => s + r.kwh, 0).toFixed(3),
          dadosExport.reduce((s, r) => s + r.custo, 0).toFixed(2)],
    [],
    [`Período: ${new Date(inicio).toLocaleDateString("pt-BR")} a ${new Date(fim).toLocaleDateString("pt-BR")}`],
    [`Tarifa: R$ ${tarifaInput.value}/kWh`],
    [`Gerado em: ${new Date().toLocaleString("pt-BR")}`],
  ];

  const csv = linhas.map(l => l.join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `safe-energy-financeiro-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Impressão ────────────────────────────────────────────────

function gerarResumoImpressao() {
  const { inicio, fim } = getPeriodo();
  const tarifa = parseFloat(tarifaInput.value) || 0.95;

  const linhas = dadosExport.map(r => `
    <tr>
      <td>${r.area}</td>
      <td>${fmt(r.kwh, 2)} kWh</td>
      <td>${fmt(r.pct, 1)}%</td>
      <td>${fmtBRL(r.custo)}</td>
    </tr>`).join("");

  const totalKwh  = dadosExport.reduce((s, r) => s + r.kwh, 0);
  const totalCost = dadosExport.reduce((s, r) => s + r.custo, 0);

  const janela = window.open("", "_blank");
  janela.document.write(`<!doctype html><html lang="pt-BR"><head>
    <meta charset="utf-8">
    <title>Safe Energy • Relatório Financeiro</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 40px; color: #222; }
      h1 { font-size: 22px; margin-bottom: 4px; }
      .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
      table { width: 100%; border-collapse: collapse; font-size: 14px; }
      th { background: #f3f4f6; padding: 10px 12px; text-align: left; border-bottom: 2px solid #ddd; }
      td { padding: 9px 12px; border-bottom: 1px solid #eee; }
      tfoot td { font-weight: bold; background: #f9fafb; border-top: 2px solid #ddd; }
      .kpis { display: flex; gap: 20px; margin-bottom: 28px; }
      .kpi { border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px 18px; flex: 1; }
      .kpi-label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .5px; }
      .kpi-value { font-size: 24px; font-weight: bold; margin-top: 4px; }
      @media print { body { margin: 20px; } }
    </style>
  </head><body>
    <h1>Safe Energy • Relatório Financeiro</h1>
    <div class="meta">
      Período: ${new Date(inicio).toLocaleDateString("pt-BR")} a ${new Date(fim).toLocaleDateString("pt-BR")} &nbsp;|&nbsp;
      Tarifa: R$ ${tarifa.toFixed(2)}/kWh &nbsp;|&nbsp;
      Gerado em: ${new Date().toLocaleString("pt-BR")}
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Consumo total</div><div class="kpi-value">${fmt(totalKwh, 1)} kWh</div></div>
      <div class="kpi"><div class="kpi-label">Custo estimado</div><div class="kpi-value">${fmtBRL(totalCost)}</div></div>
      <div class="kpi"><div class="kpi-label">Pico registrado</div><div class="kpi-value">${kpiPico.textContent}</div></div>
      <div class="kpi"><div class="kpi-label">Indicador de redução</div><div class="kpi-value">${kpiReducao.textContent}</div></div>
    </div>
    <table>
      <thead><tr><th>Área</th><th>kWh</th><th>%</th><th>Custo (R$)</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="4">Sem dados</td></tr>'}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td>${fmt(totalKwh, 2)} kWh</td>
          <td>100%</td>
          <td>${fmtBRL(totalCost)}</td>
        </tr>
      </tfoot>
    </table>
    <script>window.onload = () => window.print();<\/script>
  </body></html>`);
  janela.document.close();
}

// ── Eventos ──────────────────────────────────────────────────

selPeriodo.addEventListener("change", () => {
  customRange.style.display = selPeriodo.value === "custom" ? "flex" : "none";
});

selLocal.addEventListener("change", () => {
  carregarQuadros(selLocal.value);
});

selQuadro.addEventListener("change", () => {
  carregarCanais(selQuadro.value);
});

tarifaInput.addEventListener("change", () => {
  // Recalcula custo sem recarregar da API
  const tarifa = parseFloat(tarifaInput.value) || 0.95;
  if (dadosExport.length === 0) return;

  const totalKwh  = dadosExport.reduce((s, r) => s + r.kwh, 0);
  const totalCost = totalKwh * tarifa;

  kpiCusto.textContent   = fmtBRL(totalCost);
  tTotalCost.textContent = fmtBRL(totalCost);

  // Atualiza tabela
  const linhas = tbodyResumo.querySelectorAll("tr");
  dadosExport.forEach((r, i) => {
    r.custo = r.kwh * tarifa;
    if (linhas[i]) linhas[i].cells[3].textContent = fmtBRL(r.custo);
  });

  // Atualiza linha do custo no gráfico de barras
  if (chartKwh) {
    chartKwh.data.datasets[1].data = chartKwh.data.datasets[0].data.map(v => +(v * tarifa).toFixed(2));
    chartKwh.update();
  }
});

btnAplicar.addEventListener("click", carregarDados);
btnExportCsv.addEventListener("click", exportarCSV);
btnPrint.addEventListener("click", gerarResumoImpressao);

// ── Boot ─────────────────────────────────────────────────────

(async () => {
  await carregarLocais();
  await carregarDados();
})();
