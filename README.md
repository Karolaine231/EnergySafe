# ⚡ EnergySafe — Firmware Tolerante a Falhas v3.0

Monitor de energia trifásico para ESP32 com envio em nuvem, buffer local em SD e sincronização NTP. Desenvolvido para ambientes industriais e residenciais que exigem medição contínua mesmo sob falhas de rede ou energia.

---

## 📐 Arquitetura

```
┌──────────────────┐
│   Lê 3 fases     │  SCT-013 (corrente) + ZMPT101B (tensão)
└────────┬─────────┘
         │
┌────────▼─────────┐     ┌─────────────────────┐
│  Wi-Fi ok?       │ Não │  Salva no SD         │
│  Envia HTTP POST │────▶│  (pending.csv)       │
└────────┬─────────┘     └─────────────────────┘
         │ Sim
┌────────▼─────────┐
│  API respondeu?  │ Não → Salva no SD também
└────────┬─────────┘
         │ Sim
┌────────▼─────────┐
│  Reenvio SD      │  a cada 2 minutos (configurável)
└──────────────────┘
```

---

## 🛠 Hardware

| Componente | Modelo | Qtd |
|---|---|---|
| Microcontrolador | ESP32 (38 pinos) | 1 |
| Sensor de corrente | SCT-013-030 | 3 |
| Sensor de tensão | ZMPT101B | 3 |
| Módulo SD Card | SPI (CS GPIO5) | 1 |

### Pinagem

| Fase | Corrente (GPIO) | Tensão (GPIO) |
|---|---|---|
| A | 34 | 33 |
| B | 35 | 25 |
| C | 32 | 26 |

**SD Card:** MOSI=23 · MISO=19 · SCK=18 · CS=5

---

## 📦 Dependências

Instale via **Arduino Library Manager** ou **PlatformIO**:

| Biblioteca | Versão recomendada |
|---|---|
| [EmonLib](https://github.com/openenergymonitor/EmonLib) | ≥ 1.1.0 |
| [ArduinoJson](https://arduinojson.org/) | ≥ 6.x |
| WiFi (built-in ESP32) | — |
| WiFiClientSecure (built-in) | — |
| HTTPClient (built-in) | — |
| SD (built-in) | — |

---

## ⚙️ Configuração

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

---

## 📡 Formato da API

O firmware envia um `HTTP POST` com `Content-Type: application/json` para cada fase:

```json
{
  "canal_id": 1,
  "corrente": 4.8321,
  "tensao": 220.50,
  "potencia": 1064.8,
  "valido": true,
  "timestamp": "2025-06-01T14:32:00Z"
}
```

> O timestamp segue o fuso **GMT-3 (Brasília)** via NTP. Em caso de falha NTP, é gerado um timestamp relativo ao boot no formato `1970-01-01THH:MM:SSZ`.

---

## 💾 Buffer no SD (pending.csv)

Quando não há conexão ou a API rejeita o dado, ele é salvo localmente:

```
canal_id,corrente,tensao,potencia,valido,timestamp
1,4.8321,220.50,1064.8820,1,2025-06-01T14:32:00Z
2,3.1200,219.80,685.7760,1,2025-06-01T14:32:00Z
3,0.0000,0.00,0.0000,0,2025-06-01T14:32:00Z
```

- Quando o buffer atinge `MAX_PENDING_LINES`, a linha mais antiga é descartada automaticamente (política FIFO).
- A cada `RETRY_INTERVAL_MS`, o firmware tenta reenviar todos os pendentes enquanto o Wi-Fi estiver ativo.
- A troca de arquivo é feita via arquivo temporário (`pend_tmp.csv`) para evitar corrupção.

---

## 🔒 Segurança HTTPS

A conexão usa `WiFiClientSecure` com `setInsecure()`, aceitando qualquer certificado TLS. Para produção, considere fixar o certificado do servidor (certificate pinning).

---

## 📊 Saída Serial (115200 baud)

```
==================================================
  ENERGYSAFE — FIRMWARE TOLERANTE A FALHAS v3.0
==================================================
[SENSOR] Fase A: Corrente GPIO34 | Tensao GPIO33
[WIFI]   Conectado! IP: 192.168.1.100 | RSSI: -52 dBm
[NTP]    Horario sincronizado: 2025-06-01T14:32:00Z
==================================================
[CICLO #1] Uptime: 60s
[SENSOR] Fase A -> I: 4.832A | V: 220.5V | P: 1065.66W
[SENSOR] Fase B -> I: 3.120A | V: 219.8V | P: 685.78W
[SENSOR] Fase C -> I: 0.000A | V: 0.0V   | P: 0.00W
[API]    Canal 1 — Enviado com sucesso!
[STATS]  Ciclos: 1 | OK: 1 | Falhas: 0 | No SD: 0
```

---

## 🔄 Fluxo de Tolerância a Falhas

| Situação | Comportamento |
|---|---|
| Wi-Fi indisponível | Salva no SD, reconecta a cada 15s |
| API retorna erro HTTP | Salva no SD, retenta no próximo ciclo de reenvio |
| SD indisponível | Loga aviso no Serial, dado é perdido |
| NTP sem sincronização | Usa timestamp relativo ao boot como fallback |
| Queda de energia | Dados pendentes persistem no SD para reenvio após reinício |

---

## 📁 Estrutura do Projeto

```
energysafe/
├── energysafe.ino      # Firmware principal
├── EmonLib.h/.cpp      # (se incluído localmente)
└── README.md
```

---

## 🧪 Calibração

1. **Corrente (SCT-013-030):** O valor padrão `111.1` é para o modelo 30A. Use um alicate amperímetro como referência e ajuste `CAL_CORRENTE` até os valores coincidirem.
2. **Tensão (ZMPT101B):** Compare com um multímetro calibrado e ajuste `CAL_TENSAO`. O valor `234.26` é um ponto de partida para a rede elétrica brasileira (220V).
3. **Defasagem:** O parâmetro `DEFASAGEM` (phase shift) do EmonLib pode ser ajustado para melhorar a precisão do fator de potência.

---

## 📜 Licença

MIT — livre para uso, modificação e distribuição.
