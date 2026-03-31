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

function formatDt(dt) {
  if (!dt) return "-";

  const d = new Date(dt);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
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

let chartW = null;
let sensoresCache = [];
let eventosCache = [];

async function carregarLocais() {
  const select = $("local");
  select.innerHTML = `<option value="">Carregando...</option>`;

  const locais = await getJSON(`${API_BASE}/locais.php`);

  select.innerHTML = "";

  if (!locais.length) {
    select.innerHTML = `<option value="">Nenhum local encontrado</option>`;
    $("quadro").innerHTML = `<option value="">Sem dados</option>`;
    $("sensor").innerHTML = `<option value="">Sem dados</option>`;
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
    $("sensor").innerHTML = `<option value="">Selecione um quadro</option>`;
    return;
  }

  const quadros = await getJSON(`${API_BASE}/quadros.php?local_id=${localId}`);

  select.innerHTML = "";

  if (!quadros.length) {
    select.innerHTML = `<option value="">Nenhum quadro encontrado</option>`;
    $("sensor").innerHTML = `<option value="">Sem sensores</option>`;
    return;
  }

  quadros.forEach(quadro => {
    const option = document.createElement("option");
    option.value = quadro.id;
    option.textContent = quadro.nome;
    select.appendChild(option);
  });

  await carregarDispositivos(select.value);
}

async function carregarDispositivos(quadroId) {
  const select = $("sensor");
  select.innerHTML = `<option value="">Carregando...</option>`;

  if (!quadroId) {
    select.innerHTML = `<option value="">Selecione um quadro</option>`;
    return;
  }

  const dispositivos = await getJSON(`${API_BASE}/dispositivos.php?quadro_id=${quadroId}`);

  select.innerHTML = "";

  if (!dispositivos.length) {
    select.innerHTML = `<option value="">Nenhum sensor encontrado</option>`;
    return;
  }

  dispositivos.forEach(dispositivo => {
    const option = document.createElement("option");
    option.value = dispositivo.id;
    option.textContent = dispositivo.nome;
    select.appendChild(option);
  });
}

async function carregarKPIs() {
  const data = await getJSON(`${API_BASE}/kpis_manutencao.php`);

  $("kpiOnline").textContent = data.online ?? 0;
  $("kpiOffline").textContent = data.offline ?? 0;
  $("kpiAtraso").textContent = data.atraso ?? 0;
  $("kpiAlerts").textContent = data.alertas_ativos ?? 0;
}

async function carregarTabelaSensores() {
  const quadroId = $("quadro").value;

  if (!quadroId) {
    $("tableSensors").querySelector("tbody").innerHTML = "";
    sensoresCache = [];
    return;
  }

  const sensores = await getJSON(`${API_BASE}/sensores_status.php?quadro_id=${quadroId}`);
  sensoresCache = sensores;

  const tbody = $("tableSensors").querySelector("tbody");
  tbody.innerHTML = "";

  if (!sensores.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="4">Nenhum sensor encontrado para este quadro.</td>
      </tr>
    `;
    return;
  }

  sensores.forEach(sensor => {
    const tr = document.createElement("tr");

    let statusTexto = sensor.status;
    let statusClass = "";

    if (sensor.status === "ONLINE") {
      statusTexto = "OK";
    } else if (sensor.status === "ATRASO") {
      statusTexto = "ATRASO";
      statusClass = "warn";
    } else if (sensor.status === "OFFLINE") {
      statusTexto = "OFFLINE";
      statusClass = "danger";
    }

    tr.innerHTML = `
      <td>${sensor.sensor}</td>
      <td><span class="tag ${statusClass}">${statusTexto}</span></td>
      <td>${formatDt(sensor.ultima_leitura)}</td>
      <td>${Number(sensor.potencia_atual || 0).toFixed(1)} W</td>
    `;

    tbody.appendChild(tr);
  });
}

async function carregarAlertas() {
  const quadroId = $("quadro").value;

  if (!quadroId) {
    $("alertsList").innerHTML = "";
    return;
  }

  const alertas = await getJSON(`${API_BASE}/alertas.php?quadro_id=${quadroId}`);
  const ul = $("alertsList");
  ul.innerHTML = "";

  if (!alertas.length) {
    ul.innerHTML = `<li class="alert"><p>Nenhum alerta encontrado.</p></li>`;
    return;
  }

  alertas.forEach(alerta => {
    const li = document.createElement("li");
    li.className = "alert";

    let nivelClass = "";
    if (String(alerta.nivel).toLowerCase() === "critico") nivelClass = "danger";
    if (String(alerta.nivel).toLowerCase() === "aviso") nivelClass = "warn";

    li.innerHTML = `
      <div class="title">
        <span>${alerta.tipo}</span>
        <span class="tag ${nivelClass}">${alerta.nivel}</span>
      </div>
      <p><strong>${alerta.sensor}</strong> • ${alerta.mensagem}</p>
    `;

    ul.appendChild(li);
  });
}

async function carregarEventos() {
  const quadroId = $("quadro").value;
  const tipo = $("eventFilter").value;

  if (!quadroId) {
    $("tableEvents").querySelector("tbody").innerHTML = "";
    eventosCache = [];
    return;
  }

  const eventos = await getJSON(`${API_BASE}/eventos.php?quadro_id=${quadroId}&tipo=${encodeURIComponent(tipo)}`);
  eventosCache = eventos;

  const tbody = $("tableEvents").querySelector("tbody");
  tbody.innerHTML = "";

  if (!eventos.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Nenhum evento encontrado.</td>
      </tr>
    `;
    return;
  }

  eventos.forEach(evento => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDt(evento.timestamp)}</td>
      <td>${evento.tipo}</td>
      <td>${evento.nivel}</td>
      <td>${evento.sensor}</td>
      <td>${evento.mensagem}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function carregarGrafico() {
  const dispositivoId = $("sensor").value;
  const intervaloMin = $("intervalo").value || 30;

  if (!dispositivoId) {
    if (chartW) {
      chartW.destroy();
      chartW = null;
    }
    return;
  }

  const dados = await getJSON(`${API_BASE}/grafico_potencia.php?dispositivo_id=${dispositivoId}&intervalo=${intervaloMin}`);

  const labels = dados.map(item => {
    return new Date(item.timestamp).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit"
    });
  });

  const valores = dados.map(item => Number(item.potencia_total || 0));
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

function atualizarSubtitulo() {
  const localText = $("local").selectedOptions[0]?.textContent || "-";
  const quadroText = $("quadro").selectedOptions[0]?.textContent || "-";
  const sensorText = $("sensor").selectedOptions[0]?.textContent || "-";

  $("subtitle").textContent = `Filtro: ${localText} • ${quadroText} • ${sensorText}`;
}

async function carregarPainelCompleto() {
  atualizarSubtitulo();
  await carregarKPIs();
  await carregarTabelaSensores();
  await carregarAlertas();
  await carregarEventos();
  await carregarGrafico();

  $("statusTag").querySelector("span:last-child").textContent = "Atualizado agora";
}

function configurarExportacoes() {
  $("btnExportSensors").addEventListener("click", () => {
    const rows = [["Sensor", "Status", "Ultima Leitura", "W Agora"]];

    sensoresCache.forEach(sensor => {
      rows.push([
        sensor.sensor,
        sensor.status,
        formatDt(sensor.ultima_leitura),
        Number(sensor.potencia_atual || 0).toFixed(1)
      ]);
    });

    exportCsv("sensores_manutencao.csv", rows);
  });

  $("btnExportEvents").addEventListener("click", () => {
    const rows = [["DataHora", "Tipo", "Severidade", "Sensor", "Descricao"]];

    eventosCache.forEach(evento => {
      rows.push([
        formatDt(evento.timestamp),
        evento.tipo,
        evento.nivel,
        evento.sensor,
        evento.mensagem
      ]);
    });

    exportCsv("eventos_manutencao.csv", rows);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await carregarLocais();
    await carregarPainelCompleto();

    $("local").addEventListener("change", async (e) => {
      await carregarQuadros(e.target.value);
      await carregarPainelCompleto();
    });

    $("quadro").addEventListener("change", async (e) => {
      await carregarDispositivos(e.target.value);
      await carregarPainelCompleto();
    });

    $("sensor").addEventListener("change", async () => {
      atualizarSubtitulo();
      await carregarGrafico();
    });

    $("eventFilter").addEventListener("change", async () => {
      await carregarEventos();
    });

    $("intervalo").addEventListener("change", async () => {
      await carregarGrafico();
    });

    $("btnAplicar").addEventListener("click", async () => {
      await carregarPainelCompleto();
    });

    $("btnRefresh").addEventListener("click", async () => {
      await carregarPainelCompleto();
    });

    configurarExportacoes();

  } catch (error) {
    console.error(error);
    alert("Erro ao carregar dados do painel de manutenção.");
  }
});
