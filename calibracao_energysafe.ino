// =============================================================
//  EnergySafe — Calibração Interativa de Corrente e Tensão
//  ESP32 + SCT-013-000 + Divisor Resistivo de Tensão
//
//  Como usar:
//    1. Grave este sketch no ESP32
//    2. Abra o Serial Monitor a 115200 baud
//    3. Siga as instruções na tela
//    4. Copie os valores de CALIBRATION_GAIN e VOLTAGE_GAIN
//       gerados ao final para o seu config.h
// =============================================================

#include <Arduino.h>
#include <math.h>

// ===================== PINOS =====================
#define ADC_PIN_CURRENT   34    // Corrente — SCT-013 + burden 33Ω
#define ADC_PIN_VOLTAGE   35    // Tensão   — divisor resistivo na PCB
                                // ⚠️ Ajuste para o pino real da placa!

// ===================== ADC =====================
#define ADC_BITS          12
#define ADC_VREF          3.3f
#define ADC_MAX           4095.0f

// ===================== SENSOR DE CORRENTE =====================
#define CT_RATIO          2000.0f   // SCT-013-000: 100A:50mA → 2000:1
#define BURDEN_OHMS       33.0f     // Resistor burden da placa

// ===================== AMOSTRAGEM =====================
#define SAMPLE_RATE_HZ    2000
#define WINDOW_MS         1000
#define NUM_SAMPLES       (SAMPLE_RATE_HZ * WINDOW_MS / 1000)  // 2000 amostras

// ===================== CALIBRAÇÃO (ajustados ao final) =====================
float CALIBRATION_GAIN_CURRENT = 1.0f;  // gain da corrente
float CALIBRATION_GAIN_VOLTAGE = 1.0f;  // gain da tensão

// ===================== VARIÁVEIS GLOBAIS =====================
float measuredIrms   = 0.0f;
float measuredVrms   = 0.0f;
float referenceIrms  = 0.0f;
float referenceVrms  = 0.0f;

// =============================================================
//  Lê RMS de corrente no ADC_PIN_CURRENT
//  Retorna valor em Ampères (antes do gain de calibração)
// =============================================================
float readCurrentRms() {
  long   sumSq    = 0;
  int    offset   = 2048;  // ponto médio 12 bits
  float  vPerBit  = ADC_VREF / ADC_MAX;

  // --- Estimativa automática do offset (média das amostras) ---
  long sumOffset = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    sumOffset += analogRead(ADC_PIN_CURRENT);
    delayMicroseconds(1000000 / SAMPLE_RATE_HZ);
  }
  offset = sumOffset / NUM_SAMPLES;

  // --- Coleta RMS ---
  for (int i = 0; i < NUM_SAMPLES; i++) {
    int raw   = analogRead(ADC_PIN_CURRENT) - offset;
    long v    = raw;
    sumSq    += v * v;
    delayMicroseconds(1000000 / SAMPLE_RATE_HZ);
  }

  float vrmsADC = sqrt((float)sumSq / NUM_SAMPLES) * vPerBit;  // Vrms no ADC (V)
  float irmsSecondary = vrmsADC / BURDEN_OHMS;                  // Irms secundário (A)
  float irms = irmsSecondary * CT_RATIO;                        // Irms primário (A)
  return irms;
}

// =============================================================
//  Lê RMS de tensão no ADC_PIN_VOLTAGE
//  Retorna valor em Volts (antes do gain de calibração)
//  ⚠️ Ajuste VOLTAGE_DIVIDER_FACTOR conforme os resistores da PCB
// =============================================================
float readVoltageRms() {
  // Fator do divisor resistivo: Vin_real = Vadc * (R1 + R2) / R2
  // Exemplo: R1=470kΩ, R2=1kΩ → fator ≈ 471
  // ⚠️ AJUSTE ESTE VALOR conforme os resistores reais da sua placa!
  const float VOLTAGE_DIVIDER_FACTOR = 471.0f;

  long  sumSq   = 0;
  int   offset  = 2048;
  float vPerBit = ADC_VREF / ADC_MAX;

  // --- Offset automático ---
  long sumOffset = 0;
  for (int i = 0; i < NUM_SAMPLES; i++) {
    sumOffset += analogRead(ADC_PIN_VOLTAGE);
    delayMicroseconds(1000000 / SAMPLE_RATE_HZ);
  }
  offset = sumOffset / NUM_SAMPLES;

  // --- Coleta RMS ---
  for (int i = 0; i < NUM_SAMPLES; i++) {
    int  raw  = analogRead(ADC_PIN_VOLTAGE) - offset;
    long v    = raw;
    sumSq    += v * v;
    delayMicroseconds(1000000 / SAMPLE_RATE_HZ);
  }

  float vrmsADC = sqrt((float)sumSq / NUM_SAMPLES) * vPerBit;
  float vrms    = vrmsADC * VOLTAGE_DIVIDER_FACTOR;
  return vrms;
}

// =============================================================
//  Aguarda o usuário digitar um número float no Serial
// =============================================================
float waitForFloat(const char* prompt) {
  Serial.println();
  Serial.print("  ➤  ");
  Serial.print(prompt);
  Serial.print(": ");

  while (!Serial.available()) { delay(50); }
  float val = Serial.parseFloat();
  // Limpa buffer
  while (Serial.available()) Serial.read();
  Serial.println(val, 3);
  return val;
}

// =============================================================
//  Imprime linha separadora
// =============================================================
void linha(char c = '-', int n = 56) {
  for (int i = 0; i < n; i++) Serial.print(c);
  Serial.println();
}

// =============================================================
//  Mede N vezes e retorna a média (para maior estabilidade)
// =============================================================
void medirMedia(int repeticoes, float &mediaI, float &mediaV) {
  float somaI = 0, somaV = 0;
  for (int i = 0; i < repeticoes; i++) {
    Serial.print("    Medição ");
    Serial.print(i + 1);
    Serial.print("/");
    Serial.print(repeticoes);
    Serial.print(" ... ");
    float ci = readCurrentRms() * CALIBRATION_GAIN_CURRENT;
    float cv = readVoltageRms() * CALIBRATION_GAIN_VOLTAGE;
    somaI += ci;
    somaV += cv;
    Serial.print("I=");
    Serial.print(ci, 3);
    Serial.print(" A  |  V=");
    Serial.print(cv, 2);
    Serial.println(" V");
    delay(200);
  }
  mediaI = somaI / repeticoes;
  mediaV = somaV / repeticoes;
}

// =============================================================
//  SETUP
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(2000);

  analogReadResolution(ADC_BITS);
  analogSetAttenuation(ADC_11db);  // suporta até ~3,1 V no ESP32

  // ─────────────────────────────────────────────
  //  Tela de boas-vindas
  // ─────────────────────────────────────────────
  Serial.println();
  linha('=');
  Serial.println("   ENERGYSAFE — CALIBRAÇÃO DE SENSORES");
  Serial.println("   ESP32 + SCT-013-000 + Divisor Resistivo");
  linha('=');
  Serial.println();
  Serial.println("  Antes de começar, certifique-se de que:");
  Serial.println("  [1] O CT (clamp) está passado pelo fio de fase");
  Serial.println("  [2] Uma carga CONHECIDA está ligada (ex: chuveiro,");
  Serial.println("      ferro de solda, lâmpada incandescente)");
  Serial.println("  [3] Você tem um multímetro para medir a corrente e");
  Serial.println("      a tensão REAIS no mesmo ponto");
  Serial.println("  [4] O pino ADC de tensão está ajustado no código");
  Serial.println("      (ADC_PIN_VOLTAGE = 35 por padrão)");
  Serial.println();
  Serial.println("  Digite qualquer tecla e pressione ENTER para iniciar...");
  while (!Serial.available()) { delay(100); }
  while (Serial.available()) Serial.read();

  // ─────────────────────────────────────────────
  //  ETAPA 1 — Leitura bruta sem calibração
  // ─────────────────────────────────────────────
  Serial.println();
  linha();
  Serial.println("  ETAPA 1 — Leitura bruta do sensor (sem calibração)");
  linha();
  Serial.println("  Aguardando estabilização (3 s)...");
  delay(3000);

  float mediaI_bruta, mediaV_bruta;
  medirMedia(5, mediaI_bruta, mediaV_bruta);

  Serial.println();
  Serial.print("  ✔ Média corrente bruta : ");
  Serial.print(mediaI_bruta, 3);
  Serial.println(" A");
  Serial.print("  ✔ Média tensão bruta   : ");
  Serial.print(mediaV_bruta, 2);
  Serial.println(" V");

  // ─────────────────────────────────────────────
  //  ETAPA 2 — Referência do usuário (multímetro)
  // ─────────────────────────────────────────────
  Serial.println();
  linha();
  Serial.println("  ETAPA 2 — Insira os valores medidos pelo multímetro");
  linha();
  Serial.println("  Meça agora com o multímetro e digite os valores:");
  Serial.println();

  referenceIrms = waitForFloat("Corrente real medida pelo multímetro (A)");
  referenceVrms = waitForFloat("Tensão real medida pelo multímetro (V)  ");

  // ─────────────────────────────────────────────
  //  ETAPA 3 — Cálculo dos ganhos
  // ─────────────────────────────────────────────
  float gainI = (mediaI_bruta > 0.001f) ? (referenceIrms / mediaI_bruta) : 1.0f;
  float gainV = (mediaV_bruta > 0.5f)   ? (referenceVrms  / mediaV_bruta)  : 1.0f;

  CALIBRATION_GAIN_CURRENT = gainI;
  CALIBRATION_GAIN_VOLTAGE = gainV;

  Serial.println();
  linha();
  Serial.println("  ETAPA 3 — Ganhos calculados");
  linha();
  Serial.print("  CALIBRATION_GAIN (corrente) = ");
  Serial.println(gainI, 6);
  Serial.print("  CALIBRATION_GAIN (tensão)   = ");
  Serial.println(gainV, 6);

  // ─────────────────────────────────────────────
  //  ETAPA 4 — Verificação com os ganhos aplicados
  // ─────────────────────────────────────────────
  Serial.println();
  linha();
  Serial.println("  ETAPA 4 — Verificação (leitura com calibração aplicada)");
  linha();
  Serial.println("  Mantendo a mesma carga ligada...");
  delay(2000);

  float mediaI_cal, mediaV_cal;
  medirMedia(5, mediaI_cal, mediaV_cal);

  float erroI = abs(mediaI_cal - referenceIrms) / referenceIrms * 100.0f;
  float erroV = abs(mediaV_cal - referenceVrms)  / referenceVrms  * 100.0f;

  Serial.println();
  Serial.print("  Corrente calibrada : ");
  Serial.print(mediaI_cal, 3);
  Serial.print(" A   (referência: ");
  Serial.print(referenceIrms, 3);
  Serial.print(" A)   erro: ");
  Serial.print(erroI, 2);
  Serial.println(" %");

  Serial.print("  Tensão calibrada   : ");
  Serial.print(mediaV_cal, 2);
  Serial.print(" V   (referência: ");
  Serial.print(referenceVrms, 2);
  Serial.print(" V)   erro: ");
  Serial.print(erroV, 2);
  Serial.println(" %");

  // Potência aparente
  float pAparente = mediaI_cal * mediaV_cal;
  Serial.print("  Potência aparente  : ");
  Serial.print(pAparente, 1);
  Serial.println(" VA");

  // ─────────────────────────────────────────────
  //  RESULTADO FINAL — Cole no config.h
  // ─────────────────────────────────────────────
  Serial.println();
  linha('=');
  Serial.println("  RESULTADO FINAL — Copie para o seu config.h:");
  linha('=');
  Serial.println();
  Serial.println("  // ===== CALIBRAÇÃO GERADA AUTOMATICAMENTE =====");
  Serial.print("  #define CALIBRATION_GAIN     ");
  Serial.print(gainI, 6);
  Serial.println("f   // gain corrente SCT-013");
  Serial.print("  #define VOLTAGE_GAIN         ");
  Serial.print(gainV, 6);
  Serial.println("f   // gain tensão divisor resistivo");
  Serial.println();

  if (erroI <= 2.0f && erroV <= 2.0f) {
    Serial.println("  ✔ Calibração OK — erro abaixo de 2% em ambos os canais.");
  } else {
    Serial.println("  ⚠ Atenção — um ou mais canais com erro acima de 2%.");
    Serial.println("    Verifique:");
    Serial.println("    • Se o VOLTAGE_DIVIDER_FACTOR está correto (R1 e R2 da placa)");
    Serial.println("    • Se o burden de 33 Ω está bem soldado");
    Serial.println("    • Se o CT está bem posicionado no fio de fase");
    Serial.println("    • Se a leitura do multímetro foi em RMS (não pico)");
    Serial.println("    Execute a calibração novamente após as correções.");
  }

  linha('=');
  Serial.println();
  Serial.println("  Calibração concluída. O ESP32 continua monitorando...");
  Serial.println("  (Reset para rodar a calibração novamente)");
  Serial.println();
}

// =============================================================
//  LOOP — Monitoramento contínuo após calibração
// =============================================================
void loop() {
  float i = readCurrentRms() * CALIBRATION_GAIN_CURRENT;
  float v = readVoltageRms()  * CALIBRATION_GAIN_VOLTAGE;
  float p = i * v;

  Serial.print("I=");
  Serial.print(i, 3);
  Serial.print(" A  |  V=");
  Serial.print(v, 2);
  Serial.print(" V  |  P=");
  Serial.print(p, 1);
  Serial.println(" VA");

  delay(2000);
}
