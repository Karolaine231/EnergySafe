#include <ArduinoJson.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include "EmonLib.h"

// --- CONFIGURAÇÕES DE REDE ---
const char* ssid     = "Giih";
const char* password = "luag1611";

// --- CONFIGURAÇÃO DA API ---
const char* serverUrlMedicoes = "https://backendsafe.onrender.com/medicoes/";

// --- CONFIGURAÇÃO DO HARDWARE ---
EnergyMonitor emon1;
const int pinoSensor = 13; // GPIO13

// --- VARIÁVEIS DE STATUS ---
int leiturasCiclo = 0;
int enviosSucesso = 0;
int enviosFalha   = 0;

void printSeparador() {
  Serial.println("==================================================");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  printSeparador();
  Serial.println("        ENERGYSAFE — INICIALIZANDO SISTEMA");
  printSeparador();

  // --- SENSOR ---
  Serial.printf("[SENSOR]  Pino: GPIO%d | Calibração: 111.1\n", pinoSensor);
  emon1.current(pinoSensor, 111.1);
  Serial.println("[SENSOR]  ✅ Inicializado.");

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
      Serial.println("[Wi-Fi]   ❌ Falha. Reiniciando ESP32...");
      delay(1000);
      ESP.restart();
    }
  }

  Serial.println("[Wi-Fi]   ✅ Conectado!");
  Serial.printf("[Wi-Fi]   IP: %s | RSSI: %d dBm\n",
    WiFi.localIP().toString().c_str(), WiFi.RSSI());

  printSeparador();
  Serial.printf("[API]     Endpoint: %s\n", serverUrlMedicoes);
  printSeparador();
  Serial.println("[SISTEMA] ✅ Pronto. Iniciando leituras...\n");
}

void loop() {
  leiturasCiclo++;
  printSeparador();
  Serial.printf("[CICLO #%d] Uptime: %lus\n", leiturasCiclo, millis() / 1000);

  // --- LEITURA ---
  Serial.println("[SENSOR]  Calculando corrente RMS...");
  double Irms = emon1.calcIrms(1480);

  if (Irms < 0.1) {
    Serial.printf("[SENSOR]  Leitura bruta: %.4f A → ruído, zerado.\n", Irms);
    Irms = 0.0;
  }

  double tensao   = 220.0;
  double potencia = Irms * tensao;

  Serial.printf("[SENSOR]  Corrente: %.3f A | Tensão: %.1f V | Potência: %.2f W\n",
    Irms, tensao, potencia);

  // --- ENVIO ---
  if (WiFi.status() == WL_CONNECTED) {

    // Monta JSON alinhado com os campos esperados pelo backend
    StaticJsonDocument<256> doc;
    doc["canal_id"] = 1;          // ID do canal/sensor cadastrado no backend
    doc["corrente"] = Irms;       // Amperes com 3 casas
    doc["tensao"]   = tensao;     // Volts
    doc["potencia"] = potencia;   // Watts
    doc["valido"]   = (Irms > 0); // false se leitura zerada por ruído

    String json;
    serializeJson(doc, json);

    Serial.printf("[API]     Payload: %s\n", json.c_str());

    HTTPClient http;
    http.begin(serverUrlMedicoes);
    http.addHeader("Content-Type", "application/json");

    int httpCode = http.POST(json);

    if (httpCode > 0) {
      enviosSucesso++;
      String resposta = http.getString();
      Serial.printf("[API]     ✅ HTTP %d | Resposta: %s\n", httpCode, resposta.c_str());

      // ⚠️  Alerta se o servidor retornou 2xx mas com erro no corpo
      if (httpCode == 422) {
        Serial.println("[API]     ⚠️  HTTP 422 — Payload rejeitado! Verifique os campos enviados.");
      }
    } else {
      enviosFalha++;
      Serial.printf("[API]     ❌ Erro de conexão: %d — Verifique a URL e o servidor.\n", httpCode);
    }

    http.end();

  } else {
    Serial.println("[Wi-Fi]   ❌ Desconectado. Reconectando...");
    WiFi.disconnect();
    WiFi.begin(ssid, password);
  }

  // --- STATS ---
  Serial.printf("[STATS]   Leituras: %d | Sucesso: %d | Falha: %d\n",
    leiturasCiclo, enviosSucesso, enviosFalha);
  Serial.println("[SISTEMA] Aguardando 5s...\n");

  delay(5000);
}
