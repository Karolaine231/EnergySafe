/*
============================================================
EnergySafe — config.h
============================================================
Tudo o que muda de um módulo para outro (ou de uma instalação
para outra) fica AQUI. O EnergySafe.ino não precisa ser editado.

COMO GRAVAR UM MÓDULO:
  1. Escolha o módulo em MODULO (logo abaixo).
  2. Confira a calibração desse módulo no bloco dele.
  3. Grave o EnergySafe.ino normalmente.

DEPOIS DE CALIBRAR (calibracao_energysafe.ino):
  O sketch de calibração imprime 3 linhas (CANAL_VSENSOR_IDX,
  CAL_GAIN_I, CAL_GAIN_V). Cole essas linhas no bloco do módulo
  calibrado, substituindo as que estão lá.
============================================================
*/
#pragma once

// ═══════════════════════════════════════════════════════════
//  1. QUAL MÓDULO VOCÊ ESTÁ GRAVANDO
// ═══════════════════════════════════════════════════════════
//   0 = ADM0   → canais 1, 2, 3
//   1 = ADM01  → canais 4, 5, 6
//   2 = ADM02  → canais 7, 8, 9
#define MODULO 0


// ═══════════════════════════════════════════════════════════
//  2. WI-FI E API (iguais para todos os módulos)
// ═══════════════════════════════════════════════════════════
// Rede da instituição (WPA2, acesso liberado por MAC)
const char* WIFI_SSID     = "fmabc-devices";
const char* WIFI_PASSWORD = "@Jama!c@#26";

// Endereço completo da rota de medições
const char* API_URL = "https://energysafe.eco.br/api/medicoes/";


// ═══════════════════════════════════════════════════════════
//  3. CALIBRAÇÃO DE CADA MÓDULO
// ═══════════════════════════════════════════════════════════
// CANAL_VSENSOR_IDX: qual sensor de tensão mede o mesmo circuito
//   de cada sensor de corrente.  0 = ZMPT no VP (GPIO36)
//                                1 = ZMPT no VN (GPIO39)
// CAL_GAIN_I: ganho dos sensores de corrente 1, 2, 3
// CAL_GAIN_V: ganho dos ZMPT do VP e do VN

#if MODULO == 0
    const char* DEVICE_NAME = "ADM0";
    const int   CANAL_IDS[3] = {1, 2, 3};

    const int   CANAL_VSENSOR_IDX[3] = {0, 1, 1};  // corrente 1, 2, 3
    const float CAL_GAIN_I[3] = {1.0000f, 1.0000f, 1.0000f};
    const float CAL_GAIN_V[2] = {234.26f, 234.26f};

#elif MODULO == 1
    const char* DEVICE_NAME = "ADM01";
    const int   CANAL_IDS[3] = {4, 5, 6};

    const int   CANAL_VSENSOR_IDX[3] = {0, 1, 1};  // corrente 1, 2, 3
    const float CAL_GAIN_I[3] = {1.0000f, 1.0000f, 1.0000f};
    const float CAL_GAIN_V[2] = {234.26f, 234.26f};

#elif MODULO == 2
    const char* DEVICE_NAME = "ADM02";
    const int   CANAL_IDS[3] = {7, 8, 9};

    const int   CANAL_VSENSOR_IDX[3] = {0, 1, 1};  // corrente 1, 2, 3
    const float CAL_GAIN_I[3] = {1.0000f, 1.0000f, 1.0000f};
    const float CAL_GAIN_V[2] = {234.26f, 234.26f};

#else
    #error "MODULO invalido em config.h: use 0, 1 ou 2"
#endif

// Escala base dos sensores de corrente (o ajuste fino é o CAL_GAIN_I)
const float CT_RATIO    = 2000.0f;
const float BURDEN_OHMS = 33.0f;


// ═══════════════════════════════════════════════════════════
//  4. AJUSTES DE OPERAÇÃO
// ═══════════════════════════════════════════════════════════
// Intervalo de envio para a API
//   5000UL   = 5 s   (teste)
//   600000UL = 10 min (produção)
#define PUBLISH_INTERVAL_MS 5000UL

// Abaixo disso a medição vai como valido=false (sensor desligado ou
// ruído) e não soma energia. Ajuste depois de calibrar.
#define VALIDO_V_MIN 80.0f     // [V]  menor tensão de rede esperada
#define VALIDO_I_MIN 0.05f     // [A]  menor corrente que vale registrar
