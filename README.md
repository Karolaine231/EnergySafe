# ⚡ EnergySafe — Frontend

Interface web da plataforma EnergySafe. Dashboard estático em **HTML + CSS + JavaScript puro** com dois painéis de acesso por perfil: financeiro e manutenção. Sem frameworks — apenas Chart.js para os gráficos.

> **Deploy:** [energy-safe.vercel.app](https://energy-safe.vercel.app)

---

## 📁 Estrutura de arquivos

```
frontend/
├── index.html          # Tela de login (entrada)
├── login.css           # Estilos da tela de login
├── login.js            # Lógica de autenticação por perfil
├── financeiro.html     # Painel financeiro
├── financeiro.css      # Estilos do painel financeiro
├── financeiro.js       # Lógica do painel financeiro
├── manutencao.html     # Painel de manutenção
├── manutencao.css      # Estilos do painel de manutenção
├── manutencao.js       # Lógica do painel de manutenção
├── sobre.html          # Página institucional
├── sobre.css           # Estilos da página sobre
└── EnergiaVerdeLogo.png
```

---

## 🔐 Autenticação

O login é baseado em **e-mail + perfil**. Não há autenticação com servidor — o e-mail digitado define qual painel será aberto:

| E-mail | Destino |
|---|---|
| `financeiro@energia.com` | `financeiro.html` |
| `manutencao@energia.com` | `manutencao.html` |
| Qualquer outro | Erro de acesso |

> Isso é um protótipo acadêmico. Para produção, substitua por autenticação real (JWT, OAuth, etc.).

---

## 📊 Painel Financeiro (`financeiro.html`)

Voltado para gestores e setor financeiro. Foco em custos, consumo e rateio.

### Abas de navegação

**Visão Geral**
- KPIs: kWh do período, custo estimado, número de faturas, tarifa vigente
- Gráfico de barras — evolução mensal do consumo (kWh/mês)
- Gráfico donut — rateio por área (% do consumo)
- Tabela resumo por fatura com totais de kWh e custo

**Faturas**
- Lista de faturas cadastradas com status, mês e valor
- Detalhe da fatura selecionada com tabela de rateio por área
- Botão de recalcular rateio
- Download do PDF de rateio (gerado pelo backend)

**Rateio por Área**
- Seleção de fatura
- Gráfico donut + tabela: área, kWh, % do total, R$ a pagar

**Metas**
- Tabela de metas cadastradas (baseline vs meta em kWh)
- Gráfico de barras comparando baseline × meta × realizado

### Endpoints consumidos

```
GET /locais/
GET /areas/
GET /faturas/
GET /faturas/{id}/rateio
GET /metas/
POST /faturas/{id}/recalcular
GET /relatorios/rateio/{id}      ← download PDF
```

### Funções principais (`financeiro.js`)

| Função | Descrição |
|---|---|
| `inicializar()` | Carrega locais, áreas, faturas e KPIs |
| `renderKPIs()` | Calcula e exibe os cards de resumo |
| `renderGraficoEvolucao()` | Gráfico de barras com Chart.js |
| `renderRateioVisaoGeral()` | Donut de rateio na visão geral |
| `renderFaturasList()` | Lista de faturas com seleção |
| `selecionarFatura()` | Carrega detalhe e rateio da fatura |
| `renderRateioAreaPage()` | Página de rateio por área |
| `renderMetas()` | Tabela e gráfico de metas |
| `baixarPdf()` | Dispara download do relatório PDF |
| `exportarCSV()` | Exporta tabela visível como `.csv` |

---

## 🔧 Painel de Manutenção (`manutencao.html`)

Voltado para técnicos e equipe de TI. Foco em sensores, alertas e leituras em tempo quase real.

### Abas de navegação

**Status dos Sensores**
- KPIs: sensores online / offline / com atraso / alertas ativos
- Tabela com status de cada dispositivo (última leitura, potência atual, tempo desde última leitura)

**Consumo Diário**
- Gráfico de linhas — kWh/dia por canal ou agregado
- Filtros de período e modo de visualização (por canal ou total)

**Potência Atual**
- Totais de potência ativa, aparente e reativa
- Fator de potência médio
- Tabela por fase (A, B, C) com leituras em tempo quase real

**Medições**
- Gráfico de linhas com histórico de medições brutas
- Seleção de canal e intervalo

**Alertas**
- Lista de alertas ativos e histórico
- Filtro por tipo (`sobrecorrente`, `consumo_fora_horario`, `queda_brusca`) e nível (`aviso`, `critico`)
- Botão de resolver alerta individualmente

### Endpoints consumidos

```
GET /locais
GET /quadros
GET /dispositivos
GET /consumo/
GET /alertas/
GET /medicoes/
PATCH /alertas/{id}/resolver
```

### Funções principais (`manutencao.js`)

| Função | Descrição |
|---|---|
| `carregarLocais()` | Popula o filtro de locais |
| `carregarQuadros()` | Popula o filtro de quadros |
| `carregarDispositivos()` | Carrega status dos sensores |
| `carregarConsumo()` | Busca consumo diário e renderiza gráfico |
| `carregarAlertasAPI()` | Lista alertas com filtros |
| `resolverAlerta()` | Chama PATCH /alertas/{id}/resolver |
| `carregarMedicoesGerais()` | Busca medições e renderiza gráfico |
| `exportCsv()` | Exporta qualquer tabela visível como `.csv` |

---

## ⚙️ Configuração

### API Base URL

Em cada arquivo `.js`, localize e ajuste a constante da URL da API:

```js
// Desenvolvimento
const API_BASE = "http://localhost:8000";

// Produção
const API_BASE = "https://backendsafe.onrender.com";
```

### Filtros em cascata

Os dois painéis implementam filtros em cascata **Local → Quadro → Dispositivo/Canal**. Ao selecionar um local, os quadros são recarregados; ao selecionar um quadro, os dispositivos/canais são recarregados.

---

## 🚀 Como rodar localmente

### Opção 1 — Abrir direto no navegador

Para testes rápidos (sem chamadas à API), abra `index.html` diretamente no browser.

### Opção 2 — Servidor local (recomendado)

Necessário para que as chamadas à API funcionem sem problemas de CORS:

```bash
# Com Node.js
npx serve .

# Com Python
python -m http.server 5500
```

Acesse: `http://localhost:5500`

### Opção 3 — Live Server (VS Code)

Instale a extensão **Live Server** e clique em `Go Live` no canto inferior direito.

---

## 📦 Dependências externas

Todas carregadas via CDN — sem instalação:

| Biblioteca | Versão | Uso |
|---|---|---|
| [Chart.js](https://www.chartjs.org/) | 4.4.1 | Gráficos de barras, linhas e donut |

---

## 🌐 Deploy (Vercel)

O frontend é **100% estático** — pode ser publicado em qualquer CDN ou serviço de hosting estático.

Para publicar na Vercel:

1. Faça fork do repositório
2. Importe no [vercel.com](https://vercel.com)
3. Configure a variável de API_BASE nos arquivos `.js` apontando para o backend em produção
4. Deploy automático a cada push

---

## 🔗 Relacionado

- [Backend API — EnergySafe](https://github.com/Julyxdias/BackendSafe/tree/Julyxdias-Backend-API) — FastAPI que serve os dados
- [Firmware ESP32](../firmware/) — coleta as medições nos quadros elétricos
- [Schema do banco](../database/) — PostgreSQL com schema completo

---

## 📜 Licença

MIT — livre para uso, modificação e distribuição.
