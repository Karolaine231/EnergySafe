/*
============================================================
EnergySafe — Teste de envio para a API / banco
============================================================
O que faz:
  1. Conecta no Wi-Fi e sincroniza o relógio (Brasília, UTC-3)
  2. GET  <API_BASE>/canais/      → mostra os canais cadastrados
  3. POST <API_BASE>/medicoes/    → envia uma medição de teste por canal
  4. GET  <API_BASE>/medicoes/ultimo/{id} → confirma que gravou
  5. Repete o passo 3–4 a cada INTERVALO_MS

Imprime o status HTTP e o CORPO da resposta, para ver a mensagem
de erro do servidor (422 = payload/campo errado, 404 = rota ou
canal inexistente, 500 = erro no backend/banco).

Não usa sensores: os valores são fixos (TENSAO/CORRENTE abaixo).
ATENÇÃO: as medições entram no banco como reais. Use canais de
teste ou apague depois. Para não gerar consumo/alertas, mude
VALIDO para false.
============================================================
*/

#include <WiFi.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <time.h>

// ─── CONFIGURE AQUI ────────────────────────────────────────
const char* WIFI_SSID     = "fmabc-devices";
const char* WIFI_PASSWORD = "@Jama!c@#26";

// Endereço BASE da API, sem barra no final.
// Exemplos: "http://192.168.0.50:8000"  ou  "https://api.seudominio.com"
const char* API_BASE = "https://energysafe.eco.br/api";

const int   CANAIS[]   = {1, 2, 3};      // IDs que devem existir em /canais/
const int   NUM_CANAIS = sizeof(CANAIS) / sizeof(CANAIS[0]);

const float TENSAO   = 127.0f;           // V
const float CORRENTE = 1.000f;           // A  (constante: evita alerta queda_brusca)
const bool  VALIDO   = true;

const unsigned long INTERVALO_MS = 30000; // reenvio a cada 30 s
// ───────────────────────────────────────────────────────────

String timestampUTC() {
    struct tm ti;
    if (!getLocalTime(&ti, 2000)) return "1970-01-01T00:00:00";
    char buf[30];
    strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%S", &ti);
    return String(buf);
}

// Faz uma requisição e imprime status + corpo. Retorna o código HTTP.
int requisicao(const char* metodo, const String& url, const String& corpo = "") {
    bool https = url.startsWith("https://");
    WiFiClient       clientHttp;
    WiFiClientSecure clientHttps;
    HTTPClient http;

    if (https) {
        clientHttps.setInsecure();          // só para teste
        clientHttps.setHandshakeTimeout(10);
        http.begin(clientHttps, url);
    } else {
        http.begin(clientHttp, url);
    }
    http.setConnectTimeout(5000);
    http.setTimeout(10000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);

    Serial.printf("\n>>> %s %s\n", metodo, url.c_str());
    if (corpo.length()) Serial.printf("    corpo: %s\n", corpo.c_str());

    unsigned long t0 = millis();
    int code;
    if (strcmp(metodo, "POST") == 0) {
        http.addHeader("Content-Type", "application/json");
        code = http.POST(corpo);
    } else {
        code = http.GET();
    }
    unsigned long dt = millis() - t0;

    if (code > 0) {
        String resp = http.getString();
        Serial.printf("<<< HTTP %d (%lu ms)\n", code, dt);
        if (resp.length() > 600) resp = resp.substring(0, 600) + "...";
        Serial.printf("    resposta: %s\n", resp.c_str());
    } else {
        Serial.printf("<<< ERRO de conexao %d: %s (%lu ms)\n",
                      code, http.errorToString(code).c_str(), dt);
    }
    http.end();
    return code;
}

void enviarTeste() {
    String ts = timestampUTC();
    float potencia = TENSAO * CORRENTE;

    for (int k = 0; k < NUM_CANAIS; k++) {
        char json[200];
        snprintf(json, sizeof(json),
                 "{\"canal_id\":%d,\"corrente\":%.3f,\"tensao\":%.2f,"
                 "\"potencia\":%.1f,\"valido\":%s,\"timestamp\":\"%s\"}",
                 CANAIS[k], CORRENTE, TENSAO, potencia,
                 VALIDO ? "true" : "false", ts.c_str());

        int code = requisicao("POST", String(API_BASE) + "/medicoes/", json);

        if (code >= 200 && code < 300) {
            Serial.printf("    OK: canal %d gravado.\n", CANAIS[k]);
            requisicao("GET", String(API_BASE) + "/medicoes/ultimo/" + CANAIS[k]);
        } else {
            Serial.printf("    FALHOU: canal %d.\n", CANAIS[k]);
        }
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n===== EnergySafe — Teste API =====");

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("[WIFI] Conectando");
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
        delay(500);
        Serial.print(".");
    }
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("\n[WIFI] Falhou. Confira SSID/senha e liberacao do MAC.");
        return;
    }
    Serial.printf("\n[WIFI] OK. IP=%s MAC=%s\n",
                  WiFi.localIP().toString().c_str(), WiFi.macAddress().c_str());

    configTzTime("<-03>3", "pool.ntp.org", "time.google.com");  // Brasília, UTC-3
    Serial.printf("[NTP] Agora (Brasilia): %s\n", timestampUTC().c_str());

    // Confere se a API responde e quais canais existem
    requisicao("GET", String(API_BASE) + "/canais/");

    enviarTeste();
}

void loop() {
    static unsigned long ultimo = millis();
    if (WiFi.status() == WL_CONNECTED && millis() - ultimo >= INTERVALO_MS) {
        ultimo = millis();
        Serial.println("\n----- novo envio -----");
        enviarTeste();
    }
    delay(50);
}
