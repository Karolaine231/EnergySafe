/* ============================================================
   Safe Energy • Manutenção — FastAPI / PostgreSQL
   Integração com https://backendsafe.onrender.com
   Backend atual:
   /locais
   /quadros?local_id=
   /dispositivos?quadro_id=
   /canais?quadro_id=&dispositivo_id=
   /medicoes?canal_id=&inicio=&fim=&valido=
   /alertas?canal_id=&nivel=&tipo=&resolvido=
   ============================================================ */

const API_BASE = "https://backendsafe.onrender.com";

/* ------------------------------------------------------------
   Configuração de status
------------------------------------------------------------ */
const STATUS_OK_MIN = 5;       // até 5 min sem leitura => ONLINE
const STATUS_ATRASO_MIN = 15;  // até 15 min => ATRASO, acima => OFFLINE

/* ------------------------------------------------------------
   Helpers
------------------------------------------------------------ */
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

async function getJSON(path, params = {}) {
  const response = await fetch(buildUrl(path, params), {
    headers: { "Accept": "application/json" }
  });

  if (!response.ok) {
    throw new Error(`Erro HTTP ${response.status} em ${path}`);
  }

  return await response.json();
}

function formatDt(dt) {
  if (!dt) return "-";

  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatHour(dt) {
  if (!dt) return "-";

  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return "-";

  return d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function minutesAgo(dt) {
  if (!dt) return Infinity;

  const d = new Date(dt);
  if (Number.isNaN(d.getTime())) return Infinity;

  return (Date.now() - d.getTime()) / 60000;
}

function isoMinutesAgo(min) {
  return new Date(Date.now() - min * 60000).toISOString();
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
  if (!btn.dataset.originalText) {
    btn.dataset.originalText = btn.textContent;
  }

  btn.disabled = loading;
  btn.textContent = loading ? textLoading : btn.dataset.originalText;
}

/* ------------------------------------------------------------
   Estado
------------------------------------------------------------ */
let chartW = null;

let locaisCache = [];
let quadrosCache = [];
let dispositivosCache = [];
let canaisCache = [];
let medicoesRecentesCache = [];
let alertasCache = [];
let sensoresCache = [];
let eventosCache = [];

/* ------------------------------------------------------------
   Adaptadores
------------------------------------------------------------ */
function adaptLocal(item) {
  const nome = pick(item, "nome", "name") || "Local";
  const descricao = pick(item, "descricao", "description");
  const andar = item.andar !== undefined && item.andar !== null
    ? ` • Andar ${item.andar}`
    : "";
  const detalhe = descricao ? ` (${descricao})` : "";
  return {
    id: pick(item, "id", "local_id"),
    nome: `${nome}${andar}${detalhe}`
  };
}

function adaptQuadro(item) {
  return {
    id: pick(item, "id", "quadro_id"),
    nome: pick(item, "nome", "name", "descricao") || `Quadro ${pick(item, "id", "quadro_id")}`,
    local_id: pick(item, "local_id", "localId"),
    quadro_pai_id: pick(item, "quadro_pai_id", "quadroPaiId")
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

function adaptCanal(item) {
  return {
    id: pick(item, "id", "canal_id"),
    dispositivo_id: pick(item, "dispositivo_id", "dispositivoId"),
    fase: pick(item, "fase"),
    tipo: pick(item, "tipo"),
    nome:
      pick(item, "nome", "descricao", "label") ||
      `Canal ${pick(item, "id", "canal_id")} • ${pick(item, "fase") || "-"} • ${pick(item, "tipo") || "-"}`,
  };
}

function adaptMedicao(item) {
  return {
    id: pick(item, "id", "medicao_id"),
    canal_id: pick(item, "canal_id", "canalId"),
    corrente: Number(pick(item, "corrente", "current") || 0),
    tensao: Number(pick(item, "tensao", "voltage") || 0),
    potencia: Number(pick(item, "potencia", "potencia_total", "power") || 0),
    valido: Boolean(pick(item, "valido", "valid")),
    timestamp: pick(item, "timestamp", "created_at", "data")
  };
}

function adaptAlerta(item) {
  return {
    id: pick(item, "id", "alerta_id"),
    canal_id: pick(item, "canal_id", "canalId"),
    tipo: pick(item, "tipo", "type") || "alerta",
    nivel: pick(item, "nivel", "severity", "status") || "aviso",
    valor: Number(pick(item, "valor") || 0),
    limite: Number(pick(item, "limite") || 0),
    resolvido: Boolean(pick(item, "resolvido") || false),
    timestamp: pick(item, "timestamp", "created_at", "data")
  };
}

/* ------------------------------------------------------------
   Normalização de dados derivados
------------------------------------------------------------ */
function buildCanalLabel(canal) {
  const disp = dispositivosCache.find(d => String(d.id) === String(canal.dispositivo_id));
  const nomeDisp = disp?.nome || `Dispositivo ${canal.dispositivo_id || "-"}`;
  const fase = canal.fase ? ` • Fase ${canal.fase}` : "";
  const tipo = canal.tipo ? ` • ${canal.tipo}` : "";
  return `${nomeDisp}${fase}${tipo}`;
}

function getLatestMedicaoByCanal(canalId) {
  const lista = medicoesRecentesCache
    .filter(m => String(m.canal_id) === String(canalId))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return lista[0] || null;
}

function getStatusFromTimestamp(timestamp) {
  const diff = minutesAgo(timestamp);

  if (diff <= STATUS_OK_MIN) {
    return { code: "ONLINE", label: "OK", className: "" };
  }

  if (diff <= STATUS_ATRASO_MIN) {
    return { code: "ATRASO", label: "ATRASO", className: "warn" };
  }

  return { code: "OFFLINE", label: "OFFLINE", className: "danger" };
}

function enrichSensoresFromCanais() {
  return canaisCache.map(canal => {
    const ultima = getLatestMedicaoByCanal(canal.id);
    const status = getStatusFromTimestamp(ultima?.timestamp);

    return {
      canal_id: canal.id,
      sensor: buildCanalLabel(canal),
      status_code: status.code,
      status_label: status.label,
      status_class: status.className,
      ultima_leitura: ultima?.timestamp || null,
      potencia_atual: Number(ultima?.potencia || 0),
      corrente_atual: Number(ultima?.corrente || 0),
      tensao_atual: Number(ultima?.tensao || 0),
      valido: ultima?.valido ?? false
    };
  });
}

/* ------------------------------------------------------------
   Carga de selects
------------------------------------------------------------ */
async function carregarLocais() {
  const select = $("local");
  select.innerHTML = `<option value="">Carregando...</option>`;

  const locais = asArray(await getJSON("/locais")).map(adaptLocal);
  locaisCache = locais;

  select.innerHTML = "";

  if (!locais.length) {
    select.innerHTML = `<option value="">Nenhum local encontrado</option>`;
    $("quadro").innerHTML = `<option value="">Sem quadros</option>`;
    $("sensor").innerHTML = `<option value="">Sem canais</option>`;
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
    quadrosCache = [];
    dispositivosCache = [];
    canaisCache = [];
    select.innerHTML = `<option value="">Selecione um local</option>`;
    $("sensor").innerHTML = `<option value="">Selecione um quadro</option>`;
    return;
  }

  const quadros = asArray(await getJSON("/quadros", { local_id: localId })).map(adaptQuadro);
  quadrosCache = quadros;

  select.innerHTML = "";

  if (!quadros.length) {
    dispositivosCache = [];
    canaisCache = [];
    select.innerHTML = `<option value="">Nenhum quadro encontrado</option>`;
    $("sensor").innerHTML = `<option value="">Sem canais</option>`;
    return;
  }

  quadros.forEach(quadro => {
    const option = document.createElement("option");
    option.value = quadro.id;
    option.textContent = quadro.nome;
    select.appendChild(option);
  });

  await carregarDispositivosECanais(select.value);
}

async function carregarDispositivosECanais(quadroId) {
  const sensorSelect = $("sensor");
  sensorSelect.innerHTML = `<option value="">Carregando...</option>`;

  if (!quadroId) {
    dispositivosCache = [];
    canaisCache = [];
    sensorSelect.innerHTML = `<option value="">Selecione um quadro</option>`;
    return;
  }

  const [dispositivosRaw, canaisRaw] = await Promise.all([
    getJSON("/dispositivos", { quadro_id: quadroId }),
    getJSON("/canais", { quadro_id: quadroId })
  ]);

  dispositivosCache = asArray(dispositivosRaw).map(adaptDispositivo);
  canaisCache = asArray(canaisRaw).map(adaptCanal);

  sensorSelect.innerHTML = "";

  if (!canaisCache.length) {
    sensorSelect.innerHTML = `<option value="">Nenhum canal encontrado</option>`;
    return;
  }

  canaisCache.forEach(canal => {
    const option = document.createElement("option");
    option.value = canal.id;
    option.textContent = buildCanalLabel(canal);
    sensorSelect.appendChild(option);
  });
}

/* ------------------------------------------------------------
   Busca de medições e alertas
------------------------------------------------------------ */
async function carregarMedicoesRecentes() {
  medicoesRecentesCache = [];

  if (!canaisCache.length) {
    return [];
  }

  // Busca uma janela recente para inferir status dos canais
  const inicio = isoMinutesAgo(24 * 60); // últimas 24h

  const promises = canaisCache.map(async canal => {
    try {
      const lista = asArray(await getJSON("/medicoes", {
        canal_id: canal.id,
        inicio,
        valido: true
      })).map(adaptMedicao);

      return lista;
    } catch (error) {
      console.warn("Falha ao carregar medições do canal", canal.id, error);
      return [];
    }
  });

  const result = await Promise.all(promises);
  medicoesRecentesCache = result.flat();
  return medicoesRecentesCache;
}

async function carregarAlertasPorEscopo() {
  alertasCache = [];

  if (!canaisCache.length) {
    return [];
  }

  const promises = canaisCache.map(async canal => {
    try {
      const lista = asArray(await getJSON("/alertas", {
        canal_id: canal.id,
        resolvido: false
      })).map(adaptAlerta);

      return lista;
    } catch (error) {
      console.warn("Falha ao carregar alertas do canal", canal.id, error);
      return [];
    }
  });

  const result = await Promise.all(promises);
  alertasCache = result.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return alertasCache;
}

async function carregarHistoricoAlertasPorEscopo() {
  if (!canaisCache.length) {
    return [];
  }

  const tipo = $("eventFilter")?.value || "";

  const promises = canaisCache.map(async canal => {
    try {
      const lista = asArray(await getJSON("/alertas", {
        canal_id: canal.id,
        tipo: tipo || undefined
      })).map(adaptAlerta);

      return lista;
    } catch (error) {
      console.warn("Falha ao carregar histórico de alertas do canal", canal.id, error);
      return [];
    }
  });

  const result = await Promise.all(promises);
  return result.flat().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

/* ------------------------------------------------------------
   KPIs
------------------------------------------------------------ */
async function carregarKPIs() {
  sensoresCache = enrichSensoresFromCanais();

  const online = sensoresCache.filter(s => s.status_code === "ONLINE").length;
  const atraso = sensoresCache.filter(s => s.status_code === "ATRASO").length;
  const offline = sensoresCache.filter(s => s.status_code === "OFFLINE").length;
  const alertasAtivos = alertasCache.length;

  $("kpiOnline").textContent = online;
  $("kpiOffline").textContent = offline;
  $("kpiAtraso").textContent = atraso;
  $("kpiAlerts").textContent = alertasAtivos;
}

/* ------------------------------------------------------------
   Tabela de sensores
------------------------------------------------------------ */
async function carregarTabelaSensores() {
  const tbody = $("tableSensors")?.querySelector("tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (!sensoresCache.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Nenhum canal encontrado para este quadro.</td>
      </tr>
    `;
    return;
  }

  sensoresCache.forEach(sensor => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${sensor.sensor}</td>
      <td><span class="tag ${sensor.status_class}">${sensor.status_label}</span></td>
      <td>${formatDt(sensor.ultima_leitura)}</td>
      <td>${Number(sensor.potencia_atual || 0).toFixed(1)} W</td>
    `;

    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Alertas ativos
------------------------------------------------------------ */
async function carregarAlertas() {
  const ul = $("alertsList");
  if (!ul) return;

  ul.innerHTML = "";

  if (!alertasCache.length) {
    ul.innerHTML = `<li class="alert"><p>Nenhum alerta encontrado.</p></li>`;
    return;
  }

  alertasCache.slice(0, 12).forEach(alerta => {
    const li = document.createElement("li");
    li.className = "alert";

    const canal = canaisCache.find(c => String(c.id) === String(alerta.canal_id));
    const sensorNome = canal ? buildCanalLabel(canal) : `Canal ${alerta.canal_id}`;

    let nivelClass = "";
    const nivel = String(alerta.nivel || "").toLowerCase();

    if (nivel.includes("crit")) nivelClass = "danger";
    else if (nivel.includes("avis")) nivelClass = "warn";

    li.innerHTML = `
      <div class="title">
        <span>${alerta.tipo}</span>
        <span class="tag ${nivelClass}">${alerta.nivel}</span>
      </div>
      <p><strong>${sensorNome}</strong> • Valor: ${alerta.valor || 0} • Limite: ${alerta.limite || 0}</p>
    `;

    ul.appendChild(li);
  });
}

/* ------------------------------------------------------------
   Tabela de eventos
   Observação: o backend atual não tem /eventos.
   Aqui o "log de eventos" é montado a partir do histórico de alertas.
------------------------------------------------------------ */
async function carregarEventos() {
  const tbody = $("tableEvents")?.querySelector("tbody");
  if (!tbody) return;

  const historico = await carregarHistoricoAlertasPorEscopo();
  eventosCache = historico;

  tbody.innerHTML = "";

  if (!historico.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Nenhum evento encontrado.</td>
      </tr>
    `;
    return;
  }

  historico.slice(0, 50).forEach(evento => {
    const canal = canaisCache.find(c => String(c.id) === String(evento.canal_id));
    const sensorNome = canal ? buildCanalLabel(canal) : `Canal ${evento.canal_id}`;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDt(evento.timestamp)}</td>
      <td>${evento.tipo}</td>
      <td>${evento.nivel}</td>
      <td>${sensorNome}</td>
      <td>Valor ${evento.valor || 0} / Limite ${evento.limite || 0}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ------------------------------------------------------------
   Gráfico de potência
------------------------------------------------------------ */
async function carregarGrafico() {
  const canalId = $("sensor")?.value;
  const intervaloMin = Number($("intervalo")?.value || 30);

  if (!canalId) {
    if (chartW) {
      chartW.destroy();
      chartW = null;
    }
    return;
  }

  const inicio = isoMinutesAgo(intervaloMin);

  const medicoes = asArray(await getJSON("/medicoes", {
    canal_id: canalId,
    inicio,
    valido: true
  })).map(adaptMedicao);

  const ordenadas = medicoes.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const labels = ordenadas.map(item => formatHour(item.timestamp));
  const valores = ordenadas.map(item => Number(item.potencia || 0));
  const ctx = $("chartW");

  if (chartW) {
    chartW.destroy();
  }

  chartW = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "Potência (W)",
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
        legend: { display: false }
      },
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

/* ------------------------------------------------------------
   Subtítulo
------------------------------------------------------------ */
function atualizarSubtitulo() {
  const localText = $("local")?.selectedOptions[0]?.textContent || "-";
  const quadroText = $("quadro")?.selectedOptions[0]?.textContent || "-";
  const sensorText = $("sensor")?.selectedOptions[0]?.textContent || "-";

  const subtitle = $("subtitle");
  if (subtitle) {
    subtitle.textContent = `Filtro: ${localText} • ${quadroText} • ${sensorText}`;
  }
}

/* ------------------------------------------------------------
   Fluxo principal
------------------------------------------------------------ */
async function carregarPainelCompleto() {
  hideFeedback();
  atualizarSubtitulo();
  setStatusText("Carregando...", "warn");
  setButtonLoading($("btnAplicar"), true);

  try {
    if (!$("local")?.value || !$("quadro")?.value) {
      sensoresCache = [];
      eventosCache = [];
      medicoesRecentesCache = [];
      alertasCache = [];

      $("kpiOnline").textContent = "0";
      $("kpiOffline").textContent = "0";
      $("kpiAtraso").textContent = "0";
      $("kpiAlerts").textContent = "0";

      const tbodySensors = $("tableSensors")?.querySelector("tbody");
      const tbodyEvents = $("tableEvents")?.querySelector("tbody");
      const alerts = $("alertsList");

      if (tbodySensors) {
        tbodySensors.innerHTML = `
          <tr>
            <td colspan="4">Selecione um local e um quadro.</td>
          </tr>
        `;
      }

      if (tbodyEvents) {
        tbodyEvents.innerHTML = `
          <tr>
            <td colspan="5">Selecione um local e um quadro.</td>
          </tr>
        `;
      }

      if (alerts) {
        alerts.innerHTML = `<li class="alert"><p>Selecione um local e um quadro.</p></li>`;
      }

      if (chartW) {
        chartW.destroy();
        chartW = null;
      }

      setStatusText("Aguardando filtros", "warn");
      return;
    }

    await carregarMedicoesRecentes();
    await carregarAlertasPorEscopo();
    await carregarKPIs();
    await carregarTabelaSensores();
    await carregarAlertas();
    await carregarEventos();
    await carregarGrafico();

    setStatusText("Atualizado agora", "ok");
  } catch (error) {
    console.error("carregarPainelCompleto", error);
    showFeedback("Não foi possível carregar os dados do painel de manutenção.", "error");
    setStatusText("Erro ao carregar", "error");
  } finally {
    setButtonLoading($("btnAplicar"), false);
  }
}

/* ------------------------------------------------------------
   Exportações
------------------------------------------------------------ */
function configurarExportacoes() {
  const btnSensores = $("btnExportSensors");
  const btnEventos = $("btnExportEvents");

  if (btnSensores) {
    btnSensores.addEventListener("click", () => {
      const rows = [["Sensor", "Status", "Ultima Leitura", "Potencia Atual (W)", "Corrente (A)", "Tensao (V)"]];

      sensoresCache.forEach(sensor => {
        rows.push([
          sensor.sensor,
          sensor.status_label,
          formatDt(sensor.ultima_leitura),
          Number(sensor.potencia_atual || 0).toFixed(1),
          Number(sensor.corrente_atual || 0).toFixed(2),
          Number(sensor.tensao_atual || 0).toFixed(2)
        ]);
      });

      exportCsv("sensores_manutencao.csv", rows);
    });
  }

  if (btnEventos) {
    btnEventos.addEventListener("click", () => {
      const rows = [["DataHora", "Tipo", "Severidade", "Canal", "Valor", "Limite", "Resolvido"]];

      eventosCache.forEach(evento => {
        const canal = canaisCache.find(c => String(c.id) === String(evento.canal_id));
        const sensorNome = canal ? buildCanalLabel(canal) : `Canal ${evento.canal_id}`;

        rows.push([
          formatDt(evento.timestamp),
          evento.tipo,
          evento.nivel,
          sensorNome,
          evento.valor,
          evento.limite,
          evento.resolvido ? "Sim" : "Nao"
        ]);
      });

      exportCsv("eventos_manutencao.csv", rows);
    });
  }
}

/* ------------------------------------------------------------
   Eventos de UI
------------------------------------------------------------ */
function configurarEventosUI() {
  $("local")?.addEventListener("change", async (e) => {
    await carregarQuadros(e.target.value);
    atualizarSubtitulo();
    await carregarPainelCompleto();
  });

  $("quadro")?.addEventListener("change", async (e) => {
    await carregarDispositivosECanais(e.target.value);
    atualizarSubtitulo();
    await carregarPainelCompleto();
  });

  $("sensor")?.addEventListener("change", async () => {
    atualizarSubtitulo();
    await carregarGrafico();
  });

  $("eventFilter")?.addEventListener("change", async () => {
    await carregarEventos();
  });

  $("intervalo")?.addEventListener("change", async () => {
    await carregarGrafico();
  });

  $("btnAplicar")?.addEventListener("click", async () => {
    await carregarPainelCompleto();
  });

  $("btnRefresh")?.addEventListener("click", async () => {
    await carregarPainelCompleto();
  });
}

/* ------------------------------------------------------------
   Boot
------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    setStatusText("Inicializando...", "warn");
    await carregarLocais();
    configurarEventosUI();
    configurarExportacoes();
    await carregarPainelCompleto();
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel de manutenção.");
    setStatusText("Erro na inicialização", "error");
  }
});
