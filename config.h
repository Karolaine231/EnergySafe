#pragma once

// ================= WIFI =================
#define WIFI_SSID       "SEU_WIFI"
#define WIFI_PASSWORD   "SUA_SENHA"

// ================= MQTT =================
#define MQTT_HOST       "192.168.0.10"   // IP do PC com Mosquitto
#define MQTT_PORT       1883

#define DEVICE_ID       "esp32-qd01-c1"
#define MQTT_TOPIC      "energysafe/medicao"

// ================= TEMPO =================
#define PUBLISH_INTERVAL_MS 5000

// ================= ADC =================
#define ADC_PIN         34
#define ADC_BITS        12
#define ADC_VREF        3.3f

#define SAMPLE_RATE_HZ  2000
#define WINDOW_MS       1000

// ================= TC CLAMP =================
// SCT-013-000 => 100A : 50mA  => ratio = 2000
#define CT_RATIO        2000.0f

// Resistor burden (ajuste conforme circuito)
#define BURDEN_OHMS     33.0f

// Ajuste fino de calibração
#define CALIBRATION_GAIN 1.0f

// ================= ELÉTRICA =================
#define FIXED_VRMS      220.0f