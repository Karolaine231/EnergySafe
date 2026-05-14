# ⚡ EnergySafe

> Plataforma IoT de monitoramento energético com rateio de fatura por área — desenvolvida para instituições de ensino e hospitais-escola.

---

## Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Arquitetura](#arquitetura)
- [Stack Tecnológica](#stack-tecnológica)
- [Estrutura do Banco de Dados](#estrutura-do-banco-de-dados)
- [Hardware](#hardware)
- [Backend — API](#backend--api)
- [Frontend](#frontend)
- [Regras de Alerta](#regras-de-alerta)
- [Rateio de Fatura](#rateio-de-fatura)
- [Como Executar](#como-executar)
- [Variáveis de Ambiente](#variáveis-de-ambiente)
- [Roadmap](#roadmap)

---

## Sobre o Projeto

O **EnergySafe** captura o consumo de energia elétrica por área física de um edifício (andares, alas, setores) e divide o valor da fatura mensal proporcionalmente ao consumo real de cada área — substituindo o rateio igualitário por um modelo baseado em dados reais.

**O sistema não controla cargas.** Ele apenas monitora, registra e analisa.

### Problema resolvido

Em instituições com múltiplas áreas (administrativo, TI, ala cirúrgica, UTI), a conta de energia costuma ser dividida igualmente ou por estimativa. O EnergySafe torna o rateio **justo e auditável**, baseado em medição real por circuito.

---

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        CAMPO                                │
│                                                             │
│   TC Clamp (SCT-013)                                        │
│        │                                                    │
│   Condicionamento de sinal                                  │
│        │                                                    │
│   ESP32 (ADC + HTTP)                                        │
│        │                                                    │
│        └──── POST /medicoes ────────────────────────────┐  │
└─────────────────────────────────────────────────────────│──┘
                                                          │
┌─────────────────────────────────────────────────────────▼──┐
│                      SERVIDOR                               │
│                                                             │
│   FastAPI  ──────────────────────────────►  PostgreSQL      │
│      │                                                      │
│      ├── Calcula alertas (Python)                           │
│      ├── Calcula potência (P = I × V)                       │
│      └── Job noturno: consumo_diario (kWh)                  │
└─────────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────┐
│                      FRONTEND (Vercel)                      │
│                                                             │
│   Login ──► Financeiro (rateio, kWh, custos)                │
│         └── Manutenção (sensores, alertas, log)             │
└─────────────────────────────────────────────────────────────┘
```

### Hierarquia de dados

```
Local → Área → Quadro → Dispositivo → Canal → Medição
                                              └──────► Alerta
```

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| Hardware | ESP32 + SCT-013 (TC Clamp) |
| Firmware | C++ (Arduino framework) |
| Backend | Python 3.11 + FastAPI |
| ORM | SQLAlchemy |
| Banco | PostgreSQL 15 |
| Validação | Pydantic v2 |
| Servidor ASGI | Uvicorn |
| Frontend | HTML + CSS + JavaScript (Vanilla) |
| Gráficos | Chart.js 4 |
| Deploy API | Render |
| Deploy Frontend | Vercel |
| Containerização | Docker + Docker Compose |

---

## Estrutura do Banco de Dados

### Tabelas principais

```
locais              → local físico (prédio, andar)
areas               → agrupamento lógico (ala, setor)
quadros             → quadro elétrico (vinculado à área)
dispositivos        → ESP32 instalado no quadro
canais_medicao      → canal por fase (A, B, C)
medicoes            → leituras de corrente/tensão/potência
alertas             → notificações geradas automaticamente
```

### Tabelas de rateio

```
consumo_diario      → kWh acumulado por canal por dia
faturas             → valor real da fatura mensal
rateio              → resultado calculado por área
tarifas             → R$/kWh por local (para estimativas)
metas               → baseline e meta de redução
```

### Fluxo do rateio

```
consumo_diario (kWh por canal)
    │
    ▼ agrega por área (via quadros.area_id)
    │
    ▼
kWh por área ──── fatura (R$ total) ────► R$ por área
                                           │
                                           ▼
                                        rateio (salvo no banco)
```

**Fórmula:**
```
R$ área = (kWh área / kWh total medido) × valor da fatura
```

---

## Hardware

### Componentes por ponto de medição

| Componente | Modelo | Qtd |
|---|---|---|
| Microcontrolador | ESP32 (38 pinos) | 1 |
| Sensor de corrente | SCT-013-030 | 3 |
| Sensor de tensão | ZMPT101B | 3 |
| Módulo SD Card | SPI (CS GPIO5) | 1 |

### Cadeia de Medição

```text
Rede Elétrica (CA)
      │
      ├── SCT-013 (TC de corrente) ──► sinal analógico de tensão
      │                                       │
      └── ZMPT101B (TT de tensão) ──►  sinal analógico de tensão
                                              │
                                    ADC interno do ESP32
                                    (GPIOs 34/35/32 e 33/25/26)
                                              │
                                         EmonLib
                                    calcVI(1480, 2000)
                                              │
                              ┌───────────────┼───────────────┐
                           Irms (A)        Vrms (V)       Potência (W)
                                              │
                                       Filtragem de ruído
                              (I < 0.1A → 0 | V < 5V → 0)
                                              │
                                        Timestamp NTP
                                              │
                                       Payload JSON
                                              │
                              ┌───────────────┴───────────────┐
                         Wi-Fi ok?                       Wi-Fi falhou?
                              │                                │
                         HTTP POST                       pending.csv
                       (HTTPS/TLS)                        no SD card

---
   
### Configuração do firmware

Edite o bloco de configurações no topo do arquivo `.ino`:

```cpp
// Wi-Fi
const char* WIFI_SSID     = "SuaRede";
const char* WIFI_PASSWORD = "SuaSenha";

// Endpoint da API
const char* API_URL = "https://seu-backend.com/medicoes/";

// IDs dos canais no backend
const int CANAL_A = 1;
const int CANAL_B = 2;
const int CANAL_C = 3;

// Calibração dos sensores
const double CAL_CORRENTE = 111.1;   // SCT-013-030
const double CAL_TENSAO   = 234.26;  // ZMPT101B — ajuste conforme sua rede
const double DEFASAGEM    = 1.7;
```

### Intervalos

```cpp
#define COLLECT_INTERVAL_MS  60000UL  // leitura a cada 60s
#define RETRY_INTERVAL_MS   120000UL  // reenvio SD a cada 2min
#define WIFI_CHECK_MS        15000UL  // verificação Wi-Fi a cada 15s
#define MAX_PENDING_LINES     3000    // limite do buffer no SD
```

> Cada ESP32 físico tem seu próprio `config.h` com o `CANAL_ID` correspondente ao canal cadastrado no banco.

### Payload enviado à API

```json
{
  "timestamp": "2026-03-31T14:30:00",
  "canal_id":  1,
  "corrente":  18.542,
  "tensao":    220.0,
  "potencia":  4079.2,
  "valido":    true
}
```

---

## Backend — API

### Endpoints

| Método | Rota | Descrição |
|---|---|---|
| GET | `/` | Health check |
| GET/POST/DELETE | `/locais` | CRUD de locais |
| GET/POST/DELETE | `/quadros` | CRUD de quadros |
| GET/POST/DELETE | `/dispositivos` | CRUD de dispositivos |
| PATCH | `/dispositivos/{id}/status` | Ativa/desativa dispositivo |
| GET/POST/DELETE | `/canais` | CRUD de canais de medição |
| GET/POST/DELETE | `/medicoes` | Leituras do ESP32 |
| GET/POST/PATCH/DELETE | `/alertas` | Gerenciamento de alertas |
| PATCH | `/alertas/{id}/resolver` | Resolve um alerta |

### Documentação interativa

Após subir a API, acesse:
- **Swagger UI:** `http://localhost:8000/docs`
- **ReDoc:** `http://localhost:8000/redoc`

### Lógica de alertas (Python)

A cada `POST /medicoes`, o backend executa `_verificar_alertas()` com 3 regras:

| Regra | Condição | Nível |
|---|---|---|
| Sobrecorrente | `corrente > 40A` | `critico` |
| Consumo fora do horário | `corrente > 10A` e hora fora de 06h–22h | `aviso` |
| Queda brusca | `corrente atual < corrente anterior × 30%` | `aviso` |

> Os limites são constantes configuráveis em `routes/medicoes.py`.

---

## Frontend

Duas telas protegidas por perfil de acesso via e-mail:

### Painel Financeiro (`financeiro@energia.com`)
- KPIs: kWh do período, custo estimado, pico de potência, indicador de redução
- Gráfico de consumo diário (kWh/dia)
- Rateio por área (gráfico donut + tabela)
- Pontos de atenção (alertas com impacto financeiro)
- Exportação CSV e impressão

### Painel de Manutenção (`manutencao@energia.com`)
- KPIs: sensores online / offline / com atraso / alertas ativos
- Status de cada sensor (última leitura, potência atual)
- Gráfico de potência em tempo quase real por sensor
- Log de eventos filtrado por tipo
- Exportação CSV

> **Filtros em cascata:** Local → Quadro → Dispositivo/Canal em todos os painéis.

---

## Regras de Alerta

Os alertas são gerados automaticamente pelo backend Python (sem triggers no banco) após cada inserção de medição. Isso centraliza a lógica em um único lugar e evita duplicação.

```python
# routes/medicoes.py
LIMITE_SOBRECORRENTE = 40.0   # Amperes
LIMITE_FORA_HORARIO  = 10.0   # Amperes
HORA_INICIO          = 6
HORA_FIM             = 22
QUEDA_FATOR          = 0.3    # 30% da leitura anterior
```

---

## Rateio de Fatura

### Fluxo mensal

1. ESP32 envia medições a cada 30s → `medicoes`
2. Job noturno (backend) acumula kWh por canal → `consumo_diario`
3. Usuário cadastra o valor da fatura do mês → `faturas`
4. Backend calcula e persiste o rateio por área → `rateio`
5. Frontend exibe o resultado com exportação CSV

### Query de rateio

```sql
SELECT
    a.nome          AS area,
    r.kwh           AS "kWh consumido",
    r.percentual    AS "%",
    r.valor_rs      AS "R$ a pagar"
FROM rateio r
JOIN faturas f ON r.fatura_id = f.id
JOIN areas   a ON r.area_id   = a.id
WHERE f.mes = '2026-03-01'
ORDER BY r.valor_rs DESC;
```

---

## Como Executar

### Pré-requisitos

- Docker e Docker Compose
- Python 3.11+
- Node.js (opcional, para servir o frontend localmente)

### 1. Banco de dados

```bash
docker-compose up -d
```

Depois execute os SQLs na ordem:

```bash
psql -U postgres -d energysafe -f banco.sql
psql -U postgres -d energysafe -f tester.sql   # dados de exemplo
```

### 2. API

```bash
cd api
pip install -r requirements.txt
uvicorn main:app --reload
```

A API sobe em `http://localhost:8000`.

### 3. Frontend

Abra `login.html` no navegador ou sirva com qualquer servidor estático:

```bash
npx serve .
```

Configure a `API_BASE` nos arquivos JS:

```javascript
const API_BASE = "http://localhost:8000";  // desenvolvimento
// const API_BASE = "https://sua-api.up.railway.app";  // produção
```

### 4. Firmware

1. Abra `esp32_http_api.ino` no Arduino IDE
2. Edite `config.h` com suas credenciais Wi-Fi, URL da API e `CANAL_ID`
3. Grave no ESP32

---

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:******@localhost:5432/seubanco` | String de conexão do banco |

---

## Estrutura de Arquivos

```
energysafe/
│
├── api/                        # Backend FastAPI
│   ├── main.py                 # App, CORS, routers
│   ├── database.py             # Conexão SQLAlchemy
│   ├── models.py               # Modelos ORM
│   ├── schemas.py              # Schemas Pydantic
│   └── routes/
│       ├── locais.py
│       ├── quadros.py
│       ├── dispositivos.py
│       ├── canais.py
│       ├── medicoes.py         # Lógica de alertas aqui
│       └── alertas.py
│
├── frontend/                   # Frontend estático
│   ├── login.html / login.css / login.js
│   ├── financeiro.html / financeiro.css / financeiro.js
│   ├── manutencao.html / manutencao.css / manutencao.js
│   └── sobre.html / sobre.css
│
├── firmware/                   # Código do ESP32
│   ├── esp32_http_api.ino
│   └── config.h
│
├── sql/                        # Scripts de banco
│   ├── banco.sql               # Criação das tabelas
│   └── tester.sql              # Dados de teste + queries
│
└── docker-compose.yml          # PostgreSQL local
```

---

## Roadmap

- [ ] Endpoint `POST /faturas` com cálculo automático de rateio
- [ ] Tela de cadastro de faturas no frontend
- [ ] Alertas por e-mail / push notification


---

*EnergySafe — Protótipo acadêmico aplicado · v0.1*
