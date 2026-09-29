# ⚡ EnergySafe — Firmware v5.0.6

Firmware para **ESP32** que monitora o consumo de energia em até 3 circuitos. Ele mede corrente e tensão, envia as medições para a API via HTTPS e guarda os dados no cartão SD quando a rede falha, para reenviar depois.

São 3 módulos, cada um com o seu firmware:

| Módulo | Arquivo | Canais no backend |
|---|---|---|
| ADM0 | `EnergySafe_ADM0.ino` | 1, 2, 3 |
| ADM01 | `EnergySafe_ADM01.ino` | 4, 5, 6 |
| ADM02 | `EnergySafe_ADM02.ino` | 7, 8, 9 |

Também há um código separado para calibrar os sensores: `EnergySafe_calibracao.ino`.

---

## 🛠 Hardware

| Componente | Modelo | Qtd |
|---|---|---|
| Microcontrolador | ESP32-WROOM-32E-N8R2 | 1 |
| Sensor de corrente | Transformador de corrente próprio (projeto do grupo) | 3 |
| Sensor de tensão | ZMPT101B (um para 220 V, outro para 110 V) | 2 |
| Leitor microSD | SPI, 3,3 V | 1 |
| Cartão microSD | Até 32 GB, FAT32 | 1 |

### Pinagem

| Sensor | GPIO |
|---|---|
| Corrente 1 | 34 |
| Corrente 2 | 35 |
| Corrente 3 | 32 |
| Tensão — ZMPT no VP (U5) | 36 |
| Tensão — ZMPT no VN (U6) | 39 |

| SD | GPIO |
|---|---|
| CS | 17 |
| MOSI | 23 |
| MISO | 19 |
| SCK | 5 |

> O SCK do SD está no GPIO 5, e não no 18 (padrão do ESP32). Por isso o SPI é iniciado com os pinos explícitos no código.

---

## ⚙️ Configuração

Na Arduino IDE, use a placa **ESP32 Dev Module** e o Monitor Serial em **115200**. O firmware não usa bibliotecas externas.

Edite o bloco **CONFIGURAÇÕES** no topo do `.ino` do módulo:

```cpp
const char* WIFI_SSID     = "NomeDaRede";
const char* WIFI_PASSWORD = "SuaSenha";
const char* API_URL       = "https://backendsafe.onrender.com/medicoes/";

const char* DEVICE_NAME   = "ADM0";
const int   CANAL_IDS[3]  = {1, 2, 3};

// Preenchidos com o resultado da calibração:
const int   CANAL_VSENSOR_IDX[3] = {0, 1, 1};              // 0 = VP, 1 = VN
const float CAL_GAIN_I[3]        = {1.0f, 1.0f, 1.0f};
const float CAL_GAIN_V[2]        = {234.26f, 234.26f};

#define PUBLISH_INTERVAL_MS 600000UL   // 10 min
```

A rede libera o acesso por MAC. O MAC de cada placa aparece no Serial logo no boot.

---

## 🧪 Calibração

A calibração é feita **em cada módulo, no local da instalação**, com o código `EnergySafe_calibracao.ino`. Ele usa o mesmo cálculo do firmware, então os valores encontrados podem ser copiados direto.

A calibração define três coisas:

- **`CAL_GAIN_V`:** o ganho de cada sensor de tensão (VP e VN).
- **`CAL_GAIN_I`:** o ganho de cada sensor de corrente (1, 2 e 3).
- **`CANAL_VSENSOR_IDX`:** qual sensor de tensão está no mesmo circuito de cada sensor de corrente. É dessa combinação que sai a potência.

### Material

- Multímetro (tensão)
- Alicate amperímetro (corrente)
- Uma carga **resistiva** de 500 W a 2 kW, como chaleira, aquecedor, secador de cabelo ou ferro de passar. Não use motor, ventilador ou fonte de celular.

### Passo a passo

**1. Gravar o código de calibração**

Grave o `EnergySafe_calibracao.ino` no módulo e abra o Monitor Serial em **115200**, com a opção **"Nova linha"** ativada. Espere ~10 s até as leituras começarem a aparecer, uma tabela a cada ~2 s:

```
TENSAO
  VP (GPIO36):  219.8 V   ADC  612-3480 ok
  VN (GPIO39):  127.1 V   ADC  890-3205 ok
CORRENTE | Irms    | P c/ VP  FP VP | P c/ VN  FP VN | par  | ADC
  1      |  4.830 A |  1061.0   1.00 |   305.2   0.50 |  VP  | 1210-2890 ok
  2      |  0.004 A |     0.1   0.02 |     0.0   0.01 |  --  | 2040-2056 ok
  3      |  0.003 A |     0.0   0.01 |     0.1   0.03 |  --  | 2041-2055 ok
```

**2. Conferir a saturação**

Se aparecer **`SATURA!`** em um sensor de tensão, gire o trimpot do ZMPT101B até o aviso sumir. O ideal é o ADC ficar entre ~500 e ~3500.

**3. Calibrar a tensão**

Meça a tensão de cada rede com o multímetro e digite os valores:

```
vp 220
vn 127
```

**4. Calibrar a corrente e descobrir os pares**

Faça **um circuito por vez**, com a carga resistiva ligada só nele:

1. Coloque o alicate amperímetro no **mesmo fio** do sensor de corrente.
2. Digite a corrente real, por exemplo `i1 4.83`.
3. Veja a coluna **par**. Com carga resistiva, o sensor de tensão certo é o que dá **FP ≈ 1,00**.
4. Repita com `i2` e `i3` nos outros circuitos.

**5. Copiar para o firmware**

Digite **`p`**. O código imprime as linhas prontas:

```cpp
const int CANAL_VSENSOR_IDX[3] = {0, 1, 1};  // corrente 1, 2, 3
const float CAL_GAIN_I[3] = {0.8712f, 1.0345f, 0.9921f};
const float CAL_GAIN_V[2] = {231.45f, 238.10f};
```

Cole essas linhas no bloco CONFIGURAÇÕES do firmware **daquele módulo** (ADM0, ADM01 ou ADM02) e grave o firmware.

### Dicas

| O que aparece | O que fazer |
|---|---|
| Potência negativa | O sensor de corrente está invertido. Vire o sensor no fio |
| FP baixo nas duas colunas | A carga não é resistiva, ou o sensor de corrente está num circuito sem ZMPT |
| `par` mostra `--` | Corrente muito baixa (< 0,2 A). Ligue a carga naquele circuito |
| Ganho de corrente longe de 1 | Normal para sensor de corrente próprio. Use o valor calculado |
| Leitura muda com outra carga | Confira a linearidade: calibre com uma carga e teste com outra de potência diferente |

---

## 🧠 Como o código funciona

### Arquitetura

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

A medição roda numa task separada no Core 1. Assim, o envio pela rede nunca atrasa a amostragem.

### Proteções

- **Watchdog (30 s):** reinicia o ESP se ele travar. O watchdog é alimentado entre os envios de cada canal.
- **Sanity check:** marca como `valido=false` as medições fora dos limites físicos (V 0–300 V, I 0–120 A, P ≤ 36 kW, F 45–70 Hz, FP −1 a 1) e corrige NaN e Inf.
- **Reconexão Wi-Fi com backoff exponencial:** 5 s → 60 s. Evita que o ESP fique tentando reconectar sem parar.
- **SD com política FIFO:** quando chega em 3000 linhas, descarta a linha mais antiga.
- **Reenvio seguro:** usa o arquivo temporário `/pend_tmp.csv`. Se o Wi-Fi cair no meio do reenvio, as linhas que faltam são preservadas.
- **Validação do CSV:** linhas corrompidas ou com número errado de campos são descartadas.

### Intervalos

```cpp
#define PUBLISH_INTERVAL_MS   600000UL  // envio a cada 10 min (5000UL para teste)
#define RETRY_INTERVAL_MS     120000UL  // reenvio do SD a cada 2 min
#define WIFI_CHECK_MS          15000UL  // verificação do Wi-Fi a cada 15 s
#define WDT_TIMEOUT_S              30   // watchdog
#define MAX_PENDING_LINES        3000   // limite do buffer no SD
```

### Envio para a API

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

- `valido = false` quando `Vrms ≤ 5 V` ou `Irms ≤ 0,02 A` (circuito desligado), ou quando o sanity check falha.
- O JSON é montado com `snprintf`, sem biblioteca externa.

### Buffer offline (SD)

Quando não há conexão ou a API rejeita a medição, a linha vai para `/pending.csv` (sem cabeçalho, 10 campos):

```
canal_id,timestamp,tensao,corrente,potencia_ativa,potencia_aparente,fator_potencia,frequencia,energia_kwh,valido
1,2026-09-29T17:32:00Z,220.50,4.8321,1065.08,1065.48,0.9996,60.00,0.012345,1
```

O reenvio acontece a cada 2 minutos, sempre que o Wi-Fi estiver conectado.

### NTP

O firmware sincroniza o horário com `pool.ntp.org` e `time.google.com` em **UTC**, no boot e a cada reconexão do Wi-Fi. Se o NTP falhar, o timestamp passa a ser relativo ao boot (`1970-01-01T00:01:03Z`). Na rede da instituição, as portas **UDP 123 (NTP)** e **443 (HTTPS)** precisam estar liberadas.

### Saída Serial (115200 baud)

```
MAC do ESP32: XX:XX:XX:XX:XX:XX
==================================================
  ENERGYSAFE — FIRMWARE v5.0.6
  Modulo: ADM0 | Canais: 1, 2, 3
==================================================
[WDT] Watchdog configurado: timeout=30s
[SD] Pinos: CS=17 MOSI=23 MISO=19 SCK=5
[SD] Montado a 20000 kHz
[SD] OK. Capacidade: 15001MB
[WIFI] Iniciando conexao...
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

## 🔧 Solução de problemas

| Sintoma | Causa provável | Solução |
|---|---|---|
| `[SD] FALHA!` | Cartão em formato errado ou GND do leitor solto | Use cartão até 32 GB em FAT32 e confira o GND do leitor |
| Não conecta no Wi-Fi | MAC não liberado, SSID ou senha errados | Confira o MAC no Serial com a lista liberada |
| `Erro de conexao: -1` na API | HTTPS bloqueado ou backend acordando (Render) | Libere a porta 443. As medições ficam no SD e são reenviadas |
| Timestamp `1970-...` | NTP bloqueado | Libere a porta UDP 123 |

---

## 📝 Histórico

| Versão | Mudanças |
|---|---|
| **v5.0.6** | Pinos do SD corrigidos (CS 17, SCK 5). Timestamp em UTC. ArduinoJson removido. Um firmware por módulo. Par tensão↔corrente configurável e código de calibração |
| v5.0.5 | Bluetooth removido |
| v5.0.4 | Calibração por fase |
| v5.0.3 | Tensão nos pinos VP/VN (ADC1) |
| v5.0 | FreeRTOS, watchdog, sanity check, backoff do Wi-Fi, validação do CSV |
| v3.0 | Versão inicial com EmonLib |

---

## 🔗 Relacionado

- [Backend API](https://github.com/Julyxdias/BackendSafe)
- [Frontend](https://energy-safe.vercel.app)
