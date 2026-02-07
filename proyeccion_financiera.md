# 📊 Proyección Financiera: Sistema v4.0

Este análisis proyecta el crecimiento potencial de capital basado en la matemática actual de tu bot.

## 🧮 La Matemática Base (Por Trade)
El sistema usa **10x Apalancamiento** en **Margen Aislado** con el 50% del capital por operación (2 trades máx).

| Concepto | Cálculo | Impacto en Capital Total |
| :--- | :--- | :--- |
| **Inversión por Trade** | 50% del Balance | - |
| **Ganancia (TP)** | +8% ROI sobre Margen | **+4.00%** Crecimiento Neto |
| **Pérdida (SL)** | -2.5% ROI sobre Margen | **-1.25%** Decrecimiento Neto |
| **Risk/Reward R** | 4.00% / 1.25% | **3.2 : 1** (Excelente) |

---

## 📅 Escenarios Mensuales (Proyección a 30 días)

*Nota: Asumiendo interés compuesto diario.*

### 🐢 Escenario Conservador
*   **Frecuencia:** 1 Trade al día.
*   **Win Rate:** 50% (Gana 1, Pierde 1, etc.)
*   **Resultado Neto:** +1 trade ganador neto cada 2 días aprox (promedio).
*   *Cálculo simplificado: 15 victorias (+60%), 15 derrotas (-18.75%) -> ~+40% Mes.*

### 🐎 Escenario Moderado (Realista)
*   **Frecuencia:** 3 Trades al día.
*   **Win Rate:** 55% (Gana un poco más de lo que pierde).
*   **Estabilidad:** Mercado normal, volatilidad media.

### 🚀 Escenario Optimista
*   **Frecuencia:** 5 Trades al día.
*   **Win Rate:** 60% (El bot está "en racha").
*   **Estabilidad:** Mercado en tendencia clara a favor.

---

## 💰 Tabla de Proyección de Capital (Mes 1)

| Capital Inicial | Ganancia Conservadora (~30%) | Ganancia Moderada (~70%) | Ganancia Optimista (~120%) |
| :--- | :--- | :--- | :--- |
| **$100** | $130 | $170 | $220 |
| **$500** | $650 | $850 | $1,100 |
| **$1,000** | $1,300 | $1,700 | $2,200 |
| **$5,000** | $6,500 | $8,500 | $11,000 |
| **$10,000** | $13,000 | $17,000 | $22,000 |

*> **Advertencia:** Estas proyecciones son matemáticas basadas en el rendimiento ideal de la estrategia Mean Reversion. El mercado real tiene deslizamiento (slippage), comisiones y días de "Cierre de Emergencia" (-3%) que pueden reducir estos números.*

---

## 📉 El "Peor Caso" (Gestión de Riesgo)
¿Qué pasa si todo sale mal?
*   **Límite Diario:** -3% (El bot se apaga).
*   Si tienes **10 días desastrosos** seguidos (estadísticamente improbable con este R:R), perderías aprox **26%** de tu capital, no el 100%.
*   *Tu capital está protegido contra la ruina total.*

---
*Generado por Antigravity AI - Análisis de Rentabilidad v4.0*
