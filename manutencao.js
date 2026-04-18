const API_BASE = "https://backendsafe.onrender.com";

const TIPO_LABEL = {
  queda_brusca: "Queda brusca",
  consumo_fora_horario: "Consumo fora do horário",
  sobrecorrente: "Sobrecorrente"
};

const NIVEL_LABEL = {
  critico: "Crítico",
  aviso: "Aviso",
  info: "Informativo"
};

const NIVEL_CLASS = {
  critico: "danger",
  aviso: "warn",
  info: ""
};

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

      if (attempt === retries) {
        throw error;
      }

      await new Promise(resolve => setTimeout(resolve, 1500 * (attempt + 1)));
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
    .map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(";"))
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
  box.className = `feedback-bar ${tipo}`;

  clearTimeout(showFeedback._timer);
  showFeedback._timer = setTimeout(() => {
    hideFeedback();
  }, 3500);
}

function hideFeedback() {
  const box = $("feedbackBox");
  if (!box) return;

  box.style.display = "none";
  box.textContent = "";
  box.className = "feedback-bar";
}

function setButtonLoading(btn, loading, textLoading = "Carregando...") {
  if (!btn) return;

  if (!btn.dataset.originalText) {
    btn.dataset.originalText = btn.textContent;
  }

  btn.disabled = loading;
  btn.textContent = loading ? textLoading : btn.dataset.originalText;
}

function formatTipo(tipo) {
  if (!tipo) return "-";
  return TIPO_LABEL[tipo] || tipo.replaceAll("_", " ").replace(/\b\w/g, l => l.toUpperCase());
}

function formatNivel(nivel) {
  if (!nivel) return "-";
  return NIVEL_LABEL[nivel] || nivel;
}

/* ------------------------------------------------------------
   Estado
------------------------------------------------------------ */
let chartW = null;
let chartMedicoes = null;

let locaisCache = [];
let quadrosCache = [];
let dispositivosCache = [];
let consumoCache = [];
let alertasCache = [];
let eventosCache = [];
let medicoesCache = [];

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
    canal_id: pick(item, "canal_id", "canalId", "sensor_id"),
    data: pick(item, "data", "date"),
    kwh: Number(pick(item, "kwh", "consumo_kwh") || 0)
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

function adaptMedicao(item) {
  return {
    id: pick(item, "id"),
    canal_id: pick(item, "canal_id", "canalId"),
    corrente: Number(pick(item, "corrente") || 0),
    tensao: Number(pick(item, "tensao") || 0),
    potencia: Number(pick(item, "potencia") || 0),
    valido: pick(item, "valido") !== false,
    timestamp: normalizeTimestamp(pick(item, "timestamp", "created_at", "criado_em"))
  };
}

/* ------------------------------------------------------------
   Helpers de período
------------------------------------------------------------ */
function filtrarConsumoPorPeriodo() {
  const diasSelecionados = Number($("intervalo")?.value || 30);

  const ordenados = [...consumoCache]
    .filter(item => item.data)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (!ordenados.length) return [];

  const ultimaData = ordenados[ordenados.length - 1].data;
  const dataFinal = new Date(`${ultimaData}T00:00:00`);
  const dataInicial = new Date(dataFinal);
  dataInicial.setDate(dataFinal.getDate() - (diasSelecionados - 1));
  const dataInicialStr = dataInicial.toISOString().slice(0, 10);

  return ordenados.filter(item => item.data >= dataInicialStr && item.data <= ultimaData);
}

function getConsumoAgrupadoPorData() {
  const filtrados = filtrarConsumoPorPeriodo();
  const bucket = new Map();

  filtrados.forEach(item => {
    const atual = bucket.get(item.data) || 0;
    bucket.set(item.data, atual + Number(item.kwh || 0));
  });

  return Array.from(bucket.entries())
    .map(([data, kwh]) => ({ data, kwh }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

function agruparSeriePorCampo(medicoes, campo) {
  const diasSelecionados = Number($("intervalo")?.value || 30);

  const lista = medicoes
    .map(item => ({
      data: normalizeTimestamp(item.timestamp)?.slice(0, 10),
      valor: Number(item[campo] || 0)
    }))
    .filter(item => item.data)
    .sort((a, b) => a.data.localeCompare(b.data));

  if (!lista.length) return [];

  const ultimaData = lista[lista.length - 1].data;
  const dataFinal = new Date(`${ultimaData}T00:00:00`);
  const dataInicial = new Date(dataFinal);
  dataInicial.setDate(dataFinal.getDate() - (diasSelecionados - 1));
  const dataInicialStr = dataInicial.toISOString().slice(0, 10);

  const bucket = new Map();

  lista
    .filter(item => item.data >= dataInicialStr && item.data <= ultimaData)
    .forEach(item => {
      const atual = bucket.get(item.data) || { soma: 0, qtd: 0 };
      atual.soma += item.valor;
      atual.qtd += 1;
      bucket.set(item.data, atual);
    });

  return Array.from(bucket.entries())
    .map(([data, obj]) => ({
      data,
      valor: obj.qtd ? obj.soma / obj.qtd : 0
    }))
    .sort((a, b) => a.data.localeCompare(b.data));
}

/* ------------------------------------------------------------
   Carregamento de dados
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

async function carregarConsumo() {
  const localId = $("local")?.value || "";
  const quadroId = $("quadro")?.value || "";
  const sensorId = $("dispositivo")?.value || "";

  const params = { skip: 0, limit: 500 };

  if (sensorId) params.sensor_id = sensorId;
  else if (quadroId) params.quadro_id = quadroId;
  else if (localId) params.local_id = localId;

  const raw = await getJSON("/consumo", params);
  const dados = Array.isArray(raw) ? raw : (raw?.dados ?? []);

  consumoCache = dados.map(item => ({
    id: pick(item, "id") ?? null,
    canal_id: pick(item, "sensor_id", "canal_id") ?? null,
    data: pick(item, "data") ?? null,
    kwh: Number(pick(item, "kwh") || 0)
  }));

  return consumoCache;
}

async function carregarAlertasAPI() {
  alertasCache = asArray(await getJSON("/alertas", {
    skip: 0,
    limit: 500
  }))
    .map(adaptAlerta)
    .sort((a, b) => new Date(normalizeTimestamp(b.timestamp)) - new Date(normalizeTimestamp(a.timestamp)));

  return alertasCache;
}

async function carregarMedicoesGerais() {
  medicoesCache = asArray(await getJSON("/medicoes", {
    limit: 500
  })).map(adaptMedicao);

  return medicoesCache;
}

/* ------------------------------------------------------------
   Resolver alerta
------------------------------------------------------------ */
async function resolverAlerta(alertaId, botao = null) {
  try {
    if (botao) {
      botao.disabled = true;
      botao.textContent = "Resolvendo...";
    }

    const response = await fetch(`${API_BASE}/alertas/${alertaId}/resolver`, {
      method: "PATCH",
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Falha ao resolver alerta ${alertaId}: ${text}`);
    }

    showFeedback("Alerta marcado como resolvido com sucesso.", "info");

    await carregarAlertasAPI();
    carregarKPIsETabela();
    carregarAlertasUI();
    carregarEventos();
  } catch (error) {
    console.error(error);
    showFeedback(`Não foi possível resolver o alerta: ${error.message}`, "error");

    if (botao) {
      botao.disabled = false;
      botao.textContent = "Resolver";
    }
  }
}

/* ------------------------------------------------------------
   KPIs e tabela
------------------------------------------------------------ */
function carregarKPIsETabela() {
  const dispositivoId = $("dispositivo")?.value || "";
  const agrupado = getConsumoAgrupadoPorData();
  const ultimo = agrupado[agrupado.length - 1] || null;
  const alertasAtivos = alertasCache.filter(a => !a.resolvido).length;

  const ativos = dispositivosCache.filter(d => d.ativo).length;
  const inativos = dispositivosCache.filter(d => !d.ativo).length;

  if ($("kpiOnline")) $("kpiOnline").textContent = String(ativos);
  if ($("kpiOffline")) $("kpiOffline").textContent = String(inativos);
  if ($("kpiAtraso")) $("kpiAtraso").textContent = String(alertasAtivos);
  if ($("kpiAlerts")) $("kpiAlerts").textContent = String(alertasCache.length);

  const tbody = $("tableSensors")?.querySelector("tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!dispositivosCache.length) {
    tbody.innerHTML = `<tr><td colspan="4">Nenhum dispositivo encontrado.</td></tr>`;
    return;
  }

  let lista = [...dispositivosCache];
  if (dispositivoId) {
    lista = lista.filter(d => String(d.id) === String(dispositivoId));
  }

  const totalPeriodo = agrupado.reduce((soma, item) => soma + item.kwh, 0);

  lista.forEach(dispositivo => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${dispositivo.nome}</td>
      <td><span class="tag ${dispositivo.ativo ? "" : "danger"}">${dispositivo.ativo ? "Ativo" : "Inativo"}</span></td>
      <td>${ultimo ? formatDateBR(ultimo.data) : "-"}</td>
      <td>${totalPeriodo.toFixed(2)} kWh</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Alertas e histórico
------------------------------------------------------------ */
function nomeDispositivoHistorico() {
  const dispositivoId = $("dispositivo")?.value || "";
  if (!dispositivoId) return "Geral";
  return $("dispositivo")?.selectedOptions?.[0]?.textContent || "Dispositivo selecionado";
}

function carregarAlertasUI() {
  const ul = $("alertsList");
  if (!ul) return;

  ul.innerHTML = "";

  const ativos = alertasCache.filter(a => !a.resolvido);

  if (!ativos.length) {
    ul.innerHTML = `<li class="alert-item"><p>Nenhum alerta pendente.</p></li>`;
    return;
  }

  ativos.slice(0, 12).forEach(alerta => {
    const li = document.createElement("li");
    li.className = "alert-item";

    const nivelClass = NIVEL_CLASS[String(alerta.nivel || "").toLowerCase()] || "";

    li.innerHTML = `
      <div class="alert-title">
        <span>${formatTipo(alerta.tipo)}</span>
        <span class="tag ${nivelClass}">${formatNivel(alerta.nivel)}</span>
      </div>
      <p>${alerta.mensagem || "Sem descrição"}</p>
      <p>Valor: ${alerta.valor} • Limite: ${alerta.limite} • ${formatDt(alerta.timestamp)}</p>
      <div class="alert-actions">
        <span class="tag warn">Pendente</span>
        <button class="btn-resolver" data-id="${alerta.id}">Resolver</button>
      </div>
    `;

    ul.appendChild(li);
  });

  ul.querySelectorAll(".btn-resolver").forEach(btn => {
    btn.addEventListener("click", () => {
      resolverAlerta(btn.dataset.id, btn);
    });
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
    tbody.innerHTML = `<tr><td colspan="7">Nenhum evento encontrado.</td></tr>`;
    return;
  }

  const dispositivoLabel = nomeDispositivoHistorico();

  historico.slice(0, 50).forEach(evento => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDt(evento.timestamp)}</td>
      <td>${formatTipo(evento.tipo)}</td>
      <td><span class="tag ${NIVEL_CLASS[evento.nivel] || ""}">${formatNivel(evento.nivel)}</span></td>
      <td>${dispositivoLabel}</td>
      <td>${evento.mensagem || `Valor ${evento.valor || 0} / Limite ${evento.limite || 0}`}</td>
      <td><span class="tag ${evento.resolvido ? "" : "warn"}">${evento.resolvido ? "Resolvido" : "Pendente"}</span></td>
      <td>
        ${
          evento.resolvido
            ? `<span style="opacity:.6">Sem ação</span>`
            : `<button class="btn-resolver" data-id="${evento.id}">Resolver</button>`
        }
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-resolver").forEach(btn => {
    btn.addEventListener("click", () => {
      resolverAlerta(btn.dataset.id, btn);
    });
  });
}

/* ------------------------------------------------------------
   Gráfico principal
------------------------------------------------------------ */
function setChartTexts(title, subtitle, hint) {
  if ($("chartTitle")) $("chartTitle").textContent = title;
  if ($("chartSubtitle")) $("chartSubtitle").textContent = subtitle;
  if ($("chartHint")) $("chartHint").textContent = hint;
}

function destruirGrafico() {
  if (chartW) {
    chartW.destroy();
    chartW = null;
  }
}

function renderGraficoMisto(labels, valores, labelBarra, labelLinha, sufixo = "") {
  const ctx = $("chartW");
  if (!ctx) return;

  destruirGrafico();

  chartW = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: "bar",
          label: labelBarra,
          data: valores,
          borderWidth: 1,
          borderRadius: 4,
          backgroundColor: "rgba(59,130,246,0.35)",
          borderColor: "rgba(59,130,246,0.9)"
        },
        {
          type: "line",
          label: labelLinha,
          data: valores,
          borderColor: "rgba(56,189,248,1)",
          backgroundColor: "rgba(56,189,248,1)",
          borderWidth: 2,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: "rgba(56,189,248,1)",
          pointBorderColor: "#ffffff",
          pointBorderWidth: 1.5,
          tension: 0.3,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "rgba(234,240,255,.8)",
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: context => ` ${context.dataset.label}: ${Number(context.parsed.y).toFixed(2)}${sufixo}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "rgba(234,240,255,.65)",
            maxRotation: 45
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
        },
        y: {
          beginAtZero: true,
          ticks: {
            color: "rgba(234,240,255,.65)"
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
        }
      }
    }
  });
}

function renderGraficoConsumoGeral() {
  setChartTexts(
    "Consumo diário geral",
    "Barras com linha e pontos mostrando a evolução diária do consumo.",
    "O gráfico aparece automaticamente ao carregar a página."
  );

  const agrupado = getConsumoAgrupadoPorData();

  if (!agrupado.length) {
    destruirGrafico();
    return;
  }

  renderGraficoMisto(
    agrupado.map(item => formatDateBR(item.data)),
    agrupado.map(item => Number(item.kwh.toFixed(3))),
    "Consumo diário (kWh)",
    "Tendência",
    " kWh"
  );
}

async function renderGraficoTensao() {
  setChartTexts(
    "Consumo de tensão",
    "Média diária das leituras de tensão retornadas pela API.",
    "Visualização diária em barras com linha e pontos."
  );

  const medicoes = medicoesCache.length ? medicoesCache : await carregarMedicoesGerais();
  const serie = agruparSeriePorCampo(medicoes, "tensao");

  if (!serie.length) {
    destruirGrafico();
    return;
  }

  renderGraficoMisto(
    serie.map(item => formatDateBR(item.data)),
    serie.map(item => Number(item.valor.toFixed(2))),
    "Tensão média",
    "Tendência",
    " V"
  );
}

async function renderGraficoCorrente() {
  setChartTexts(
    "Consumo de corrente",
    "Média diária das leituras de corrente retornadas pela API.",
    "Visualização diária em barras com linha e pontos."
  );

  const medicoes = medicoesCache.length ? medicoesCache : await carregarMedicoesGerais();
  const serie = agruparSeriePorCampo(medicoes, "corrente");

  if (!serie.length) {
    destruirGrafico();
    return;
  }

  renderGraficoMisto(
    serie.map(item => formatDateBR(item.data)),
    serie.map(item => Number(item.valor.toFixed(2))),
    "Corrente média",
    "Tendência",
    " A"
  );
}

function renderGraficoConsumoPorDispositivo() {
  const dispositivoId = $("dispositivo")?.value || "";

  setChartTexts(
    "Consumo por dispositivo",
    "Esse gráfico depende de um dispositivo selecionado.",
    "Selecione um dispositivo no filtro para visualizar este modo."
  );

  if (!dispositivoId) {
    destruirGrafico();
    showFeedback("Selecione um dispositivo para visualizar o gráfico de consumo por dispositivo.", "info");
    return;
  }

  const agrupado = getConsumoAgrupadoPorData();

  if (!agrupado.length) {
    destruirGrafico();
    return;
  }

  const nome = $("dispositivo")?.selectedOptions?.[0]?.textContent || "Dispositivo";

  renderGraficoMisto(
    agrupado.map(item => formatDateBR(item.data)),
    agrupado.map(item => Number(item.kwh.toFixed(3))),
    `${nome} (kWh)`,
    "Tendência",
    " kWh"
  );
}

async function carregarGraficoPrincipal() {
  const modo = $("chartMode")?.value || "consumo_geral";

  if (modo === "consumo_geral") {
    renderGraficoConsumoGeral();
    return;
  }

  if (modo === "tensao") {
    await renderGraficoTensao();
    return;
  }

  if (modo === "corrente") {
    await renderGraficoCorrente();
    return;
  }

  if (modo === "consumo_dispositivo") {
    renderGraficoConsumoPorDispositivo();
  }
}

/* ------------------------------------------------------------
   Gráfico de medições
------------------------------------------------------------ */
function renderGraficoMedicoes(modo) {
  if (!medicoesCache.length) return;

  const campo = modo === "corrente" ? "corrente" : "tensao";
  const sufixo = campo === "tensao" ? " V" : " A";
  const serie = agruparSeriePorCampo(medicoesCache, campo);

  const ctx = $("chartMedicoes");
  if (!ctx) return;

  if (chartMedicoes) {
    chartMedicoes.destroy();
    chartMedicoes = null;
  }

  if (!serie.length) return;

  chartMedicoes = new Chart(ctx, {
    data: {
      labels: serie.map(item => new Date(item.data + "T00:00:00").toLocaleDateString("pt-BR")),
      datasets: [
        {
          type: "bar",
          label: campo === "tensao" ? "Tensão média (V)" : "Corrente média (A)",
          data: serie.map(item => +Number(item.valor).toFixed(2)),
          borderWidth: 1,
          borderRadius: 4,
          backgroundColor: "rgba(139,92,246,0.28)",
          borderColor: "rgba(139,92,246,0.88)"
        },
        {
          type: "line",
          label: "Tendência",
          data: serie.map(item => +Number(item.valor).toFixed(2)),
          borderColor: "rgba(56,189,248,1)",
          borderWidth: 2,
          pointRadius: 3,
          tension: 0.3,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          labels: {
            color: "rgba(234,240,255,.8)",
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: context => ` ${context.dataset.label}: ${Number(context.parsed.y).toFixed(2)}${sufixo}`
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "rgba(234,240,255,.65)",
            maxRotation: 45
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
        },
        y: {
          beginAtZero: false,
          ticks: {
            color: "rgba(234,240,255,.65)"
          },
          grid: {
            color: "rgba(255,255,255,.06)"
          }
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
  const dispositivoText = $("dispositivo")?.selectedOptions?.[0]?.textContent || "Todos os dispositivos";

  if ($("subtitle")) {
    $("subtitle").textContent = `Filtro: ${localText} • ${quadroText} • ${dispositivoText}`;
  }
}

async function carregarPainelCompleto() {
  hideFeedback();
  atualizarSubtitulo();
  setStatusText("Carregando...", "warn");
  setButtonLoading($("btnAplicar"), true);
  setButtonLoading($("btnRefresh"), true);

  try {
    const localId = $("local")?.value || "";
    const quadroId = $("quadro")?.value || "";

    await Promise.all([carregarConsumo(), carregarAlertasAPI()]);
    medicoesCache = [];

    carregarKPIsETabela();
    carregarAlertasUI();
    carregarEventos();

    if (consumoCache.length) {
      await carregarGraficoPrincipal();
    } else {
      destruirGrafico();
    }

    if (!localId && !quadroId) {
      showFeedback("Exibindo visão geral de todos os locais.", "info");
    } else if (localId && !quadroId) {
      showFeedback("Exibindo consumo por quadro do local selecionado.", "info");
    } else {
      showFeedback("Exibindo visão geral do quadro. O filtro de dispositivo refina a tabela e o modo 'Consumo por dispositivo'.", "info");
    }

    setStatusText("Atualizado agora", "ok");
  } catch (error) {
    console.error(error);
    showFeedback(`Não foi possível carregar os dados do painel: ${error.message}`, "error");
    setStatusText("Erro ao carregar", "error");
  } finally {
    setButtonLoading($("btnAplicar"), false);
    setButtonLoading($("btnRefresh"), false);
  }
}

function configurarExportacoes() {
  $("btnExportSensors")?.addEventListener("click", () => {
    const agrupado = getConsumoAgrupadoPorData();
    const rows = [["Dispositivo", "Data", "Consumo (kWh)"]];

    const nomeSelecionado = $("dispositivo")?.selectedOptions?.[0]?.textContent || "Todos os dispositivos";

    agrupado.forEach(item => {
      rows.push([
        nomeSelecionado,
        formatDateBR(item.data),
        Number(item.kwh || 0).toFixed(2)
      ]);
    });

    exportCsv("dispositivo_consumo.csv", rows);
  });

  $("btnExportEvents")?.addEventListener("click", () => {
    const rows = [["DataHora", "Tipo", "Severidade", "Dispositivo", "Descricao", "Status"]];

    eventosCache.forEach(evento => {
      rows.push([
        formatDt(evento.timestamp),
        formatTipo(evento.tipo),
        formatNivel(evento.nivel),
        nomeDispositivoHistorico(),
        evento.mensagem || "—",
        evento.resolvido ? "Resolvido" : "Pendente"
      ]);
    });

    exportCsv("eventos_manutencao.csv", rows);
  });
}

function configurarEventosUI() {
  $("local")?.addEventListener("change", async event => {
    await carregarQuadros(event.target.value || "");

    const quadro = $("quadro");
    const dispositivo = $("dispositivo");

    if (quadro) quadro.value = "";
    if (dispositivo) {
      dispositivo.innerHTML = `<option value="">Todos os dispositivos</option>`;
      dispositivo.value = "";
    }

    await carregarPainelCompleto();
  });

  $("quadro")?.addEventListener("change", async event => {
    await carregarDispositivos(event.target.value || "");

    const dispositivo = $("dispositivo");
    if (dispositivo) dispositivo.value = "";

    await carregarPainelCompleto();
  });

  $("dispositivo")?.addEventListener("change", async () => {
    carregarKPIsETabela();
    carregarEventos();
    atualizarSubtitulo();
    await carregarGraficoPrincipal();
  });

  $("eventFilter")?.addEventListener("change", () => {
    carregarEventos();
  });

  $("intervalo")?.addEventListener("change", async () => {
    await carregarConsumo();
    await carregarGraficoPrincipal();
    carregarKPIsETabela();
  });

  $("chartMode")?.addEventListener("change", async () => {
    await carregarGraficoPrincipal();
  });

  $("chartModeMedicoes")?.addEventListener("change", event => {
    renderGraficoMedicoes(event.target.value);
  });

  $("btnAplicar")?.addEventListener("click", async () => {
    await carregarPainelCompleto();
  });

  $("btnRefresh")?.addEventListener("click", async () => {
    await carregarPainelCompleto();
  });
}

/* ------------------------------------------------------------
   Navegação entre páginas
------------------------------------------------------------ */
const pageTitles = {
  consumo: "Consumo",
  medicoes: "Medições",
  alertas: "Alertas",
  dispositivos: "Dispositivos"
};

function abrirSidebar() {
  $("sidenav")?.classList.add("open");
  $("navOverlay")?.classList.add("open");
}

function fecharSidebar() {
  $("sidenav")?.classList.remove("open");
  $("navOverlay")?.classList.remove("open");
}

function navegarPara(pageId) {
  document.querySelectorAll(".page").forEach(page => page.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(button => button.classList.remove("active"));

  const page = document.getElementById("page-" + pageId);
  if (page) page.classList.add("active");

  const btn = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (btn) btn.classList.add("active");

  const title = $("pageTitle");
  if (title) title.textContent = pageTitles[pageId] || pageId;

  fecharSidebar();

  if (pageId === "medicoes") {
    const modo = $("chartModeMedicoes")?.value || "tensao";

    if (!medicoesCache.length) {
      carregarMedicoesGerais().then(() => renderGraficoMedicoes(modo)).catch(console.error);
    } else {
      renderGraficoMedicoes(modo);
    }
  }
}

function configurarNavegacao() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navegarPara(btn.dataset.page));
  });

  $("btnMenu")?.addEventListener("click", abrirSidebar);
  $("navOverlay")?.addEventListener("click", fecharSidebar);
}

/* ------------------------------------------------------------
   Inicialização
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    setStatusText("Inicializando...", "warn");
    configurarNavegacao();
    configurarEventosUI();
    configurarExportacoes();
    await carregarLocais();
    await carregarPainelCompleto();
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel.");
    setStatusText("Erro na inicialização", "error");
  }
});
