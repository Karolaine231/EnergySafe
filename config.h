#pragma once

// ================= WIFI =================
#define WIFI_SSID       "SEU_WIFI"
#define WIFI_PASSWORD   "SUA_SENHA"

// ================= API =================
// Troque pela URL real quando publicar
#define API_HOST        "SUA-API.up.railway.app"
#define API_PORT        443                        // 443 = HTTPS, 80 = HTTP
#define API_USE_HTTPS   true
#define API_ENDPOINT    "/medicoes"

// ================= IDENTIFICAÇÃO =================
// canal_id deve corresponder ao ID cadastrado na tabela canais_medicao do banco
// Cada ESP32/canal físico tem seu próprio canal_id
#define CANAL_ID        1

// ================= TEMPO =================
#define PUBLISH_INTERVAL_MS  30000   // 30s — suficiente para rateio, reduz carga no banco

// Fuso horário: Brasil (UTC-3) = -3 * 3600 = -10800
#define TZ_OFFSET_SEC   -10800

// ================= ADC =================
#define ADC_PIN         34
#define ADC_BITS        12
#define ADC_VREF        3.3f

#define SAMPLE_RATE_HZ  2000
#define WINDOW_MS       1000

// ================= TC CLAMP =================
// SCT-013-000 => 100A : 50mA  => ratio = 2000
#define CT_RATIO        2000.0f
#define BURDEN_OHMS     33.0f
#define CALIBRATION_GAIN 1.0f

// ================= ELÉTRICA =================
// Tensão fixada em 220V RMS (monofásico padrão Brasil)
// Substitua por leitura real se tiver sensor de tensão
#define FIXED_VRMS      220.0f
