// manutencao.js (somente front, mock)

function $(id){ return document.getElementById(id); }

function nowIso(){
  return new Date().toISOString();
}

function formatDt(dt){
  const d = new Date(dt);
  return d.toLocaleString("pt-BR", { day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit" });
}

function exportCsv(filename, rows){
  const csv = rows.map(r => r.map(x => String(x).replaceAll(";", ",")).join(";")).join("\n");
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

const MOCK = {
  structure: [
    {
      id: "predio_admin",
      name: "Prédio Administrativo",
      boards: [
        { id: "qdg_01", name: "QDG-01", sensors: [
          { id: "s1", name: "Sensor S1 • Salas (novas)" },
          { id: "s2", name: "Sensor S2 • Setores Adm (1º andar)" },
          { id: "s3", name: "Sensor S3 • Coordenações (2º andar)" },
        ]}
      ]
    },
    {
      id: "predio_principal",
      name: "Prédio Principal",
      boards: [
        { id: "qdg_02", name: "QDG-02", sensors: [
          { id: "s4", name: "Sensor S4 • Biblioteca" },
          { id: "s5", name: "Sensor S5 • Lab Informática" },
          { id: "s6", name: "Sensor S6 • Ambulatório" },
        ]}
      ]
    }
  ],
  // eventos mock (vai ser regenerado)
  events: []
};

function randomChoice(arr){ return arr[Math.floor(Math.random()*arr.length)]; }

function generateSensorTelemetry(sensorId){
  // status baseado em probabilidade (mock)
  const r = Math.random();
  let status = "ONLINE";
  let lastSeenMinutes = Math.floor(Math.random()*6); // 0-5 min

  if (r < 0.10) { status = "OFFLINE"; lastSeenMinutes = 20 + Math.floor(Math.random()*60); }
  else if (r < 0.25) { status = "DELAYED"; lastSeenMinutes = 7 + Math.floor(Math.random()*15); }

  const watts = Math.max(0, Math.round(700 + Math.random()*2800)); // 700-3500W
  const lastSeen = new Date(Date.now() - lastSeenMinutes*60*1000).toISOString();

  return { sensorId, status, lastSeen, watts };
}

function generateEvents(telemetryMap, limitW){
  const types = ["OFFLINE", "PEAK", "ANOMALY", "OUT_OF_HOURS"];
  const sev = { OFFLINE:"HIGH", PEAK:"HIGH", ANOMALY:"MEDIUM", OUT_OF_HOURS:"MEDIUM" };

  const events = [];
  const now = Date.now();

  for (const t of telemetryMap.values()){
    // offline vira evento
    if (t.status === "OFFLINE"){
      events.push({
        ts: new Date(now - Math.random()*30*60*1000).toISOString(),
        type: "OFFLINE",
        severity: sev.OFFLINE,
        sensorId: t.sensorId,
        desc: `Sensor sem comunicação há ${Math.round((now - new Date(t.lastSeen).getTime())/60000)} min (mock).`
      });
    }

    // pico
    if (t.watts > limitW){
      events.push({
        ts: new Date(now - Math.random()*25*60*1000).toISOString(),
        type: "PEAK",
        severity: sev.PEAK,
        sensorId: t.sensorId,
        desc: `Pico acima do limite (${t.watts} W > ${limitW} W).`
      });
    }

    // anomalia / fora do horário (mock aleatório)
    if (Math.random() < 0.12){
      const type = randomChoice(["ANOMALY","OUT_OF_HOURS"]);
      events.push({
        ts: new Date(now - Math.random()*90*60*1000).toISOString(),
        type,
        severity: sev[type],
        sensorId: t.sensorId,
        desc: type === "ANOMALY"
          ? "Variação súbita em relação à média recente (mock)."
          : "Consumo detectado fora do horário configurado (mock)."
      });
    }
  }

  // ordena por mais recente
  events.sort((a,b) => new Date(b.ts) - new Date(a.ts));
  return events.slice(0, 18);
}

function fillSelectors(){
  const localSel = $("local");
  const boardSel = $("quadro");
  const sensorSel = $("sensor");

  localSel.innerHTML = "";
  for (const loc of MOCK.structure){
    const o = document.createElement("option");
    o.value = loc.id;
    o.textContent = loc.name;
    localSel.appendChild(o);
  }

  function fillBoards(){
    const loc = MOCK.structure.find(x => x.id === localSel.value) || MOCK.structure[0];
    boardSel.innerHTML = "";
    for (const b of loc.boards){
      const o = document.createElement("option");
      o.value = b.id;
      o.textContent = b.name;
      boardSel.appendChild(o);
    }
    fillSensors();
  }

  function fillSensors(){
    const loc = MOCK.structure.find(x => x.id === localSel.value) || MOCK.structure[0];
    const b = loc.boards.find(x => x.id === boardSel.value) || loc.boards[0];
    sensorSel.innerHTML = "";
    for (const s of b.sensors){
      const o = document.createElement("option");
      o.value = s.id;
      o.textContent = s.name;
      sensorSel.appendChild(o);
    }
  }

  localSel.addEventListener("change", fillBoards);
  boardSel.addEventListener("change", fillSensors);
  fillBoards();
}

function flattenSensors(){
  const arr = [];
  for (const loc of MOCK.structure){
    for (const b of loc.boards){
      for (const s of b.sensors){
        arr.push({ ...s, localId: loc.id, localName: loc.name, boardId: b.id, boardName: b.name });
      }
    }
  }
  return arr;
}

function renderSensorsTable(telemetryMap){
  const tbody = $("tableSensors").querySelector("tbody");
  tbody.innerHTML = "";

  const allSensors = flattenSensors();

  for (const s of allSensors){
    const t = telemetryMap.get(s.id);
    const tr = document.createElement("tr");

    const status = t.status;
    const badge = status === "ONLINE" ? "OK" : (status === "DELAYED" ? "ATRASO" : "OFFLINE");
    const statusClass = status === "ONLINE" ? "" : (status === "DELAYED" ? "warn" : "danger");

    tr.innerHTML = `
      <td>${s.name}</td>
      <td><span class="tag ${statusClass}">${badge}</span></td>
      <td>${formatDt(t.lastSeen)}</td>
      <td>${t.watts.toLocaleString("pt-BR")} W</td>
    `;

    // clicar na linha seleciona o sensor no select (UX boa)
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      $("local").value = s.localId;
      $("local").dispatchEvent(new Event("change"));
      $("quadro").value = s.boardId;
      $("quadro").dispatchEvent(new Event("change"));
      $("sensor").value = s.id;
      updateSubtitle();
    });

    tbody.appendChild(tr);
  }
}

function renderAlerts(events){
  const ul = $("alertsList");
  ul.innerHTML = "";

  const top = events.slice(0, 6);
  for (const e of top){
    const li = document.createElement("li");
    li.className = "alert";

    const kind = (e.severity === "HIGH") ? "danger" : "warn";
    const tag = (e.type === "OFFLINE") ? "Offline"
              : (e.type === "PEAK") ? "Pico"
              : (e.type === "ANOMALY") ? "Anomalia"
              : "Fora do horário";

    li.innerHTML = `
      <div class="title">
        <span>${tag}</span>
        <span class="tag ${kind}">${e.severity}</span>
      </div>
      <p><strong>${e.sensorId}</strong> • ${e.desc}</p>
    `;
    ul.appendChild(li);
  }
}

function renderEventsTable(events){
  const filter = $("eventFilter").value;
  const tbody = $("tableEvents").querySelector("tbody");
  tbody.innerHTML = "";

  const shown = (filter === "all") ? events : events.filter(e => e.type === filter);

  for (const e of shown){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDt(e.ts)}</td>
      <td>${e.type}</td>
      <td>${e.severity}</td>
      <td>${e.sensorId}</td>
      <td>${e.desc}</td>
    `;
    tbody.appendChild(tr);
  }
}

function setKpis(telemetryMap, events){
  let online = 0, offline = 0, delayed = 0;

  for (const t of telemetryMap.values()){
    if (t.status === "ONLINE") online++;
    else if (t.status === "OFFLINE") offline++;
    else delayed++;
  }

  $("kpiOnline").textContent = online;
  $("kpiOffline").textContent = offline;
  $("kpiAtraso").textContent = delayed;
  $("kpiAlerts").textContent = events.length;
}

function updateSubtitle(){
  const locText = $("local").selectedOptions[0]?.textContent || "";
  const bText = $("quadro").selectedOptions[0]?.textContent || "";
  const sText = $("sensor").selectedOptions[0]?.textContent || "";

  $("subtitle").textContent = `Filtro: ${locText} • ${bText} • ${sText} (mock)`;
}

let chartW = null;
let timer = null;

function buildChart(){
  const ctx = $("chartW");
  if (chartW) chartW.destroy();

  // 20 pontos iniciais
  const labels = Array.from({ length: 20 }, (_, i) => `-${(19-i)}x`);
  const data = Array.from({ length: 20 }, () => Math.round(900 + Math.random()*2400));

  chartW = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [{
        label: "W",
        data,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          ticks: { display: false },
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

function startRealtimeMock(){
  if (timer) clearInterval(timer);

  const interval = Number($("intervalo").value || 30) * 1000;

  timer = setInterval(() => {
    if (!chartW) return;
    const ds = chartW.data.datasets[0].data;
    ds.push(Math.round(900 + Math.random()*2600));
    ds.shift();
    chartW.update("none");

    $("statusTag").querySelector("span:last-child").textContent = "Atualizado agora";
  }, interval);
}

function refreshAll(){
  updateSubtitle();

  const sensors = flattenSensors();
  const telemetryMap = new Map();

  for (const s of sensors){
    telemetryMap.set(s.id, generateSensorTelemetry(s.id));
  }

  const limitW = Number($("limitePico").value || 3500);
  const events = generateEvents(telemetryMap, limitW);
  MOCK.events = events;

  renderSensorsTable(telemetryMap);
  renderAlerts(events);
  renderEventsTable(events);
  setKpis(telemetryMap, events);

  $("statusTag").querySelector("span:last-child").textContent = "Atualizado agora";
}

function main(){
  fillSelectors();
  buildChart();
  startRealtimeMock();
  refreshAll();

  $("btnAplicar").addEventListener("click", () => {
    updateSubtitle();
  });

  $("btnRefresh").addEventListener("click", refreshAll);

  $("intervalo").addEventListener("change", startRealtimeMock);

  $("limitePico").addEventListener("change", refreshAll);

  $("eventFilter").addEventListener("change", () => {
    renderEventsTable(MOCK.events);
  });

  $("btnExportSensors").addEventListener("click", () => {
    const rows = [["Sensor", "Local", "Quadro"]];
    for (const s of flattenSensors()){
      rows.push([s.name, s.localName, s.boardName]);
    }
    exportCsv("energia_verde_sensores.csv", rows);
  });

  $("btnExportEvents").addEventListener("click", () => {
    const rows = [["DataHora", "Tipo", "Severidade", "Sensor", "Descricao"]];
    for (const e of MOCK.events){
      rows.push([formatDt(e.ts), e.type, e.severity, e.sensorId, e.desc]);
    }
    exportCsv("energia_verde_eventos.csv", rows);
  });

  // limpa timer se sair da página
  window.addEventListener("beforeunload", () => {
    if (timer) clearInterval(timer);
  });
}

document.addEventListener("DOMContentLoaded", main);