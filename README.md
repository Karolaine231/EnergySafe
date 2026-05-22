# ⚡ EnergySafe — Backend API

API REST construída com **FastAPI** para a plataforma de monitoramento energético EnergySafe. Recebe medições dos dispositivos ESP32, detecta alertas automaticamente, calcula consumo diário, gerencia faturas com rateio por área e gera relatórios em PDF.

> **Deploy:** [backendsafe.onrender.com](https://backendsafe.onrender.com)  
> **Docs interativas:** [backendsafe.onrender.com/docs](https://backendsafe.onrender.com/docs)

---

## 🏗️ Stack

| Camada | Tecnologia |
|---|---|
| Framework | FastAPI 0.100+ |
| ORM | SQLAlchemy |
| Banco de dados | PostgreSQL (SSL obrigatório) |
| Scheduler | APScheduler (job noturno 00:05) |
| PDF | ReportLab |
| HTTP client | HTTPX (integração Enel) |
| Deploy | Render.com |

---

## 📁 Estrutura do projeto

```
BackendSafe/
├── main.py               # App FastAPI, CORS, routers, scheduler
├── database.py           # Engine SQLAlchemy, SessionLocal, Base
├── models.py             # Modelos ORM (todas as tabelas)
├── schemas.py            # Schemas Pydantic (request/response)
├── enel_client.py        # Cliente HTTP para microserviço Enel SP
├── persistir_fatura.py   # Lógica de persistência de faturas Enel
├── requirements.txt      # Dependências
├── migration/            # Scripts SQL de migração
└── routes/
    ├── locais.py         # CRUD de locais físicos
    ├── areas.py          # CRUD de áreas
    ├── quadros.py        # CRUD de quadros elétricos
    ├── dispositivos.py   # CRUD de dispositivos ESP32
    ├── canais.py         # CRUD de canais de medição
    ├── medicoes.py       # Ingestão de medições + detecção de alertas
    ├── alertas.py        # Consulta e resolução de alertas
    ├── consumo.py        # Consulta de consumo diário agregado
    ├── faturas.py        # Faturas + cálculo automático de rateio
    ├── tarifas.py        # Histórico de tarifas (R$/kWh)
    ├── metas.py          # Metas de consumo
    ├── jobs.py           # Job de cálculo de kWh (manual + agendado)
    └── relatorios.py     # Geração de relatório PDF de rateio
```

---

## 🚀 Como rodar localmente

### 1. Pré-requisitos

- Python 3.11+
- PostgreSQL (local ou nuvem, ex: Supabase, Neon)

### 2. Clone e instale as dependências

```bash
git clone https://github.com/Julyxdias/BackendSafe.git
cd BackendSafe
git checkout Julyxdias-Backend-API

python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz:

```env
DATABASE_URL=postgresql://usuario:senha@host:5432/energysafe
```

> A conexão com o PostgreSQL exige `sslmode=require`. Para banco local sem SSL, ajuste `database.py` removendo `connect_args`.

### 4. Inicie o servidor

```bash
uvicorn main:app --reload
```

Acesse: `http://localhost:8000/docs`

---

## 🗺️ Hierarquia de entidades

```
Local
  └── Área
  └── Quadro
        └── Dispositivo (ESP32)
              └── Canal de Medição (Fase A/B/C)
                    └── Medição (série temporal)
                    └── Consumo Diário (kWh agregado)
                    └── Alerta
```

---

## 📡 Endpoints

### Estrutura física

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/locais/` | Lista ou cria locais |
| GET/PUT/DELETE | `/locais/{id}` | Detalha, atualiza ou remove |
| GET/POST | `/areas/` | Lista ou cria áreas |
| GET/POST | `/quadros/` | Lista ou cria quadros |
| GET/POST | `/dispositivos/` | Lista ou cria dispositivos |
| GET/POST | `/canais/` | Lista ou cria canais de medição |

### Medições

| Método | Rota | Descrição |
|---|---|---|
| POST | `/medicoes/` | Recebe medição do ESP32 e dispara verificação de alertas |
| GET | `/medicoes/` | Lista medições com filtros (canal, período, valido) |
| GET | `/medicoes/ultimo/{canal_id}` | Última medição de um canal |

**Payload de entrada (ESP32 → API):**
```json
{
  "canal_id": 1,
  "corrente": 4.83,
  "tensao": 220.5,
  "potencia": 1065.0,
  "valido": true,
  "timestamp": "2026-05-21T14:32:00Z"
}
```

### Alertas

Gerados automaticamente a cada medição recebida. Tipos detectados:

| Tipo | Nível | Condição |
|---|---|---|
| `sobrecorrente` | crítico | corrente > 40 A |
| `consumo_fora_horario` | aviso | potência > 10 W fora de 06h–22h |
| `queda_brusca` | crítico | corrente caiu > 70% em relação à anterior |

| Método | Rota | Descrição |
|---|---|---|
| GET | `/alertas/` | Lista alertas (filtros: canal, nível, tipo, resolvido) |
| PATCH | `/alertas/{id}/resolver` | Marca alerta como resolvido |

### Consumo

| Método | Rota | Descrição |
|---|---|---|
| GET | `/consumo/` | Consumo diário agregado (filtros: local, quadro, sensor, período) |

### Faturas e Rateio

| Método | Rota | Descrição |
|---|---|---|
| POST | `/faturas/` | Cadastra fatura e calcula rateio por área automaticamente |
| GET | `/faturas/` | Lista faturas |
| GET | `/faturas/{id}/rateio` | Retorna rateio calculado da fatura |

O rateio é calculado com base no `consumo_diario` de cada canal, agrupado pela área do quadro ao qual o canal pertence.

### Tarifas e Metas

| Método | Rota | Descrição |
|---|---|---|
| GET/POST | `/tarifas/` | Histórico de tarifas (R$/kWh) por local e vigência |
| GET/POST | `/metas/` | Metas de consumo por local ou quadro |

### Jobs

| Método | Rota | Descrição |
|---|---|---|
| POST | `/jobs/consumo-diario` | Dispara cálculo de kWh manualmente para uma data |

O job roda automaticamente todo dia às **00:05 (horário de Brasília)** via APScheduler. O cálculo usa **integração trapezoidal**:

```
kWh = Σ ( (P_i + P_{i+1}) / 2 × Δt_horas ) / 1000
```

### Relatórios

| Método | Rota | Descrição |
|---|---|---|
| GET | `/relatorios/rateio/{fatura_id}` | Gera e retorna PDF de rateio para download |

O PDF é gerado com ReportLab e inclui tabela de rateio por área com kWh, percentual e valor em R$.

---

## 🔔 Integração Enel SP

O `enel_client.py` se comunica com um microserviço Node.js separado para consultar faturas diretamente no portal da Enel SP.

Variáveis de ambiente necessárias:

```env
ENEL_SERVICE_URL=https://seu-microservico-enel.com
ENEL_SERVICE_KEY=sua-chave-de-api
```

---

## 🌐 CORS

Origens permitidas por padrão:

```
https://energy-safe.vercel.app
https://energy-safe-9m2q.vercel.app
http://localhost:5500
http://127.0.0.1:5500
```

Para adicionar origens, edite a lista `allow_origins` em `main.py`.

---

## 🔗 Relacionado

- [Firmware ESP32 — EnergySafe v3.0](../firmware/) — coleta e envia as medições
- [Banco de dados (schema SQL)](../database/) — schema PostgreSQL completo
- [Frontend](https://github.com/Julyxdias/BackendSafe) — interface web (Vercel)

---

## 📜 Licença

MIT — livre para uso, modificação e distribuição.
