# ⚡ EnergySafe — Firmware v5.0.6

Firmware para **ESP32** que faz o monitoramento energético trifásico em tempo real. Ele mede corrente e tensão em 3 fases, calcula localmente Vrms, Irms, potência ativa e aparente, fator de potência, frequência e energia acumulada, e envia as medições para a API via HTTPS. Se a rede ou a API falharem, as medições ficam guardadas no cartão SD e são reenviadas automaticamente.

O projeto tem **3 módulos** (ADM0, ADM01 e ADM02). Cada um tem o seu próprio firmware e envia para os seus próprios canais no backend.

---

## 📁 Estrutura

```
firmware/
├── EnergySafe_ADM0/
│   └── EnergySafe_ADM0.ino     # Módulo ADM0  → canais 1, 2, 3
├── EnergySafe_ADM01/
│   └── EnergySafe_ADM01.ino    # Módulo ADM01 → canais 4, 5, 6
├── EnergySafe_ADM02/
│   └── EnergySafe_ADM02.ino    # Módulo ADM02 → canais 7, 8, 9
└── README.md
```

Os três firmwares são idênticos, exceto por `DEVICE_NAME` e `CANAL_IDS`.

---

## 🛠 Hardware

Placa própria **Hardware Energy Safe REV 1.0** (EasyEDA).

| Componente | Modelo | Qtd por módulo |
|---|---|---|
| Microcontrolador | ESP32-WROOM-32E-N8R2 | 1 |
| Sensor de corrente | SCT-013-000 (100 A : 50 mA) + burden 33 Ω | 3 |
| Sensor de tensão | ZMPT101B | 2 |
| Leitor microSD | Slot simples SPI, 3,3 V, sem regulador | 1 |
| Cartão microSD | Até 32 GB, FAT32 | 1 |
| Conversor USB-serial | CP2102 (gravação) | 1 |
| Fonte | Flyback TNY275 + AMS1117 3,3 V | 1 |

### Pinagem

| Fase | Corrente (ADC1) | Tensão (ADC1) |
|---|---|---|
| A | GPIO 34 | GPIO 36 (SENSOR_VP) |
| B | GPIO 35 | GPIO 39 (SENSOR_VN) |
| C | GPIO 32 | GPIO 39 (SENSOR_VN, compartilhado com a fase B) |

**Cartão SD (SPI):**

| Sinal | GPIO |
|---|---|
| CS | 17 |
| MOSI | 23 |
| MISO | 19 |
| SCK | **5** |

> ⚠️ O SCK está no **GPIO 5**, e não no GPIO 18 (padrão do ESP32). Por isso o firmware inicializa o SPI com os pinos explícitos: `spiSD.begin(5, 19, 23, 17)`. Sem isso, o cartão não monta.

> ⚠️ Todos os sensores estão em pinos **ADC1**, que continuam funcionando com o Wi-Fi ligado (o ADC2 não funciona com Wi-Fi ativo). Os GPIOs 34, 35, 36 e 39 são **somente entrada**.

> ⚠️ Na versão **N8R2** (com PSRAM), o **GPIO 16** fica ligado à PSRAM interna. Ele precisa de pull-up de 10 kΩ e não pode ser usado para outra função (datasheet ESP32-WROOM-32E, seção 9).

---

## 📦 Dependências

O firmware **não usa bibliotecas externas**. Desde a v5.0.6, o JSON é montado com `snprintf`, sem o ArduinoJson.

| Biblioteca | Uso |
|---|---|
| WiFi *(built-in)* | Conexão Wi-Fi |
| WiFiClientSecure *(built-in)* | HTTPS/TLS |
| HTTPClient *(built-in)* | POST para a API |
| SD / SPI *(built-in)* | Buffer offline no cartão |
| esp_task_wdt *(built-in)* | Watchdog |

**Placa:** instale o pacote `esp32` pelo Boards Manager:
`https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`

**Configuração na Arduino IDE:** placa `ESP32 Dev Module`, Monitor Serial em `115200`. O código funciona com os cores 2.x e 3.x.

---

## ⚙️ Configuração

Edite **somente o bloco CONFIGURAÇÕES** no topo do `.ino` de cada módulo.

```cpp
// Wi-Fi
const char* WIFI_SSID     = "NomeDaRede";
const char* WIFI_PASSWORD = "SuaSenha";

// API
const char* API_URL = "https://backendsafe.onrender.com/medicoes/";

// Identificação do módulo
const char* DEVICE_NAME = "ADM0";          // também vira o hostname na rede

// IDs dos canais no backend (Fase A, B, C)
const int CANAL_IDS[3] = {1, 2, 3};
```

| Módulo | `DEVICE_NAME` | `CANAL_IDS` |
|---|---|---|
| ADM0 | `"ADM0"` | `{1, 2, 3}` |
| ADM01 | `"ADM01"` | `{4, 5, 6}` |
| ADM02 | `"ADM02"` | `{7, 8, 9}` |

> Os IDs precisam existir no backend (`GET /canais/` em `/docs`). Confira antes de gravar.

> 🌐 A rede da instituição libera o acesso **por endereço MAC**. O firmware mostra o MAC logo no boot (`MAC do ESP32: ...`). Se a placa ou o ESP forem trocados, o novo MAC precisa ser liberado.

### Intervalos

```cpp
#define PUBLISH_INTERVAL_MS   600000UL  // envio a cada 10 min (use 5000UL para teste)
#define RETRY_INTERVAL_MS     120000UL  // reenvio do SD a cada 2 min
#define WIFI_CHECK_MS          15000UL  // verificação do Wi-Fi a cada 15 s
#define WDT_TIMEOUT_S              30   // watchdog
#define MAX_PENDING_LINES        3000   // limite do buffer no SD
```

---

## 🏗️ Arquitetura

```
┌────────────────────────────────────────────┐
│  FreeRTOS Task: acquisitionTask() (Core 1) │
│  • Amostra V e I a 2 kHz (10 ciclos)       │
│  • Remove offset DC (EMA)                  │
│  • Filtro passa-baixa                      │
│  • Calcula Vrms, Irms, P, S, FP, Freq      │
│  • Acumula energia (kWh)                   │
│  • Protege resultados com mutex            │
└────────────────────────────────────────────┘
        ↓ a cada PUBLISH_INTERVAL_MS
┌────────────────────────────────────────────┐
│  loop()                                    │
│  → Copia snapshot protegido                │
│  → Sanity check (limites físicos)          │
│  → Wi-Fi ok?  → HTTPS POST ao backend      │
│  → Falhou?    → Salva no SD (pending.csv)  │
│  → Reenvio periódico do SD                 │
│  → Alimenta o watchdog                     │
└────────────────────────────────────────────┘
```

### Proteções

- **Watchdog (30 s):** reinicia o ESP se ele travar. O watchdog é alimentado entre os envios de cada canal.
- **Sanity check:** marca como `valido=false` as medições fora dos limites físicos (V 0–300 V, I 0–120 A, P ≤ 36 kW, F 45–70 Hz, FP −1 a 1) e corrige NaN e Inf.
- **Reconexão Wi-Fi com backoff exponencial:** 5 s → 60 s.
- **SD com política FIFO:** quando chega em `MAX_PENDING_LINES`, descarta a linha mais antiga.
- **Reenvio seguro:** usa o arquivo temporário `/pend_tmp.csv` e, se o Wi-Fi cair no meio do reenvio, preserva as linhas que faltam.
- **Validação do CSV:** linhas corrompidas ou com número errado de campos são descartadas.

---

## 📡 Payload enviado à API

`POST /medicoes/` com `Content-Type: application/json`:

```json
{
  "canal_id": 1,
  "corrente": 4.832,
  "tensao": 220.50,
  "potencia": 1065.1,
  "valido": true,
  "timestamp": "2026-09-29T17:32:00Z"
}
```

- `valido = false` quando `Vrms ≤ 5 V` ou `Irms ≤ 0,02 A`, ou quando o sanity check falha.
- O `timestamp` está em **UTC** (ISO 8601 com `Z`). O backend converte para o horário de Brasília.

---

## 💾 Buffer offline (SD)

Quando não há conexão ou a API rejeita a medição, a linha vai para `/pending.csv` (sem cabeçalho, 10 campos):

```
canal_id,timestamp,tensao,corrente,potencia_ativa,potencia_aparente,fator_potencia,frequencia,energia_kwh,valido
1,2026-09-29T17:32:00Z,220.50,4.8321,1065.08,1065.48,0.9996,60.00,0.012345,1
```

O reenvio acontece a cada `RETRY_INTERVAL_MS`, sempre que o Wi-Fi estiver conectado.

---

## 🕐 NTP

Sincroniza com `pool.ntp.org` e `time.google.com` em **UTC**. Faz isso no boot e a cada reconexão do Wi-Fi.

Se o NTP falhar, o timestamp passa a ser relativo ao boot (`1970-01-01T00:01:03Z`). Em redes corporativas, confirme que a **porta UDP 123 (NTP)** e a **porta 443 (HTTPS)** estão liberadas.

---

## 📊 Saída Serial (115200 baud)

```
MAC do ESP32: XX:XX:XX:XX:XX:XX
==================================================
  ENERGYSAFE — FIRMWARE v5.0.6
  Modulo: ADM0 | Canais: 1, 2, 3
  Segurança reforçada
==================================================
[WDT] Watchdog configurado: timeout=30s
[SD] Inicializando...
[SD] Pinos: CS=17 MOSI=23 MISO=19 SCK=5
[SD] Montado a 20000 kHz
[SD] OK. Capacidade: 15001MB
[SD] Nenhuma pendencia encontrada.
[WIFI] Iniciando conexao...
===== INFORMAÇÕES DA REDE =====
IP: 10.0.0.42
RSSI (Sinal): -58 dBm
Hostname: ADM0
[NTP] Sincronizado: 2026-09-29T17:32:00Z
[SISTEMA] Pronto. Task de aquisicao iniciada.
==================================================
[PUBLICACAO #1] Uptime: 600s
[CANAL 1] V=220.5V I=4.832A P=1065.1W S=1065.5VA FP=1.000 F=60.0Hz E=0.0123kWh valido=sim
[API] Canal 1 — Enviado com sucesso!
...
[STATS] Ciclos: 1 | OK: 3 | Falhas: 0 | No SD: 0
```

---

## 🧪 Calibração

A calibração é **por sensor**. Cada fase tem o seu próprio ganho.

### Corrente — SCT-013-000

```cpp
const float CT_RATIO      = 2000.0f;               // 100 A : 50 mA
const float BURDEN_OHMS   = 33.0f;                 // resistor de carga na placa
const float CAL_GAIN_I[3] = {1.0f, 1.0f, 1.0f};    // Fase A, B, C
```

1. Ligue uma carga conhecida e meça a corrente com um alicate amperímetro.
2. Leia o `I=` da fase no Serial.
3. Ajuste: `CAL_GAIN_I_novo = CAL_GAIN_I_atual × (I_real / I_lido)`.

### Tensão — ZMPT101B

```cpp
const float CAL_GAIN_V[2] = {234.26f, 234.26f};    // sensor VP, sensor VN
```

1. Meça a tensão da rede com um multímetro.
2. Compare com o `V=` no Serial.
3. Ajuste pela mesma proporção. Ajuste também o trimpot do ZMPT101B para a senoide não saturar.

---

## 🔧 Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `[SD] FALHA!` | SPI com pinos errados, cartão em formato errado, GND do leitor solto | Rode `teste_sd_placa.ino`. Use cartão até 32 GB em FAT32 e confira o GND do U7 |
| Não conecta no Wi-Fi | MAC não liberado, SSID ou senha errados | Confira o MAC no Serial com a lista liberada |
| `Erro de conexao: -1` na API | HTTPS bloqueado ou backend em cold start (Render) | Libere a porta 443. As medições ficam no SD e são reenviadas |
| Timestamp `1970-...` | NTP bloqueado | Libere a porta UDP 123 |
| `ArduinoJson.h: No such file` | Versão antiga do firmware | Use a v5.0.6, que não depende do ArduinoJson |

---

## 🔒 Segurança HTTPS

A conexão usa `WiFiClientSecure` com `setInsecure()`: os dados vão criptografados, mas o certificado do servidor não é verificado. Para produção, configure `client.setCACert()` com o certificado raiz do backend.

---

## 📝 Histórico

| Versão | Mudanças |
|---|---|
| **v5.0.6** | Pinos do SD corrigidos para a placa (CS 17, SCK 5), com montagem em 20, 10 ou 4 MHz. Timestamp em UTC real. ArduinoJson removido. Watchdog alimentado entre canais. Um firmware por módulo (ADM0, ADM01, ADM02) com hostname |
| v5.0.5 | Bluetooth removido |
| v5.0.4 | Calibração por fase |
| v5.0.3 | Tensão nos pinos VP/VN (ADC1) |
| v5.0 | FreeRTOS, watchdog, sanity check, backoff do Wi-Fi, validação do CSV |
| v3.0 | Versão inicial com EmonLib |

---

## 🔗 Relacionado

- [Backend API — EnergySafe](https://github.com/Julyxdias/BackendSafe): recebe as medições e gera alertas ([docs](https://backendsafe.onrender.com/docs))
- [Frontend](https://energy-safe.vercel.app): dashboard de monitoramento

---

## 📜 Licença

MIT — livre para uso, modificação e distribuição.
