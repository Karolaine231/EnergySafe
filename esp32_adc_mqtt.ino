#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include "config.h"

// ================= MQTT =================
WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ================= VARIÁVEIS =================
static unsigned long lastPublish = 0;
static float energia_kwh = 0.0;
static unsigned long seq = 0;

// ================= WIFI =================
void connectWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  Serial.print("Conectando ao WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado");
}

// ================= MQTT =================
void reconnectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Conectando ao MQTT...");
    if (mqttClient.connect(DEVICE_ID)) {
      Serial.println("conectado");
    } else {
      Serial.print("falhou, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" tentando novamente em 2s");
      delay(2000);
    }
  }
}

// ================= TEMPO (NTP) =================
void setupTime() {
  configTime(0, 0, "pool.ntp.org", "time.nist.gov");
}

String getTimestamp() {
  time_t now;
  time(&now);
  if (now < 100000) return "";
  struct tm t;
  gmtime_r(&now, &t);
  char buf[25];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &t);
  return String(buf);
}

// ================= LEITURA RMS =================
float readCurrentRMS() {
  const int samples = (SAMPLE_RATE_HZ * WINDOW_MS) / 1000;
  const int delay_us = 1000000 / SAMPLE_RATE_HZ;

  uint64_t soma = 0;
  for (int i = 0; i < samples; i++) {
    soma += analogRead(ADC_PIN);
    delayMicroseconds(delay_us);
  }
  float offset = (float)soma / samples;

  double somaQuadrados = 0;
  for (int i = 0; i < samples; i++) {
    float val = analogRead(ADC_PIN) - offset;
    somaQuadrados += val * val;
    delayMicroseconds(delay_us);
  }

  float rmsCounts = sqrt(somaQuadrados / samples);
  float vrms_adc = (rmsCounts / ((1 << ADC_BITS) - 1)) * ADC_VREF;
  float irms_sec = vrms_adc / BURDEN_OHMS;
  float irms = irms_sec * CT_RATIO * CALIBRATION_GAIN;

  return irms;
}

// ================= SETUP =================
void setup() {
  Serial.begin(115200);

  analogReadResolution(ADC_BITS);
  analogSetPinAttenuation(ADC_PIN, ADC_11db);

  connectWiFi();

  mqttClient.setServer(MQTT_HOST, MQTT_PORT);

  setupTime();
}

// ================= LOOP =================
void loop() {
  if (!mqttClient.connected()) {
    reconnectMQTT();
  }
  mqttClient.loop();

  unsigned long now = millis();
  if (now - lastPublish < PUBLISH_INTERVAL_MS) return;
  lastPublish = now;

  float corrente = readCurrentRMS();
  float tensao = FIXED_VRMS;
  float potencia = corrente * tensao;

  float delta_h = (PUBLISH_INTERVAL_MS / 1000.0) / 3600.0;
  energia_kwh += (potencia * delta_h) / 1000.0;

  StaticJsonDocument<256> doc;
  doc["seq"] = ++seq;
  doc["device_id"] = DEVICE_ID;
  doc["corrente_irms"] = corrente;
  doc["tensao_vrms"] = tensao;
  doc["potencia_w"] = potencia;
  doc["energia_kwh"] = energia_kwh;

  String ts = getTimestamp();
  if (ts.length() > 0) doc["timestamp"] = ts;

  char payload[256];
  serializeJson(doc, payload);

  String topic = String(MQTT_TOPIC) + "/" + DEVICE_ID;
  mqttClient.publish(topic.c_str(), payload);

  Serial.println(payload);
}