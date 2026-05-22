# ⚡ EnergySafe — Firmware v3.0

Firmware para **ESP32** que realiza monitoramento energético trifásico em tempo real. Mede corrente e tensão em 3 fases simultaneamente, envia os dados para a API via HTTPS e armazena localmente no SD card em caso de falha de rede ou energia.

---

## 🛠 Hardware necessário

| Componente | Modelo | Qtd |
|---|---|---|
| Microcontrolador | ESP32 (38 pinos) | 1 |
| Sensor de corrente | SCT-013-030 (30A) | 3 |
| Sensor de tensão | ZMPT101B | 3 |
| Módulo SD Card | SPI | 1 |
| Cartão microSD | Qualquer | 1 |

### Pinagem

| Fase | Corrente (ADC) | Tensão (ADC) |
|---|---|---|
| A | GPIO 34 | GPIO 33 |
| B | GPIO 35 | GPIO 25 |
| C | GPIO 32 | GPIO 26 |

**SD Card (SPI):**

| Sinal | GPIO |
|---|---|
| MOSI | 23 |
| MISO | 19 |
| SCK | 18 |
| CS | 5 |

> ⚠️ GPIOs 34, 35 e 32 são **somente entrada** no ESP32 — ideais para ADC, não conecte saídas neles.

---

## 📦 Dependências

Instale via **Arduino Library Manager** ou **PlatformIO**:

| Biblioteca | Uso |
|---|---|
| [EmonLib](https://github.com/openenergymonitor/EmonLib) | Cálculo de Irms, Vrms e potência |
| [ArduinoJson](https://arduinojson.org/) ≥ 6.x | Serialização do payload JSON |
| WiFi *(built-in ESP32)* | Conexão Wi-Fi |
| WiFiClientSecure *(built-in)* | HTTPS/TLS |
| HTTPClient *(built-in)* | Requisições HTTP POST |
| SD *(built-in)* | Leitura/escrita no SD card |

**Board:** `esp32` — instale via Boards Manager: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`

---

## ⚙️ Configuração

Edite **somente o bloco de configurações** no topo do `.ino`:

```cpp
// Wi-Fi
const char* WIFI_SSID     = "NomeDaRede";
const char* WIFI_PASSWORD = "SuaSenha";

// Endpoint da API
const char* API_URL = "https://seu-backend.com/medicoes/";

// IDs dos canais cadastrados no backend
const int CANAL_A = 1;
const int CANAL_B = 2;
const int CANAL_C = 3;

// Calibração
const double CAL_CORRENTE = 111.1;   // SCT-013-030 → 111.1
const double CAL_TENSAO   = 234.26;  // ZMPT101B — ajuste pelo multímetro
const double DEFASAGEM    = 1.7;     // phase_shift EmonLib
```

### Intervalos configuráveis

```cpp
#define COLLECT_INTERVAL_MS  60000UL  // leitura a cada 60s
#define RETRY_INTERVAL_MS   120000UL  // reenvio SD a cada 2min
#define WIFI_CHECK_MS        15000UL  // verificação Wi-Fi a cada 15s
#define MAX_PENDING_LINES     3000    // limite do buffer no SD (~3 canais × 1000 leituras)
```

---

## 🔄 Fluxo de operação

```
┌──────────────────┐
│   Lê 3 fases     │  calcVI(1480, 2000) — Irms + Vrms + P
└────────┬─────────┘
         │
┌────────▼─────────┐     ┌──────────────────────┐
│  Wi-Fi ok?       │ Não │  Salva no SD         │
│  Envia HTTP POST │────▶│  (pending.csv)       │
└────────┬─────────┘     └──────────────────────┘
         │ Sim
┌────────▼─────────┐
│  API respondeu?  │ Não → Salva no SD também
└────────┬─────────┘
         │ Sim
┌────────▼─────────┐
│  Reenvio SD      │  a cada RETRY_INTERVAL_MS
└──────────────────┘
```

O loop é **não-bloqueante** — usa `millis()` para todos os intervalos, sem nenhum `delay()` no caminho principal.

---

## 📡 Payload enviado à API

`POST /medicoes/` com `Content-Type: application/json`:

```json
{
  "canal_id": 1,
  "corrente": 4.8321,
  "tensao": 220.50,
  "potencia": 1065.08,
  "valido": true,
  "timestamp": "2026-05-21T14:32:00Z"
}
```

- `valido = false` quando `corrente == 0` (circuito desligado)
- `corrente` zerada se `Irms < 0.1 A` (filtro de ruído)
- `tensao` zerada se `Vrms < 5.0 V` (filtro de ruído)
- Timestamp em **ISO 8601 UTC** via NTP (fuso GMT-3, Brasília)

---

## 💾 Buffer offline (SD card)

Quando não há conexão ou a API rejeita a medição, os dados são persistidos em `/pending.csv`:

```
canal_id,corrente,tensao,potencia,valido,timestamp
1,4.8321,220.50,1064.8820,1,2026-05-21T14:32:00Z
2,3.1200,219.80,685.7760,1,2026-05-21T14:32:00Z
3,0.0000,0.00,0.0000,0,2026-05-21T14:32:00Z
```

**Comportamentos de segurança:**
- Quando o buffer atinge `MAX_PENDING_LINES`, a linha mais antiga é descartada automaticamente (política **FIFO**)
- O reenvio usa um arquivo temporário (`/pend_tmp.csv`) para evitar corrupção em caso de queda de energia durante a escrita
- Se o Wi-Fi cair **durante** o reenvio, o processo é abortado e as linhas restantes são preservadas

---

## 🕐 NTP e Timestamps

O firmware sincroniza com `pool.ntp.org` e `time.google.com` ao iniciar (fuso **GMT-3**).

Em caso de falha de NTP, o timestamp cai para um valor relativo ao boot:

```
1970-01-01T00:01:03Z  ← segundos desde o boot
```

Esses registros são válidos para o SD, mas o backend pode rejeitá-los dependendo da validação de data.

---

## 📊 Saída Serial (115200 baud)

```
==================================================
  ENERGYSAFE — FIRMWARE TOLERANTE A FALHAS v3.0
==================================================
[SENSOR] Fase A: Corrente GPIO34 | Tensao GPIO33
[SENSOR] Fase B: Corrente GPIO35 | Tensao GPIO25
[SENSOR] Fase C: Corrente GPIO32 | Tensao GPIO26
[SD]     Capacidade: 32MB
[WIFI]   Conectado! IP: 192.168.1.100 | RSSI: -52 dBm
[NTP]    Horario sincronizado: 2026-05-21T14:32:00Z
==================================================
[CICLO #1] Uptime: 60s
[SENSOR] Fase A -> I: 4.832A | V: 220.5V | P: 1065.66W
[SENSOR] Fase B -> I: 3.120A | V: 219.8V | P: 685.78W
[SENSOR] Fase C -> I: 0.000A | V:   0.0V | P:    0.00W
[SENSOR] Total  -> P: 1751.44W
[NTP]    Timestamp: 2026-05-21T14:32:00Z
[API]    Canal 1 — Enviado com sucesso!
[API]    Canal 2 — Enviado com sucesso!
[API]    Canal 3 — Enviado com sucesso!
[STATS]  Ciclos: 1 | OK: 3 | Falhas: 0 | No SD: 0
```

---

## 🧪 Calibração dos sensores

### Corrente — SCT-013-030

O valor padrão `111.1` é o fator de calibração para o modelo 30A/1V. Para ajustar:

1. Coloque uma carga conhecida no circuito (ex: resistência medida)
2. Leia o valor de `Irms` no Serial
3. Ajuste `CAL_CORRENTE` pela proporção: `CAL_nova = CAL_atual × (I_real / I_lido)`

### Tensão — ZMPT101B

1. Meça a tensão da rede com um multímetro calibrado
2. Compare com o `Vrms` lido no Serial
3. Ajuste `CAL_TENSAO` pela mesma proporção

### Defasagem (phase shift)

O parâmetro `DEFASAGEM = 1.7` afeta o cálculo do fator de potência. Para cargas puramente resistivas (aquecedores, lâmpadas incandescentes) o impacto é mínimo. Para cargas indutivas (motores, ar-condicionado), ajuste até o fator de potência exibido bater com o medidor de referência.

---

## 🔒 Segurança HTTPS

A conexão usa `WiFiClientSecure` com `setInsecure()`, aceitando qualquer certificado TLS. Isso é suficiente para proteger os dados em trânsito, mas não autentica o servidor. Para ambientes de produção críticos, considere **certificate pinning** com o certificado do backend.

---

## 🔗 Relacionado

- [Backend API — EnergySafe](../backend/) — recebe as medições e gera alertas
- [Banco de dados (schema SQL)](../database/) — schema PostgreSQL completo
- [Frontend](https://energy-safe.vercel.app) — dashboard de monitoramento

---

## 📜 Licença

MIT — livre para uso, modificação e distribuição.
