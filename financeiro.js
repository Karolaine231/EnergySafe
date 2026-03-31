const API_BASE = "https://backendsafe.onrender.com";

function $(id) {
  return document.getElementById(id);
}

async function getJSON(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status}`);
  }

  return await response.json();
}

function brMoney(v) {
  return Number(v || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
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

let chartKwh = null;
let chartRateio = null;
let resumoCache = [];
let serieCache = [];
let alertasCache = [];

async function carregarLocais() {
  const select = $("local");
  select.innerHTML = `<option value="">Carregando...</option>`;

  const locais = await getJSON(`${API_BASE}/locais.php`);
  select.innerHTML = "";

  if (!locais.length) {
    select.innerHTML = `<option value="">Nenhum local encontrado</option>`;
    $("quadro").innerHTML = `<option value="">Sem dados</option>`;
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
    select.innerHTML = `<option value="">Selecione um local</option>`;
    $("circuito").innerHTML = `<option value="">Selecione um quadro</option>`;
    return;
  }

  const quadros = await getJSON(`${API_BASE}/quadros.php?local_id=${localId}`);
  select.innerHTML = "";

  if (!quadros.length) {
    select.innerHTML = `<option value="">Nenhum quadro encontrado</option>`;
    $("circuito").innerHTML = `<option value="">Sem circuitos</option>`;
    return;
  }

  quadros.forEach(quadro => {
    const option = document.createElement("option");
    option.value = quadro.id;
    option.textContent = quadro.nome;
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

  // Aqui assumimos um endpoint PHP que retorna canais por quadro
  const canais = await getJSON(`${API_BASE}/canais.php?quadro_id=${quadroId}`);
  select.innerHTML = "";

  const optTodos = document.createElement("option");
  optTodos.value = "all";
  optTodos.textContent = "Todos";
  select.appendChild(optTodos);

  canais.forEach(canal => {
    const option = document.createElement("option");
    option.value = canal.id;
    option.textContent = canal.descricao || `${canal.tipo} - Fase ${canal.fase}`;
    select.appendChild(option);
  });
}

function handlePeriodo() {
  const p = $("periodo").value;
  $("customRange").style.display = (p === "custom") ? "grid" : "none";
}

function atualizarSubtitulo() {
  const locText = $("local").selectedOptions[0]?.textContent || "-";
  const qText = $("quadro").selectedOptions[0]?.textContent || "-";
  const cText = $("circuito").selectedOptions[0]?.textContent || "Todos";

  $("subtitle").textContent = `Filtro: ${locText} • ${qText} • ${cText}`;
}

function getPeriodoParams() {
  const periodo = $("periodo").value;

  if (periodo === "custom") {
    return {
      periodo,
      de: $("dateFrom").value || "",
      ate: $("dateTo").value || ""
    };
  }

  return { periodo };
}

function buildQuery(params) {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.append(key, value);
    }
  });

  return search.toString();
}

async function carregarKPIs() {
  const tarifa = Number($("tarifa").value || 0);
  const params = {
    local_id: $("local").value,
    quadro_id: $("quadro").value,
    canal_id: $("circuito").value === "all" ? "" : $("circuito").value,
    ...getPeriodoParams()
  };

  const data = await getJSON(`${API_BASE}/financeiro_kpis.php?${buildQuery(params)}`);

  $("kpiKwhPeriodo").textContent = `${brNumber(data.total_kwh, 1)} kWh`;
  $("kpiKwhPeriodoSub").textContent = `Consolidado do período selecionado`;
  $("kpiCusto").textContent = brMoney(Number(data.total_kwh || 0) * tarifa);
  $("kpiPico").textContent = `${brNumber(data.pico_w, 0)} W`;
  $("kpiReducao").textContent = `${brNumber(data.reducao_pct, 1)}%`;
}

async function carregarSerieConsumo() {
  const params = {
    local_id: $("local").value,
    quadro_id: $("quadro").value,
    canal_id: $("circuito").value === "all" ? "" : $("circuito").value,
    ...getPeriodoParams()
  };

  const data = await getJSON(`${API_BASE}/financeiro_serie.php?${buildQuery(params)}`);
  serieCache = data;

  const labels = data.map(item => item.label);
  const valores = data.map(item => Number(item.kwh || 0));

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
}

async function carregarRateio() {
  const tarifa = Number($("tarifa").value || 0);
  const params = {
    local_id: $("local").value,
    quadro_id: $("quadro").value,
    ...getPeriodoParams()
  };

  const data = await getJSON(`${API_BASE}/financeiro_rateio.php?${buildQuery(params)}`);
  resumoCache = data;

  const labels = data.map(item => item.area);
  const valores = data.map(item => Number(item.kwh || 0));

  if (chartRateio) chartRateio.destroy();

  chartRateio = new Chart($("chartRateio"), {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data: valores,
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

  renderRateioLegend(data);
  renderResumoTable(data, tarifa);
}

function renderRateioLegend(data) {
  const wrap = $("rateioLegend");
  wrap.innerHTML = "";

  const total = data.reduce((acc, item) => acc + Number(item.kwh || 0), 0);

  data.forEach(item => {
    const kwh = Number(item.kwh || 0);
    const pct = total > 0 ? (kwh / total) * 100 : 0;

    const div = document.createElement("div");
    div.className = "legend-item";
    div.innerHTML = `
      <div class="legend-left">
        <span class="swatch"></span>
        <span>${item.area}</span>
      </div>
      <div>
        <strong>${brNumber(kwh, 1)} kWh</strong>
        <span style="color: rgba(234,240,255,0.65); font-size: 12px;"> • ${brNumber(pct, 0)}%</span>
      </div>
    `;
    wrap.appendChild(div);
  });
}

function renderResumoTable(data, tarifa) {
  const tbody = $("tableResumo").querySelector("tbody");
  tbody.innerHTML = "";

  let totalKwh = 0;
  let totalCost = 0;

  data.forEach(item => {
    const kwh = Number(item.kwh || 0);
    totalKwh += kwh;

    const cost = kwh * tarifa;
    totalCost += cost;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${item.area}</td>
      <td>${brNumber(kwh, 1)}</td>
      <td>${brNumber(item.percentual || 0, 1)}%</td>
      <td>${brMoney(cost)}</td>
    `;
    tbody.appendChild(tr);
  });

  $("tTotalKwh").textContent = brNumber(totalKwh, 1);
  $("tTotalCost").textContent = brMoney(totalCost);
}

async function carregarAlertas() {
  const params = {
    local_id: $("local").value,
    quadro_id: $("quadro").value,
    ...getPeriodoParams()
  };

  const data = await getJSON(`${API_BASE}/financeiro_alertas.php?${buildQuery(params)}`);
  alertasCache = data;

  const ul = $("alertsList");
  ul.innerHTML = "";

  if (!data.length) {
    ul.innerHTML = `<li class="alert"><p>Nenhum ponto de atenção encontrado.</p></li>`;
    return;
  }

  data.forEach(alerta => {
    const li = document.createElement("li");
    li.className = "alert";

    let nivelClass = "";
    const nivel = String(alerta.nivel || "").toLowerCase();
    if (nivel === "critico") nivelClass = "danger";
    if (nivel === "aviso") nivelClass = "warn";

    li.innerHTML = `
      <div class="title">
        <span>${alerta.tipo}</span>
        <span class="tag ${nivelClass}">${alerta.nivel}</span>
      </div>
      <p>${alerta.mensagem}</p>
    `;
    ul.appendChild(li);
  });
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

document.addEventListener("DOMContentLoaded", async () => {
  try {
    handlePeriodo();
    await carregarLocais();
    await carregarPainel();

    $("periodo").addEventListener("change", async () => {
      handlePeriodo();
      await carregarPainel();
    });

    $("local").addEventListener("change", async (e) => {
      await carregarQuadros(e.target.value);
      await carregarPainel();
    });

    $("quadro").addEventListener("change", async (e) => {
      await carregarCircuitos(e.target.value);
      await carregarPainel();
    });

    $("circuito").addEventListener("change", async () => {
      await carregarPainel();
    });

    $("btnAplicar").addEventListener("click", async () => {
      await carregarPainel();
    });

    $("tarifa").addEventListener("change", async () => {
      await carregarKPIs();
      await carregarRateio();
    });

    $("dateFrom").addEventListener("change", async () => {
      if ($("periodo").value === "custom") await carregarPainel();
    });

    $("dateTo").addEventListener("change", async () => {
      if ($("periodo").value === "custom") await carregarPainel();
    });

    configurarExportacao();

  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel financeiro.");
  }
});
