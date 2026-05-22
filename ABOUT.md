# ⚡ EnergySafe — Sobre o Projeto

**EnergySafe** é uma plataforma IoT de monitoramento energético desenvolvida para instituições com múltiplas áreas físicas — como escolas, universidades e hospitais-escola. O sistema captura o consumo de energia por circuito elétrico em tempo real e divide o valor da fatura mensal proporcionalmente ao consumo real de cada área, substituindo o rateio estimativo por um modelo baseado em dados medidos.

> O sistema **não controla cargas**. Ele monitora, registra, alerta e analisa.

---

## 🎯 Problema resolvido

Em instituições com múltiplos setores (administrativo, TI, salas de aula, reitoria, UTI), a conta de energia costuma ser dividida igualmente ou por estimativa — o que é injusto e impossível de auditar.

O EnergySafe torna o rateio **justo, transparente e auditável**, baseado na medição real de consumo por circuito.

**Antes:** Fatura de R$ 130.000 dividida igualmente entre 4 andares.  
**Com EnergySafe:** Cada andar paga exatamente o que consumiu, calculado a partir de medições reais em kWh.

---

## 🏗️ Arquitetura geral

```
┌─────────────────────────────────────────────┐
│  CAMPO                                      │
│                                             │
│  SCT-013 (corrente) + ZMPT101B (tensão)     │
│          │                                  │
│      ESP32 (ADC + Wi-Fi)                    │
│          │                                  │
│          └──── POST /medicoes ──────────┐   │
└─────────────────────────────────────────│───┘
                                          │
┌─────────────────────────────────────────▼───┐
│  SERVIDOR                                   │
│                                             │
│  FastAPI ──────────────────► PostgreSQL     │
│     ├── Detecta alertas (Python)            │
│     ├── Calcula kWh (job noturno 00:05)     │
│     └── Gera PDF de rateio (ReportLab)      │
└─────────────────────────────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│  FRONTEND (Vercel)                          │
│                                             │
│  Login ──► Painel Financeiro                │
│        └── Painel de Manutenção             │
└─────────────────────────────────────────────┘
```

---

## 🧩 Componentes do sistema

### 1. Firmware ESP32 (`v3.0`)
Roda em cada quadro elétrico monitorado. Lê corrente e tensão em 3 fases com os sensores SCT-013 e ZMPT101B, calcula Irms/Vrms/Potência via EmonLib e envia para a API via HTTPS a cada 60 segundos.

**Tolerância a falhas:** se a rede cair, os dados são armazenados localmente no SD card (`pending.csv`) e reenviados automaticamente assim que a conexão retornar.

### 2. Backend API (FastAPI + PostgreSQL)
Recebe as medições, executa verificação de alertas a cada inserção, agrega o consumo diário em kWh via integração trapezoidal e expõe endpoints REST para o frontend. Um job noturno (APScheduler, 00:05 BRT) consolida o consumo do dia anterior.

### 3. Frontend (HTML + JS + Chart.js)
Dois painéis de acesso por perfil:

- **Painel Financeiro** — KPIs de custo e consumo, evolução mensal, rateio por área, gestão de faturas, metas de redução e download de PDF
- **Painel de Manutenção** — status dos sensores em tempo quase real, log de alertas, gráficos de potência e consumo diário por circuito

---

## 🗺️ Hierarquia de dados

```
Local  (ex: Prédio ADM)
  └── Área  (ex: 1º Andar)
        └── Quadro  (ex: QLT-301)
              └── Dispositivo  (ex: ESP32_ADM1_A301)
                    └── Canal  (ex: Fase A)
                          ├── Medições (série temporal)
                          ├── Consumo Diário (kWh/dia)
                          └── Alertas
```

---

## 📐 Fluxo do rateio mensal

```
1. ESP32 envia medições a cada 60s  →  tabela medicoes
2. Job noturno acumula kWh por canal  →  tabela consumo_diario
3. Usuário cadastra o valor da fatura  →  tabela faturas
4. Backend calcula rateio por área  →  tabela rateio

Fórmula:
  R$ área = (kWh área / kWh total medido) × valor da fatura
```

---

## 🚨 Alertas automáticos

Gerados pelo backend Python após cada medição recebida, sem triggers no banco:

| Tipo | Condição | Nível |
|---|---|---|
| `sobrecorrente` | corrente > 40 A | crítico |
| `consumo_fora_horario` | corrente > 10 A fora de 06h–22h | aviso |
| `queda_brusca` | corrente caiu > 70% em relação à anterior | crítico |

---

## 🛠 Stack tecnológica

| Camada | Tecnologia |
|---|---|
| Hardware | ESP32 + SCT-013-030 + ZMPT101B |
| Firmware | C++ (Arduino framework) + EmonLib |
| Backend | Python 3.11 + FastAPI + SQLAlchemy |
| Banco de dados | PostgreSQL 18 |
| Scheduler | APScheduler |
| Relatórios PDF | ReportLab |
| Frontend | HTML + CSS + JavaScript (Vanilla) |
| Gráficos | Chart.js 4 |
| Deploy API | Render |
| Deploy Frontend | Vercel |

---

## 🌱 Alinhamento com ODS

O projeto foi desenvolvido com foco nos Objetivos de Desenvolvimento Sustentável da ONU:

- **ODS 7 — Energia limpa e acessível:** ao tornar o consumo visível e mensurável, a plataforma cria a base para decisões de eficiência energética e redução de desperdício.
- **ODS 12 — Consumo e produção responsáveis:** o rateio baseado em dados reais incentiva o uso consciente de energia por cada setor da instituição.

---

## 📦 Repositórios

| Componente | Repositório | Branch |
|---|---|---|
| Frontend | [Karolaine231/EnergySafe](https://github.com/Karolaine231/EnergySafe) | `Front` |
| Backend API | [Julyxdias/BackendSafe](https://github.com/Julyxdias/BackendSafe) | `Julyxdias-Backend-API` |
| Firmware ESP32 | — | — |
| Schema SQL | — | — |

---

## 👥 Time

Protótipo acadêmico desenvolvido como projeto aplicado.

| Papel | Responsabilidade |
|---|---|
| Hardware & Firmware | Sensores, ESP32, calibração, buffer SD |
| Backend | API FastAPI, banco de dados, alertas, rateio |
| Frontend | Dashboard, gráficos, exportação, UX |

---

## 📄 Licença

MIT — livre para uso, modificação e distribuição.
