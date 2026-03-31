#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include "config.h"

// ================================================================
//  VARIÁVEIS GLOBAIS
// ================================================================
static unsigned long lastPublish = 0;
static unsigned long seq         = 0;

// ================================================================
//  WIFI
// ================================================================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Conectando ao WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado — IP: " + WiFi.localIP().toString());
}

// ================================================================
//  NTP — timestamp ISO 8601 no fuso correto
//  Formato esperado pela API FastAPI: "2026-04-01T14:30:00"
// ================================================================
void setupTime() {
  // TZ_OFFSET_SEC = -10800 para Brasil (UTC-3)
  configTime(TZ_OFFSET_SEC, 0, "pool.ntp.org", "time.nist.gov");

  Serial.print("Sincronizando NTP");
  time_t now = 0;
  int tentativas = 0;
  while (now < 100000 && tentativas < 20) {
    delay(500);
    time(&now);
    Serial.print(".");
    tentativas++;
  }
  Serial.println(now > 100000 ? "\nNTP OK" : "\nNTP FALHOU — timestamps incorretos");
}

// Retorna timestamp local no formato aceito pela API: "YYYY-MM-DDTHH:MM:SS"
String getTimestamp() {
  time_t now;
  time(&now);
  if (now < 100000) return "";   // NTP ainda não sincronizou

  struct tm t;
  localtime_r(&now, &t);         // usa fuso local (TZ_OFFSET_SEC)

  char buf[20];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &t);
  return String(buf);
}

// ================================================================
//  LEITURA RMS — duas passagens para remoção de offset DC
// ================================================================
float readCurrentRMS() {
  const int samples  = (SAMPLE_RATE_HZ * WINDOW_MS) / 1000;
  const int delay_us = 1000000 / SAMPLE_RATE_HZ;

  // Passagem 1: calcula offset (valor médio = ponto central do sinal AC)
  uint64_t soma = 0;
  for (int i = 0; i < samples; i++) {
    soma += analogRead(ADC_PIN);
    delayMicroseconds(delay_us);
  }
  float offset = (float)soma / samples;

  // Passagem 2: calcula RMS removendo o offset
  double somaQuadrados = 0;
  for (int i = 0; i < samples; i++) {
    float val = (float)analogRead(ADC_PIN) - offset;
    somaQuadrados += (double)val * val;
    delayMicroseconds(delay_us);
  }

  float rmsCounts = sqrt(somaQuadrados / samples);
  float vrms_adc  = (rmsCounts / (float)((1 << ADC_BITS) - 1)) * ADC_VREF;
  float irms_sec  = vrms_adc / BURDEN_OHMS;
  float irms      = irms_sec * CT_RATIO * CALIBRATION_GAIN;

  // Descarta leituras de ruído abaixo de 0.3A
  return (irms < 0.3f) ? 0.0f : irms;
}

// ================================================================
//  ENVIO PARA A API — POST /medicoes
//
//  Payload esperado pela API (schema MedicaoCreate):
//  {
//    "timestamp": "2026-04-01T14:30:00",
//    "canal_id":  1,
//    "corrente":  18.5,
//    "tensao":    220.0,
//    "potencia":  4070.0,   <- opcional, API calcula se omitido
//    "valido":    true
//  }
// ================================================================
bool enviarMedicao(float corrente, float tensao, float potencia, const String& timestamp) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[HTTP] WiFi desconectado — pulando envio");
    return false;
  }

  if (timestamp.length() == 0) {
    Serial.println("[HTTP] Timestamp inválido — NTP não sincronizado");
    return false;
  }

  // Monta JSON
  StaticJsonDocument<256> doc;
  doc["timestamp"] = timestamp;
  doc["canal_id"]  = CANAL_ID;
  doc["corrente"]  = serialized(String(corrente, 3));
  doc["tensao"]    = serialized(String(tensao,   2));
  doc["potencia"]  = serialized(String(potencia, 2));
  doc["valido"]    = true;

  char payload[256];
  serializeJson(doc, payload);

  // Monta URL
  String url = String(API_USE_HTTPS ? "https" : "http") +
               "://" + API_HOST + API_ENDPOINT;

  HTTPClient http;

  if (API_USE_HTTPS) {
    // Sem verificação de certificado — adequado para protótipo/railway
    // Em produção, use WiFiClientSecure com o certificado raiz
    http.begin(url);
  } else {
    http.begin(url);
  }

  http.addHeader("Content-Type", "application/json");
  http.setTimeout(8000);   // 8s timeout

  int httpCode = http.POST(payload);

  if (httpCode == 201) {
    Serial.println("[HTTP] ✓ Medição enviada — " + timestamp +
                   " | I=" + String(corrente, 2) + "A" +
                   " | P=" + String(potencia,  1) + "W");
    http.end();
    return true;
  } else {
    String resp = http.getString();
    Serial.println("[HTTP] ✗ Erro " + String(httpCode) + " — " + resp);
    http.end();
    return false;
  }
}

// ================================================================
//  SETUP
// ================================================================
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println("\n=== EnergySafe ESP32 ===");
  Serial.println("Canal ID: " + String(CANAL_ID));

  analogReadResolution(ADC_PIN);
  analogSetPinAttenuation(ADC_PIN, ADC_11db);

  connectWiFi();
  setupTime();
}

// ================================================================
//  LOOP
// ================================================================
void loop() {
  // Reconecta WiFi se cair
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] Reconectando...");
    WiFi.reconnect();
    delay(3000);
    return;
  }

  unsigned long agora = millis();
  if (agora - lastPublish < PUBLISH_INTERVAL_MS) return;
  lastPublish = agora;

  seq++;

  // Leitura
  float corrente = readCurrentRMS();
  float tensao   = FIXED_VRMS;
  float potencia = corrente * tensao;   // W — P = I × V (fator de potência = 1)

  String timestamp = getTimestamp();

  // Log serial
  Serial.printf("[%lu] seq=%lu | I=%.3fA | V=%.1fV | P=%.1fW | ts=%s\n",
                agora, seq, corrente, tensao, potencia, timestamp.c_str());

  // Envia para a API
  enviarMedicao(corrente, tensao, potencia, timestamp);
}
