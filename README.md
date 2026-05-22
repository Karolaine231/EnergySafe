# 🗄️ EnergySafe — Banco de Dados (PostgreSQL)

Schema completo do banco de dados do backend EnergySafe. Inclui todas as tabelas, sequências, índices, constraints e triggers. Os dados de exemplo presentes no dump representam uma instalação real de 3 andares de um prédio administrativo com 3 quadros elétricos monitorados.

---

## 📦 Requisitos

- PostgreSQL **16+** (dump gerado na versão 18.3)
- `psql` ou qualquer client compatível (DBeaver, TablePlus, etc.)

---

## 🚀 Como restaurar

```bash
# 1. Crie o banco (se ainda não existir)
createdb energysafe

# 2. Restaure o schema + dados
psql -d energysafe -f energysafe_schema.sql
```

Ou com usuário específico:

```bash
psql -U seu_usuario -d energysafe -f energysafe_schema.sql
```

---

## 🗺️ Diagrama do Schema

```
locais
  ├── areas                  (local_id → locais.id)
  ├── enel_instalacoes       (local_id → locais.id)
  ├── faturas                (local_id → locais.id)
  │     ├── fatura_itens     (fatura_id → faturas.id)
  │     ├── faturas_ocr      (fatura_id → faturas.id)
  │     └── rateio           (fatura_id → faturas.id)
  ├── metas                  (local_id → locais.id)
  └── tarifas                (local_id → locais.id)

quadros
  ├── quadros.quadro_pai_id  (auto-referência — hierarquia de quadros)
  ├── local_id → locais.id
  ├── area_id  → areas.id
  └── dispositivos           (quadro_id → quadros.id)
        ├── dispositivos_status  (dispositivo_id → dispositivos.id)
        └── canais_medicao       (dispositivo_id → dispositivos.id)
              ├── medicoes       (canal_id → canais_medicao.id)
              ├── consumo_diario (canal_id → canais_medicao.id)
              └── alertas        (canal_id → canais_medicao.id)
```

---

## 📋 Tabelas

### `locais`
Unidades físicas monitoradas (prédio, andar, setor).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `nome` | text NOT NULL | Ex: "Predio ADM - 1 Andar" |
| `andar` | integer | Número do andar |
| `descricao` | text | Descrição livre |

---

### `areas`
Subdivisões dentro de um local (salas, setores).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `nome` | text NOT NULL | Ex: "Terreo ADM" |
| `local_id` | integer FK | → `locais.id` |
| `descricao` | text | — |

---

### `quadros`
Quadros elétricos de distribuição, com suporte a hierarquia (quadro pai → filhos).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `nome` | text NOT NULL | Ex: "QLT-307" |
| `local_id` | integer FK | → `locais.id` |
| `area_id` | integer FK | → `areas.id` |
| `quadro_pai_id` | integer FK | → `quadros.id` (auto-referência) |
| `descricao` | text | — |

---

### `dispositivos`
ESP32s instalados nos quadros elétricos.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `nome` | text NOT NULL | Ex: "ESP32_ADM0_A307" |
| `quadro_id` | integer FK | → `quadros.id` |
| `ativo` | boolean | Default `true` |
| `data_instalacao` | timestamp | — |
| `observacoes` | text | — |

---

### `dispositivos_status`
Status operacional atual de cada dispositivo (1-para-1).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `dispositivo_id` | integer FK UNIQUE | → `dispositivos.id` |
| `status` | text | `ONLINE` \| `ATRASO` \| `OFFLINE` |
| `ultima_leitura` | timestamp | Última vez que enviou dados |
| `potencia_atual` | real | Potência em W da última leitura |
| `atualizado_em` | timestamp | Auto-atualizado |

---

### `canais_medicao`
Canais de medição por fase de cada dispositivo (até 3 por ESP32: A, B, C).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `dispositivo_id` | integer FK | → `dispositivos.id` |
| `fase` | text | `A` \| `B` \| `C` (CHECK constraint) |
| `tipo` | text | Ex: `corrente` |
| `descricao` | text | Ex: "ADM0_A307 Fase A" |

---

### `medicoes`
Série temporal de medições enviadas pelo firmware ESP32. Tabela principal do sistema.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | bigint PK | — |
| `timestamp` | timestamp NOT NULL | Horário da medição (NTP, GMT-3) |
| `canal_id` | integer FK | → `canais_medicao.id` |
| `corrente` | real | Irms em Amperes |
| `tensao` | real | Vrms em Volts |
| `potencia` | real | P = V × I em Watts |
| `potencia_ativa` | double | Watts (reservado para medição com FP real) |
| `potencia_aparente` | double | VA |
| `potencia_reativa` | double | VAr |
| `fator_potencia` | double | 0.0 – 1.0 |
| `valido` | boolean | `false` se leitura descartada |
| `criado_em` | timestamp | Inserção no banco |

**Índices:**
```sql
idx_medicoes_canal      — canal_id
idx_medicoes_timestamp  — timestamp
```

---

### `consumo_diario`
Agregação diária de kWh por canal (gerada pelo backend a partir de `medicoes`).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | bigint PK | — |
| `canal_id` | integer FK | → `canais_medicao.id` |
| `data` | date NOT NULL | Dia da agregação |
| `kwh` | real NOT NULL | Consumo do dia |
| `criado_em` | timestamp | — |

**Constraint única:** `(canal_id, data)` — um registro por canal por dia.

---

### `alertas`
Alertas gerados automaticamente por desvios nos valores medidos.

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `canal_id` | integer FK | → `canais_medicao.id` |
| `tipo` | text | Ex: `queda_brusca`, `sobrecarga` |
| `nivel` | text | Ex: `aviso`, `critico` |
| `mensagem` | text | Descrição legível |
| `valor` | real | Valor medido que gerou o alerta |
| `limite` | real | Threshold configurado |
| `timestamp` | timestamp NOT NULL | Momento do alerta |
| `resolvido` | boolean | Default `false` |
| `criado_em` | timestamp | — |

**Índice:** `idx_alertas_timestamp`

---

### `faturas`
Faturas de energia elétrica por local (lançamento manual ou via integração Enel).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `local_id` | integer FK | → `locais.id` |
| `mes` | date NOT NULL | Competência (1º dia do mês) |
| `valor_total` | numeric(10,2) | R$ total — NUMERIC para evitar float |
| `kwh_total` | numeric(10,3) | Consumo total em kWh |
| `instalacao_id` | integer FK | → `enel_instalacoes.id` (nullable) |
| `vencimento` | date | Data de vencimento |
| `status` | text | `em aberto` \| `pago` \| `vencido` |
| `codigo_barras` | text | — |
| `conta_pdf_url` | text | URL do PDF da fatura |
| `atualizado_em` | timestamp | Auto-atualizado via trigger |

**Índices:** `idx_faturas_vencimento`, `idx_faturas_status`

---

### `faturas_ocr`
Dados extraídos por OCR do PDF da fatura Enel (1-para-1 com `faturas`).

Inclui campos detalhados: cliente, distribuidora, nota fiscal, endereço, leituras do medidor, tarifas TE e TUSD, datas de leitura, etc.

**Campos de tarifa:**
- `preco_te` / `preco_tusd` — valores brutos do OCR
- `normalizado_preco_te` / `normalizado_preco_tusd` / `normalizado_valor` — valores normalizados após validação

---

### `fatura_itens`
Itens detalhados da composição da fatura (extraídos do OCR).

| Coluna | Tipo | Descrição |
|---|---|---|
| `id` | integer PK | — |
| `fatura_id` | integer FK | → `faturas.id` |
| `descricao` | text | Ex: "Energia Elétrica", "ICMS" |
| `valor` | numeric(10,2) | Valor do item em R$ |

---

### `enel_instalacoes`
Instalações Enel vinculadas a cada local.

| Coluna | Tipo | Descrição |
|---|---|---|
| `numero` | text | Número da instalação Enel (ex: `7006123456`) |
| `titular` | text | Nome do titular da conta |
| `endereco` | text | Endereço da instalação |
| `lista_raw` | jsonb | Array completo de instalações do login (para referência) |

---

### `tarifas`
Histórico de tarifas de energia (R$/kWh) por local e vigência.

| Coluna | Tipo | Descrição |
|---|---|---|
| `local_id` | integer FK | → `locais.id` |
| `valor_kwh` | real | Tarifa em R$/kWh |
| `vigencia` | date | Data de início da vigência |

**Constraint única:** `(local_id, vigencia)`

---

### `metas`
Metas de consumo por local ou quadro.

| Coluna | Tipo | Descrição |
|---|---|---|
| `local_id` | integer FK | → `locais.id` |
| `quadro_id` | integer FK | → `quadros.id` |
| `kwh_baseline` | real | Consumo de referência (antes da meta) |
| `kwh_meta` | real | Consumo alvo |
| `data_inicio` | date | — |
| `data_fim` | date | Nullable — meta em aberto |

---

### `rateio`
Rateio de custos da fatura por área.

| Coluna | Tipo | Descrição |
|---|---|---|
| `fatura_id` | integer FK | → `faturas.id` |
| `area_id` | integer FK | → `areas.id` |
| `kwh` | real | kWh atribuídos à área |
| `percentual` | real | % do consumo total |
| `valor_rs` | real | Custo em R$ da área |

---

## ⚙️ Triggers

| Trigger | Tabela | Evento | Ação |
|---|---|---|---|
| `trg_faturas_atualizado_em` | `faturas` | UPDATE | Atualiza `atualizado_em` |
| `trg_faturas_ocr_atualizado_em` | `faturas_ocr` | UPDATE | Atualiza `atualizado_em` |
| `trg_enel_inst_atualizado_em` | `enel_instalacoes` | UPDATE | Atualiza `atualizado_em` |

---

## 📊 Dados de exemplo incluídos

O dump contém **1 linha de exemplo por tabela** (16 no total), suficiente para ilustrar o schema e testar queries sem volume de dados. Os valores são representativos de uma instalação real, mas foram reduzidos intencionalmente para uso público.

---

## 🔗 Relacionado

- [Firmware ESP32 — EnergySafe v3.0](../firmware/) — coleta os dados e envia para a API
- [Backend API](../backend/) — recebe as medições e alimenta este banco

---

## 📜 Licença

MIT — livre para uso, modificação e distribuição.
