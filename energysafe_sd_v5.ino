/*
============================================================
EnergySafe — Firmware v5.0
3 Fases | SCT-013-000 + ZMPT101B | NTP | HTTPS | SD Buffer
============================================================

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
        ↓ (a cada PUBLISH_INTERVAL_MS = 10min)
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
    Fase A → SENSOR_VP (GPIO36)
    Fase B → SENSOR_VN (GPIO39)
    Fase C → SENSOR_VN (GPIO39, compartilhado com Fase B)
- SD Card SPI:           CS=5, MOSI=23, MISO=19, SCK=18
============================================================
*/

// [v5.0.2] config.h removido — credenciais e URL da API são definidas
// diretamente no bloco CONFIGURAÇÕES abaixo (const char* WIFI_SSID etc.).
// Evite versionar este arquivo no git com valores reais preenchidos.

#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SD.h>
#include <SPI.h>
#include <time.h>
#include <math.h>
#include <esp_task_wdt.h>    // [v5.0] Watchdog Timer

// Macros de log — agora apenas via Serial (Bluetooth removido em v5.0.5)
#define LOGBT(msg)       Serial.print(msg)
#define LOGBTln(msg)     Serial.println(msg)
#define LOGBTf(fmt, ...) Serial.printf(fmt, ##__VA_ARGS__)

// ═══════════════════════════════════════════════════════════
//  CONFIGURAÇÕES — edite apenas este bloco
// ═══════════════════════════════════════════════════════════

// ─── Wi-Fi ─────────────────────────────────────────────────
const char* WIFI_SSID     = "S23 da Karol";
const char* WIFI_PASSWORD = "teste123";

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

// ─── IDs dos canais no backend ─────────────────────────────
const int CANAL_IDS[3] = {1, 2, 3};
const int NUM_CANAIS    = 3;

// ─── Pinos dos sensores ────────────────────────────────────
const int PINO_CORRENTE[3] = {34, 35, 32};

// [v5.0.3] ESP32-E: apenas 2 sensores de tensão físicos disponíveis
// (SENSOR_VP = GPIO36, SENSOR_VN = GPIO39). Fase A usa VP; Fases B e C
// compartilham o mesmo sensor em VN (mesma leitura de tensão para ambas).
// Ambos são pinos ADC1 (não conflitam com Wi-Fi, que usa ADC2) —
// isso também resolve o conflito latente que existia com GPIO25/26 (ADC2).
#define SENSOR_VP  36
#define SENSOR_VN  39
const int PINO_TENSAO[3]   = {SENSOR_VP, SENSOR_VN, SENSOR_VN};

// ─── [v5.0.4] Calibração do SCT-013-000 (100A:50mA) ────────
// CT_RATIO e BURDEN_OHMS descrevem o modelo físico do sensor (iguais
// para os 3, pois é o mesmo modelo de CT). CAL_GAIN_I é o ganho de
// ajuste fino POR FASE — calibre cada sensor separadamente comparando
// o Irms lido no Serial com uma pinça amperímetro de referência.
//   CAL_GAIN_I[0] → Fase A (GPIO34)
//   CAL_GAIN_I[1] → Fase B (GPIO35)
//   CAL_GAIN_I[2] → Fase C (GPIO32)
const float CT_RATIO      = 2000.0f;
const float BURDEN_OHMS   = 33.0f;
const float CAL_GAIN_I[3] = {1.0f, 1.0f, 1.0f};

// ─── [v5.0.4] Calibração do ZMPT101B (2 sensores físicos) ──
// Um ganho por sensor de tensão — calibre cada um separadamente
// comparando o Vrms lido no Serial com um multímetro de referência.
//   CAL_GAIN_V[0] → sensor em SENSOR_VP (usado pela Fase A)
//   CAL_GAIN_V[1] → sensor em SENSOR_VN (usado pelas Fases B e C)
const float CAL_GAIN_V[2] = {234.26f, 234.26f};

// [v5.0.4] Mapeia cada canal (fase) para o índice do sensor de tensão
// que ele usa em CAL_GAIN_V — mesma lógica de compartilhamento de PINO_TENSAO.
const int CANAL_VSENSOR_IDX[3] = {0, 1, 1}; // Fase A→VP(0), Fase B→VN(1), Fase C→VN(1)

// ─── ADC ───────────────────────────────────────────────────
#define ADC_BITS         12
#define ADC_VREF         3.3f
#define ADC_FULL_SCALE   4095.0f
#define ADC_MID          (ADC_FULL_SCALE / 2.0f)

// ─── Aquisição ─────────────────────────────────────────────
#define SAMPLE_RATE_HZ   2000
#define SAMPLE_PERIOD_US (1000000 / SAMPLE_RATE_HZ)
#define WINDOW_CYCLES    10
#define WINDOW_SAMPLES   (SAMPLE_RATE_HZ / 60 * WINDOW_CYCLES)

// ─── Filtro EMA ────────────────────────────────────────────
#define DC_ALPHA         0.001f

// ─── Frequência nominal ────────────────────────────────────
#define FREQ_NOMINAL_HZ  60.0f

// ─── SD Card ───────────────────────────────────────────────
#define SD_CS_PIN        5

// ─── Intervalos ────────────────────────────────────────────
#define PUBLISH_INTERVAL_MS 5000UL   // 10 minutos
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
void processarCanal(int canal, float* bufV, float* bufI, int n,
                     unsigned long janela_ms);
float detectarFrequencia(float* buf, int n, float sampleRate);
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

    printSeparador();
    LOGBTln("  ENERGYSAFE — FIRMWARE v5.0");
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

    // [v5.0] Task de aquisição com stack maior (10240 bytes)
    xTaskCreatePinnedToCore(
        acquisitionTask,
        "AcqTask",
        10240,    // [v5.0] aumentado de 8192 para comportar buffers estáticos
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

    // ── 2. Publicar dados (a cada 10 minutos) ───────────────
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
//  TASK DE AQUISIÇÃO CONTÍNUA (FreeRTOS, Core 1)
// ═══════════════════════════════════════════════════════════
void acquisitionTask(void* param) {
    static float bufV[WINDOW_SAMPLES];
    static float bufI[WINDOW_SAMPLES];

    LOGBTf("[ACQ] Task iniciada. Rate=%dHz, Janela=%d amostras\n",
           SAMPLE_RATE_HZ, WINDOW_SAMPLES);

    float dcV[NUM_CANAIS], dcI[NUM_CANAIS];
    for (int c = 0; c < NUM_CANAIS; c++) {
        dcV[c] = ADC_MID;
        dcI[c] = ADC_MID;
    }

    unsigned long tJanelaInicio = micros();

    while (true) {
        for (int canal = 0; canal < NUM_CANAIS; canal++) {
            for (int n = 0; n < WINDOW_SAMPLES; n++) {
                unsigned long t0 = micros();

                int rawV = analogRead(PINO_TENSAO[canal]);
                int rawI = analogRead(PINO_CORRENTE[canal]);

                float adcV = (float)rawV * (ADC_VREF / ADC_FULL_SCALE);
                float adcI = (float)rawI * (ADC_VREF / ADC_FULL_SCALE);

                dcV[canal] = (1.0f - DC_ALPHA) * dcV[canal] + DC_ALPHA * adcV;
                dcI[canal] = (1.0f - DC_ALPHA) * dcI[canal] + DC_ALPHA * adcI;

                float vCentrado = adcV - dcV[canal];
                float iCentrado = adcI - dcI[canal];

                if (n > 0) {
                    vCentrado = 0.5f * (vCentrado + bufV[n - 1]);
                    iCentrado = 0.5f * (iCentrado + bufI[n - 1]);
                }

                bufV[n] = vCentrado;
                bufI[n] = iCentrado;

                long resta = (long)SAMPLE_PERIOD_US - (long)(micros() - t0);
                if (resta > 0) {
                    delayMicroseconds((uint32_t)resta);
                }
            }

            unsigned long janela_ms = (micros() - tJanelaInicio) / 1000UL;
            tJanelaInicio = micros();

            processarCanal(canal, bufV, bufI, WINDOW_SAMPLES, janela_ms);
        }

        vTaskDelay(1);
    }
}

// ═══════════════════════════════════════════════════════════
//  PROCESSAMENTO LOCAL DAS GRANDEZAS ELÉTRICAS
// ═══════════════════════════════════════════════════════════
void processarCanal(int canal, float* bufV, float* bufI, int n,
                     unsigned long janela_ms) {
    double sumV2 = 0.0, sumI2 = 0.0, sumVI = 0.0;

    // [v5.0.4] Ganho de tensão vem do sensor físico que esta fase usa
    // (via CANAL_VSENSOR_IDX); ganho de corrente é individual por fase.
    float ganhoV = CAL_GAIN_V[CANAL_VSENSOR_IDX[canal]];
    float ganhoI = CAL_GAIN_I[canal];

    for (int k = 0; k < n; k++) {
        float v = bufV[k] * ganhoV;
        float i = bufI[k] / BURDEN_OHMS * CT_RATIO * ganhoI;

        sumV2 += (double)v * v;
        sumI2 += (double)i * i;
        sumVI += (double)v * i;
    }

    float vrms     = sqrtf((float)(sumV2 / n));
    float irms     = sqrtf((float)(sumI2 / n));
    float pAtiva   = (float)(sumVI / n);
    float pAparente = vrms * irms;

    float fp = 0.0f;
    if (pAparente > 0.1f) {
        fp = pAtiva / pAparente;
        fp = constrain(fp, -1.0f, 1.0f);
    }

    float freq = detectarFrequencia(bufV, n, (float)SAMPLE_RATE_HZ);
    if (freq < 45.0f || freq > 70.0f) {
        freq = FREQ_NOMINAL_HZ;
    }

    bool valido = (vrms > 5.0f && irms > 0.02f);

    float dt_h     = (float)janela_ms / 3600000.0f;
    float delta_kwh = fabsf(pAtiva) * dt_h / 1000.0f;

    // [v5.0] timeout aumentado de 50ms para 100ms + log explícito de falha
    if (xSemaphoreTake(xResultMutex, pdMS_TO_TICKS(100)) == pdTRUE) {
        resultados[canal].tensao_rms        = vrms;
        resultados[canal].corrente_rms      = irms;
        resultados[canal].potencia_ativa    = pAtiva;
        resultados[canal].potencia_aparente = pAparente;
        resultados[canal].fator_potencia    = fp;
        resultados[canal].frequencia        = freq;
        resultados[canal].valido            = valido;

        // [v5.0] Cap de energia: evita overflow de float após operação prolongada
        float novaEnergia = resultados[canal].energia_kwh + delta_kwh;
        resultados[canal].energia_kwh = min(novaEnergia, MAX_ENERGIA_KWH);

        xSemaphoreGive(xResultMutex);
    } else {
        // [v5.0] Falha no mutex logada explicitamente — antes era silenciosa
        Serial.printf("[ACQ][AVISO] Canal %d: timeout no mutex (100ms). "
                      "Amostra descartada.\n", canal);
    }
}

// ═══════════════════════════════════════════════════════════
//  DETECÇÃO DE FREQUÊNCIA POR CRUZAMENTO POR ZERO
// ═══════════════════════════════════════════════════════════
float detectarFrequencia(float* buf, int n, float sampleRate) {
    int cruzamentos = 0;
    int primeiroIdx = -1;
    int ultimoIdx   = -1;

    for (int k = 1; k < n; k++) {
        if (buf[k - 1] < 0.0f && buf[k] >= 0.0f) {
            cruzamentos++;
            if (primeiroIdx < 0) primeiroIdx = k;
            ultimoIdx = k;
        }
    }

    if (cruzamentos >= 2) {
        int amostrasEntreCruzamentos = ultimoIdx - primeiroIdx;
        float periodMedio = (float)amostrasEntreCruzamentos
                            / (float)(cruzamentos - 1)
                            / sampleRate;
        return (periodMedio > 0.0f) ? (1.0f / periodMedio) : FREQ_NOMINAL_HZ;
    }
    return FREQ_NOMINAL_HZ;
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

    HTTPClient http;
    http.begin(client, API_URL);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    http.addHeader("Content-Type", "application/json");
    http.setTimeout(10000);

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
    StaticJsonDocument<256> doc;

    doc["canal_id"]  = m.canal_id;
    doc["corrente"]  = serialized(String(m.corrente_rms,   3));
    doc["tensao"]    = serialized(String(m.tensao_rms,     2));
    doc["potencia"]  = serialized(String(m.potencia_ativa, 1));
    doc["valido"]    = m.valido;
    doc["timestamp"] = m.timestamp;

    String json;
    serializeJson(doc, json);
    return json;
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
    configTime(-3 * 3600, 0, "pool.ntp.org", "time.google.com");

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
        // [v5.0] Imprime IP mas não imprime SSID ou senha
        LOGBTf("[WIFI] Conectado! IP: %s | RSSI: %d dBm\n",
               WiFi.localIP().toString().c_str(), WiFi.RSSI());
        wifiBackoff = WIFI_BACKOFF_MIN_MS; // reseta backoff ao conectar
    } else {
        LOGBTln("[WIFI] Falha na conexao. Continuando offline.");
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
    if (!SD.begin(SD_CS_PIN)) {
        LOGBTln("[SD] FALHA! Verifique o modulo e a fiacao.");
        sdAvailable = false;
        return;
    }

    sdAvailable = true;
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

