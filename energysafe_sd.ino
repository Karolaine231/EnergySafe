/*
 * ============================================================
 *  EnergySafe — Firmware Tolerante a Falhas v3.0
 *  3 Fases | SCT-013 + ZMPT101B | NTP | HTTPS | SD Buffer
 * ============================================================
 *
 *  ARQUITETURA:
 *  - 3 canais de corrente: GPIO34, GPIO35, GPIO32
 *  - 3 canais de tensão:   GPIO33, GPIO25, GPIO26
 *  - NTP para timestamp real (fuso -3h Brasília)
 *  - HTTPS com WiFiClientSecure
 *  - SD buffer para falhas de internet/energia
 *
 *  FLUXO DO LOOP:
 *  ┌──────────────────┐
 *  │  Lê 3 fases      │ (calcVI — corrente + tensão reais)
 *  └────────┬─────────┘
 *           │
 *  ┌────────▼─────────┐     ┌─────────────────────┐
 *  │  Wi-Fi ok?       │ Não │  Salva no SD         │
 *  │  Envia HTTP POST │────▶│  (pending.csv)       │
 *  └────────┬─────────┘     └─────────────────────┘
 *           │ Sim
 *  ┌────────▼─────────┐
 *  │  API respondeu?  │ Não → Salva no SD também
 *  └────────┬─────────┘
 *           │ Sim
 *  ┌────────▼─────────┐
 *  │  Reenvio SD      │ (a cada RETRY_INTERVAL_MS)
 *  └──────────────────┘
 *
 *  FORMATO SD (pending.csv):
 *  canal_id,corrente,tensao,potencia,valido,timestamp
 * ============================================================
 */

#include <ArduinoJson.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <SD.h>
#include <SPI.h>
#include <time.h>
#include "EmonLib.h"

// ═══════════════════════════════════════════════════════════
//  CONFIGURAÇÕES — edite apenas este bloco
// ═══════════════════════════════════════════════════════════

// ─── Wi-Fi ─────────────────────────────────────────────────
const char* WIFI_SSID     = "Iphone de Isabelle";
const char* WIFI_PASSWORD = "isa150905";

// ─── API ───────────────────────────────────────────────────
const char* API_URL = "https://backendsafe.onrender.com/medicoes/";

// ─── IDs dos canais no backend ─────────────────────────────
const int CANAL_A = 1;
const int CANAL_B = 2;
const int CANAL_C = 3;

// ─── Pinos dos sensores ────────────────────────────────────
const int PINO_CORRENTE_A = 34;
const int PINO_CORRENTE_B = 35;
const int PINO_CORRENTE_C = 32;
const int PINO_TENSAO_A   = 33;
const int PINO_TENSAO_B   = 25;
const int PINO_TENSAO_C   = 26;

// ─── Calibração ────────────────────────────────────────────
const double CAL_CORRENTE = 111.1;   // SCT-013-030 → 111.1
const double CAL_TENSAO   = 234.26;  // ZMPT101B — ajuste conforme sua rede
const double DEFASAGEM    = 1.7;     // phase_shift do EmonLib

// ─── SD Card ───────────────────────────────────────────────
#define SD_CS_PIN 5  // MOSI=23, MISO=19, SCK=18, CS=5

// ─── Intervalos ────────────────────────────────────────────
#define COLLECT_INTERVAL_MS  60000UL  // leitura a cada 60s (igual ao original)
#define RETRY_INTERVAL_MS   120000UL  // reenvio SD a cada 2min
#define WIFI_CHECK_MS        15000UL  // verificação Wi-Fi a cada 15s

// ─── Limite de segurança no SD ─────────────────────────────
#define MAX_PENDING_LINES 3000  // ~3 canais x 1000 leituras

// ═══════════════════════════════════════════════════════════
//  Arquivos SD
// ═══════════════════════════════════════════════════════════
#define PENDING_FILE "/pending.csv"
#define TEMP_FILE    "/pend_tmp.csv"

// ═══════════════════════════════════════════════════════════
//  Objetos globais
// ═══════════════════════════════════════════════════════════
EnergyMonitor faseA, faseB, faseC;

unsigned long lastCollect   = 0;
unsigned long lastRetry     = 0;
unsigned long lastWifiCheck = 0;

bool sdAvailable = false;

int leiturasCiclo = 0;
int enviosSucesso = 0;
int enviosFalha   = 0;
int gravadosSD    = 0;

// ═══════════════════════════════════════════════════════════
//  Estrutura de medição por fase
// ═══════════════════════════════════════════════════════════
struct Medicao {
  int    canal_id;
  double corrente;
  double tensao;
  double potencia;
  bool   valido;
  String timestamp;
};

// ═══════════════════════════════════════════════════════════
//  Protótipos
// ═══════════════════════════════════════════════════════════
String    getTimestamp();
bool      enviarMedicao(const Medicao& m);
void      salvarSD(const Medicao& m);
void      reenviarPendentes();
String    medicaoParaCSV(const Medicao& m);
Medicao   csvParaMedicao(const String& linha);
String    medicaoParaJSON(const Medicao& m);
int       contarLinhasSD();
bool      sdTruncateFirstLine();
void      iniciarWifi();
void      verificarWifi();
void      initSD();
void      initNTP();
void      printSeparador();

// ═══════════════════════════════════════════════════════════
//  SETUP
// ═══════════════════════════════════════════════════════════
void setup() {
  Serial.begin(115200);
  delay(1000);

  printSeparador();
  Serial.println("  ENERGYSAFE — FIRMWARE TOLERANTE A FALHAS v3.0");
  printSeparador();

  // Sensores de corrente + tensão (3 fases)
  Serial.println("[SENSOR] Inicializando sensores...");
  faseA.current(PINO_CORRENTE_A, CAL_CORRENTE);
  faseA.voltage(PINO_TENSAO_A, CAL_TENSAO, DEFASAGEM);
  faseB.current(PINO_CORRENTE_B, CAL_CORRENTE);
  faseB.voltage(PINO_TENSAO_B, CAL_TENSAO, DEFASAGEM);
  faseC.current(PINO_CORRENTE_C, CAL_CORRENTE);
  faseC.voltage(PINO_TENSAO_C, CAL_TENSAO, DEFASAGEM);
  Serial.println("[SENSOR] Fase A: Corrente GPIO34 | Tensao GPIO33");
  Serial.println("[SENSOR] Fase B: Corrente GPIO35 | Tensao GPIO25");
  Serial.println("[SENSOR] Fase C: Corrente GPIO32 | Tensao GPIO26");

  // SD
  initSD();

  // Wi-Fi
  iniciarWifi();

  // NTP (só após Wi-Fi)
  if (WiFi.status() == WL_CONNECTED) {
    initNTP();
  }

  printSeparador();
  Serial.println("[SISTEMA] Pronto. Iniciando leituras...");
  printSeparador();
}

// ═══════════════════════════════════════════════════════════
//  LOOP — não-bloqueante
// ═══════════════════════════════════════════════════════════
void loop() {
  unsigned long now = millis();

  // ── 1. Monitorar Wi-Fi ──────────────────────────────────
  if (now - lastWifiCheck >= WIFI_CHECK_MS) {
    lastWifiCheck = now;
    verificarWifi();
  }

  // ── 2. Coleta e envio das 3 fases ───────────────────────
  if (now - lastCollect >= COLLECT_INTERVAL_MS) {
    lastCollect = now;
    leiturasCiclo++;

    printSeparador();
    Serial.printf("[CICLO #%d] Uptime: %lus\n", leiturasCiclo, millis() / 1000);

    // Leitura das 3 fases
    Serial.println("[SENSOR] Calculando Fase A...");
    faseA.calcVI(1480, 2000);
    Medicao mA;
    mA.canal_id  = CANAL_A;
    mA.corrente  = (faseA.Irms < 0.1) ? 0.0 : faseA.Irms;
    mA.tensao    = (faseA.Vrms < 5.0) ? 0.0 : faseA.Vrms;
    mA.potencia  = mA.corrente * mA.tensao;
    mA.valido    = (mA.corrente > 0);
    mA.timestamp = getTimestamp();
    Serial.printf("[SENSOR] Fase A -> I: %.3fA | V: %.1fV | P: %.2fW\n",
                  mA.corrente, mA.tensao, mA.potencia);

    Serial.println("[SENSOR] Calculando Fase B...");
    faseB.calcVI(1480, 2000);
    Medicao mB;
    mB.canal_id  = CANAL_B;
    mB.corrente  = (faseB.Irms < 0.1) ? 0.0 : faseB.Irms;
    mB.tensao    = (faseB.Vrms < 5.0) ? 0.0 : faseB.Vrms;
    mB.potencia  = mB.corrente * mB.tensao;
    mB.valido    = (mB.corrente > 0);
    mB.timestamp = mA.timestamp; // mesmo ciclo
    Serial.printf("[SENSOR] Fase B -> I: %.3fA | V: %.1fV | P: %.2fW\n",
                  mB.corrente, mB.tensao, mB.potencia);

    Serial.println("[SENSOR] Calculando Fase C...");
    faseC.calcVI(1480, 2000);
    Medicao mC;
    mC.canal_id  = CANAL_C;
    mC.corrente  = (faseC.Irms < 0.1) ? 0.0 : faseC.Irms;
    mC.tensao    = (faseC.Vrms < 5.0) ? 0.0 : faseC.Vrms;
    mC.potencia  = mC.corrente * mC.tensao;
    mC.valido    = (mC.corrente > 0);
    mC.timestamp = mA.timestamp;
    Serial.printf("[SENSOR] Fase C -> I: %.3fA | V: %.1fV | P: %.2fW\n",
                  mC.corrente, mC.tensao, mC.potencia);

    Serial.printf("[SENSOR] Total -> P: %.2fW\n",
                  mA.potencia + mB.potencia + mC.potencia);
    Serial.printf("[NTP] Timestamp: %s\n", mA.timestamp.c_str());

    // Envio ou SD
    if (WiFi.status() == WL_CONNECTED) {
      Serial.println("[API] Enviando 3 fases...");
      processarMedicao(mA);
      processarMedicao(mB);
      processarMedicao(mC);
    } else {
      Serial.println("[WIFI] Sem conexao. Salvando 3 fases no SD...");
      salvarSD(mA);
      salvarSD(mB);
      salvarSD(mC);
    }

    // Stats
    Serial.printf("[STATS] Ciclos: %d | OK: %d | Falhas: %d | No SD: %d\n",
                  leiturasCiclo, enviosSucesso, enviosFalha, gravadosSD);
  }

  // ── 3. Reenvio de pendências do SD ──────────────────────
  if (now - lastRetry >= RETRY_INTERVAL_MS) {
    lastRetry = now;
    if (sdAvailable && WiFi.status() == WL_CONNECTED) {
      reenviarPendentes();
    }
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
//  ENVIO HTTP (HTTPS)
// ═══════════════════════════════════════════════════════════
bool enviarMedicao(const Medicao& m) {
  WiFiClientSecure client;
  client.setInsecure(); // aceita qualquer certificado (igual ao original)

  HTTPClient http;
  http.begin(client, API_URL);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(10000);

  String json = medicaoParaJSON(m);
  Serial.printf("[API] Canal %d | Payload: %s\n", m.canal_id, json.c_str());

  int code = http.POST(json);

  if (code > 0) {
    String resposta = http.getString();
    Serial.printf("[API] Canal %d | HTTP %d | Resposta: %s\n",
                  m.canal_id, code, resposta.c_str());
    http.end();
    if (code >= 200 && code < 300) {
      Serial.printf("[API] Canal %d — Enviado com sucesso!\n", m.canal_id);
      return true;
    }
    Serial.printf("[API] Canal %d — Rejeitado (HTTP %d)\n", m.canal_id, code);
    return false;
  }

  Serial.printf("[API] Canal %d — Erro de conexao: %d\n", m.canal_id, code);
  http.end();
  return false;
}

// ═══════════════════════════════════════════════════════════
//  SALVAR NO SD
// ═══════════════════════════════════════════════════════════
void salvarSD(const Medicao& m) {
  if (!sdAvailable) {
    Serial.println("[SD] Modulo SD indisponivel — dado PERDIDO.");
    return;
  }

  int linhas = contarLinhasSD();
  if (linhas >= MAX_PENDING_LINES) {
    Serial.println("[SD] Buffer cheio. Descartando linha mais antiga...");
    sdTruncateFirstLine();
  }

  File f = SD.open(PENDING_FILE, FILE_APPEND);
  if (!f) {
    Serial.println("[SD] ERRO: nao abriu pending.csv para escrita.");
    return;
  }

  String linha = medicaoParaCSV(m);
  f.println(linha);
  f.close(); // flush garantido

  gravadosSD++;
  Serial.printf("[SD] Gravado canal %d: %s\n", m.canal_id, linha.c_str());
}

// ═══════════════════════════════════════════════════════════
//  REENVIO DE PENDÊNCIAS DO SD
// ═══════════════════════════════════════════════════════════
void reenviarPendentes() {
  if (!SD.exists(PENDING_FILE)) return;

  File src = SD.open(PENDING_FILE, FILE_READ);
  if (!src) {
    Serial.println("[SD] ERRO: nao abriu pending.csv para leitura.");
    return;
  }

  File tmp = SD.open(TEMP_FILE, FILE_WRITE);
  if (!tmp) {
    src.close();
    Serial.println("[SD] ERRO: nao criou arquivo temp.");
    return;
  }

  Serial.println("[SD] Iniciando reenvio de pendencias...");
  int enviados = 0;
  int falhas   = 0;

  while (src.available()) {
    String linha = src.readStringUntil('\n');
    linha.trim();
    if (linha.length() == 0) continue;

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("[SD] Wi-Fi caiu durante reenvio. Abortando.");
      tmp.println(linha);
      // Copia o restante sem tentar enviar
      while (src.available()) {
        String resto = src.readStringUntil('\n');
        resto.trim();
        if (resto.length() > 0) tmp.println(resto);
      }
      break;
    }

    Medicao m = csvParaMedicao(linha);
    if (enviarMedicao(m)) {
      enviados++;
      gravadosSD = max(0, gravadosSD - 1);
    } else {
      falhas++;
      tmp.println(linha);
    }

    delay(300); // pausa entre envios para não sobrecarregar a API
  }

  src.close();
  tmp.close();

  SD.remove(PENDING_FILE);
  SD.rename(TEMP_FILE, PENDING_FILE);

  Serial.printf("[SD] Reenvio concluido. Enviados: %d | Pendentes: %d\n",
                enviados, falhas);
}

// ═══════════════════════════════════════════════════════════
//  SERIALIZAÇÃO
// ═══════════════════════════════════════════════════════════

// JSON para a API — formato exato do backend
String medicaoParaJSON(const Medicao& m) {
  StaticJsonDocument<300> doc;
  doc["canal_id"]  = m.canal_id;
  doc["corrente"]  = m.corrente;
  doc["tensao"]    = m.tensao;
  doc["potencia"]  = m.potencia;
  doc["valido"]    = m.valido;
  doc["timestamp"] = m.timestamp;
  String json;
  serializeJson(doc, json);
  return json;
}

// CSV para o SD: canal_id,corrente,tensao,potencia,valido,timestamp
String medicaoParaCSV(const Medicao& m) {
  String s = "";
  s += String(m.canal_id);   s += ",";
  s += String(m.corrente, 4); s += ",";
  s += String(m.tensao, 2);   s += ",";
  s += String(m.potencia, 4); s += ",";
  s += (m.valido ? "1" : "0"); s += ",";
  s += m.timestamp;
  return s;
}

// Reconstrói Medicao a partir de linha CSV
Medicao csvParaMedicao(const String& linha) {
  Medicao m;
  int campo = 0;
  String token = "";

  for (int i = 0; i <= (int)linha.length(); i++) {
    char c = (i < (int)linha.length()) ? linha[i] : ',';
    if (c == ',' && campo < 5) {
      switch (campo) {
        case 0: m.canal_id  = token.toInt(); break;
        case 1: m.corrente  = token.toDouble(); break;
        case 2: m.tensao    = token.toDouble(); break;
        case 3: m.potencia  = token.toDouble(); break;
        case 4: m.valido    = (token == "1"); break;
      }
      campo++;
      token = "";
    } else {
      token += c;
    }
  }
  // Campo 5 = timestamp (pode conter nada após a última vírgula)
  if (campo == 5) m.timestamp = token;
  return m;
}

// ═══════════════════════════════════════════════════════════
//  NTP — timestamp real (fuso Brasília GMT-3)
// ═══════════════════════════════════════════════════════════
void initNTP() {
  Serial.println("[NTP] Sincronizando horario...");
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.google.com");

  struct tm ti;
  int tentativas = 0;
  while (!getLocalTime(&ti) && tentativas < 10) {
    delay(500);
    tentativas++;
    Serial.printf("[NTP] Aguardando... tentativa %d/10\n", tentativas);
  }

  if (getLocalTime(&ti)) {
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    Serial.printf("[NTP] Horario sincronizado: %s\n", buf);
  } else {
    Serial.println("[NTP] AVISO: falha no NTP. Timestamps serao fallback.");
  }
}

String getTimestamp() {
  struct tm ti;
  if (!getLocalTime(&ti)) {
    // Fallback: hora relativa ao boot
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
//  WI-FI
// ═══════════════════════════════════════════════════════════
void iniciarWifi() {
  Serial.printf("[WIFI] Conectando a: %s\n", WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED && tentativas < 20) {
    delay(500);
    tentativas++;
    Serial.printf("[WIFI] Tentativa %d/20...\n", tentativas);
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] Conectado! IP: %s | RSSI: %d dBm\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println("[WIFI] Falha na conexao. Continuando offline.");
  }
}

void verificarWifi() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Desconectado. Reconectando...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  }
}

// ═══════════════════════════════════════════════════════════
//  SD
// ═══════════════════════════════════════════════════════════
void initSD() {
  Serial.print("[SD] Inicializando...");
  if (!SD.begin(SD_CS_PIN)) {
    Serial.println(" FALHA! Verifique o modulo e a fiacao.");
    sdAvailable = false;
    return;
  }
  sdAvailable = true;
  Serial.println(" OK.");

  uint64_t cardSize = SD.cardSize() / (1024 * 1024);
  Serial.printf("[SD] Capacidade: %lluMB\n", cardSize);

  int pendentes = contarLinhasSD();
  if (pendentes > 0) {
    Serial.printf("[SD] ATENCAO: %d medicoes pendentes de reenvio.\n", pendentes);
    gravadosSD = pendentes;
  } else {
    Serial.println("[SD] Nenhuma pendencia encontrada.");
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
  src.readStringUntil('\n'); // descarta a primeira
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
  Serial.println("==================================================");
}
