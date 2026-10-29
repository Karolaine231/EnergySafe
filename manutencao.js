/* ══════════════════════════════════════
   CONFIGURAÇÃO
══════════════════════════════════════ */
const API_BASE = "https://backendsafe.onrender.com";

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

/* ══════════════════════════════════════
   MODO DEMONSTRAÇÃO (dados simulados)
   Abra a página com  manutencao.html?demo=1  para usar dados
   fictícios em vez do banco. Nada é enviado nem gravado na API.
══════════════════════════════════════ */
const MODO_DEMO = typeof location !== "undefined" && new URLSearchParams(location.search).has("demo");
let demoDB = null;

function construirDemo() {
  // gerador pseudoaleatório com semente fixa: os gráficos são iguais a cada recarga
  let seed = 20261029;
  const rand = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pad = n => String(n).padStart(2, "0");
  const isoLocal = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
  // perfil de carga ao longo do dia (aula de manhã/tarde, noite reduzida, madrugada baixa)
  const perfil = h => h < 6 ? 0.25 : h < 8 ? 0.6 : h < 18 ? 1.0 : h < 22 ? 0.7 : 0.35;

  const agora = new Date(); agora.setSeconds(0, 0);

  const locais = [
    { id: 1, nome: "Bloco A – Engenharia" },
    { id: 2, nome: "Bloco B – Laboratórios" }
  ];
  const quadros = [
    { id: 1, nome: "QDG Bloco A",      local_id: 1 },
    { id: 2, nome: "QD Laboratórios",  local_id: 2 }
  ];
  const dispositivos = [
    { id: 1, nome: "Ar-condicionado Sala 101",    quadro_id: 1, ativo: true,  kw: 1.9 },
    { id: 2, nome: "Laboratório de Informática",  quadro_id: 2, ativo: true,  kw: 2.6 },
    { id: 3, nome: "Bomba de água",               quadro_id: 1, ativo: true,  kw: 0.9 },
    { id: 4, nome: "Câmara fria (desativada)",    quadro_id: 2, ativo: false, kw: 0 }
  ];

  // 3 canais (fases A, B, C) por dispositivo; carga um pouco desigual entre fases
  const FATOR_FASE = [1.0, 0.92, 1.08];
  const canais = [];
  dispositivos.forEach(d => FASES.forEach((f, i) => canais.push({
    id: (d.id - 1) * 3 + i + 1, dispositivo_id: d.id, nome: `Fase ${f}`, kw: d.kw / 3 * FATOR_FASE[i]
  })));
  const canaisAtivos = canais.filter(c => dispositivos.find(d => d.id === c.dispositivo_id).ativo);

  // Consumo (kWh): 1 leitura a cada 6 h, nos últimos 4 dias
  const consumo = [];
  let idC = 1;
  canaisAtivos.forEach(c => {
    for (let dia = 3; dia >= 0; dia--) {
      [0, 6, 12, 18].forEach(h => {
        const t = new Date(agora); t.setDate(t.getDate() - dia); t.setHours(h, 0, 0, 0);
        if (t > agora) return;
        const kwh = c.kw * 6 * perfil(h + 3) * (0.85 + rand() * 0.3);
        consumo.push({ id: idC++, sensor_id: c.id, data: isoLocal(t).slice(0, 10), timestamp: isoLocal(t), kwh: +kwh.toFixed(3) });
      });
    }
  });

  // Medições elétricas: 1 a cada 15 min nas últimas ~15 h (mais recente primeiro)
  const medicoes = [];
  let idM = 1;
  canaisAtivos.forEach(c => {
    for (let k = 0; k < 60; k++) {
      const t = new Date(agora.getTime() - k * 15 * 60000);
      let ativaW = c.kw * 1000 * perfil(t.getHours()) * (0.85 + rand() * 0.3);
      const fp   = Math.min(0.98, 0.86 + rand() * 0.11);
      let tensao = 127 + (rand() - 0.5) * 4 - (ativaW > 700 ? 1.2 : 0);
      // picos de sobrecorrente no ar-condicionado (fase A) para exemplificar os alertas
      if (c.id === 1 && (k === 6 || k === 7)) ativaW *= 2.1;
      const aparente = ativaW / fp;
      const corrente = aparente / tensao;
      const reativa  = Math.sqrt(Math.max(aparente ** 2 - ativaW ** 2, 0));
      medicoes.push({
        id: idM++, canal_id: c.id, timestamp: isoLocal(t), valido: true,
        tensao: +tensao.toFixed(2), corrente: +corrente.toFixed(3),
        potencia: +ativaW.toFixed(1), potencia_ativa: +ativaW.toFixed(1),
        potencia_aparente: +aparente.toFixed(1), potencia_reativa: +reativa.toFixed(1),
        fator_potencia: +fp.toFixed(3)
      });
    }
  });
  medicoes.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Alertas: 26 nos últimos 5 dias, cerca de 60% pendentes
  const modelos = [
    { tipo: "sobrecorrente",        niveis: ["critico", "aviso"], msg: "Corrente acima do limite",           valor: () => 26 + rand() * 9,   limite: 25 },
    { tipo: "queda_brusca",         niveis: ["aviso"],            msg: "Queda brusca de tensão detectada",   valor: () => 100 + rand() * 9,  limite: 114 },
    { tipo: "consumo_fora_horario", niveis: ["info", "aviso"],    msg: "Consumo fora do horário de aula",    valor: () => 1.2 + rand() * 1.5, limite: 0.5 }
  ];
  const alertas = [];
  for (let i = 1; i <= 26; i++) {
    const m = modelos[Math.floor(rand() * modelos.length)];
    const c = canaisAtivos[Math.floor(rand() * canaisAtivos.length)];
    const t = new Date(agora.getTime() - rand() * 5 * 24 * 3600000);
    alertas.push({
      id: i, canal_id: c.id, tipo: m.tipo, nivel: m.niveis[Math.floor(rand() * m.niveis.length)],
      mensagem: m.msg, valor: +m.valor().toFixed(2), limite: m.limite,
      resolvido: rand() < 0.4, timestamp: isoLocal(t)
    });
  }

  return { locais, quadros, dispositivos, canais, consumo, medicoes, alertas };
}

/* Responde no lugar da API, aceitando os mesmos parâmetros usados pelo painel */
async function dadosDemo(path, params = {}) {
  if (!demoDB) demoDB = construirDemo();
  const db = demoDB;
  const recurso = String(path).replace(/\/+$/, "");
  const lim = Number(params.limit) || 500;
  const canaisDoDisp = id => db.canais.filter(c => String(c.dispositivo_id) === String(id)).map(c => c.id);
  let out = [];

  if (recurso === "/locais") out = db.locais;
  else if (recurso === "/quadros") out = db.quadros.filter(q => !params.local_id || String(q.local_id) === String(params.local_id));
  else if (recurso === "/dispositivos") out = db.dispositivos
    .filter(d => !params.quadro_id || String(d.quadro_id) === String(params.quadro_id))
    .map(({ kw, ...d }) => d);
  else if (recurso === "/canais") out = db.canais
    .filter(c => !params.dispositivo_id || String(c.dispositivo_id) === String(params.dispositivo_id))
    .map(({ kw, ...c }) => c);
  else if (recurso === "/consumo") out = db.consumo.filter(c => !params.sensor_id || String(c.sensor_id) === String(params.sensor_id));
  else if (recurso === "/medicoes") {
    out = db.medicoes;
    if (params.canal_id) out = out.filter(m => String(m.canal_id) === String(params.canal_id));
    if (params.dispositivo_id) { const ids = canaisDoDisp(params.dispositivo_id); out = out.filter(m => ids.includes(m.canal_id)); }
  } else if (recurso === "/alertas") {
    out = db.alertas;
    if (params.dispositivo_id) { const ids = canaisDoDisp(params.dispositivo_id); out = out.filter(a => ids.includes(a.canal_id)); }
  }
  return JSON.parse(JSON.stringify(out.slice(0, lim)));
}

function demoResolverAlerta(id) {
  const a = demoDB?.alertas.find(x => String(x.id) === String(id));
  if (a) a.resolvido = true;
}

function mostrarBannerDemo() {
  const b = document.createElement("div");
  b.style.cssText = "position:fixed;bottom:14px;right:14px;z-index:9999;background:rgba(251,191,36,.96);color:#1a1a1a;padding:8px 14px;border-radius:999px;font:600 12px system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35)";
  const url = new URL(location.href); url.searchParams.delete("demo");
  b.innerHTML = `🧪 Modo demonstração · dados simulados · <a href="${url}" style="color:#1a1a1a;text-decoration:underline">sair</a>`;
  document.body.appendChild(b);
}

async function getJSON(path, params = {}, retries = 2) {
  if (MODO_DEMO) return dadosDemo(path, params);
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
  // carimbo de data no nome do arquivo: consumo_2026-10-29.csv
  a.href = url; a.download = filename.replace(/\.csv$/i, "") + "_" + new Date().toISOString().slice(0, 10) + ".csv";
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

/* Número com vírgula decimal (Excel pt-BR lê como número, não como data/texto) */
function numBR(n, casas = 2) {
  if (n === null || n === undefined || n === "" || Number.isNaN(Number(n))) return "";
  return Number(n).toFixed(casas).replace(".", ",");
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

let locaisCache            = [];
let quadrosCache           = [];
let dispositivosCache      = [];
let todosDispositivosCache = [];
let consumoCache           = [];
let alertasCache           = [];
let eventosCache           = [];
let medicoesCache          = [];
let canalParaDispositivo   = new Map();   // canal_id -> { id, nome, fase, quadro_id }
let quadroInfoMap          = new Map();   // quadro_id -> { quadro, local }

let consumoPorDispositivoCache = new Map();

// Filtros customizados de data/hora
let filtroCustomConsumo  = { inicio: null, fim: null, ativo: false };
let filtroCustomMedicoes = { inicio: null, fim: null, ativo: false };

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
    // horário real da medição (se o backend enviar); usado para 1 barra por medição
    timestamp: normalizeTimestamp(pick(item,"timestamp","data_hora","datetime","created_at","criado_em","hora")) ?? null,
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

  if (potencia_ativa === null && potencia > 0) potencia_ativa = potencia;

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
function filtrarConsumoPorPeriodo(lista) {
  const fonte = lista ?? consumoCache;
  const ordenados = [...fonte]
    .filter(i => i.data && /^\d{4}-\d{2}-\d{2}$/.test(String(i.data)))
    .sort((a, b) => String(a.data).localeCompare(String(b.data)));
  if (!ordenados.length) return [];

  // Filtro customizado tem prioridade sobre os quick filters
  if (filtroCustomConsumo.ativo && filtroCustomConsumo.inicio && filtroCustomConsumo.fim) {
    const ini = filtroCustomConsumo.inicio.slice(0, 10);
    const fim = filtroCustomConsumo.fim.slice(0, 10);
    return ordenados.filter(i => i.data >= ini && i.data <= fim);
  }

  // Quick filters originais
  const periodo = $("intervalo")?.value || "20";
  const ultima  = ordenados[ordenados.length - 1].data;

  if (periodo === "24h") {
    return ordenados.filter(i => i.data === ultima);
  }

  const dias = Number(periodo);
  if (!dias || isNaN(dias)) return ordenados;

  const fim = new Date(`${ultima}T00:00:00`);
  const ini = new Date(fim);
  ini.setDate(fim.getDate() - (dias - 1));
  const iniStr = ini.toISOString().slice(0, 10);
  return ordenados.filter(i => i.data >= iniStr && i.data <= ultima);
}

function getConsumoAgrupadoPorData(lista) {
  const bucket = new Map();
  filtrarConsumoPorPeriodo(lista).forEach(item => {
    bucket.set(item.data, (bucket.get(item.data) || 0) + Number(item.kwh || 0));
  });
  return Array.from(bucket.entries()).map(([data,kwh]) => ({ data, kwh })).sort((a,b) => a.data.localeCompare(b.data));
}

/* Formata data+hora para os rótulos do eixo X (valor real de cada medição) */
function formatDateTimeLabel(ts) {
  const d = new Date(normalizeTimestamp(ts));
  if (Number.isNaN(d.getTime())) return String(ts ?? "-");
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit", second:"2-digit" });
}

/* Consumo SEM agrupar: cada registro vindo do banco vira uma barra.
   Mantém o filtro de período; só não soma por dia. */
function getConsumoIndividual(lista) {
  const itens = filtrarConsumoPorPeriodo(lista)
    .map(i => ({ ...i, _ord: i.timestamp || i.data }))
    .sort((a, b) => String(a._ord).localeCompare(String(b._ord)) || (Number(a.id) || 0) - (Number(b.id) || 0));

  // Sem horário no registro: numera as medições dentro do dia (16/10/2026 #1, #2...)
  const seqPorDia = new Map();
  return itens.map(i => {
    let label;
    if (i.timestamp && String(i.timestamp).length > 10) {
      label = formatDateTimeLabel(i.timestamp);
    } else {
      const n = (seqPorDia.get(i.data) || 0) + 1;
      seqPorDia.set(i.data, n);
      label = `${formatDateBR(i.data)} #${n}`;
    }
    return { data: i.data, label, kwh: Number(i.kwh || 0) };
  });
}

/* Filtra medições pelo período/intervalo escolhido (mesma regra do gráfico) */
function filtrarMedicoesPorPeriodo(medicoes) {
  const lista = medicoes
    .map(i => ({ ...i, data: normalizeTimestamp(i.timestamp)?.slice(0, 10), ts: i.timestamp }))
    .filter(i => i.data)
    .sort((a, b) => String(a.ts || a.data).localeCompare(String(b.ts || b.data)));
  if (!lista.length) return [];

  if (filtroCustomMedicoes.ativo && filtroCustomMedicoes.inicio && filtroCustomMedicoes.fim) {
    const ini = filtroCustomMedicoes.inicio;
    const fim = filtroCustomMedicoes.fim;
    return lista.filter(i => {
      const ts = i.ts || (i.data + "T00:00:00");
      return ts >= ini && ts <= fim;
    });
  }

  const periodo = $("intervalo")?.value || "20";
  const ultima  = lista[lista.length - 1].data;
  if (periodo === "24h") return lista.filter(i => i.data === ultima);

  const dias = Number(periodo);
  if (!dias || isNaN(dias)) return lista;
  const fimD = new Date(`${ultima}T00:00:00`);
  const iniD = new Date(fimD);
  iniD.setDate(fimD.getDate() - (dias - 1));
  const iniStr = iniD.toISOString().slice(0, 10);
  return lista.filter(i => i.data >= iniStr && i.data <= ultima);
}

/* Valor real de cada medição (sem média): uma barra por registro do banco */
function agruparSeriePorCampo(medicoes, campo) {
  return filtrarMedicoesPorPeriodo(medicoes)
    .map(i => ({ data: i.data, ts: i.ts, valor: Number(i[campo] || 0) }));
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

/* ══════════════════════════════════════
   CONSUMO
══════════════════════════════════════ */
async function getCanaisDeDispositivo(dispositivoId) {
  try {
    const canais = asArray(await getJSON("/canais/", { dispositivo_id: dispositivoId }));
    const ids = canais.map(c => c.id ?? c.canal_id).filter(Boolean);
    if (ids.length) return ids;
  } catch(e) {
    console.warn(`Canais do dispositivo ${dispositivoId}:`, e);
  }
  return [Number(dispositivoId)];
}

async function fetchConsumoPorSensors(sensorIds) {
  if (!sensorIds.length) return [];
  const resultados = await Promise.all(
    sensorIds.map(sid =>
      getJSON("/consumo/", { sensor_id: sid, limit: 500 })
        .then(raw => {
          const dados = Array.isArray(raw) ? raw : (raw?.dados ?? []);
          return dados.map(adaptConsumo);
        })
        .catch(() => [])
    )
  );
  return resultados.flat();
}

async function carregarConsumo() {
  const dispositivoId = $("selDispositivoConsumo")?.value || "";
  let sensorIds = [];

  if (dispositivoId) {
    sensorIds = await getCanaisDeDispositivo(Number(dispositivoId));
  } else {
    const todos = todosDispositivosCache.length
      ? todosDispositivosCache
      : asArray(await getJSON("/dispositivos/", { limit: 500 })).map(adaptDispositivo);

    const canaisPorDisp = await Promise.all(
      todos.map(d => getJSON("/canais/", { dispositivo_id: d.id }).then(asArray).catch(() => []))
    );
    sensorIds = canaisPorDisp.flat().map(c => c.id ?? c.canal_id).filter(Boolean);
  }

  consumoCache = await fetchConsumoPorSensors(sensorIds);
  return consumoCache;
}

async function carregarConsumoPorTodosDispositivos() {
  consumoPorDispositivoCache.clear();
  const todos = todosDispositivosCache.length
    ? todosDispositivosCache
    : asArray(await getJSON("/dispositivos/", { limit: 500 })).map(adaptDispositivo);

  await Promise.all(
    todos.map(async d => {
      const sensorIds = await getCanaisDeDispositivo(d.id);
      const consumo   = await fetchConsumoPorSensors(sensorIds);
      consumoPorDispositivoCache.set(d.id, consumo);
    })
  );
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

async function carregarMedicoesPorCanal(canalId) {
  const raw = await getJSON("/medicoes/", { canal_id: canalId, limit: 20 });
  return asArray(raw).map(adaptMedicao).filter(m =>
    m.valido || m.potencia > 0 || m.corrente > 0
  );
}

function preencherSelDispositivos() {
  ["selDispositivoPotencia", "selDispositivoConsumo", "selDispositivoMedicoes"].forEach(selId => {
    const sel = $(selId); if (!sel) return;
    const valorAtual = sel.value;
    sel.innerHTML = `<option value="">Todos os dispositivos</option>`;
    todosDispositivosCache.forEach(d => {
      const o = document.createElement("option");
      o.value = d.id;
      o.textContent = d.nome + (d.ativo ? "" : " (inativo)");
      sel.appendChild(o);
    });
    if (valorAtual) sel.value = valorAtual;
  });
}

async function carregarFasesDeDispositivo(dispositivoId, faseSelecionada) {
  const LETRAS = ["A", "B", "C"];
  const FASE_INDEX = { A: 0, B: 1, C: 2 };

  let canais = [];
  try {
    canais = asArray(await getJSON("/canais/", { dispositivo_id: dispositivoId }));
  } catch (e) {
    console.warn(`Canais do dispositivo ${dispositivoId}:`, e);
  }

  if (!canais.length) {
    try {
      const raw = await getJSON("/medicoes/", { dispositivo_id: dispositivoId, limit: 60 });
      const medicoes = asArray(raw).map(adaptMedicao).filter(m =>
        m.valido || m.potencia > 0 || m.corrente > 0
      );
      return [{ dispositivo_id: dispositivoId, canal_id: null, fase: "A", label: "Fase A", medicoes }];
    } catch { return []; }
  }

  const canaisFiltrados = faseSelecionada
    ? canais.filter((_, i) => i === (FASE_INDEX[faseSelecionada] ?? i))
    : canais;

  const nomeDisp = todosDispositivosCache.find(d => d.id === dispositivoId)?.nome || `Disp ${dispositivoId}`;

  return Promise.all(
    canaisFiltrados.map(async (canal, i) => {
      const canalId = canal.id ?? canal.canal_id;
      const fase = faseSelecionada || LETRAS[canais.indexOf(canal)] || LETRAS[i];
      const label = `${nomeDisp} Fase ${fase}`;
      try {
        const medicoes = await carregarMedicoesPorCanal(canalId);
        return { dispositivo_id: dispositivoId, canal_id: canalId, fase, label, medicoes };
      } catch {
        return { dispositivo_id: dispositivoId, canal_id: canalId, fase, label, medicoes: [] };
      }
    })
  );
}

async function carregarDadosPotencia() {
  const selDisp = $("selDispositivoPotencia");
  const selFase = $("selFasePotencia");

  const dispositivoIdSel = selDisp?.value ? Number(selDisp.value) : null;
  const faseSelecionada  = selFase?.value || "";

  const subtitulo = $("potenciaSubtitulo");
  if (subtitulo) {
    const nomeDisp = dispositivoIdSel
      ? (todosDispositivosCache.find(d => d.id === dispositivoIdSel)?.nome || `Dispositivo ${dispositivoIdSel}`)
      : "Todos os dispositivos";
    const labelFase = faseSelecionada ? `Fase ${faseSelecionada}` : "Todas as fases";
    subtitulo.textContent = `${nomeDisp} · ${labelFase}`;
  }

  if (dispositivoIdSel) {
    return carregarFasesDeDispositivo(dispositivoIdSel, faseSelecionada);
  }

  const dispositivos = todosDispositivosCache.length
    ? todosDispositivosCache
    : asArray(await getJSON("/dispositivos/", { limit: 500 })).map(adaptDispositivo);

  const todasFases = await Promise.all(
    dispositivos.map(d => carregarFasesDeDispositivo(d.id, faseSelecionada).catch(() => []))
  );

  return todasFases.flat();
}

/* ══════════════════════════════════════
   MODAL DE CONFIRMAÇÃO
══════════════════════════════════════ */
function abrirModalConfirmacao(alertaId) {
  return new Promise(resolve => {
    const overlay    = $("modalConfirm");
    const btnConfirm = $("modalBtnConfirm");
    const btnCancel  = $("modalBtnCancel");

    // Atualiza descrição com dados do alerta
    const alerta = alertasCache.find(a => String(a.id) === String(alertaId));
    const desc = $("modalDesc");
    if (desc && alerta) {
      desc.textContent = `Alerta: "${alerta.mensagem || formatTipo(alerta.tipo)}" — confirmar resolução? Esta ação não pode ser desfeita.`;
    }

    overlay.classList.add("open");

    function fechar(resultado) {
      overlay.classList.remove("open");
      btnConfirm.removeEventListener("click", onConfirm);
      btnCancel.removeEventListener("click", onCancel);
      overlay.removeEventListener("click", onOverlayClick);
      resolve(resultado);
    }

    function onConfirm()        { fechar(true);  }
    function onCancel()         { fechar(false); }
    function onOverlayClick(e)  { if (e.target === overlay) fechar(false); }

    btnConfirm.addEventListener("click", onConfirm);
    btnCancel.addEventListener("click", onCancel);
    overlay.addEventListener("click", onOverlayClick);
  });
}

/* ══════════════════════════════════════
   RESOLVER ALERTA
══════════════════════════════════════ */
async function resolverAlerta(alertaId, botao = null) {
  const confirmado = await abrirModalConfirmacao(alertaId);
  if (!confirmado) return;

  try {
    if (botao) { botao.disabled = true; botao.textContent = "Resolvendo..."; }
    if (MODO_DEMO) {
      demoResolverAlerta(alertaId);
    } else {
      const response = await fetch(`${API_BASE}/alertas/${alertaId}/resolver`, {
        method: "PATCH", headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Falha ao resolver alerta ${alertaId}`);
    }
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
  const dispositivoIdFiltro = $("dispositivo")?.value || "";
  const alertasAtivos = alertasCache.filter(a => !a.resolvido).length;

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

  const fonte = dispositivosCache.length ? dispositivosCache : todosDispositivosCache;

  if (!fonte.length) {
    tbody.innerHTML = `<tr><td colspan="4">Nenhum dispositivo encontrado.</td></tr>`;
    return;
  }

  let lista = [...fonte];
  if (dispositivoIdFiltro) lista = lista.filter(d => String(d.id) === String(dispositivoIdFiltro));

  lista.forEach(d => {
    const consumoDisp  = consumoPorDispositivoCache.get(d.id) ?? [];
    const agrupadoDisp = getConsumoAgrupadoPorData(consumoDisp);
    const totalDisp    = agrupadoDisp.reduce((s, i) => s + i.kwh, 0);
    const ultimaData   = agrupadoDisp.length ? agrupadoDisp[agrupadoDisp.length - 1].data : null;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${d.nome}</td>
      <td><span class="tag ${d.ativo ? "" : "danger"}">${d.ativo ? "Ativo" : "Inativo"}</span></td>
      <td>${ultimaData ? formatDateBR(ultimaData) : "-"}</td>
      <td>${totalDisp.toFixed(2)} kWh</td>
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
  ativos.slice(0, 12).forEach(alerta => {
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
  historico.slice(0, 50).forEach(evento => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDt(evento.timestamp)}</td>
      <td>${formatTipo(evento.tipo)}</td>
      <td><span class="tag ${NIVEL_CLASS[evento.nivel] || ""}">${formatNivel(evento.nivel)}</span></td>
      <td>${dispLabel}</td>
      <td>${evento.mensagem || `Valor ${evento.valor || 0} / Limite ${evento.limite || 0}`}</td>
      <td>
        <span class="status-badge ${evento.resolvido ? "resolved" : "pending"}">
          ${evento.resolvido ? "Resolvido" : "Pendente"}
        </span>
      </td>
      <td><span class="sem-acao">Sem ação</span></td>
    `;
    tbody.appendChild(tr);
  });
  // Histórico é somente leitura — sem botão Resolver aqui
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
          borderWidth:2, pointHoverRadius:6,
          pointBackgroundColor:"rgba(56,189,248,1)", pointBorderColor:"#ffffff",
          pointBorderWidth:1.5, tension:0.3, fill:false, pointRadius: valores.length > 60 ? 2 : 4
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
        x: { ticks:{ color:"rgba(234,240,255,.65)", maxRotation:50, minRotation:50, autoSkip: labels.length > 30, maxTicksLimit: 30 }, grid:{ color:"rgba(255,255,255,.06)" } },
        y: { beginAtZero:true, ticks:{ color:"rgba(234,240,255,.65)" }, grid:{ color:"rgba(255,255,255,.06)" } }
      }
    }
  });
}

function renderGraficoConsumoGeral() {
  setChartTexts("Consumo geral","Cada barra é uma medição real do banco, com linha de tendência.","Atualizado conforme os filtros.");
  const medicoes = getConsumoIndividual();
  if (!medicoes.length) { destruirGrafico(); return; }
  renderGraficoMisto(
    medicoes.map(i => i.label),
    medicoes.map(i => Number(i.kwh.toFixed(3))),
    "Consumo (kWh)", "Tendência", " kWh"
  );
}

function renderGraficoConsumoPorDispositivo() {
  const dispositivoId = $("dispositivo")?.value || "";
  setChartTexts("Consumo por dispositivo","Selecione um dispositivo no filtro.","Selecione um dispositivo para visualizar.");
  if (!dispositivoId) { destruirGrafico(); showFeedback("Selecione um dispositivo para este modo.","info"); return; }
  const medicoes = getConsumoIndividual();
  if (!medicoes.length) { destruirGrafico(); return; }
  const nome = $("dispositivo")?.selectedOptions?.[0]?.textContent || "Dispositivo";
  renderGraficoMisto(
    medicoes.map(i => i.label),
    medicoes.map(i => Number(i.kwh.toFixed(3))),
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
async function renderGraficoMedicoes(modo) {
  if (!medicoesCache.length) return;
  const campo = modo === "corrente" ? "corrente" : "tensao";
  const sufixo = campo === "tensao" ? " V" : " A";
  // respeita o dispositivo selecionado no filtro (mesma regra do export)
  let fonte = medicoesCache;
  const idSel = $("selDispositivoMedicoes")?.value || "";
  if (idSel) {
    try { await garantirMapaCanais(); } catch (e) { console.warn(e); }
    fonte = medicoesCache.filter(m => String(infoCanal(m.canal_id).id) === String(idSel));
  }
  const serie = agruparSeriePorCampo(fonte, campo);
  const ctx = $("chartMedicoes"); if (!ctx) return;
  if (chartMedicoes) { chartMedicoes.destroy(); chartMedicoes = null; }
  if (!serie.length) return;
  chartMedicoes = new Chart(ctx, {
    data: {
      labels: serie.map(i => i.ts ? formatDateTimeLabel(i.ts) : formatDateBR(i.data)),
      datasets: [
        {
          type:"bar", label: campo === "tensao" ? "Tensão (V)" : "Corrente (A)",
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
        x: { ticks:{ color:"rgba(234,240,255,.65)", maxRotation:45, autoSkip: serie.length > 30, maxTicksLimit: 30 }, grid:{ color:"rgba(255,255,255,.06)" } },
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
  if ($("potAtivaTot"))    $("potAtivaTot").innerHTML    = `${totalAtiva.toFixed(0)} <span>W</span>`;
  if ($("potAparenteTot")) $("potAparenteTot").innerHTML = `${totalAparente.toFixed(0)} <span>VA</span>`;
  if ($("potReativaTot"))  $("potReativaTot").innerHTML  = `${totalReativa.toFixed(0)} <span>VAr</span>`;
  if ($("fatPotMedio"))    $("fatPotMedio").innerHTML    = `${fpMedio} <span>cos(ϕ)</span>`;
}

function preencherTabelaFases(fases) {
  const tbody = $("tbodyFases"); if (!tbody) return;
  tbody.innerHTML = "";
  if (!fases.length || fases.every(f => !f.medicoes.length)) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:rgba(234,240,255,.45)">Nenhuma medição encontrada.</td></tr>`;
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
        { label:"Ativa (W)",     data:dadosAtiva,    backgroundColor:COR_ATIVA.bg,    borderColor:COR_ATIVA.border,    borderWidth:1, borderRadius:6 },
        { label:"Aparente (VA)", data:dadosAparente, backgroundColor:COR_APARENTE.bg, borderColor:COR_APARENTE.border, borderWidth:1, borderRadius:6 },
        { label:"Reativa (VAr)", data:dadosReativa,  backgroundColor:COR_REATIVA.bg,  borderColor:COR_REATIVA.border,  borderWidth:1, borderRadius:6 }
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
      borderColor: cores[i % cores.length].border,
      backgroundColor: cores[i % cores.length].bg.replace("0.75","0.15"),
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
    await Promise.all([
      carregarConsumo(),
      carregarAlertasAPI(),
      carregarConsumoPorTodosDispositivos()
    ]);
    medicoesCache = [];
    carregarKPIsETabela();
    carregarAlertasUI();
    carregarEventos();
    if (consumoCache.length) await carregarGraficoPrincipal();
    else destruirGrafico();
    if (document.getElementById("page-potencia")?.classList.contains("active")) {
      await carregarPaginaPotencia();
    }
    const localId  = $("local")?.value  || "";
    const quadroId = $("quadro")?.value || "";
    if (!localId && !quadroId)     showFeedback("Exibindo visão geral de todos os locais.", "info");
    else if (localId && !quadroId) showFeedback("Exibindo consumo por quadro do local selecionado.", "info");
    else                           showFeedback("Exibindo visão geral do quadro.", "info");
    setStatusText("Atualizado agora", "ok");
  } catch (error) {
    console.error(error);
    showFeedback(`Não foi possível carregar os dados: ${error.message}. Dica: abra com ?demo=1 na URL para ver dados simulados.`, "error");
    setStatusText("Erro ao carregar", "error");
  } finally {
    setButtonLoading($("btnAplicar"), false);
    setButtonLoading($("btnRefresh"), false);
  }
}

/* ══════════════════════════════════════
   EXPORTAÇÕES
   Dois exports fixos, pensados para a equipe técnica:
   • Alertas            → lista de serviço dos técnicos e histórico de falhas
   • Medições elétricas → dado bruto para análise do engenheiro
   Ambos respeitam os filtros atuais da tela.
══════════════════════════════════════ */

/* Carrega uma vez (só ao exportar): canal -> dispositivo/fase e quadro -> local */
async function garantirMapaCanais() {
  if (canalParaDispositivo.size) return canalParaDispositivo;

  const dispositivos = todosDispositivosCache.length
    ? todosDispositivosCache
    : asArray(await getJSON("/dispositivos/", { limit: 500 })).map(adaptDispositivo);

  // quadro -> local (busca os quadros de cada local)
  const locais = locaisCache.length ? locaisCache : asArray(await getJSON("/locais/")).map(adaptLocal);
  await Promise.all(locais.map(async l => {
    try {
      const quadros = asArray(await getJSON("/quadros/", { local_id: l.id })).map(adaptQuadro);
      quadros.forEach(q => quadroInfoMap.set(String(q.id), { quadro: q.nome, local: l.nome }));
    } catch (e) { console.warn("Quadros do local", l.id, e); }
  }));

  // canal -> dispositivo/fase
  await Promise.all(dispositivos.map(async d => {
    try {
      const canais = asArray(await getJSON("/canais/", { dispositivo_id: d.id }));
      canais.forEach((c, i) => {
        const cid = c.id ?? c.canal_id;
        if (cid !== undefined && cid !== null) {
          canalParaDispositivo.set(Number(cid), { id: d.id, nome: d.nome, fase: FASES[i] || "", quadro_id: d.quadro_id });
        }
      });
    } catch (e) { console.warn("Canais do dispositivo", d.id, e); }
  }));
  return canalParaDispositivo;
}

/* Dispositivo, fase, quadro e local de um canal */
function infoCanal(canalId) {
  const c = canalParaDispositivo.get(Number(canalId));
  if (!c) return { id: "", nome: "—", fase: "", quadro: "—", local: "—" };
  const q = quadroInfoMap.get(String(c.quadro_id)) || {};
  return { ...c, quadro: q.quadro || "—", local: q.local || "—" };
}

/* ── Alertas: todos os filtrados (a tela mostra só 50) ── */
async function linhasAlertas() {
  await garantirMapaCanais();
  const rows = [["ID","Data/Hora","Local","Quadro","Dispositivo","Fase","Tipo","Severidade","Mensagem","Valor","Limite","Status"]];
  const filtroTipo = $("eventFilter")?.value || "";
  let lista = [...alertasCache];
  if (filtroTipo) lista = lista.filter(a => String(a.tipo) === String(filtroTipo));
  lista.forEach(a => {
    const c = infoCanal(a.canal_id);
    rows.push([
      a.id ?? "", formatDt(a.timestamp), c.local, c.quadro,
      c.id !== "" ? c.nome : nomeDispositivoHistorico(), c.fase ? `Fase ${c.fase}` : "",
      formatTipo(a.tipo), formatNivel(a.nivel), a.mensagem || "—",
      numBR(a.valor, 2), numBR(a.limite, 2), a.resolvido ? "Resolvido" : "Pendente"
    ]);
  });
  return rows;
}

/* ── Medições elétricas: valor real de cada medição (sem média) ── */
async function linhasMedicoes() {
  if (!medicoesCache.length) await carregarMedicoesGerais();
  await garantirMapaCanais();
  const rows = [["Data/Hora","Local","Quadro","Dispositivo","Fase","Tensão (V)","Corrente (A)","Potência ativa (W)","Potência aparente (VA)","Potência reativa (VAr)","Fator de potência","Medição válida"]];
  const idSel = $("selDispositivoMedicoes")?.value || "";
  filtrarMedicoesPorPeriodo(medicoesCache).forEach(m => {
    const c = infoCanal(m.canal_id);
    if (idSel && String(c.id) !== String(idSel)) return;
    rows.push([
      formatDateTimeLabel(m.ts), c.local, c.quadro, c.nome, c.fase ? `Fase ${c.fase}` : "",
      numBR(m.tensao, 2), numBR(m.corrente, 3),
      numBR(m.potencia_ativa ?? m.potencia, 1), numBR(m.potencia_aparente, 1), numBR(m.potencia_reativa, 1),
      numBR(m.fator_potencia, 3), m.valido ? "Sim" : "Não"
    ]);
  });
  return rows;
}

const EXPORTS = {
  medicoes: { arquivo: "medicoes_eletricas", fn: linhasMedicoes },
  alertas:  { arquivo: "alertas",            fn: linhasAlertas }
};

async function executarExportacao(btn, cfg) {
  const textoOriginal = btn?.textContent;
  try {
    if (btn) { btn.disabled = true; btn.textContent = "Gerando..."; }
    const rows = await cfg.fn();
    if (rows.length <= 1) {
      showFeedback("Não há dados para exportar com os filtros atuais.", "warn");
      return;
    }
    exportCsv(cfg.arquivo + ".csv", rows);
    showFeedback(`${rows.length - 1} linha(s) exportada(s) em ${cfg.arquivo}.csv.`, "info");
  } catch (e) {
    console.error("Erro ao exportar:", e);
    showFeedback(`Não foi possível exportar: ${e.message}`, "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = textoOriginal; }
  }
}

function configurarExportacoes() {
  $("btnExportSensors")?.addEventListener("click", e => executarExportacao(e.currentTarget, EXPORTS.medicoes));
  $("btnExportEvents")?.addEventListener("click",  e => executarExportacao(e.currentTarget, EXPORTS.alertas));
}

/* ══════════════════════════════════════
   FILTROS DE DATA CUSTOMIZADOS
══════════════════════════════════════ */
function configurarFiltrosData() {

  function toggleAccordion(accordion, btn) {
    const aberto = accordion.classList.contains("open");
    accordion.classList.toggle("open", !aberto);
    btn.classList.toggle("active", !aberto);
  }

  function formatarIntervalo(inicio, fim) {
    const fmt = s => s.replace("T", " ").slice(0, 16);
    return `${fmt(inicio)} → ${fmt(fim)}`;
  }

  function atualizarBadge(badgeEl, textoEl, ativo, inicio, fim) {
    if (!badgeEl) return;
    badgeEl.style.display = ativo ? "inline-flex" : "none";
    if (textoEl && ativo) textoEl.textContent = formatarIntervalo(inicio, fim);
  }

  /* ── CONSUMO ── */
  const btnToggleConsumo  = $("btnToggleFiltroConsumo");
  const accordionConsumo  = $("accordionConsumo");
  const btnAplicarConsumo = $("btnAplicarFiltroConsumo");
  const btnLimparConsumo  = $("btnLimparFiltroConsumo");
  const clearBadgeConsumo = $("clearFiltroConsumo");
  const badgeConsumo      = $("badgeFiltroConsumo");
  const badgeConsumoTxt   = $("badgeFiltroConsumoTexto");
  const periodWrap        = $("periodSelectWrap");

  btnToggleConsumo?.addEventListener("click", () => {
    toggleAccordion(accordionConsumo, btnToggleConsumo);
  });

  btnAplicarConsumo?.addEventListener("click", async () => {
    const inicio = $("consumoDataInicio")?.value;
    const fim    = $("consumoDataFim")?.value;
    if (!inicio || !fim) { showFeedback("Preencha data/hora de início e fim.", "warn"); return; }
    if (inicio >= fim)   { showFeedback("A data de início deve ser anterior à data de fim.", "warn"); return; }

    filtroCustomConsumo = { inicio, fim, ativo: true };
    periodWrap?.classList.add("dimmed");
    accordionConsumo?.classList.remove("open");
    btnToggleConsumo?.classList.remove("active");
    atualizarBadge(badgeConsumo, badgeConsumoTxt, true, inicio, fim);
    showFeedback(`Filtro aplicado: ${formatarIntervalo(inicio, fim)}`, "info");
    await carregarConsumo();
    await carregarGraficoPrincipal();
    carregarKPIsETabela();
  });

  function limparFiltroConsumo() {
    filtroCustomConsumo = { inicio: null, fim: null, ativo: false };
    if ($("consumoDataInicio")) $("consumoDataInicio").value = "";
    if ($("consumoDataFim"))    $("consumoDataFim").value    = "";
    periodWrap?.classList.remove("dimmed");
    atualizarBadge(badgeConsumo, badgeConsumoTxt, false, null, null);
    accordionConsumo?.classList.remove("open");
    btnToggleConsumo?.classList.remove("active");
  }

  btnLimparConsumo?.addEventListener("click", async () => {
    limparFiltroConsumo();
    await carregarConsumo();
    await carregarGraficoPrincipal();
    carregarKPIsETabela();
  });

  clearBadgeConsumo?.addEventListener("click", async () => {
    limparFiltroConsumo();
    await carregarConsumo();
    await carregarGraficoPrincipal();
    carregarKPIsETabela();
  });

  /* ── MEDIÇÕES ── */
  const btnToggleMedicoes  = $("btnToggleFiltroMedicoes");
  const accordionMedicoes  = $("accordionMedicoes");
  const btnAplicarMedicoes = $("btnAplicarFiltroMedicoes");
  const btnLimparMedicoes  = $("btnLimparFiltroMedicoes");
  const clearBadgeMedicoes = $("clearFiltroMedicoes");
  const badgeMedicoes      = $("badgeFiltroMedicoes");
  const badgeMedicoesTxt   = $("badgeFiltroMedicoesTexto");

  btnToggleMedicoes?.addEventListener("click", () => {
    toggleAccordion(accordionMedicoes, btnToggleMedicoes);
  });

  btnAplicarMedicoes?.addEventListener("click", () => {
    const inicio = $("medicoesDataInicio")?.value;
    const fim    = $("medicoesDataFim")?.value;
    if (!inicio || !fim) { showFeedback("Preencha data/hora de início e fim.", "warn"); return; }
    if (inicio >= fim)   { showFeedback("A data de início deve ser anterior à data de fim.", "warn"); return; }

    filtroCustomMedicoes = { inicio, fim, ativo: true };
    accordionMedicoes?.classList.remove("open");
    btnToggleMedicoes?.classList.remove("active");
    atualizarBadge(badgeMedicoes, badgeMedicoesTxt, true, inicio, fim);
    showFeedback(`Filtro aplicado: ${formatarIntervalo(inicio, fim)}`, "info");
    const modo = $("chartModeMedicoes")?.value || "tensao";
    renderGraficoMedicoes(modo);
  });

  function limparFiltroMedicoes() {
    filtroCustomMedicoes = { inicio: null, fim: null, ativo: false };
    if ($("medicoesDataInicio")) $("medicoesDataInicio").value = "";
    if ($("medicoesDataFim"))    $("medicoesDataFim").value    = "";
    atualizarBadge(badgeMedicoes, badgeMedicoesTxt, false, null, null);
    accordionMedicoes?.classList.remove("open");
    btnToggleMedicoes?.classList.remove("active");
  }

  btnLimparMedicoes?.addEventListener("click", () => {
    limparFiltroMedicoes();
    const modo = $("chartModeMedicoes")?.value || "tensao";
    renderGraficoMedicoes(modo);
  });

  clearBadgeMedicoes?.addEventListener("click", () => {
    limparFiltroMedicoes();
    const modo = $("chartModeMedicoes")?.value || "tensao";
    renderGraficoMedicoes(modo);
  });

  /* Trocar quick filter limpa o filtro customizado de consumo */
  $("intervalo")?.addEventListener("change", () => {
    if (filtroCustomConsumo.ativo) limparFiltroConsumo();
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
  $("selDispositivoMedicoes")?.addEventListener("change", () => renderGraficoMedicoes($("chartModeMedicoes")?.value || "tensao"));
  $("chartModePotencia")?.addEventListener("change", async () => {
    const fases = await carregarDadosPotencia();
    renderGraficoTemporalPotencia(fases);
  });
  $("selDispositivoPotencia")?.addEventListener("change", async () => await carregarPaginaPotencia());
  $("selFasePotencia")?.addEventListener("change", async () => await carregarPaginaPotencia());
  $("selDispositivoConsumo")?.addEventListener("change", async () => {
    await carregarConsumo();
    await carregarGraficoPrincipal();
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
    if (MODO_DEMO) mostrarBannerDemo();
    configurarNavegacao();
    configurarEventosUI();
    configurarExportacoes();
    configurarFiltrosData();
    await carregarLocais();
    await carregarTodosDispositivos();
    preencherSelDispositivos();
    await carregarPainelCompleto();
  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel.");
    setStatusText("Erro na inicialização", "error");
  }
});
