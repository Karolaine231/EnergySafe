/* ══════════════════════════════════════
   CONFIGURAÇÃO
══════════════════════════════════════ */
const API_BASE = "https://backendsafe.onrender.com";

// Fases por dispositivo — dispositivo_id 1, 2 e 3
const FASES = ["A", "B", "C"];
const DISPOSITIVOS_IDS = [1, 2, 3];

const TIPO_LABEL = {
  queda_brusca: "Queda brusca",
  consumo_fora_horario: "Consumo fora do horário",
  sobrecorrente: "Sobrecorrente"
};

const NIVEL_LABEL = { critico: "Crítico", aviso: "Aviso", info: "Informativo" };
const NIVEL_CLASS = { critico: "danger", aviso: "warn", info: "" };

const COR_ATIVA    = { bg: "rgba(56,189,248,0.75)",  border: "rgba(56,189,248,1)"  };
const COR_APARENTE = { bg: "rgba(139,92,246,0.75)",  border: "rgba(139,92,246,1)"  };
const COR_REATIVA  = { bg: "rgba(34,197,94,0.75)",   border: "rgba(34,197,94,1)"   };

/* ══════════════════════════════════════
   HELPERS GERAIS
══════════════════════════════════════ */
function $(id) { return document.getElementById(id); }

function pick(obj, ...keys) {
  for (const key of keys) {
    if (obj && obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return null;
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items))   return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.data))    return payload.data;
  return [];
}

function buildUrl(path, params = {}) {
  const url = new URL(API_BASE + path);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
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
      if (!response.ok) throw new Error(`HTTP ${response.status} em ${path}`);
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
  return dt.includes(" ") && !dt.includes("T") ? dt.replace(" ", "T") : dt;
}

function formatDt(dt) {
  if (!dt) return "-";
  const d = new Date(normalizeTimestamp(dt));
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function formatDateBR(dt) {
  if (!dt) return "-";
  const d = new Date(`${dt}T00:00:00`);
  return Number.isNaN(d.getTime()) ? dt : d.toLocaleDateString("pt-BR");
}

function exportCsv(filename, rows) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? "").replaceAll('"','""')}"`).join(";")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function setStatusText(msg, tipo = "ok") {
  const el = $("statusTag"); if (!el) return;
  const dot = el.querySelector(".dot");
  const txt = el.querySelector("span:last-child");
  if (dot) dot.style.background = tipo === "ok" ? "#22c55e" : tipo === "warn" ? "#f59e0b" : "#ef4444";
  if (txt) txt.textContent = msg;
}

function showFeedback(msg, tipo = "info") {
  const box = $("feedbackBox"); if (!box) return;
  box.style.display = "block";
  box.textContent = msg;
  box.className = `feedback-bar ${tipo}`;
  clearTimeout(showFeedback._timer);
  showFeedback._timer = setTimeout(hideFeedback, 3500);
}

function hideFeedback() {
  const box = $("feedbackBox"); if (!box) return;
  box.style.display = "none"; box.textContent = ""; box.className = "feedback-bar";
}

function setButtonLoading(btn, loading, txt = "Carregando...") {
  if (!btn) return;
  if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent;
  btn.disabled = loading;
  btn.textContent = loading ? txt : btn.dataset.originalText;
}

function formatTipo(tipo) {
  if (!tipo) return "-";
  return TIPO_LABEL[tipo] || tipo.replaceAll("_"," ").replace(/\b\w/g, l => l.toUpperCase());
}

function formatNivel(nivel) {
  return NIVEL_LABEL[nivel] || nivel || "-";
}

/* ══════════════════════════════════════
   ESTADO GLOBAL
══════════════════════════════════════ */
let chartW           = null;
let chartMedicoes    = null;
let chartPotencia    = null;
let chartPotTemporal = null;

let locaisCache           = [];
let quadrosCache          = [];
let dispositivosCache     = [];
let todosDispositivosCache = [];
let consumoCache          = [];
let alertasCache          = [];
let eventosCache          = [];
let medicoesCache         = [];

/* ══════════════════════════════════════
   ADAPTADORES
══════════════════════════════════════ */
function adaptLocal(item) {
  return { id: pick(item,"id","local_id"), nome: pick(item,"nome","name","descricao") || "Local" };
}

function adaptQuadro(item) {
  return {
    id: pick(item,"id","quadro_id"),
    nome: pick(item,"nome","name","descricao") || `Quadro ${pick(item,"id","quadro_id")}`,
    local_id: pick(item,"local_id","localId")
  };
}

function adaptDispositivo(item) {
  return {
    id: pick(item,"id","dispositivo_id"),
    nome: pick(item,"nome","name","descricao") || `Dispositivo ${pick(item,"id","dispositivo_id")}`,
    quadro_id: pick(item,"quadro_id","quadroId"),
    ativo: Boolean(pick(item,"ativo","active","is_active"))
  };
}

function adaptConsumo(item) {
  return {
    id: pick(item,"id") ?? null,
    canal_id: pick(item,"sensor_id","canal_id") ?? null,
    data: pick(item,"data") ?? null,
    kwh: Number(pick(item,"kwh") || 0)
  };
}

function adaptAlerta(item) {
  return {
    id: pick(item,"id","alerta_id"),
    canal_id: pick(item,"canal_id","canalId"),
    tipo: pick(item,"tipo","type") || "alerta",
    nivel: pick(item,"nivel","severity","status") || "aviso",
    mensagem: pick(item,"mensagem","message","descricao") || "",
    valor: Number(pick(item,"valor") || 0),
    limite: Number(pick(item,"limite") || 0),
    resolvido: Boolean(pick(item,"resolvido") || false),
    timestamp: normalizeTimestamp(pick(item,"timestamp","created_at","data","criado_em"))
  };
}

function adaptMedicao(item) {
  const potencia        = Number(pick(item,"potencia") || 0);
  let potencia_ativa    = pick(item,"potencia_ativa");
  let potencia_aparente = pick(item,"potencia_aparente");
  const potencia_reativa = pick(item,"potencia_reativa");
  let fator_potencia    = pick(item,"fator_potencia");

  // Fallback: potencia_ativa ← potencia (legado)
  if (potencia_ativa === null && potencia > 0) potencia_ativa = potencia;

  // Fallback: fator_potencia calculado P/S
  if (fator_potencia === null && potencia_ativa && potencia_aparente && potencia_aparente > 0) {
    fator_potencia = Math.min(potencia_ativa / potencia_aparente, 1.0);
  }

  return {
    id: pick(item,"id"),
    canal_id: pick(item,"canal_id","canalId"),
    corrente: Number(pick(item,"corrente") || 0),
    tensao:   Number(pick(item,"tensao") || 0),
    potencia,
    potencia_ativa:    potencia_ativa    !== null ? Number(potencia_ativa)    : null,
    potencia_aparente: potencia_aparente !== null ? Number(potencia_aparente) : null,
    potencia_reativa:  potencia_reativa  !== null ? Number(potencia_reativa)  : null,
    fator_potencia:    fator_potencia    !== null ? Number(fator_potencia)    : null,
    valido: pick(item,"valido") !== false,
    timestamp: normalizeTimestamp(pick(item,"timestamp","created_at","criado_em"))
  };
}

/* ══════════════════════════════════════
   HELPERS DE PERÍODO E AGRUPAMENTO
══════════════════════════════════════ */
function filtrarConsumoPorPeriodo() {
  const dias = Number($("intervalo")?.value || 30);
  const ordenados = [...consumoCache].filter(i => i.data).sort((a,b) => a.data.localeCompare(b.data));
  if (!ordenados.length) return [];
  const ultima = ordenados[ordenados.length - 1].data;
  const fim = new Date(`${ultima}T00:00:00`);
  const ini = new Date(fim); ini.setDate(fim.getDate() - (dias - 1));
  const iniStr = ini.toISOString().slice(0,10);
  return ordenados.filter(i => i.data >= iniStr && i.data <= ultima);
}

function getConsumoAgrupadoPorData() {
  const bucket = new Map();
  filtrarConsumoPorPeriodo().forEach(item => {
    bucket.set(item.data, (bucket.get(item.data) || 0) + Number(item.kwh || 0));
  });
  return Array.from(bucket.entries()).map(([data,kwh]) => ({ data, kwh })).sort((a,b) => a.data.localeCompare(b.data));
}

function agruparSeriePorCampo(medicoes, campo) {
  const dias = Number($("intervalo")?.value || 30);
  const lista = medicoes
    .map(i => ({ data: normalizeTimestamp(i.timestamp)?.slice(0,10), valor: Number(i[campo] || 0) }))
    .filter(i => i.data)
    .sort((a,b) => a.data.localeCompare(b.data));
  if (!lista.length) return [];
  const ultima = lista[lista.length-1].data;
  const fim = new Date(`${ultima}T00:00:00`);
  const ini = new Date(fim); ini.setDate(fim.getDate() - (dias-1));
  const iniStr = ini.toISOString().slice(0,10);
  const bucket = new Map();
  lista.filter(i => i.data >= iniStr && i.data <= ultima).forEach(i => {
    const cur = bucket.get(i.data) || { soma:0, qtd:0 };
    cur.soma += i.valor; cur.qtd++;
    bucket.set(i.data, cur);
  });
  return Array.from(bucket.entries())
    .map(([data,obj]) => ({ data, valor: obj.qtd ? obj.soma/obj.qtd : 0 }))
    .sort((a,b) => a.data.localeCompare(b.data));
}

/* ══════════════════════════════════════
   CARREGAMENTO DE DADOS
══════════════════════════════════════ */
async function carregarLocais() {
  const select = $("local"); if (!select) return;
  select.innerHTML = `<option value="">Carregando...</option>`;
  locaisCache = asArray(await getJSON("/locais/")).map(adaptLocal);
  select.innerHTML = `<option value="">Todos os locais</option>`;
  locaisCache.forEach(l => {
    const o = document.createElement("option");
    o.value = l.id; o.textContent = l.nome;
    select.appendChild(o);
  });
  await carregarQuadros("");
}

async function carregarQuadros(localId = "") {
  const select = $("quadro"); if (!select) return;
  select.innerHTML = `<option value="">Carregando...</option>`;
  if (!localId) {
    quadrosCache = [];
    select.innerHTML = `<option value="">Todos os quadros</option>`;
    return;
  }
  quadrosCache = asArray(await getJSON("/quadros/", { local_id: localId })).map(adaptQuadro);
  select.innerHTML = `<option value="">Todos os quadros</option>`;
  quadrosCache.forEach(q => {
    const o = document.createElement("option");
    o.value = q.id; o.textContent = q.nome;
    select.appendChild(o);
  });
}

async function carregarTodosDispositivos() {
  try {
    todosDispositivosCache = asArray(await getJSON("/dispositivos/", { limit: 500 })).map(adaptDispositivo);
  } catch(e) {
    console.error("Erro ao carregar todos os dispositivos:", e);
  }
}

async function carregarDispositivos(quadroId = "") {
  const select = $("dispositivo"); if (!select) return;
  select.innerHTML = `<option value="">Carregando...</option>`;
  if (!quadroId) {
    dispositivosCache = [];
    select.innerHTML = `<option value="">Todos os dispositivos</option>`;
    return;
  }
  dispositivosCache = asArray(await getJSON("/dispositivos/", { quadro_id: quadroId })).map(adaptDispositivo);
  select.innerHTML = `<option value="">Todos os dispositivos</option>`;
  dispositivosCache.forEach(d => {
    const o = document.createElement("option");
    o.value = d.id; o.textContent = d.nome + (d.ativo ? "" : " (inativo)");
    select.appendChild(o);
  });
}

async function carregarConsumo() {
  const localId  = $("local")?.value  || "";
  const quadroId = $("quadro")?.value || "";
  const sensorId = $("dispositivo")?.value || "";
  const params = { skip:0, limit:500 };
  if (sensorId)      params.sensor_id = sensorId;
  else if (quadroId) params.quadro_id = quadroId;
  else if (localId)  params.local_id  = localId;
  const raw = await getJSON("/consumo/", params);
  const dados = Array.isArray(raw) ? raw : (raw?.dados ?? []);
  consumoCache = dados.map(adaptConsumo);
  return consumoCache;
}

async function carregarAlertasAPI() {
  const dispositivoId = $("dispositivo")?.value || "";
  const params = { limit: 500 };
  if (dispositivoId) params.dispositivo_id = dispositivoId;
  alertasCache = asArray(await getJSON("/alertas/", params))
    .map(adaptAlerta)
    .sort((a,b) => new Date(normalizeTimestamp(b.timestamp)) - new Date(normalizeTimestamp(a.timestamp)));
  return alertasCache;
}

async function carregarMedicoesGerais() {
  medicoesCache = asArray(await getJSON("/medicoes/", { limit:500 })).map(adaptMedicao);
  return medicoesCache;
}

/**
 * Busca medições de um dispositivo filtrando por fase (A, B ou C).
 * GET /medicoes/?dispositivo_id=X&fase=Y&limit=20
 * Retorna apenas registros com algum valor útil.
 */
async function carregarMedicoesPorFase(dispositivoId, fase) {
  const params = { dispositivo_id: dispositivoId, fase, limit: 20 };
  const raw = await getJSON("/medicoes/", params);
  return asArray(raw).map(adaptMedicao).filter(m =>
    m.valido || m.potencia > 0 || m.corrente > 0
  );
}

/**
 * Carrega as 3 fases (A, B, C) do dispositivo selecionado no filtro.
 * Se nenhum dispositivo selecionado, usa o primeiro da lista (dispositivo_id=1).
 * Cada fase é buscada em: GET /medicoes/?dispositivo_id=X&fase=A|B|C
 */
async function carregarDadosPotencia() {
  // Dispositivo selecionado no filtro, ou o primeiro disponível (id=1)
  const dispositivoFiltro = $("dispositivo")?.value || "";
  const dispositivoId = dispositivoFiltro
    ? Number(dispositivoFiltro)
    : (todosDispositivosCache[0]?.id ?? 1);

  // Busca as 3 fases em paralelo para o dispositivo selecionado
  const fases = await Promise.all(
    FASES.map(async fase => {
      try {
        const medicoes = await carregarMedicoesPorFase(dispositivoId, fase);
        return { dispositivo_id: dispositivoId, fase, label: `Fase ${fase}`, medicoes };
      } catch {
        return { dispositivo_id: dispositivoId, fase, label: `Fase ${fase}`, medicoes: [] };
      }
    })
  );

  return fases;
}

/* ══════════════════════════════════════
   RESOLVER ALERTA
══════════════════════════════════════ */
async function resolverAlerta(alertaId, botao = null) {
  try {
    if (botao) { botao.disabled = true; botao.textContent = "Resolvendo..."; }
    const response = await fetch(`${API_BASE}/alertas/${alertaId}/resolver`, {
      method: "PATCH", headers: { Accept: "application/json" }
    });
    if (!response.ok) throw new Error(`Falha ao resolver alerta ${alertaId}`);
    showFeedback("Alerta marcado como resolvido.", "info");
    await carregarAlertasAPI();
    carregarKPIsETabela(); carregarAlertasUI(); carregarEventos();
  } catch (error) {
    console.error(error);
    showFeedback(`Não foi possível resolver: ${error.message}`, "error");
    if (botao) { botao.disabled = false; botao.textContent = "Resolver"; }
  }
}

/* ══════════════════════════════════════
   KPIs E TABELA DE DISPOSITIVOS
══════════════════════════════════════ */
function carregarKPIsETabela() {
  const dispositivoId = $("dispositivo")?.value || "";
  const agrupado = getConsumoAgrupadoPorData();
  const ultimo = agrupado[agrupado.length - 1] || null;
  const alertasAtivos = alertasCache.filter(a => !a.resolvido).length;

  // KPIs sempre usam TODOS os dispositivos do sistema
  const fonteKpi = todosDispositivosCache.length ? todosDispositivosCache : dispositivosCache;
  const ativos   = fonteKpi.filter(d => d.ativo).length;
  const inativos = fonteKpi.filter(d => !d.ativo).length;

  if ($("kpiOnline"))  $("kpiOnline").textContent  = String(ativos);
  if ($("kpiOffline")) $("kpiOffline").textContent = String(inativos);
  if ($("kpiAtraso"))  $("kpiAtraso").textContent  = String(alertasAtivos);
  if ($("kpiAlerts"))  $("kpiAlerts").textContent  = String(alertasCache.length);

  const tbody = $("tableSensors")?.querySelector("tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  // Se nenhum quadro selecionado, usa todos os dispositivos do sistema
  const fonte = dispositivosCache.length ? dispositivosCache : todosDispositivosCache;

  if (!fonte.length) {
    tbody.innerHTML = `<tr><td colspan="4">Nenhum dispositivo encontrado.</td></tr>`;
    return;
  }

  // Filtra por dispositivo se selecionado, senão mostra todos
  let lista = [...fonte];
  if (dispositivoId) lista = lista.filter(d => String(d.id) === String(dispositivoId));

  const totalPeriodo = agrupado.reduce((s,i) => s + i.kwh, 0);

  lista.forEach(d => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.nome}</td>
      <td><span class="tag ${d.ativo ? "" : "danger"}">${d.ativo ? "Ativo" : "Inativo"}</span></td>
      <td>${ultimo ? formatDateBR(ultimo.data) : "-"}</td>
      <td>${totalPeriodo.toFixed(2)} kWh</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ══════════════════════════════════════
   ALERTAS
══════════════════════════════════════ */
function nomeDispositivoHistorico() {
  const dispositivoId = $("dispositivo")?.value || "";
  if (!dispositivoId) return "Geral";
  return $("dispositivo")?.selectedOptions?.[0]?.textContent || "Dispositivo selecionado";
}

function carregarAlertasUI() {
  const ul = $("alertsList"); if (!ul) return;
  ul.innerHTML = "";
  const ativos = alertasCache.filter(a => !a.resolvido);
  if (!ativos.length) {
    ul.innerHTML = `<li class="alert-item"><p>Nenhum alerta pendente.</p></li>`;
    return;
  }
  ativos.slice(0,12).forEach(alerta => {
    const li = document.createElement("li");
    li.className = "alert-item";
    const nivelClass = NIVEL_CLASS[String(alerta.nivel||"").toLowerCase()] || "";
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
    btn.addEventListener("click", () => resolverAlerta(btn.dataset.id, btn));
  });
}

function carregarEventos() {
  const tbody = $("tableEvents")?.querySelector("tbody"); if (!tbody) return;
  const filtroTipo = $("eventFilter")?.value || "";
  let historico = [...alertasCache];
  if (filtroTipo) historico = historico.filter(a => String(a.tipo) === String(filtroTipo));
  eventosCache = historico;
  tbody.innerHTML = "";
  if (!historico.length) {
    tbody.innerHTML = `<tr><td colspan="7">Nenhum evento encontrado.</td></tr>`;
    return;
  }
  const dispLabel = nomeDispositivoHistorico();
  historico.slice(0,50).forEach(evento => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDt(evento.timestamp)}</td>
      <td>${formatTipo(evento.tipo)}</td>
      <td><span class="tag ${NIVEL_CLASS[evento.nivel]||""}">${formatNivel(evento.nivel)}</span></td>
      <td>${dispLabel}</td>
      <td>${evento.mensagem || `Valor ${evento.valor||0} / Limite ${evento.limite||0}`}</td>
      <td><span class="tag ${evento.resolvido ? "" : "warn"}">${evento.resolvido ? "Resolvido" : "Pendente"}</span></td>
      <td>${evento.resolvido
        ? `<span class="sem-acao">Sem ação</span>`
        : `<button class="btn-resolver" data-id="${evento.id}">Resolver</button>`
      }</td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll(".btn-resolver").forEach(btn => {
    btn.addEventListener("click", () => resolverAlerta(btn.dataset.id, btn));
  });
}

/* ══════════════════════════════════════
   GRÁFICO PRINCIPAL (CONSUMO)
══════════════════════════════════════ */
function setChartTexts(title, subtitle, hint) {
  if ($("chartTitle"))    $("chartTitle").textContent    = title;
  if ($("chartSubtitle")) $("chartSubtitle").textContent = subtitle;
  if ($("chartHint"))     $("chartHint").textContent     = hint;
}

function destruirGrafico() {
  if (chartW) { chartW.destroy(); chartW = null; }
}

function renderGraficoMisto(labels, valores, labelBarra, labelLinha, sufixo = "") {
  const ctx = $("chartW"); if (!ctx) return;
  destruirGrafico();
  chartW = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type:"bar", label:labelBarra, data:valores,
          borderWidth:1, borderRadius:4,
          backgroundColor:"rgba(59,130,246,0.35)", borderColor:"rgba(59,130,246,0.9)"
        },
        {
          type:"line", label:labelLinha, data:valores,
          borderColor:"rgba(56,189,248,1)", backgroundColor:"rgba(56,189,248,1)",
          borderWidth:2, pointRadius:4, pointHoverRadius:6,
          pointBackgroundColor:"rgba(56,189,248,1)", pointBorderColor:"#ffffff",
          pointBorderWidth:1.5, tension:0.3, fill:false
        }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, labels:{ color:"rgba(234,240,255,.8)", boxWidth:12 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)}${sufixo}` } }
      },
      scales: {
        x: { ticks:{ color:"rgba(234,240,255,.65)", maxRotation:50, minRotation:50, autoSkip:false }, grid:{ color:"rgba(255,255,255,.06)" } },
        y: { beginAtZero:true, ticks:{ color:"rgba(234,240,255,.65)" }, grid:{ color:"rgba(255,255,255,.06)" } }
      }
    }
  });
}

function renderGraficoConsumoGeral() {
  setChartTexts("Consumo diário geral","Barras com linha mostrando a evolução diária.","Atualizado conforme os filtros.");
  const agrupado = getConsumoAgrupadoPorData();
  if (!agrupado.length) { destruirGrafico(); return; }
  renderGraficoMisto(
    agrupado.map(i => formatDateBR(i.data)),
    agrupado.map(i => Number(i.kwh.toFixed(3))),
    "Consumo diário (kWh)", "Tendência", " kWh"
  );
}

function renderGraficoConsumoPorDispositivo() {
  const dispositivoId = $("dispositivo")?.value || "";
  setChartTexts("Consumo por dispositivo","Selecione um dispositivo no filtro.","Selecione um dispositivo para visualizar.");
  if (!dispositivoId) { destruirGrafico(); showFeedback("Selecione um dispositivo para este modo.","info"); return; }
  const agrupado = getConsumoAgrupadoPorData();
  if (!agrupado.length) { destruirGrafico(); return; }
  const nome = $("dispositivo")?.selectedOptions?.[0]?.textContent || "Dispositivo";
  renderGraficoMisto(
    agrupado.map(i => formatDateBR(i.data)),
    agrupado.map(i => Number(i.kwh.toFixed(3))),
    `${nome} (kWh)`, "Tendência", " kWh"
  );
}

async function carregarGraficoPrincipal() {
  const modo = $("chartMode")?.value || "consumo_geral";
  if (modo === "consumo_geral") renderGraficoConsumoGeral();
  else renderGraficoConsumoPorDispositivo();
}

/* ══════════════════════════════════════
   GRÁFICO MEDIÇÕES (tensão/corrente)
══════════════════════════════════════ */
function renderGraficoMedicoes(modo) {
  if (!medicoesCache.length) return;
  const campo = modo === "corrente" ? "corrente" : "tensao";
  const sufixo = campo === "tensao" ? " V" : " A";
  const serie = agruparSeriePorCampo(medicoesCache, campo);
  const ctx = $("chartMedicoes"); if (!ctx) return;
  if (chartMedicoes) { chartMedicoes.destroy(); chartMedicoes = null; }
  if (!serie.length) return;
  chartMedicoes = new Chart(ctx, {
    data: {
      labels: serie.map(i => new Date(i.data+"T00:00:00").toLocaleDateString("pt-BR")),
      datasets: [
        {
          type:"bar", label: campo === "tensao" ? "Tensão média (V)" : "Corrente média (A)",
          data: serie.map(i => +Number(i.valor).toFixed(2)),
          borderWidth:1, borderRadius:4,
          backgroundColor:"rgba(139,92,246,0.28)", borderColor:"rgba(139,92,246,0.88)"
        },
        {
          type:"line", label:"Tendência", data: serie.map(i => +Number(i.valor).toFixed(2)),
          borderColor:"rgba(56,189,248,1)", borderWidth:2, pointRadius:3, tension:0.3, fill:false
        }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, labels:{ color:"rgba(234,240,255,.8)", boxWidth:12, font:{size:11} } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)}${sufixo}` } }
      },
      scales: {
        x: { ticks:{ color:"rgba(234,240,255,.65)", maxRotation:45 }, grid:{ color:"rgba(255,255,255,.06)" } },
        y: { beginAtZero:false, ticks:{ color:"rgba(234,240,255,.65)" }, grid:{ color:"rgba(255,255,255,.06)" } }
      }
    }
  });
}

/* ══════════════════════════════════════
   PÁGINA DE POTÊNCIA
══════════════════════════════════════ */
function ultimaMedicaoComPotencia(medicoes) {
  const comPotencia = medicoes.find(m => m.potencia_ativa !== null && m.potencia_ativa > 0);
  if (comPotencia) return comPotencia;
  return medicoes.find(m => m.potencia > 0 || m.corrente > 0) || null;
}

function preencherCardsPotencia(fases) {
  let totalAtiva = 0, totalAparente = 0, totalReativa = 0, someFP = 0, countFP = 0;
  fases.forEach(f => {
    const m = ultimaMedicaoComPotencia(f.medicoes);
    if (!m) return;
    totalAtiva    += m.potencia_ativa    ?? m.potencia ?? 0;
    totalAparente += m.potencia_aparente ?? m.potencia ?? 0;
    totalReativa  += m.potencia_reativa  ?? 0;
    if (m.fator_potencia !== null) { someFP += m.fator_potencia; countFP++; }
  });
  const fpMedio = countFP > 0 ? (someFP / countFP).toFixed(3) : "—";
  if ($("potAtivaTot"))   $("potAtivaTot").innerHTML   = `${totalAtiva.toFixed(0)} <span>W</span>`;
  if ($("potAparenteTot")) $("potAparenteTot").innerHTML = `${totalAparente.toFixed(0)} <span>VA</span>`;
  if ($("potReativaTot")) $("potReativaTot").innerHTML  = `${totalReativa.toFixed(0)} <span>VAr</span>`;
  if ($("fatPotMedio"))   $("fatPotMedio").innerHTML   = `${fpMedio} <span>cos(ϕ)</span>`;
}

function preencherTabelaFases(fases) {
  const tbody = $("tbodyFases"); if (!tbody) return;
  tbody.innerHTML = "";
  if (!fases.length || fases.every(f => !f.medicoes.length)) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:rgba(234,240,255,.45)">Nenhuma medição encontrada. Verifique a conexão dos dispositivos.</td></tr>`;
    return;
  }
  fases.forEach(f => {
    const m = ultimaMedicaoComPotencia(f.medicoes);
    const tr = document.createElement("tr");
    if (!m) {
      tr.innerHTML = `<td><strong>${f.label}</strong></td><td colspan="7" style="color:rgba(234,240,255,.45)">Sem dados recentes</td>`;
    } else {
      const ativa    = m.potencia_ativa    ?? m.potencia ?? 0;
      const aparente = m.potencia_aparente ?? m.potencia ?? 0;
      const reativa  = m.potencia_reativa  ?? 0;
      const fp       = m.fator_potencia    !== null ? m.fator_potencia.toFixed(3) : "—";
      tr.innerHTML = `
        <td><strong>${f.label}</strong></td>
        <td>${m.corrente.toFixed(2)} A</td>
        <td>${m.tensao.toFixed(1)} V</td>
        <td style="color:rgba(56,189,248,1)">${ativa.toFixed(0)} W</td>
        <td style="color:rgba(139,92,246,1)">${aparente.toFixed(0)} VA</td>
        <td style="color:rgba(34,197,94,1)">${reativa.toFixed(0)} VAr</td>
        <td>${fp}</td>
        <td style="font-size:11px;color:rgba(234,240,255,.50)">${formatDt(m.timestamp)}</td>
      `;
    }
    tbody.appendChild(tr);
  });
}

function renderGraficoBarrasFases(fases) {
  const ctx = $("chartPotencia"); if (!ctx) return;
  if (chartPotencia) { chartPotencia.destroy(); chartPotencia = null; }
  const labels = fases.map(f => f.label);
  const dadosAtiva    = fases.map(f => { const m = ultimaMedicaoComPotencia(f.medicoes); return m ? (m.potencia_ativa ?? m.potencia ?? 0) : 0; });
  const dadosAparente = fases.map(f => { const m = ultimaMedicaoComPotencia(f.medicoes); return m ? (m.potencia_aparente ?? m.potencia ?? 0) : 0; });
  const dadosReativa  = fases.map(f => { const m = ultimaMedicaoComPotencia(f.medicoes); return m ? (m.potencia_reativa ?? 0) : 0; });
  chartPotencia = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label:"Ativa (W)",      data:dadosAtiva,    backgroundColor:COR_ATIVA.bg,    borderColor:COR_ATIVA.border,    borderWidth:1, borderRadius:6 },
        { label:"Aparente (VA)",  data:dadosAparente, backgroundColor:COR_APARENTE.bg, borderColor:COR_APARENTE.border, borderWidth:1, borderRadius:6 },
        { label:"Reativa (VAr)",  data:dadosReativa,  backgroundColor:COR_REATIVA.bg,  borderColor:COR_REATIVA.border,  borderWidth:1, borderRadius:6 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, labels:{ color:"rgba(234,240,255,.85)", boxWidth:14, font:{size:12} } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(0)}` } }
      },
      scales: {
        x: { ticks:{ color:"rgba(234,240,255,.70)", font:{size:13, weight:"600"} }, grid:{ color:"rgba(255,255,255,.05)" } },
        y: { beginAtZero:true, ticks:{ color:"rgba(234,240,255,.65)" }, grid:{ color:"rgba(255,255,255,.06)" } }
      }
    }
  });
}

function renderGraficoTemporalPotencia(fases) {
  const ctx = $("chartPotTemporal"); if (!ctx) return;
  if (chartPotTemporal) { chartPotTemporal.destroy(); chartPotTemporal = null; }
  const campo = $("chartModePotencia")?.value || "potencia_ativa";
  const sufixoMap = { potencia_ativa:"W", potencia_aparente:"VA", potencia_reativa:"VAr", fator_potencia:"" };
  const sufixo = sufixoMap[campo] || "";
  const cores = [COR_ATIVA, COR_APARENTE, COR_REATIVA];
  const allTs = new Set();
  fases.forEach(f => f.medicoes.forEach(m => { if (m.timestamp) allTs.add(m.timestamp); }));
  const tsOrdenados = [...allTs].sort().slice(-30);
  const labels = tsOrdenados.map(ts => new Date(ts).toLocaleTimeString("pt-BR", { hour:"2-digit", minute:"2-digit" }));
  const datasets = fases.map((f, i) => {
    const mapa = new Map(f.medicoes.map(m => [m.timestamp, m]));
    const dados = tsOrdenados.map(ts => {
      const m = mapa.get(ts);
      if (!m) return null;
      if (campo === "potencia_ativa" && m.potencia_ativa === null) return m.potencia || null;
      return m[campo] ?? null;
    });
    return {
      label: f.label, data: dados,
      borderColor: cores[i].border,
      backgroundColor: cores[i].bg.replace("0.75","0.15"),
      borderWidth:2, pointRadius:3, pointHoverRadius:5, tension:0.3, fill:false, spanGaps:true
    };
  });
  chartPotTemporal = new Chart(ctx, {
    type:"line",
    data: { labels, datasets },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins: {
        legend: { display:true, labels:{ color:"rgba(234,240,255,.85)", boxWidth:12 } },
        tooltip: { callbacks: { label: ctx => ctx.parsed.y !== null ? ` ${ctx.dataset.label}: ${Number(ctx.parsed.y).toFixed(2)} ${sufixo}` : ` ${ctx.dataset.label}: —` } }
      },
      scales: {
        x: { ticks:{ color:"rgba(234,240,255,.60)", maxRotation:45 }, grid:{ color:"rgba(255,255,255,.05)" } },
        y: { beginAtZero:false, ticks:{ color:"rgba(234,240,255,.65)" }, grid:{ color:"rgba(255,255,255,.06)" } }
      }
    }
  });
}

async function carregarPaginaPotencia() {
  setButtonLoading($("btnRefreshPotencia"), true);
  try {
    const fases = await carregarDadosPotencia();
    preencherCardsPotencia(fases);
    preencherTabelaFases(fases);
    renderGraficoBarrasFases(fases);
    renderGraficoTemporalPotencia(fases);
  } catch (error) {
    console.error("Erro ao carregar potência:", error);
    showFeedback("Erro ao carregar dados de potência.", "error");
  } finally {
    setButtonLoading($("btnRefreshPotencia"), false);
  }
}

/* ══════════════════════════════════════
   PAINEL COMPLETO
══════════════════════════════════════ */
function atualizarSubtitulo() {
  const localText       = $("local")?.selectedOptions?.[0]?.textContent || "-";
  const quadroText      = $("quadro")?.selectedOptions?.[0]?.textContent || "-";
  const dispositivoText = $("dispositivo")?.selectedOptions?.[0]?.textContent || "Todos os dispositivos";
  if ($("subtitle")) $("subtitle").textContent = `Filtro: ${localText} • ${quadroText} • ${dispositivoText}`;
}

async function carregarPainelCompleto() {
  hideFeedback();
  atualizarSubtitulo();
  setStatusText("Carregando...", "warn");
  setButtonLoading($("btnAplicar"), true);
  setButtonLoading($("btnRefresh"), true);
  try {
    const localId  = $("local")?.value  || "";
    const quadroId = $("quadro")?.value || "";
    await Promise.all([carregarConsumo(), carregarAlertasAPI()]);
    medicoesCache = [];
    carregarKPIsETabela();
    carregarAlertasUI();
    carregarEventos();
    if (consumoCache.length) await carregarGraficoPrincipal();
    else destruirGrafico();
    if (document.getElementById("page-potencia")?.classList.contains("active")) {
      await carregarPaginaPotencia();
    }
    if (!localId && !quadroId)     showFeedback("Exibindo visão geral de todos os locais.", "info");
    else if (localId && !quadroId) showFeedback("Exibindo consumo por quadro do local selecionado.", "info");
    else                           showFeedback("Exibindo visão geral do quadro.", "info");
    setStatusText("Atualizado agora", "ok");
  } catch (error) {
    console.error(error);
    showFeedback(`Não foi possível carregar os dados: ${error.message}`, "error");
    setStatusText("Erro ao carregar", "error");
  } finally {
    setButtonLoading($("btnAplicar"), false);
    setButtonLoading($("btnRefresh"), false);
  }
}

/* ══════════════════════════════════════
   EXPORTAÇÕES
══════════════════════════════════════ */
function configurarExportacoes() {
  $("btnExportSensors")?.addEventListener("click", () => {
    const agrupado = getConsumoAgrupadoPorData();
    const rows = [["Dispositivo","Data","Consumo (kWh)"]];
    const nome = $("dispositivo")?.selectedOptions?.[0]?.textContent || "Todos";
    agrupado.forEach(i => rows.push([nome, formatDateBR(i.data), Number(i.kwh||0).toFixed(2)]));
    exportCsv("dispositivo_consumo.csv", rows);
  });
  $("btnExportEvents")?.addEventListener("click", () => {
    const rows = [["DataHora","Tipo","Severidade","Dispositivo","Descricao","Status"]];
    eventosCache.forEach(e => rows.push([
      formatDt(e.timestamp), formatTipo(e.tipo), formatNivel(e.nivel),
      nomeDispositivoHistorico(), e.mensagem || "—", e.resolvido ? "Resolvido" : "Pendente"
    ]));
    exportCsv("eventos_manutencao.csv", rows);
  });
}

/* ══════════════════════════════════════
   EVENTOS DE UI
══════════════════════════════════════ */
function configurarEventosUI() {
  $("local")?.addEventListener("change", async e => {
    await carregarQuadros(e.target.value || "");
    if ($("quadro"))      $("quadro").value = "";
    if ($("dispositivo")) { $("dispositivo").innerHTML = `<option value="">Todos os dispositivos</option>`; $("dispositivo").value = ""; }
    await carregarPainelCompleto();
  });
  $("quadro")?.addEventListener("change", async e => {
    await carregarDispositivos(e.target.value || "");
    if ($("dispositivo")) $("dispositivo").value = "";
    await carregarPainelCompleto();
  });
  $("dispositivo")?.addEventListener("change", async () => {
    carregarKPIsETabela();
    carregarEventos();
    atualizarSubtitulo();
    await carregarGraficoPrincipal();
    if (document.getElementById("page-potencia")?.classList.contains("active")) {
      await carregarPaginaPotencia();
    }
  });
  $("eventFilter")?.addEventListener("change", () => carregarEventos());
  $("intervalo")?.addEventListener("change", async () => {
    await carregarConsumo();
    await carregarGraficoPrincipal();
    carregarKPIsETabela();
  });
  $("chartMode")?.addEventListener("change", async () => await carregarGraficoPrincipal());
  $("chartModeMedicoes")?.addEventListener("change", e => renderGraficoMedicoes(e.target.value));
  $("chartModePotencia")?.addEventListener("change", async () => {
    const fases = await carregarDadosPotencia();
    renderGraficoTemporalPotencia(fases);
  });
  $("btnAplicar")?.addEventListener("click", async () => await carregarPainelCompleto());
  $("btnRefresh")?.addEventListener("click", async () => await carregarPainelCompleto());
  $("btnRefreshPotencia")?.addEventListener("click", async () => await carregarPaginaPotencia());
}

/* ══════════════════════════════════════
   NAVEGAÇÃO
══════════════════════════════════════ */
const pageTitles = {
  consumo: "Consumo", potencia: "Potência",
  medicoes: "Medições", alertas: "Alertas", dispositivos: "Dispositivos"
};

function abrirSidebar()  { $("sidenav")?.classList.add("open");    $("navOverlay")?.classList.add("open"); }
function fecharSidebar() { $("sidenav")?.classList.remove("open"); $("navOverlay")?.classList.remove("open"); }

function navegarPara(pageId) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  const page = document.getElementById("page-" + pageId);
  if (page) page.classList.add("active");
  const btn = document.querySelector(`.nav-item[data-page="${pageId}"]`);
  if (btn) btn.classList.add("active");
  if ($("pageTitle")) $("pageTitle").textContent = pageTitles[pageId] || pageId;

  // Esconde KPIs globais na página Potência
  const kpisBar = $("kpisBar");
  if (kpisBar) kpisBar.style.display = pageId === "potencia" ? "none" : "";

  fecharSidebar();

  if (pageId === "medicoes") {
    const modo = $("chartModeMedicoes")?.value || "tensao";
    if (!medicoesCache.length) {
      carregarMedicoesGerais().then(() => renderGraficoMedicoes(modo)).catch(console.error);
    } else {
      renderGraficoMedicoes(modo);
    }
  }
  if (pageId === "potencia") {
    carregarPaginaPotencia().catch(console.error);
  }
}

function configurarNavegacao() {
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => navegarPara(btn.dataset.page));
  });
  $("btnMenu")?.addEventListener("click", abrirSidebar);
  $("navOverlay")?.addEventListener("click", fecharSidebar);
}

/* ══════════════════════════════════════
   INICIALIZAÇÃO
══════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", async () => {
  try {
    setStatusText("Inicializando...", "warn");
    configurarNavegacao();
    configurarEventosUI();
    configurarExportacoes();
    await carregarLocais();
    await carregarTodosDispositivos();
    await carregarPainelCompleto();
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel.");
    setStatusText("Erro na inicialização", "error");
  }
});
