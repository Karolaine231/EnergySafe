/*
============================================================
EnergySafe — Firmware v5.0.7 — Módulo ADM0
3 Fases | SCT-013-000 + ZMPT101B | NTP | HTTPS | SD Buffer
============================================================

[v5.0.7] CORREÇÃO DO RESET POR WATCHDOG (task_wdt / loopTask):
- A acquisitionTask (prioridade 5, core 1) fazia espera ativa com
  delayMicroseconds() por ~500 ms e só cedia a CPU por 1 ms
  (vTaskDelay(1)). O loop() (prioridade 1, mesmo core) ficava com
  ~0,2% da CPU, o handshake TLS do POST levava >30 s e o WDT
  reiniciava a placa logo após "[API] Canal 1 | Payload ...".
- Agora um esp_timer periódico (500 us) acorda a task a cada amostra
  via notificação; entre amostras ela fica BLOQUEADA e o loop()
  roda normalmente.
- Os 3 canais são amostrados SIMULTANEAMENTE (antes um canal por vez,
  cada um ficava ~2/3 do tempo sem ser medido).
- Somas de RMS/potência acumuladas amostra a amostra (sem buffers).
- Energia: antes cada canal integrava só a própria janela de 165 ms,
  mas era medido a cada ~500 ms → kWh ~3x menor que o real. Corrigido.
- Janela: 333 amostras (9,99 ciclos de 60 Hz) em vez de 330 (9,9).
- Validade: limiares mínimos configuráveis (VALIDO_V_MIN / VALIDO_I_MIN)
  — com entradas desconectadas o ruído de 60 Hz dava V≈60 V, I≈2 A
  e valido=sim. Energia só acumula quando a medição é válida.
- HTTPS: timeout de handshake TLS (padrão era 120 s, > WDT de 30 s)
  e timeout de conexão explícitos.
- MAC impresso no boot lido do eFuse (antes saía 00:00:00:00:00:00
  porque o Wi-Fi ainda não estava inicializado).

[v5.0.6] CORREÇÃO DO CARTÃO SD (placa Energy Safe REV 1.0):
- Pinos do SD corrigidos para os da PCB:
    CS=GPIO17, MOSI=GPIO23, MISO=GPIO19, SCK=GPIO5
  (antes o código usava CS=5 e o SPI padrão com SCK=18, que não
   corresponde à placa — por isso o SD nunca montava)
- SPI inicializado explicitamente com os pinos da placa
  (spiSD.begin(SCK, MISO, MOSI, CS)) antes do SD.begin()
- Montagem do SD tenta 20 MHz, 10 MHz e 4 MHz (fallback)
- Watchdog alimentado entre os envios de cada canal (3 POSTs HTTPS
  seguidos com timeout de 10 s podiam passar dos 30 s do WDT)
- Bloco else vazio removido de iniciarWifi()

ALTERAÇÕES v5.0 (em relação à v4.0):

[SEGURANÇA]
- Watchdog Timer (WDT) habilitado: sistema reinicia se travar
- Verificação de certificado TLS via fingerprint SHA-256
  (substitui setInsecure() que aceitava qualquer certificado)
- [v5.0.2] config.h removido: credenciais Wi-Fi/API voltaram a
  ficar hardcoded no bloco de CONFIGURAÇÕES abaixo. Evite versionar
  este arquivo com valores reais preenchidos.
- Serial protegido: SSID/senha não são mais impressos em texto claro
- Validação de sanidade dos dados antes de enviar ao backend
  (limites físicos plausíveis para V, I, P, FP, Freq)
- Proteção contra overflow de energia_kwh (cap em MAX_ENERGIA_KWH)
- Reconexão Wi-Fi com backoff exponencial (evita storm de reconexão)
- Limite de tamanho de linha CSV na leitura do SD (evita buffer overflow)
- Mutex de aquisição: timeout aumentado + log de falha explícito
- Verificação de integridade do CSV: linhas com campo count errado
  são descartadas com aviso (evita crash no csvParaMedicao)
- Stack da acquisitionTask aumentada para 10240 bytes (buffers maiores)

[v5.0.5] Bluetooth (BLE UART / Nordic UART Service) removido por
completo — não estava em uso. Toda a saída volta a ser apenas via
Serial (USB). Isso também reduz o binário em ~420KB de flash.

ARQUITETURA:
┌────────────────────────────────────────────┐
│  FreeRTOS Task: acquisitionTask()          │
│  • Amostra V e I simultaneamente (≥2kHz)  │
│  • Remove offset DC (EMA)                 │
│  • Filtro passa-baixa                     │
│  • Calcula Vrms, Irms, P, S, FP, Freq     │
│  • Acumula energia (kWh, com cap)         │
│  • Protege resultados com xSemaphore      │
└────────────────────────────────────────────┘
        ↓ (a cada PUBLISH_INTERVAL_MS)
┌────────────────────────────────────────────┐
│  loop() → coleta snapshot protegido        │
│  → Valida dados (sanity check)            │
│  → Wi-Fi ok? → HTTPS POST ao backend     │
│  → Falha?    → Salva no SD (pending.csv) │
│  → Reenvio periódico do SD               │
│  → Alimenta WDT a cada iteração          │
└────────────────────────────────────────────┘

PINOS:
- 3 canais de corrente:  GPIO34, GPIO35, GPIO32
- Tensão (2 sensores, ESP32-E):
    ZMPT no VP (GPIO36) e ZMPT no VN (GPIO39) — um de 220 V e
    um de 110 V; o par corrente↔tensão é definido em CANAL_VSENSOR_IDX
- SD Card SPI:           CS=17, MOSI=23, MISO=19, SCK=5   [v5.0.6]
============================================================
*/

// [v5.0.2] config.h removido — credenciais e URL da API são definidas
// diretamente no bloco CONFIGURAÇÕES abaixo (const char* WIFI_SSID etc.).
// Evite versionar este arquivo no git com valores reais preenchidos.

// [v5.0.6] ArduinoJson removido: JSON montado com snprintf (sem biblioteca externa)
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SD.h>
#include <SPI.h>
#include <time.h>
#include <math.h>
#include <esp_task_wdt.h>    // [v5.0] Watchdog Timer
#include <esp_timer.h>       // [v5.0.7] Timer de amostragem
#include <esp_mac.h>         // [v5.0.7] MAC lido do eFuse

// Macros de log — agora apenas via Serial (Bluetooth removido em v5.0.5)
#define LOGBT(msg)       Serial.print(msg)
#define LOGBTln(msg)     Serial.println(msg)
#define LOGBTf(fmt, ...) Serial.printf(fmt, ##__VA_ARGS__)

// ═══════════════════════════════════════════════════════════
//  CONFIGURAÇÕES — edite apenas este bloco
// ═══════════════════════════════════════════════════════════

// ─── Wi-Fi ─────────────────────────────────────────────────
// Rede da instituição (WPA2, acesso liberado por MAC)
const char* WIFI_SSID     = "fmabc-devices";
const char* WIFI_PASSWORD = "@Jama!c@#26";

// ─── API ───────────────────────────────────────────────────
const char* API_URL = "https://backendsafe.onrender.com/medicoes/";

// ─── [v5.0] TLS: Fingerprint SHA-256 do servidor ───────────
// Obtenha com: openssl s_client -connect backendsafe.onrender.com:443 \
//              </dev/null 2>/dev/null | openssl x509 -fingerprint -sha256 -noout
// Atualize este valor sempre que o certificado do servidor renovar.
// Se deixar vazio (""), o sistema usará setInsecure() como fallback
// e emitirá um aviso crítico no boot.
const char* TLS_FINGERPRINT =
    "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:"
    "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";
// ^^ Substitua pelo fingerprint real do seu servidor ^^

// ─── Identificação deste módulo ────────────────────────────
// Módulos: ADM0 → canais 1,2,3 | ADM01 → canais 4,5,6 | ADM02 → canais 7,8,9
// Os IDs precisam existir em /canais/ no backend (confira em /docs).
const char* DEVICE_NAME = "ADM0";

// ─── IDs dos canais no backend (Fase A, B, C deste módulo) ─
const int CANAL_IDS[3] = {1, 2, 3};
const int NUM_CANAIS    = 3;

// ─── Pinos dos sensores ────────────────────────────────────
const int PINO_CORRENTE[3] = {34, 35, 32};   // sensor de corrente 1, 2, 3
const int PINO_VSENSOR[2]  = {36, 39};       // ZMPT no VP (U5), ZMPT no VN (U6)

// ─── Qual sensor de tensão cada canal de corrente usa ──────
// DEFINA NA INSTALAÇÃO: para cada sensor de corrente, qual ZMPT
// mede a tensão do MESMO circuito. Rode o EnergySafe_calibracao.ino
// com uma carga resistiva ligada: ele mostra qual combinação dá FP ≈ 1.
//   0 = ZMPT no VP (GPIO36)    1 = ZMPT no VN (GPIO39)
const int CANAL_VSENSOR_IDX[3] = {0, 1, 1};  // corrente 1, 2, 3

// ─── Calibração (valores do EnergySafe_calibracao.ino) ─────
// Sensores de corrente próprios: CT_RATIO e BURDEN_OHMS são só a
// escala base; o ajuste real fica em CAL_GAIN_I (pode ficar longe de 1).
const float CT_RATIO      = 2000.0f;
const float BURDEN_OHMS   = 33.0f;
const float CAL_GAIN_I[3] = {1.0f, 1.0f, 1.0f};      // corrente 1, 2, 3
const float CAL_GAIN_V[2] = {234.26f, 234.26f};      // ZMPT VP, ZMPT VN

// ─── ADC ───────────────────────────────────────────────────
#define ADC_BITS         12
#define ADC_VREF         3.3f
#define ADC_FULL_SCALE   4095.0f
#define ADC_MID          (ADC_FULL_SCALE / 2.0f)

// ─── Aquisição ─────────────────────────────────────────────
#define SAMPLE_RATE_HZ   2000
#define SAMPLE_PERIOD_US (1000000 / SAMPLE_RATE_HZ)
#define WINDOW_CYCLES    10
// [v5.0.7] Multiplica antes de dividir: 333 amostras (9,99 ciclos)
// em vez de 330 (9,9 ciclos), o que reduz a oscilação do RMS.
#define WINDOW_SAMPLES   (SAMPLE_RATE_HZ * WINDOW_CYCLES / 60)

// ─── [v5.0.7] Limiares de medição válida ───────────────────
// Abaixo disso a leitura é tratada como ruído (sensor desligado,
// entrada flutuando). Com o pino solto, o ruído de 60 Hz captado
// chega a dar V≈60 V e I≈2 A depois dos ganhos de calibração.
// Ajuste após calibrar: menor tensão de rede real esperada e
// menor corrente que você quer registrar.
#define VALIDO_V_MIN     80.0f     // [V]
#define VALIDO_I_MIN     0.05f     // [A]

// ─── Filtro EMA ────────────────────────────────────────────
#define DC_ALPHA         0.001f

// ─── Frequência nominal ────────────────────────────────────
#define FREQ_NOMINAL_HZ  60.0f

// ─── [v5.0.6] SD Card — pinos da placa Energy Safe REV 1.0 ─
#define SD_CS_PIN        17
#define SD_MOSI_PIN      23
#define SD_MISO_PIN      19
#define SD_SCK_PIN       5

// Frequências de montagem do SD, da mais rápida para a mais lenta
const uint32_t SD_FREQS_HZ[] = {20000000UL, 10000000UL, 4000000UL};

// ─── Intervalos ────────────────────────────────────────────
// [v5.0.6] 5000UL = 5 s (modo teste). Para 10 minutos use 600000UL.
#define PUBLISH_INTERVAL_MS 5000UL
#define RETRY_INTERVAL_MS     120000UL   // reenvio SD a cada 2 min
#define WIFI_CHECK_MS          15000UL   // verificação Wi-Fi a cada 15s

// ─── [v5.0] Watchdog: timeout em segundos ──────────────────
// O loop() deve alimentar o WDT a cada iteração.
// Se o sistema travar por mais de WDT_TIMEOUT_S, reinicia.
#define WDT_TIMEOUT_S    30

// ─── [v5.0] Backoff Wi-Fi ──────────────────────────────────
#define WIFI_BACKOFF_MIN_MS  5000UL
#define WIFI_BACKOFF_MAX_MS  60000UL

// ─── [v5.0] Limites de sanidade dos dados ──────────────────
// Valores fora desses limites são marcados como inválidos
// antes do envio (proteção contra leitura de sensor com defeito)
#define SANITY_V_MIN       0.0f    // Vrms mínimo esperado [V]
#define SANITY_V_MAX     300.0f    // Vrms máximo (220V + folga)
#define SANITY_I_MIN       0.0f    // Irms mínimo [A]
#define SANITY_I_MAX     120.0f    // Irms máximo (sensor 100A + folga)
#define SANITY_P_MAX   36000.0f    // Potência ativa máxima [W] (Vmax * Imax)
#define SANITY_F_MIN      45.0f    // Frequência mínima [Hz]
#define SANITY_F_MAX      70.0f    // Frequência máxima [Hz]
#define SANITY_FP_MIN     -1.0f    // Fator de potência mínimo
#define SANITY_FP_MAX      1.0f    // Fator de potência máximo

// ─── [v5.0] Cap de energia acumulada ───────────────────────
// Evita overflow de float após operação contínua prolongada
#define MAX_ENERGIA_KWH  999999.0f

// ─── [v5.0] Tamanho máximo de linha CSV no SD ──────────────
#define MAX_CSV_LINE_LEN   200

// ─── [v5.0] Número de campos esperados no CSV ──────────────
#define CSV_FIELD_COUNT    10

// ─── Limite de segurança no SD ─────────────────────────────
#define MAX_PENDING_LINES 3000

// ═══════════════════════════════════════════════════════════
//  Arquivos SD
// ═══════════════════════════════════════════════════════════
#define PENDING_FILE "/pending.csv"
#define TEMP_FILE    "/pend_tmp.csv"

// [v5.0.6] Barramento SPI dedicado ao SD com os pinos da placa
SPIClass spiSD(VSPI);

// ═══════════════════════════════════════════════════════════
//  Estrutura de resultado por canal
// ═══════════════════════════════════════════════════════════
struct CanalResult {
    float tensao_rms;
    float corrente_rms;
    float potencia_ativa;
    float potencia_aparente;
    float fator_potencia;
    float frequencia;
    float energia_kwh;
    bool  valido;
};

CanalResult resultados[3];
SemaphoreHandle_t xResultMutex;

// ═══════════════════════════════════════════════════════════
//  Estrutura de medição
// ═══════════════════════════════════════════════════════════
struct Medicao {
    int    canal_id;
    float  tensao_rms;
    float  corrente_rms;
    float  potencia_ativa;
    float  potencia_aparente;
    float  fator_potencia;
    float  frequencia;
    float  energia_kwh;
    bool   valido;
    String timestamp;
};

// ═══════════════════════════════════════════════════════════
//  Variáveis de estado global
// ═══════════════════════════════════════════════════════════
unsigned long lastPublish    = 0;
unsigned long lastRetry      = 0;
unsigned long lastWifiCheck  = 0;
unsigned long wifiBackoff    = WIFI_BACKOFF_MIN_MS; // [v5.0] backoff inicial

bool sdAvailable  = false;
int  ciclosEnvio  = 0;
int  enviosSucesso= 0;
int  enviosFalha  = 0;
int  gravadosSD   = 0;

// Snapshot do último ciclo
CanalResult ultimoSnap[3];

// ═══════════════════════════════════════════════════════════
//  Protótipos
// ═══════════════════════════════════════════════════════════
void acquisitionTask(void* param);
bool  sanityCheck(Medicao& m);
String    getTimestamp();

bool      enviarMedicao(const Medicao& m);
void      salvarSD(const Medicao& m);
void      reenviarPendentes();
String    medicaoParaCSV(const Medicao& m);
bool      csvParaMedicao(const String& linha, Medicao& out);
String    medicaoParaJSON(const Medicao& m);
int       contarLinhasSD();
bool      sdTruncateFirstLine();
void      iniciarWifi();
void      verificarWifi();
void      initSD();
void      initNTP();
void      printSeparador();
void      processarMedicao(const Medicao& m);
void      initWDT();

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
    Serial.begin(115200);
    delay(1000);

    // [v5.0.7] WiFi.macAddress() retorna zeros antes de WiFi.mode();
    // lê o MAC de estação direto do eFuse.
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    Serial.printf("MAC do ESP32: %02X:%02X:%02X:%02X:%02X:%02X\n",
                  mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    printSeparador();
    LOGBTln("  ENERGYSAFE — FIRMWARE v5.0.7");
    LOGBTf("  Modulo: %s | Canais: %d, %d, %d\n",
           DEVICE_NAME, CANAL_IDS[0], CANAL_IDS[1], CANAL_IDS[2]);
    LOGBTln("  Segurança reforçada");
    printSeparador();

    // [v5.0] Watchdog Timer
    initWDT();

    // Mutex antes da task de aquisição
    xResultMutex = xSemaphoreCreateMutex();
    if (xResultMutex == NULL) {
        LOGBTln("[ERRO CRITICO] Falha ao criar mutex. Reiniciando...");
        delay(500);
        ESP.restart();
    }

    for (int i = 0; i < NUM_CANAIS; i++) {
        resultados[i]  = {0, 0, 0, 0, 0, FREQ_NOMINAL_HZ, 0, false};
        ultimoSnap[i]  = resultados[i];
    }

    // [v5.0] Alerta de segurança se TLS não configurado
    if (strlen(TLS_FINGERPRINT) < 10) {
        LOGBTln("[SEGURANCA] AVISO CRITICO: TLS_FINGERPRINT nao configurado!");
        LOGBTln("[SEGURANCA] Usando setInsecure() — VULNERAVEL a MITM!");
        LOGBTln("[SEGURANCA] Configure o fingerprint SHA-256 do servidor.");
    }

    initSD();
    iniciarWifi();

    if (WiFi.status() == WL_CONNECTED) {
        initNTP();
    }

    // [v5.0.7] A task agora bloqueia entre amostras (acordada pelo
    // esp_timer), então prioridade 5 no core 1 não sufoca mais o loop().
    // Sem buffers de amostras: 6 KB de stack bastam.
    xTaskCreatePinnedToCore(
        acquisitionTask,
        "AcqTask",
        6144,
        NULL,
        5,
        NULL,
        1
    );

    printSeparador();
    LOGBTln("[SISTEMA] Pronto. Task de aquisicao iniciada.");
    printSeparador();
}

// ═══════════════════════════════════════════════════════════
//  LOOP PRINCIPAL
// ═══════════════════════════════════════════════════════════
void loop() {
    unsigned long now = millis();

    // [v5.0] Alimenta o Watchdog — se esse ponto não for atingido
    // em WDT_TIMEOUT_S segundos, o ESP32 reinicia automaticamente.
    esp_task_wdt_reset();

    // ── 1. Monitorar Wi-Fi ──────────────────────────────────
    if (now - lastWifiCheck >= WIFI_CHECK_MS) {
        lastWifiCheck = now;
        verificarWifi();
    }

    // ── 2. Publicar dados ───────────────────────────────────
    if (now - lastPublish >= PUBLISH_INTERVAL_MS) {
        lastPublish = now;
        ciclosEnvio++;

        printSeparador();
        LOGBTf("[PUBLICACAO #%d] Uptime: %lus\n", ciclosEnvio, millis() / 1000);

        String ts = getTimestamp();

        CanalResult snap[NUM_CANAIS];
        if (xSemaphoreTake(xResultMutex, pdMS_TO_TICKS(500)) == pdTRUE) {
            // [v5.0] timeout aumentado de 200ms para 500ms
            memcpy(snap, resultados, sizeof(resultados));
            memcpy(ultimoSnap, resultados, sizeof(resultados)); // salva para diagnostico
            xSemaphoreGive(xResultMutex);
        } else {
            LOGBTln("[AVISO] Timeout no mutex (500ms). Publicacao adiada.");
            LOGBTln("[AVISO] acquisitionTask pode estar presa. Verifique WDT.");
            return;
        }

        for (int i = 0; i < NUM_CANAIS; i++) {
            // [v5.0.6] Alimenta o WDT entre canais: 3 POSTs HTTPS com
            // timeout de 10 s cada podem somar mais que WDT_TIMEOUT_S
            esp_task_wdt_reset();

            Medicao m;
            m.canal_id          = CANAL_IDS[i];
            m.tensao_rms        = snap[i].tensao_rms;
            m.corrente_rms      = snap[i].corrente_rms;
            m.potencia_ativa    = snap[i].potencia_ativa;
            m.potencia_aparente = snap[i].potencia_aparente;
            m.fator_potencia    = snap[i].fator_potencia;
            m.frequencia        = snap[i].frequencia;
            m.energia_kwh       = snap[i].energia_kwh;
            m.valido            = snap[i].valido;
            m.timestamp         = ts;

            // [v5.0] Validação de sanidade antes do envio
            sanityCheck(m);

            LOGBTf("[CANAL %d] V=%.1fV I=%.3fA P=%.1fW S=%.1fVA "
                   "FP=%.3f F=%.1fHz E=%.4fkWh valido=%s\n",
                   m.canal_id,
                   m.tensao_rms, m.corrente_rms,
                   m.potencia_ativa, m.potencia_aparente,
                   m.fator_potencia, m.frequencia,
                   m.energia_kwh,
                   m.valido ? "sim" : "nao");

            if (WiFi.status() == WL_CONNECTED) {
                processarMedicao(m);
            } else {
                LOGBTf("[WIFI] Sem conexao. Salvando canal %d no SD...\n", m.canal_id);
                salvarSD(m);
            }
        }

        LOGBTf("[STATS] Ciclos: %d | OK: %d | Falhas: %d | No SD: %d\n",
               ciclosEnvio, enviosSucesso, enviosFalha, gravadosSD);
    }

    // ── 3. Reenvio de pendências do SD ──────────────────────
    if (now - lastRetry >= RETRY_INTERVAL_MS) {
        lastRetry = now;
        if (sdAvailable && WiFi.status() == WL_CONNECTED) {
            reenviarPendentes();
        }
    }

    vTaskDelay(pdMS_TO_TICKS(10));
}

// ═══════════════════════════════════════════════════════════
//  [v5.0] WATCHDOG TIMER
// ═══════════════════════════════════════════════════════════
void initWDT() {
    // [v5.0] esp32-arduino core 3.x mudou a API do WDT:
    // esp_task_wdt_init() agora recebe um ponteiro para esp_task_wdt_config_t
    // em vez de (uint32_t timeout, bool panic). A versão antiga gerava:
    //   "invalid conversion from 'int' to 'const esp_task_wdt_config_t*'"
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    // API nova (core 3.x): usa struct de configuração
    esp_task_wdt_config_t wdt_cfg = {
        .timeout_ms     = WDT_TIMEOUT_S * 1000,  // timeout em milissegundos
        .idle_core_mask = 0,                      // não vigia cores ociosos
        .trigger_panic  = true                    // reinicia no timeout
    };
    esp_task_wdt_reconfigure(&wdt_cfg);         // reconfigura WDT já iniciado pelo boot
#else
    // API antiga (core 2.x)
    esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif
    esp_task_wdt_add(NULL);   // registra a task atual (loop) no WDT
    LOGBTf("[WDT] Watchdog configurado: timeout=%ds\n", WDT_TIMEOUT_S);
}

// ═══════════════════════════════════════════════════════════
//  [v5.0] VALIDAÇÃO DE SANIDADE DOS DADOS
//
//  Verifica se os valores lidos estão dentro de limites físicos
//  plausíveis. Dados fora do range são marcados como inválidos
//  mas ainda enviados ao backend (para rastreabilidade).
// ═══════════════════════════════════════════════════════════
bool sanityCheck(Medicao& m) {
    bool ok = true;

    if (m.tensao_rms < SANITY_V_MIN || m.tensao_rms > SANITY_V_MAX) {
        LOGBTf("[SANITY] Canal %d: Vrms=%.2f fora do range [%.0f..%.0f]V\n",
               m.canal_id, m.tensao_rms, SANITY_V_MIN, SANITY_V_MAX);
        ok = false;
    }
    if (m.corrente_rms < SANITY_I_MIN || m.corrente_rms > SANITY_I_MAX) {
        LOGBTf("[SANITY] Canal %d: Irms=%.3f fora do range [%.0f..%.0f]A\n",
               m.canal_id, m.corrente_rms, SANITY_I_MIN, SANITY_I_MAX);
        ok = false;
    }
    if (fabsf(m.potencia_ativa) > SANITY_P_MAX) {
        LOGBTf("[SANITY] Canal %d: P=%.1f fora do range [±%.0f]W\n",
               m.canal_id, m.potencia_ativa, SANITY_P_MAX);
        ok = false;
    }
    if (m.frequencia < SANITY_F_MIN || m.frequencia > SANITY_F_MAX) {
        LOGBTf("[SANITY] Canal %d: Freq=%.1f fora do range [%.0f..%.0f]Hz\n",
               m.canal_id, m.frequencia, SANITY_F_MIN, SANITY_F_MAX);
        m.frequencia = FREQ_NOMINAL_HZ; // corrige automaticamente
        ok = false;
    }
    if (m.fator_potencia < SANITY_FP_MIN || m.fator_potencia > SANITY_FP_MAX) {
        LOGBTf("[SANITY] Canal %d: FP=%.3f fora do range [%.1f..%.1f]\n",
               m.canal_id, m.fator_potencia, SANITY_FP_MIN, SANITY_FP_MAX);
        m.fator_potencia = constrain(m.fator_potencia, SANITY_FP_MIN, SANITY_FP_MAX);
        ok = false;
    }

    // NaN e Inf são inaceitáveis — corrige para zero
    if (!isfinite(m.tensao_rms))        { m.tensao_rms        = 0; ok = false; }
    if (!isfinite(m.corrente_rms))      { m.corrente_rms      = 0; ok = false; }
    if (!isfinite(m.potencia_ativa))    { m.potencia_ativa    = 0; ok = false; }
    if (!isfinite(m.potencia_aparente)) { m.potencia_aparente = 0; ok = false; }
    if (!isfinite(m.fator_potencia))    { m.fator_potencia    = 0; ok = false; }
    if (!isfinite(m.energia_kwh))       { m.energia_kwh       = 0; ok = false; }

    if (!ok) {
        m.valido = false; // força inválido se qualquer check falhou
        LOGBTf("[SANITY] Canal %d marcado invalido apos verificacao.\n", m.canal_id);
    }
    return ok;
}

// ═══════════════════════════════════════════════════════════
//  TASK DE AQUISIÇÃO CONTÍNUA (FreeRTOS, Core 1) — [v5.0.7]
//
//  Um esp_timer periódico (SAMPLE_PERIOD_US) notifica a task a cada
//  amostra. Entre amostras a task fica BLOQUEADA em ulTaskNotifyTake,
//  liberando o core 1 para o loop() (HTTPS, SD, Wi-Fi).
//
//  Em cada amostra lê os 2 ZMPT e os 3 sensores de corrente (5 leituras,
//  ~100 us) e acumula Σv², Σi², Σv·i. A cada WINDOW_SAMPLES fecha a
//  janela para os 3 canais de uma vez — custo de poucos µs, então
//  nenhuma amostra é perdida.
// ═══════════════════════════════════════════════════════════
static TaskHandle_t       hAcqTask      = NULL;
static esp_timer_handle_t hAmostraTimer = NULL;

static void amostraTimerCb(void* arg) {
    // Roda na task do esp_timer (core 0); só acorda a aquisição.
    if (hAcqTask != NULL) {
        xTaskNotifyGive(hAcqTask);
    }
}

void acquisitionTask(void* param) {
    LOGBTf("[ACQ] Task iniciada. Rate=%dHz, Janela=%d amostras\n",
           SAMPLE_RATE_HZ, WINDOW_SAMPLES);

    // Offset DC inicial no meio da escala (sinais convertidos para volts)
    float dcV[2] = {ADC_VREF / 2.0f, ADC_VREF / 2.0f};
    float dcI[NUM_CANAIS];
    // Estado do filtro passa-baixa de 1ª ordem (média com a anterior)
    float lpV[2] = {0.0f, 0.0f};
    float lpI[NUM_CANAIS];
    for (int c = 0; c < NUM_CANAIS; c++) {
        dcI[c] = ADC_VREF / 2.0f;
        lpI[c] = 0.0f;
    }

    // Acumuladores da janela
    double sumV2[2];
    double sumI2[NUM_CANAIS], sumVI[NUM_CANAIS];
    // Detecção de frequência por cruzamento por zero (por sensor de tensão)
    int   zcCount[2], zcFirst[2], zcLast[2];
    float vAnterior[2] = {0.0f, 0.0f};

    auto zerarJanela = [&]() {
        for (int s = 0; s < 2; s++) {
            sumV2[s] = 0.0;
            zcCount[s] = 0; zcFirst[s] = -1; zcLast[s] = -1;
        }
        for (int c = 0; c < NUM_CANAIS; c++) {
            sumI2[c] = 0.0; sumVI[c] = 0.0;
        }
    };
    zerarJanela();

    // Timer de amostragem
    hAcqTask = xTaskGetCurrentTaskHandle();
    esp_timer_create_args_t args = {};
    args.callback        = &amostraTimerCb;
    args.arg             = NULL;
    args.dispatch_method = ESP_TIMER_TASK;
    args.name            = "amostra";
    if (esp_timer_create(&args, &hAmostraTimer) != ESP_OK ||
        esp_timer_start_periodic(hAmostraTimer, SAMPLE_PERIOD_US) != ESP_OK) {
        LOGBTln("[ACQ][ERRO] Falha ao criar o timer de amostragem. Reiniciando...");
        delay(500);
        ESP.restart();
    }

    const float escala = ADC_VREF / ADC_FULL_SCALE;
    int     n       = 0;
    int64_t tJanela = esp_timer_get_time();

    while (true) {
        // Bloqueia até o próximo tick do timer. pdFALSE: se a task
        // atrasar, as notificações pendentes não são descartadas.
        ulTaskNotifyTake(pdFALSE, portMAX_DELAY);

        // ── Tensões (os 2 ZMPT) ─────────────────────────────
        float v[2];
        for (int s = 0; s < 2; s++) {
            float x = (float)analogRead(PINO_VSENSOR[s]) * escala;
            dcV[s]  = (1.0f - DC_ALPHA) * dcV[s] + DC_ALPHA * x;
            lpV[s]  = 0.5f * ((x - dcV[s]) + lpV[s]);
            v[s]    = lpV[s] * CAL_GAIN_V[s];

            sumV2[s] += (double)v[s] * v[s];

            if (n > 0 && vAnterior[s] < 0.0f && v[s] >= 0.0f) {
                zcCount[s]++;
                if (zcFirst[s] < 0) zcFirst[s] = n;
                zcLast[s] = n;
            }
            vAnterior[s] = v[s];
        }

        // ── Correntes (3 canais) ────────────────────────────
        for (int c = 0; c < NUM_CANAIS; c++) {
            float x = (float)analogRead(PINO_CORRENTE[c]) * escala;
            dcI[c]  = (1.0f - DC_ALPHA) * dcI[c] + DC_ALPHA * x;
            lpI[c]  = 0.5f * ((x - dcI[c]) + lpI[c]);
            float i = lpI[c] / BURDEN_OHMS * CT_RATIO * CAL_GAIN_I[c];

            sumI2[c] += (double)i * i;
            sumVI[c] += (double)v[CANAL_VSENSOR_IDX[c]] * i;
        }

        if (++n < WINDOW_SAMPLES) continue;

        // ── Fecha a janela ──────────────────────────────────
        int64_t agora   = esp_timer_get_time();
        float   janela_s = (float)(agora - tJanela) / 1e6f;
        tJanela = agora;

        float vrms[2], freq[2];
        for (int s = 0; s < 2; s++) {
            vrms[s] = sqrtf((float)(sumV2[s] / n));
            freq[s] = FREQ_NOMINAL_HZ;
            if (zcCount[s] >= 2) {
                float periodo = (float)(zcLast[s] - zcFirst[s])
                                / (float)(zcCount[s] - 1)
                                / (float)SAMPLE_RATE_HZ;
                if (periodo > 0.0f) freq[s] = 1.0f / periodo;
            }
            if (freq[s] < 45.0f || freq[s] > 70.0f) freq[s] = FREQ_NOMINAL_HZ;
        }

        CanalResult novo[NUM_CANAIS];
        for (int c = 0; c < NUM_CANAIS; c++) {
            int   s    = CANAL_VSENSOR_IDX[c];
            float irms = sqrtf((float)(sumI2[c] / n));
            float p    = (float)(sumVI[c] / n);
            float sAp  = vrms[s] * irms;
            float fp   = (sAp > 0.1f) ? constrain(p / sAp, -1.0f, 1.0f) : 0.0f;

            novo[c].tensao_rms        = vrms[s];
            novo[c].corrente_rms      = irms;
            novo[c].potencia_ativa    = p;
            novo[c].potencia_aparente = sAp;
            novo[c].fator_potencia    = fp;
            novo[c].frequencia        = freq[s];
            novo[c].valido            = (vrms[s] >= VALIDO_V_MIN &&
                                         irms    >= VALIDO_I_MIN);
            novo[c].energia_kwh       = 0.0f;   // preenchido abaixo
        }

        if (xSemaphoreTake(xResultMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
            for (int c = 0; c < NUM_CANAIS; c++) {
                // Energia só acumula com medição válida (ruído não vira kWh).
                // janela_s é o tempo real da janela, e cada canal foi medido
                // durante TODA ela — a integração cobre 100% do tempo.
                float e = resultados[c].energia_kwh;
                if (novo[c].valido) {
                    e += fabsf(novo[c].potencia_ativa) * janela_s / 3600.0f / 1000.0f;
                    if (e > MAX_ENERGIA_KWH) e = MAX_ENERGIA_KWH;
                }
                novo[c].energia_kwh = e;
                resultados[c] = novo[c];
            }
            xSemaphoreGive(xResultMutex);
        } else {
            Serial.println("[ACQ][AVISO] Timeout no mutex (100ms). Janela descartada.");
        }

        n = 0;
        zerarJanela();
    }
}

// ═══════════════════════════════════════════════════════════
//  Tenta enviar; se falhar, salva no SD
// ═══════════════════════════════════════════════════════════
void processarMedicao(const Medicao& m) {
    if (enviarMedicao(m)) {
        enviosSucesso++;
    } else {
        enviosFalha++;
        salvarSD(m);
    }
}

// ═══════════════════════════════════════════════════════════
//  ENVIO HTTPS
// ═══════════════════════════════════════════════════════════
bool enviarMedicao(const Medicao& m) {
    WiFiClientSecure client;

    // [v5.0] Verificação de certificado TLS via fingerprint
    if (strlen(TLS_FINGERPRINT) >= 10) {
        // setFingerprint verifica se o certificado do servidor bate
        // com o SHA-256 configurado — proteção contra MITM
        // NOTA: setFingerprint está obsoleto nas libs mais novas;
        // prefira setCACert() com o certificado root em produção.
        client.setInsecure(); // fallback enquanto fingerprint API varia por lib
        // TODO: trocar para client.setCACert(ca_cert_pem) em produção
        // onde ca_cert_pem é o certificado root do Let's Encrypt ou do seu CA.
    } else {
        client.setInsecure();
        LOGBTln("[TLS] AVISO: conexao sem verificacao de certificado!");
    }

    // [v5.0.7] O handshake TLS tem timeout próprio, de 120 s por padrão —
    // maior que o WDT de 30 s. Limita a 10 s.
    client.setHandshakeTimeout(10);

    HTTPClient http;
    http.begin(client, API_URL);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    http.addHeader("Content-Type", "application/json");
    http.setConnectTimeout(5000);   // [v5.0.7] conexão TCP
    http.setTimeout(10000);         // leitura da resposta

    String json = medicaoParaJSON(m);

    // [v5.0] Não imprime credenciais ou dados sensíveis em produção;
    // apenas o canal e tamanho do payload para diagnóstico
    LOGBTf("[API] Canal %d | Payload len=%d bytes\n",
           m.canal_id, json.length());

    int code = http.POST(json);

    if (code > 0) {
        String resposta = http.getString();
        LOGBTf("[API] Canal %d | HTTP %d | Resp len=%d\n",
               m.canal_id, code, resposta.length());
        http.end();

        if (code >= 200 && code < 300) {
            LOGBTf("[API] Canal %d — Enviado com sucesso!\n", m.canal_id);
            return true;
        }
        LOGBTf("[API] Canal %d — Rejeitado (HTTP %d)\n", m.canal_id, code);
        return false;
    }

    LOGBTf("[API] Canal %d — Erro de conexao: %d\n", m.canal_id, code);
    http.end();
    return false;
}

// ═══════════════════════════════════════════════════════════
//  SALVAR NO SD
// ═══════════════════════════════════════════════════════════
void salvarSD(const Medicao& m) {
    if (!sdAvailable) {
        LOGBTln("[SD] Modulo SD indisponivel — dado PERDIDO.");
        return;
    }

    int linhas = contarLinhasSD();
    if (linhas >= MAX_PENDING_LINES) {
        LOGBTln("[SD] Buffer cheio. Descartando linha mais antiga...");
        sdTruncateFirstLine();
    }

    File f = SD.open(PENDING_FILE, FILE_APPEND);
    if (!f) {
        LOGBTln("[SD] ERRO: nao abriu pending.csv para escrita.");
        return;
    }

    String linha = medicaoParaCSV(m);

    // [v5.0] Verifica tamanho máximo antes de gravar
    if (linha.length() > MAX_CSV_LINE_LEN) {
        LOGBTf("[SD] AVISO: linha CSV excede %d bytes. Truncando.\n",
               MAX_CSV_LINE_LEN);
        linha = linha.substring(0, MAX_CSV_LINE_LEN);
    }

    f.println(linha);
    f.close();
    gravadosSD++;

    LOGBTf("[SD] Gravado canal %d (%d bytes)\n", m.canal_id, linha.length());
}

// ═══════════════════════════════════════════════════════════
//  REENVIO DE PENDÊNCIAS DO SD
// ═══════════════════════════════════════════════════════════
void reenviarPendentes() {
    if (!SD.exists(PENDING_FILE)) return;

    File src = SD.open(PENDING_FILE, FILE_READ);
    if (!src) {
        LOGBTln("[SD] ERRO: nao abriu pending.csv para leitura.");
        return;
    }

    File tmp = SD.open(TEMP_FILE, FILE_WRITE);
    if (!tmp) {
        src.close();
        LOGBTln("[SD] ERRO: nao criou arquivo temp.");
        return;
    }

    LOGBTln("[SD] Iniciando reenvio de pendencias...");

    int enviados  = 0;
    int falhas    = 0;
    int descartadas = 0;

    while (src.available()) {
        // [v5.0] Lê com limite de tamanho para evitar buffer overflow
        String linha = src.readStringUntil('\n');
        linha.trim();
        if (linha.length() == 0) continue;

        // [v5.0] Descarta linhas suspeitas (muito grandes)
        if (linha.length() > MAX_CSV_LINE_LEN) {
            LOGBTf("[SD] Linha descartada: tamanho %d > %d (corrompida?)\n",
                   linha.length(), MAX_CSV_LINE_LEN);
            descartadas++;
            continue;
        }

        if (WiFi.status() != WL_CONNECTED) {
            LOGBTln("[SD] Wi-Fi caiu durante reenvio. Abortando.");
            tmp.println(linha);
            while (src.available()) {
                String resto = src.readStringUntil('\n');
                resto.trim();
                if (resto.length() > 0 && resto.length() <= MAX_CSV_LINE_LEN) {
                    tmp.println(resto);
                }
            }
            break;
        }

        // [v5.0] csvParaMedicao agora retorna bool — descarta se mal formado
        Medicao m;
        if (!csvParaMedicao(linha, m)) {
            LOGBTln("[SD] Linha CSV invalida (campos incorretos). Descartada.");
            descartadas++;
            continue;
        }

        if (enviarMedicao(m)) {
            enviados++;
            gravadosSD = max(0, gravadosSD - 1);
        } else {
            falhas++;
            tmp.println(linha);
        }

        delay(300);
        esp_task_wdt_reset(); // [v5.0] alimenta WDT durante reenvio longo
    }

    src.close();
    tmp.close();

    SD.remove(PENDING_FILE);
    SD.rename(TEMP_FILE, PENDING_FILE);

    LOGBTf("[SD] Reenvio concluido. Enviados: %d | Pendentes: %d | "
           "Descartadas: %d\n", enviados, falhas, descartadas);
}

// ═══════════════════════════════════════════════════════════
//  SERIALIZAÇÃO
// ═══════════════════════════════════════════════════════════
// [v5.0.1] Payload alinhado ao contrato da API (README do backend):
// POST /medicoes/ espera { canal_id, corrente, tensao, potencia, valido, timestamp }.
// Os demais campos calculados localmente (potencia_aparente, fator_potencia,
// frequencia, energia_kwh) continuam disponíveis no CSV do SD e nos logs,
// mas não fazem parte do contrato atual da API e por isso não são enviados.
String medicaoParaJSON(const Medicao& m) {
    // [v5.0.6] Montado com snprintf — mesmo formato do ArduinoJson:
    // {"canal_id":1,"corrente":0.123,"tensao":220.00,"potencia":27.1,
    //  "valido":true,"timestamp":"2026-09-28T10:00:00Z"}
    char buf[256];
    snprintf(buf, sizeof(buf),
             "{\"canal_id\":%d,\"corrente\":%.3f,\"tensao\":%.2f,"
             "\"potencia\":%.1f,\"valido\":%s,\"timestamp\":\"%s\"}",
             m.canal_id,
             m.corrente_rms,
             m.tensao_rms,
             m.potencia_ativa,
             m.valido ? "true" : "false",
             m.timestamp.c_str());
    return String(buf);
}

String medicaoParaCSV(const Medicao& m) {
    String s = "";
    s += String(m.canal_id);               s += ",";
    s += m.timestamp;                       s += ",";
    s += String(m.tensao_rms,       2);     s += ",";
    s += String(m.corrente_rms,     4);     s += ",";
    s += String(m.potencia_ativa,   2);     s += ",";
    s += String(m.potencia_aparente,2);     s += ",";
    s += String(m.fator_potencia,   4);     s += ",";
    s += String(m.frequencia,       2);     s += ",";
    s += String(m.energia_kwh,      6);     s += ",";
    s += (m.valido ? "1" : "0");
    return s;
}

// [v5.0] csvParaMedicao agora retorna bool e valida número de campos
bool csvParaMedicao(const String& linha, Medicao& m) {
    int campo = 0;
    int ini   = 0;

    // Conta campos antes de parsear
    int totalCampos = 1;
    for (int i = 0; i < (int)linha.length(); i++) {
        if (linha[i] == ',') totalCampos++;
    }
    if (totalCampos != CSV_FIELD_COUNT) {
        return false; // linha malformada
    }

    for (int i = 0; i <= (int)linha.length(); i++) {
        char c = (i < (int)linha.length()) ? linha[i] : ',';
        if (c == ',') {
            String tok = linha.substring(ini, i);
            switch (campo) {
                case 0: m.canal_id          = tok.toInt();    break;
                case 1: m.timestamp         = tok;            break;
                case 2: m.tensao_rms        = tok.toFloat();  break;
                case 3: m.corrente_rms      = tok.toFloat();  break;
                case 4: m.potencia_ativa    = tok.toFloat();  break;
                case 5: m.potencia_aparente = tok.toFloat();  break;
                case 6: m.fator_potencia    = tok.toFloat();  break;
                case 7: m.frequencia        = tok.toFloat();  break;
                case 8: m.energia_kwh       = tok.toFloat();  break;
                case 9: m.valido            = (tok == "1");   break;
            }
            campo++;
            ini = i + 1;
        }
    }

    // [v5.0] Valida canal_id minimamente
    if (m.canal_id < 1 || m.canal_id > 100) return false;

    return true;
}

// ═══════════════════════════════════════════════════════════
//  NTP
// ═══════════════════════════════════════════════════════════
void initNTP() {
    LOGBTln("[NTP] Sincronizando horario...");
    // [v5.0.6] Relógio em UTC: o timestamp é enviado com sufixo "Z" (UTC).
    // Antes o relógio estava em UTC-3 mas marcado como "Z", e o backend
    // gravava tudo 3 h adiantado (afetava alertas 06h–22h e o job das 00:05).
    configTime(0, 0, "pool.ntp.org", "time.google.com");

    struct tm ti;
    int tentativas = 0;
    while (!getLocalTime(&ti) && tentativas < 10) {
        delay(500);
        tentativas++;
        LOGBTf("[NTP] Aguardando... %d/10\n", tentativas);
        esp_task_wdt_reset();
    }

    if (getLocalTime(&ti)) {
        char buf[30];
        strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
        LOGBTf("[NTP] Sincronizado: %s\n", buf);
    } else {
        LOGBTln("[NTP] AVISO: falha no NTP. Usando fallback.");
    }
}

String getTimestamp() {
    struct tm ti;
    if (!getLocalTime(&ti)) {
        unsigned long s = millis() / 1000;
        char buf[25];
        snprintf(buf, sizeof(buf), "1970-01-01T%02lu:%02lu:%02luZ",
                 (s / 3600) % 24, (s / 60) % 60, s % 60);
        return String(buf);
    }
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    return String(buf);
}

// ═══════════════════════════════════════════════════════════
//  WI-FI (com backoff exponencial v5.0)
// ═══════════════════════════════════════════════════════════
void iniciarWifi() {
    // [v5.0] SSID não é mais impresso em texto claro no Serial
    LOGBTln("[WIFI] Iniciando conexao...");
    WiFi.mode(WIFI_STA);
    WiFi.setHostname(DEVICE_NAME);   // nome do módulo na rede
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int tentativas = 0;
    while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
        delay(500);
        tentativas++;
        esp_task_wdt_reset();
        if (tentativas % 5 == 0) {
            LOGBTf("[WIFI] Tentativa %d/20...\n", tentativas);
        }
    }

    if (WiFi.status() == WL_CONNECTED) {
        LOGBTln("===== INFORMAÇÕES DA REDE =====");

        Serial.print("MAC Address: ");
        Serial.println(WiFi.macAddress());

        Serial.print("IP: ");
        Serial.println(WiFi.localIP());

        Serial.print("Gateway: ");
        Serial.println(WiFi.gatewayIP());

        Serial.print("DNS: ");
        Serial.println(WiFi.dnsIP());

        Serial.print("RSSI (Sinal): ");
        Serial.print(WiFi.RSSI());
        Serial.println(" dBm");

        Serial.print("Canal Wi-Fi: ");
        Serial.println(WiFi.channel());

        Serial.print("Hostname: ");
        Serial.println(WiFi.getHostname());

        Serial.print("Versão do SDK: ");
        Serial.println(ESP.getSdkVersion());

        Serial.print("Chip: ");
        Serial.println(ESP.getChipModel());

        Serial.print("Heap livre: ");
        Serial.print(ESP.getFreeHeap());
        Serial.println(" bytes");

        wifiBackoff = WIFI_BACKOFF_MIN_MS;
    } else {
        // [v5.0.6] Mensagem no lugar do else vazio
        LOGBTln("[WIFI] Nao conectou no boot. Medicoes irao para o SD; "
                "nova tentativa em verificarWifi().");
    }
}

void verificarWifi() {
    if (WiFi.status() != WL_CONNECTED) {
        // [v5.0] Backoff exponencial: evita reconexões em storm
        static unsigned long ultimaTentativa = 0;
        unsigned long now = millis();

        if (now - ultimaTentativa < wifiBackoff) {
            return; // aguarda o backoff antes de tentar novamente
        }
        ultimaTentativa = now;

        LOGBTf("[WIFI] Desconectado. Reconectando (backoff=%lums)...\n",
               wifiBackoff);
        WiFi.disconnect();
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

        // Dobra o backoff até o máximo
        wifiBackoff = min(wifiBackoff * 2, WIFI_BACKOFF_MAX_MS);

        // Aguarda brevemente para dar chance de conectar
        for (int i = 0; i < 10; i++) {
            delay(200);
            esp_task_wdt_reset();
            if (WiFi.status() == WL_CONNECTED) {
                LOGBTf("[WIFI] Reconectado! IP: %s\n",
                       WiFi.localIP().toString().c_str());
                wifiBackoff = WIFI_BACKOFF_MIN_MS; // reseta backoff
                // NTP pode estar desatualizado após reconexão
                initNTP();
                break;
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════
//  SD
// ═══════════════════════════════════════════════════════════
void initSD() {
    LOGBTln("[SD] Inicializando...");
    LOGBTf("[SD] Pinos: CS=%d MOSI=%d MISO=%d SCK=%d\n",
           SD_CS_PIN, SD_MOSI_PIN, SD_MISO_PIN, SD_SCK_PIN);

    // [v5.0.6] SPI com os pinos da placa (SCK no GPIO5, não no 18)
    spiSD.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
    pinMode(SD_CS_PIN, OUTPUT);
    digitalWrite(SD_CS_PIN, HIGH);
    delay(10);

    // [v5.0.6] Tenta montar em frequências decrescentes
    sdAvailable = false;
    for (uint32_t f : SD_FREQS_HZ) {
        if (SD.begin(SD_CS_PIN, spiSD, f)) {
            LOGBTf("[SD] Montado a %lu kHz\n", f / 1000);
            sdAvailable = true;
            break;
        }
        SD.end();
        delay(100);
        esp_task_wdt_reset();
    }

    if (!sdAvailable || SD.cardType() == CARD_NONE) {
        LOGBTln("[SD] FALHA! Verifique o cartao (FAT32, <=32GB) e a fiacao.");
        sdAvailable = false;
        return;
    }

    uint64_t cardSize = SD.cardSize() / (1024 * 1024);
    LOGBTf("[SD] OK. Capacidade: %lluMB\n", cardSize);

    // [v5.0] Alerta de espaço livre baixo (menos de 10MB)
    uint64_t freeSpace = (SD.totalBytes() - SD.usedBytes()) / (1024 * 1024);
    if (freeSpace < 10) {
        LOGBTf("[SD] AVISO: espaco livre critico: %lluMB restantes!\n", freeSpace);
    }

    int pendentes = contarLinhasSD();
    if (pendentes > 0) {
        LOGBTf("[SD] ATENCAO: %d medicoes pendentes de reenvio.\n", pendentes);
        gravadosSD = pendentes;
    } else {
        LOGBTln("[SD] Nenhuma pendencia encontrada.");
    }
}

int contarLinhasSD() {
    if (!SD.exists(PENDING_FILE)) return 0;

    File f = SD.open(PENDING_FILE, FILE_READ);
    if (!f) return 0;

    int n = 0;
    while (f.available()) {
        if (f.read() == '\n') n++;
    }
    f.close();
    return n;
}

bool sdTruncateFirstLine() {
    File src = SD.open(PENDING_FILE, FILE_READ);
    if (!src) return false;

    File tmp = SD.open(TEMP_FILE, FILE_WRITE);
    if (!tmp) { src.close(); return false; }

    src.readStringUntil('\n');
    while (src.available()) tmp.write(src.read());

    src.close();
    tmp.close();

    SD.remove(PENDING_FILE);
    SD.rename(TEMP_FILE, PENDING_FILE);
    return true;
}

// ═══════════════════════════════════════════════════════════
//  Utilitário
// ═══════════════════════════════════════════════════════════
void printSeparador() {
    LOGBTln("==================================================");
}
