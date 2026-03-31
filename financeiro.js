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

async function carregarLocais() {
  const select = $("local");
  select.innerHTML = `<option value="">Carregando...</option>`;

  const locais = await getJSON(`${API_BASE}/locais`);
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

  const quadros = await getJSON(`${API_BASE}/quadros?local_id=${localId}`);
  select.innerHTML = "";

  if (!quadros.length) {
    select.innerHTML = `<option value="">Nenhum quadro encontrado</option>`;
    $("circuito").innerHTML = `<option value="">Sem circuitos</option>`;
    return;
  }

  quadros.forEach(quadro => {
    const option = document.createElement("option");
    option.value = quadro.id;
    option.textContent = quadro.nome || `Quadro ${quadro.id}`;
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

  const canais = await getJSON(`${API_BASE}/canais?quadro_id=${quadroId}`);
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
