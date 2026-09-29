/*
============================================================
EnergySafe — Calibração dos sensores
============================================================
Usa o mesmo processamento do firmware v5.0.6 (2 kHz, janela
de 10 ciclos, remoção de DC por EMA, filtro passa-baixa,
CT_RATIO e BURDEN). Os ganhos daqui valem direto no firmware.

Também descobre QUAL sensor de tensão (VP ou VN) está no mesmo
circuito de cada sensor de corrente: com carga resistiva, o par
certo dá fator de potência ≈ 1.

COMO USAR (Monitor Serial 115200, "Nova linha" ativado):
  1. Ligue uma carga resistiva (chaleira, aquecedor, secador)
     e meça com alicate amperímetro e multímetro.
  2. Digite os valores REAIS medidos:
        vp 220     -> tensão real no ZMPT do VP (GPIO36)
        vn 127     -> tensão real no ZMPT do VN (GPIO39)
        i1 4.83    -> corrente real no sensor de corrente 1 (GPIO34)
        i2 4.83    -> sensor 2 (GPIO35)
        i3 4.83    -> sensor 3 (GPIO32)
  3. Digite  p  para imprimir as linhas prontas para colar no
     bloco CONFIGURAÇÕES do firmware (ganhos + CANAL_VSENSOR_IDX).
============================================================
*/

// ─── Pinos (iguais ao firmware) ────────────────────────────
const int PINO_CORRENTE[3] = {34, 35, 32};
const int PINO_VSENSOR[2]  = {36, 39};    // VP, VN

// ─── Constantes (iguais ao firmware) ───────────────────────
const float CT_RATIO    = 2000.0f;
const float BURDEN_OHMS = 33.0f;

// Ganhos iniciais — coloque aqui os valores atuais do firmware
float CAL_GAIN_I[3] = {1.0f, 1.0f, 1.0f};
float CAL_GAIN_V[2] = {234.26f, 234.26f};

#define ADC_VREF         3.3f
#define ADC_FULL_SCALE   4095.0f
#define SAMPLE_RATE_HZ   2000
#define SAMPLE_PERIOD_US (1000000 / SAMPLE_RATE_HZ)
#define WINDOW_SAMPLES   (SAMPLE_RATE_HZ / 60 * 10)
#define DC_ALPHA         0.001f
#define JANELAS_MEDIA    4          // média de 4 janelas por leitura
#define I_MIN_PAREAMENTO 0.2f       // corrente mínima para sugerir o par

float dcV[2], dcI[3];

// Resultados sem ganho
float vrmsBruto[2];
float irmsBruto[3];
double pBruto[3][2];                // P bruta da corrente c com o sensor s

int adcMinV[2], adcMaxV[2], adcMinI[3], adcMaxI[3];

// ─────────────────────────────────────────────────────────
// Mede o sensor de corrente c junto com OS DOIS sensores de tensão
void medirCanal(int c) {
    double sV2[2] = {0, 0}, sVI[2] = {0, 0}, sI2 = 0;
    long nTot = 0;
    adcMinI[c] = 4095; adcMaxI[c] = 0;
    for (int s = 0; s < 2; s++) { adcMinV[s] = 4095; adcMaxV[s] = 0; }

    for (int j = 0; j < JANELAS_MEDIA; j++) {
        float antV[2] = {0, 0}, antI = 0;
        for (int n = 0; n < WINDOW_SAMPLES; n++) {
            unsigned long t0 = micros();

            int rawI = analogRead(PINO_CORRENTE[c]);
            int rawV[2];
            rawV[0] = analogRead(PINO_VSENSOR[0]);
            rawV[1] = analogRead(PINO_VSENSOR[1]);

            adcMinI[c] = min(adcMinI[c], rawI); adcMaxI[c] = max(adcMaxI[c], rawI);

            float aI = rawI * (ADC_VREF / ADC_FULL_SCALE);
            dcI[c] = (1.0f - DC_ALPHA) * dcI[c] + DC_ALPHA * aI;
            float i = aI - dcI[c];
            if (n > 0) i = 0.5f * (i + antI);          // mesmo filtro do firmware
            antI = i;
            float iA = i / BURDEN_OHMS * CT_RATIO;
            sI2 += (double)iA * iA;

            for (int s = 0; s < 2; s++) {
                adcMinV[s] = min(adcMinV[s], rawV[s]);
                adcMaxV[s] = max(adcMaxV[s], rawV[s]);
                float aV = rawV[s] * (ADC_VREF / ADC_FULL_SCALE);
                dcV[s] = (1.0f - DC_ALPHA) * dcV[s] + DC_ALPHA * aV;
                float v = aV - dcV[s];
                if (n > 0) v = 0.5f * (v + antV[s]);
                antV[s] = v;
                sV2[s] += (double)v * v;
                sVI[s] += (double)v * iA;
            }
            nTot++;

            long resta = (long)SAMPLE_PERIOD_US - (long)(micros() - t0);
            if (resta > 0) delayMicroseconds(resta);
        }
    }

    irmsBruto[c] = sqrt(sI2 / nTot);
    for (int s = 0; s < 2; s++) {
        vrmsBruto[s] = sqrt(sV2[s] / nTot);
        pBruto[c][s] = sVI[s] / nTot;
    }
}

// FP da corrente c usando o sensor de tensão s (independe dos ganhos)
float fpPar(int c, int s) {
    float den = vrmsBruto[s] * irmsBruto[c];
    return (den > 1e-9f) ? (float)(pBruto[c][s] / den) : 0.0f;
}

// Sugestão de par: sensor com |FP| maior (-1 = corrente baixa demais)
int sugerirPar(int c) {
    if (irmsBruto[c] * CAL_GAIN_I[c] < I_MIN_PAREAMENTO) return -1;
    return (fabsf(fpPar(c, 0)) >= fabsf(fpPar(c, 1))) ? 0 : 1;
}

void imprimirConstantes() {
    int par[3];
    for (int c = 0; c < 3; c++) par[c] = sugerirPar(c);

    Serial.println("\n----- COLE NO FIRMWARE (bloco CONFIGURACOES) -----");
    Serial.printf("const int CANAL_VSENSOR_IDX[3] = {%d, %d, %d};  // corrente 1, 2, 3\n",
                  par[0] < 0 ? 0 : par[0], par[1] < 0 ? 1 : par[1], par[2] < 0 ? 1 : par[2]);
    Serial.printf("const float CAL_GAIN_I[3] = {%.4ff, %.4ff, %.4ff};\n",
                  CAL_GAIN_I[0], CAL_GAIN_I[1], CAL_GAIN_I[2]);
    Serial.printf("const float CAL_GAIN_V[2] = {%.2ff, %.2ff};\n",
                  CAL_GAIN_V[0], CAL_GAIN_V[1]);
    for (int c = 0; c < 3; c++) {
        if (par[c] < 0)
            Serial.printf("// ATENCAO: corrente %d sem carga — par nao detectado (valor padrao).\n", c + 1);
    }
    Serial.println("--------------------------------------------------\n");
}

void processarComando() {
    if (!Serial.available()) return;
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toLowerCase();
    if (cmd.length() == 0) return;

    if (cmd == "p") { imprimirConstantes(); return; }

    int esp = cmd.indexOf(' ');
    if (esp < 0) {
        Serial.println("Use: vp <V> | vn <V> | i1 <A> | i2 <A> | i3 <A> | p");
        return;
    }
    String alvo = cmd.substring(0, esp);
    float real  = cmd.substring(esp + 1).toFloat();
    if (real <= 0) { Serial.println("Valor invalido."); return; }

    if (alvo == "vp" || alvo == "vn") {
        int s = (alvo == "vp") ? 0 : 1;
        if (vrmsBruto[s] < 0.001f) { Serial.println("Sem sinal nesse sensor de tensao."); return; }
        CAL_GAIN_V[s] = real / vrmsBruto[s];
        Serial.printf(">> CAL_GAIN_V[%d] (%s) = %.2f\n", s, s == 0 ? "VP" : "VN", CAL_GAIN_V[s]);
    } else if (alvo == "i1" || alvo == "i2" || alvo == "i3") {
        int c = alvo.charAt(1) - '1';
        if (irmsBruto[c] < 0.00005f) { Serial.println("Sem sinal nesse sensor de corrente."); return; }
        CAL_GAIN_I[c] = real / irmsBruto[c];
        Serial.printf(">> CAL_GAIN_I[%d] (corrente %d) = %.4f\n", c, c + 1, CAL_GAIN_I[c]);
    } else {
        Serial.println("Use: vp <V> | vn <V> | i1 <A> | i2 <A> | i3 <A> | p");
    }
}

const char* satura(int mn, int mx) {
    return (mn < 50 || mx > 4045) ? "SATURA!" : "ok";
}

// ─────────────────────────────────────────────────────────
void setup() {
    Serial.begin(115200);
    delay(1000);
    analogReadResolution(12);

    for (int s = 0; s < 2; s++) dcV[s] = ADC_VREF / 2.0f;
    for (int c = 0; c < 3; c++) dcI[c] = ADC_VREF / 2.0f;

    Serial.println("\n===== EnergySafe — Calibracao =====");
    Serial.println("Comandos: vp <V> | vn <V> | i1 <A> | i2 <A> | i3 <A> | p");
    Serial.println("Estabilizando o offset (~10 s)...\n");

    for (int k = 0; k < 4; k++)
        for (int c = 0; c < 3; c++) medirCanal(c);
}

void loop() {
    for (int c = 0; c < 3; c++) {
        medirCanal(c);
        processarComando();
    }

    Serial.println("TENSAO");
    for (int s = 0; s < 2; s++) {
        Serial.printf("  %s (GPIO%d): %6.1f V   ADC %4d-%4d %s\n",
                      s == 0 ? "VP" : "VN", PINO_VSENSOR[s],
                      vrmsBruto[s] * CAL_GAIN_V[s],
                      adcMinV[s], adcMaxV[s], satura(adcMinV[s], adcMaxV[s]));
    }

    Serial.println("CORRENTE | Irms    | P c/ VP  FP VP | P c/ VN  FP VN | par  | ADC");
    for (int c = 0; c < 3; c++) {
        float gI = CAL_GAIN_I[c];
        int par  = sugerirPar(c);
        Serial.printf("  %d      | %6.3f A | %7.1f  %5.2f | %7.1f  %5.2f | %s | %4d-%4d %s\n",
                      c + 1, irmsBruto[c] * gI,
                      pBruto[c][0] * CAL_GAIN_V[0] * gI, fpPar(c, 0),
                      pBruto[c][1] * CAL_GAIN_V[1] * gI, fpPar(c, 1),
                      par < 0 ? " -- " : (par == 0 ? " VP " : " VN "),
                      adcMinI[c], adcMaxI[c], satura(adcMinI[c], adcMaxI[c]));
    }
    Serial.println();
    processarComando();
}
