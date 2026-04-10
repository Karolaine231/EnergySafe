const API_BASE = "https://backendsafe.onrender.com";

function $(id) {
  return document.getElementById(id);
}

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) {
      return obj[key];
    }
  }
  return null;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function buildUrl(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, value);
    }
  });
  return url.toString();
}

async function getJSON(path, params = {}, retries = 2) {
  const url = buildUrl(path, params);

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status} em ${path}: ${text}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeout);
      if (attempt === retries) throw error;
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

function normalizeTimestamp(dt) {
  if (!dt) return null;
  if (typeof dt !== "string") return dt;
  if (dt.includes(" ") && !dt.includes("T")) return dt.replace(" ", "T");
  return dt;
}

function formatDt(dt) {
  if (!dt) return "-";
  const d = new Date(normalizeTimestamp(dt));
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateBR(dt) {
  if (!dt) return "-";
  const d = new Date(`${dt}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dt;
  return d.toLocaleDateString("pt-BR");
}

function exportCsv(filename, rows) {
  const csv = rows
    .map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(";"))
    .join("\n");

  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function setStatusText(msg, tipo = "ok") {
  const el = $("statusTag");
  if (!el) return;

  const dot = el.querySelector(".dot");
  const txt = el.querySelector("span:last-child");

  if (dot) {
    if (tipo === "ok") dot.style.background = "#22c55e";
    else if (tipo === "warn") dot.style.background = "#f59e0b";
    else dot.style.background = "#ef4444";
  }

  if (txt) txt.textContent = msg;
}

function showFeedback(msg, tipo = "info") {
  const box = $("feedbackBox");
  if (!box) return;
  box.style.display = "block";
  box.textContent = msg;
  box.className = "feedback " + tipo;
}

function hideFeedback() {
  const box = $("feedbackBox");
  if (!box) return;
  box.style.display = "none";
  box.textContent = "";
  box.className = "feedback";
}

function setButtonLoading(btn, loading, textLoading = "Carregando...") {
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
  btn.disabled = loading;
  btn.textContent = loading ? textLoading : btn.dataset.originalText;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------
   Estado
------------------------------------------------------------ */
let chartW = null;

let locaisCache = [];
let quadrosCache = [];
let dispositivosCache = [];
let consumoCache = [];
let alertasCache = [];
let eventosCache = [];

/* ------------------------------------------------------------
   Adaptadores
------------------------------------------------------------ */
function adaptLocal(item) {
  return {
    id: pick(item, "id", "local_id"),
    nome: pick(item, "nome", "name", "descricao") || "Local"
  };
}

function adaptQuadro(item) {
  return {
    id: pick(item, "id", "quadro_id"),
    nome: pick(item, "nome", "name", "descricao") || `Quadro ${pick(item, "id", "quadro_id")}`,
    local_id: pick(item, "local_id", "localId")
  };
}

function adaptDispositivo(item) {
  return {
    id: pick(item, "id", "dispositivo_id"),
    nome: pick(item, "nome", "name", "descricao") || `Dispositivo ${pick(item, "id", "dispositivo_id")}`,
    quadro_id: pick(item, "quadro_id", "quadroId"),
    ativo: Boolean(pick(item, "ativo", "active", "is_active"))
  };
}

function adaptConsumo(item) {
  return {
    id: pick(item, "id"),
    canal_id: pick(item, "canal_id", "canalId"),
    data: pick(item, "data", "date"),
    kwh: Number(pick(item, "kwh", "consumo_kwh") || 0),
    criado_em: normalizeTimestamp(pick(item, "criado_em", "created_at"))
  };
}

function adaptAlerta(item) {
  return {
    id: pick(item, "id", "alerta_id"),
    canal_id: pick(item, "canal_id", "canalId"),
    tipo: pick(item, "tipo", "type") || "alerta",
    nivel: pick(item, "nivel", "severity", "status") || "aviso",
    mensagem: pick(item, "mensagem", "message", "descricao") || "",
    valor: Number(pick(item, "valor") || 0),
    limite: Number(pick(item, "limite") || 0),
    resolvido: Boolean(pick(item, "resolvido") || false),
    timestamp: normalizeTimestamp(pick(item, "timestamp", "created_at", "data", "criado_em"))
  };
}

/* ------------------------------------------------------------
   Filtros
------------------------------------------------------------ */
async function carregarLocais() {
  const select = $("local");
  if (!select) return;

  select.innerHTML = `<option value="">Carregando...</option>`;
  locaisCache = asArray(await getJSON("/locais")).map(adaptLocal);

  select.innerHTML = `<option value="">Todos os locais</option>`;
  locaisCache.forEach(local => {
    const option = document.createElement("option");
    option.value = local.id;
    option.textContent = local.nome;
    select.appendChild(option);
  });

  await carregarQuadros("");
}

async function carregarQuadros(localId = "") {
  const select = $("quadro");
  if (!select) return;

  select.innerHTML = `<option value="">Carregando...</option>`;

  if (!localId) {
    quadrosCache = [];
    select.innerHTML = `<option value="">Todos os quadros</option>`;
    return;
  }

  quadrosCache = asArray(await getJSON("/quadros", { local_id: localId })).map(adaptQuadro);

  select.innerHTML = `<option value="">Todos os quadros</option>`;
  quadrosCache.forEach(quadro => {
    const option = document.createElement("option");
    option.value = quadro.id;
    option.textContent = quadro.nome;
    select.appendChild(option);
  });
}

async function carregarDispositivos(quadroId = "") {
  const select = $("dispositivo");
  if (!select) return;

  select.innerHTML = `<option value="">Carregando...</option>`;

  if (!quadroId) {
    dispositivosCache = [];
    select.innerHTML = `<option value="">Todos os dispositivos</option>`;
    return;
  }

  dispositivosCache = asArray(await getJSON("/dispositivos", { quadro_id: quadroId })).map(adaptDispositivo);

  select.innerHTML = `<option value="">Todos os dispositivos</option>`;
  dispositivosCache.forEach(dispositivo => {
    const option = document.createElement("option");
    option.value = dispositivo.id;
    option.textContent = dispositivo.nome + (dispositivo.ativo ? "" : " (inativo)");
    select.appendChild(option);
  });
}

/* ------------------------------------------------------------
   Consumo e alertas
------------------------------------------------------------ */
async function carregarConsumo() {
  const dias = Number($("intervalo")?.value || 30);
  const dataIni = daysAgoISO(dias);
  const dataFim = todayISO();

  consumoCache = asArray(await getJSON("/consumo", {
    data_ini: dataIni,
    data_fim: dataFim,
    skip: 0,
    limit: 500
  })).map(adaptConsumo);

  return consumoCache;
}

async function carregarAlertasAPI() {
  alertasCache = asArray(await getJSON("/alertas", {
    skip: 0,
    limit: 100
  }))
    .map(adaptAlerta)
    .sort((a, b) => new Date(normalizeTimestamp(b.timestamp)) - new Date(normalizeTimestamp(a.timestamp)));

  return alertasCache;
}

function getConsumoAgrupadoPorData() {
  const bucket = new Map();

  consumoCache.forEach(item => {
    const atual = bucket.get(item.data) || 0;
    bucket.set(item.data, atual + Number(item.kwh || 0));
  });

  return Array.from(bucket.entries())
    .map(([data, kwh]) => ({ data, kwh }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/* ------------------------------------------------------------
   KPIs e tabela
------------------------------------------------------------ */
function carregarKPIsETabela() {
  const dispositivoId = $("dispositivo")?.value || "";
  const dispositivo = dispositivosCache.find(d => String(d.id) === String(dispositivoId));
  const agrupado = getConsumoAgrupadoPorData();
  const ultimo = agrupado[agrupado.length - 1] || null;
  const alertasAtivos = alertasCache.filter(a => !a.resolvido).length;

  $("kpiOnline").textContent = dispositivo && ultimo ? "1" : "0";
  $("kpiOffline").textContent = dispositivo && !ultimo ? "1" : "0";
  $("kpiAtraso").textContent = dispositivo ? "1" : "0";
  $("kpiAlerts").textContent = String(alertasAtivos);

  const tbody = $("tableSensors")?.querySelector("tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!dispositivo) {
    tbody.innerHTML = `<tr><td colspan="4">Selecione um dispositivo.</td></tr>`;
    return;
  }

  tbody.innerHTML = `
    <tr>
      <td>${dispositivo.nome}</td>
      <td><span class="tag warn">VISÃO GERAL</span></td>
      <td>${ultimo ? formatDateBR(ultimo.data) : "-"}</td>
      <td>${ultimo ? Number(ultimo.kwh).toFixed(2) : "0.00"} kWh</td>
    </tr>
  `;
}

/* ------------------------------------------------------------
   Alertas e eventos
------------------------------------------------------------ */
function carregarAlertasUI() {
  const ul = $("alertsList");
  if (!ul) return;

  ul.innerHTML = "";

  const ativos = alertasCache.filter(a => !a.resolvido);

  if (!ativos.length) {
    ul.innerHTML = `<li class="alert"><p>Nenhum alerta encontrado.</p></li>`;
    return;
  }

  ativos.slice(0, 12).forEach(alerta => {
    const li = document.createElement("li");
    li.className = "alert";

    let nivelClass = "";
    const nivel = String(alerta.nivel || "").toLowerCase();
    if (nivel.includes("crit")) nivelClass = "danger";
    else if (nivel.includes("avis")) nivelClass = "warn";

    li.innerHTML = `
      <div class="title">
        <span>${alerta.tipo}</span>
        <span class="tag ${nivelClass}">${alerta.nivel}</span>
      </div>
      <p>${alerta.mensagem || "Sem descrição"}</p>
      <p>Valor: ${alerta.valor} • Limite: ${alerta.limite} • ${formatDt(alerta.timestamp)}</p>
    `;

    ul.appendChild(li);
  });
}

function carregarEventos() {
  const tbody = $("tableEvents")?.querySelector("tbody");
  if (!tbody) return;

  const filtroTipo = $("eventFilter")?.value || "";
  let historico = [...alertasCache];

  if (filtroTipo) {
    historico = historico.filter(a => String(a.tipo) === String(filtroTipo));
  }

  eventosCache = historico;
  tbody.innerHTML = "";

  if (!historico.length) {
    tbody.innerHTML = `<tr><td colspan="5">Nenhum evento encontrado.</td></tr>`;
    return;
  }

  const nomeDispositivo = $("dispositivo")?.selectedOptions?.[0]?.textContent || "-";

  historico.slice(0, 50).forEach(evento => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDt(evento.timestamp)}</td>
      <td>${evento.tipo}</td>
      <td>${evento.nivel}</td>
      <td>${nomeDispositivo}</td>
      <td>${evento.mensagem || `Valor ${evento.valor || 0} / Limite ${evento.limite || 0}`}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Gráfico
------------------------------------------------------------ */
function carregarGrafico() {
  const ctx = $("chartW");
  if (!ctx) return;

  const agrupado = getConsumoAgrupadoPorData();

  if (!agrupado.length) {
    if (chartW) {
      chartW.destroy();
      chartW = null;
    }
    return;
  }

  const labels = agrupado.map(item => formatDateBR(item.data));
  const valores = agrupado.map(item => Number(item.kwh || 0));

  if (chartW) chartW.destroy();

  chartW = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Consumo diário (kWh)",
        data: valores,
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "rgba(234,240,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "rgba(234,240,255,0.65)" },
          grid: { color: "rgba(255,255,255,0.06)" }
        }
      }
    }
  });
}

/* ------------------------------------------------------------
   UI
------------------------------------------------------------ */
function atualizarSubtitulo() {
  const localText = $("local")?.selectedOptions?.[0]?.textContent || "-";
  const quadroText = $("quadro")?.selectedOptions?.[0]?.textContent || "-";
  const dispositivoText = $("dispositivo")?.selectedOptions?.[0]?.textContent || "-";

  $("subtitle").textContent = `Filtro: ${localText} • ${quadroText} • ${dispositivoText}`;
}

async function carregarPainelCompleto() {
  hideFeedback();
  atualizarSubtitulo();
  setStatusText("Carregando...", "warn");
  setButtonLoading($("btnAplicar"), true);

  try {
    const dispositivoId = $("dispositivo")?.value || "";

    if (!dispositivoId) {
      consumoCache = [];
      alertasCache = [];
      eventosCache = [];
      carregarKPIsETabela();
      carregarGrafico();
      carregarEventos();
      carregarAlertasUI();
      setStatusText("Selecione um dispositivo", "warn");
      return;
    }

    showFeedback(
      "Exibindo visão geral baseada nos endpoints disponíveis da API. O gráfico usa o consumo diário retornado por /consumo.",
      "info"
    );

    await Promise.all([carregarConsumo(), carregarAlertasAPI()]);
    carregarKPIsETabela();
    carregarGrafico();
    carregarAlertasUI();
    carregarEventos();

    setStatusText("Atualizado agora", "ok");
  } catch (error) {
    console.error(error);
    showFeedback(`Não foi possível carregar os dados do painel: ${error.message}`, "error");
    setStatusText("Erro ao carregar", "error");
  } finally {
    setButtonLoading($("btnAplicar"), false);
  }
}

function configurarExportacoes() {
  $("btnExportSensors")?.addEventListener("click", () => {
    const dispositivo = $("dispositivo")?.selectedOptions?.[0]?.textContent || "-";
    const agrupado = getConsumoAgrupadoPorData();

    const rows = [["Dispositivo", "Data", "Consumo (kWh)"]];
    agrupado.forEach(item => {
      rows.push([dispositivo, formatDateBR(item.data), Number(item.kwh || 0).toFixed(2)]);
    });

    exportCsv("dispositivo_consumo.csv", rows);
  });

  $("btnExportEvents")?.addEventListener("click", () => {
    const dispositivo = $("dispositivo")?.selectedOptions?.[0]?.textContent || "-";

    const rows = [["DataHora", "Tipo", "Severidade", "Dispositivo", "Descricao"]];
    eventosCache.forEach(evento => {
      rows.push([
        formatDt(evento.timestamp),
        evento.tipo || "—",
        evento.nivel || "—",
        dispositivo,
        evento.mensagem || "—"
      ]);
    });

    exportCsv("eventos_manutencao.csv", rows);
  });
}

function configurarEventosUI() {
  $("local")?.addEventListener("change", async e => {
    await carregarQuadros(e.target.value || "");

    const quadro = $("quadro");
    const dispositivo = $("dispositivo");

    if (quadro) quadro.value = "";
    if (dispositivo) {
      dispositivo.innerHTML = `<option value="">Todos os dispositivos</option>`;
      dispositivo.value = "";
    }

    await carregarPainelCompleto();
  });

  $("quadro")?.addEventListener("change", async e => {
    await carregarDispositivos(e.target.value || "");

    const dispositivo = $("dispositivo");
    if (dispositivo) dispositivo.value = "";

    await carregarPainelCompleto();
  });

  $("dispositivo")?.addEventListener("change", async () => {
    await carregarPainelCompleto();
  });

  $("eventFilter")?.addEventListener("change", async () => {
    carregarEventos();
  });

  $("intervalo")?.addEventListener("change", async () => {
    await carregarConsumo();
    carregarGrafico();
    carregarKPIsETabela();
  });

  $("btnAplicar")?.addEventListener("click", async () => {
    await carregarPainelCompleto();
  });

  $("btnRefresh")?.addEventListener("click", async () => {
    await carregarPainelCompleto();
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    setStatusText("Inicializando...", "warn");
    await carregarLocais();
    configurarEventosUI();
    configurarExportacoes();
    await carregarPainelCompleto();
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel.");
    setStatusText("Erro na inicialização", "error");
  }
});
