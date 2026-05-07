#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <time.h>
#include "EmonLib.h"

// --- CONFIGURAÇÕES DE REDE ---
const char* ssid     = "Giih";
const char* password = "luag1611";

// --- CONFIGURAÇÃO DA API ---
const char* serverUrlMedicoes = "https://backendsafe.onrender.com/medicoes/";

// --- PINOS DOS SENSORES ---
// Corrente (SCT-013)
const int pinoCorrenteA = 34;
const int pinoCorrenteB = 35;
const int pinoCorrenteC = 32;

// Tensão (ZMPT101B)
const int pinoTensaoA = 33;
const int pinoTensaoB = 25;
const int pinoTensaoC = 26;

// --- CALIBRAÇÃO ---
// Ajuste o fator de corrente conforme seu SCT-013 (ex: SCT-013-030 = 30A → ~111.1)
const double calCorrente = 111.1;
// Ajuste o fator de tensão conforme sua rede e divisor do ZMPT101B
const double calTensao   = 234.26;

// --- SENSORES ---
EnergyMonitor faseA, faseB, faseC;

// --- VARIÁVEIS DE STATUS ---
int leiturasCiclo = 0;
int enviosSucesso = 0;
int enviosFalha   = 0;

// --- IDs dos canais no backend (conforme cadastro) ---
const int canalIdA = 1;
const int canalIdB = 2;
const int canalIdC = 3;

// -------------------------------------------------------
void printSeparador() {
  Serial.println("==================================================");
}

String getTimestamp() {
  struct tm ti;
  if (!getLocalTime(&ti)) {
    Serial.println("[NTP]     ⚠️  Falha ao obter horário, usando fallback.");
    return "1970-01-01T00:00:00Z";
  }
  char buf[30];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
  return String(buf);
}

// Envia uma medição para a API
void enviarMedicao(int canalId, double corrente, double tensao, double potencia, String timestamp) {
  StaticJsonDocument<300> doc;
  doc["canal_id"]  = canalId;
  doc["corrente"]  = corrente;
  doc["tensao"]    = tensao;
  doc["potencia"]  = potencia;
  doc["valido"]    = (corrente > 0);
  doc["timestamp"] = timestamp;

  String json;
  serializeJson(doc, json);
  Serial.printf("[API]     Canal %d | Payload: %s\n", canalId, json.c_str());

  WiFiClientSecure client;  // necessário para HTTPS
  client.setInsecure();

  HTTPClient http;
  http.begin(serverUrlMedicoes);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
  http.addHeader("Content-Type", "application/json");

  int httpCode = http.POST(json);

  if (httpCode > 0) {
    String resposta = http.getString();
    Serial.printf("[API]     Canal %d | HTTP %d | Resposta: %s\n", canalId, httpCode, resposta.c_str());
    if (httpCode == 422) {
      enviosFalha++;
      Serial.printf("[API]     ⚠️  Canal %d — HTTP 422, payload rejeitado!\n", canalId);
    } else {
      enviosSucesso++;
      Serial.printf("[API]     ✅ Canal %d — Enviado com sucesso!\n", canalId);
    }
  } else {
    enviosFalha++;
    Serial.printf("[API]     ❌ Canal %d — Erro de conexão: %d\n", canalId, httpCode);
  }

  http.end();
  delay(200); // pequena pausa entre requisições
}

// -------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);

  printSeparador();
  Serial.println("        ENERGYSAFE — INICIALIZANDO SISTEMA");
  printSeparador();

  // --- SENSORES ---
  Serial.println("[SENSOR]  Inicializando sensores de corrente e tensão...");

  faseA.current(pinoCorrenteA, calCorrente);
  faseA.voltage(pinoTensaoA, calTensao, 1.7); // último parâmetro = defasagem de fase

  faseB.current(pinoCorrenteB, calCorrente);
  faseB.voltage(pinoTensaoB, calTensao, 1.7);

  faseC.current(pinoCorrenteC, calCorrente);
  faseC.voltage(pinoTensaoC, calTensao, 1.7);

  Serial.println("[SENSOR]  ✅ Fase A — Corrente: GPIO34 | Tensão: GPIO33");
  Serial.println("[SENSOR]  ✅ Fase B — Corrente: GPIO35 | Tensão: GPIO25");
  Serial.println("[SENSOR]  ✅ Fase C — Corrente: GPIO32 | Tensão: GPIO26");
  printSeparador();

  // --- WI-FI ---
  Serial.printf("[Wi-Fi]   Conectando a: %s\n", ssid);
  WiFi.begin(ssid, password);

  int tentativas = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    tentativas++;
    Serial.printf("[Wi-Fi]   Tentativa %d/20...\n", tentativas);
    if (tentativas >= 20) {
      Serial.println("[Wi-Fi]   ❌ Falha. Reiniciando...");
      delay(1000);
      ESP.restart();
    }
  }

  Serial.println("[Wi-Fi]   ✅ Conectado!");
  Serial.printf("[Wi-Fi]   IP: %s | RSSI: %d dBm\n",
    WiFi.localIP().toString().c_str(), WiFi.RSSI());
  printSeparador();

  // --- NTP ---
  Serial.println("[NTP]     Sincronizando horário...");
  configTime(-3 * 3600, 0, "pool.ntp.org", "time.google.com");

  struct tm ti;
  int ntpTentativas = 0;
  while (!getLocalTime(&ti) && ntpTentativas < 10) {
    delay(500);
    ntpTentativas++;
    Serial.printf("[NTP]     Aguardando... tentativa %d/10\n", ntpTentativas);
  }

  if (getLocalTime(&ti)) {
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &ti);
    Serial.printf("[NTP]     ✅ Horário sincronizado: %s\n", buf);
  } else {
    Serial.println("[NTP]     ⚠️  Falha no NTP. Timestamp será fallback.");
  }

  printSeparador();
  Serial.printf("[API]     Endpoint: %s\n", serverUrlMedicoes);
  printSeparador();
  Serial.println("[SISTEMA] ✅ Pronto. Iniciando leituras...\n");
}

// -------------------------------------------------------
void loop() {
  leiturasCiclo++;
  printSeparador();
  Serial.printf("[CICLO #%d] Uptime: %lus\n", leiturasCiclo, millis() / 1000);

  // --- LEITURA DAS 3 FASES ---
  // calcVI(amostras, tempo_cross_ms) — lê corrente E tensão simultaneamente
  Serial.println("[SENSOR]  Calculando Fase A...");
  faseA.calcVI(1480, 2000);
  double IrmsA = (faseA.Irms   < 0.1) ? 0.0 : faseA.Irms;
  double VrmsA = (faseA.Vrms   < 5.0) ? 0.0 : faseA.Vrms;
  double PotA  = IrmsA * VrmsA;
  Serial.printf("[SENSOR]  Fase A → I: %.3f A | V: %.1f V | P: %.2f W\n", IrmsA, VrmsA, PotA);

  Serial.println("[SENSOR]  Calculando Fase B...");
  faseB.calcVI(1480, 2000);
  double IrmsB = (faseB.Irms   < 0.1) ? 0.0 : faseB.Irms;
  double VrmsB = (faseB.Vrms   < 5.0) ? 0.0 : faseB.Vrms;
  double PotB  = IrmsB * VrmsB;
  Serial.printf("[SENSOR]  Fase B → I: %.3f A | V: %.1f V | P: %.2f W\n", IrmsB, VrmsB, PotB);

  Serial.println("[SENSOR]  Calculando Fase C...");
  faseC.calcVI(1480, 2000);
  double IrmsC = (faseC.Irms   < 0.1) ? 0.0 : faseC.Irms;
  double VrmsC = (faseC.Vrms   < 5.0) ? 0.0 : faseC.Vrms;
  double PotC  = IrmsC * VrmsC;
  Serial.printf("[SENSOR]  Fase C → I: %.3f A | V: %.1f V | P: %.2f W\n", IrmsC, VrmsC, PotC);

  // --- TOTAL ---
  Serial.printf("[SENSOR]  Total → P: %.2f W\n", PotA + PotB + PotC);

  // --- ENVIO ---
  if (WiFi.status() == WL_CONNECTED) {
    String ts = getTimestamp();
    Serial.printf("[NTP]     Timestamp: %s\n", ts.c_str());
    Serial.println("[API]     Enviando 3 fases...");

    enviarMedicao(canalIdA, IrmsA, VrmsA, PotA, ts);
    enviarMedicao(canalIdB, IrmsB, VrmsB, PotB, ts);
    enviarMedicao(canalIdC, IrmsC, VrmsC, PotC, ts);

  } else {
    Serial.println("[Wi-Fi]   ❌ Desconectado. Reconectando...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
  }

  // --- STATS ---
  Serial.printf("[STATS]   Ciclos: %d | Envios OK: %d | Falhas: %d\n",
    leiturasCiclo, enviosSucesso, enviosFalha);
  Serial.println("[SISTEMA] Aguardando 60s...\n");

  delay(60000);
}
