# 🦅 Manual Operativo: Sistema de Trading v4.0 "Fortaleza Matemática"

Este documento detalla el funcionamiento exacto y los parámetros matemáticos activos en tu bot de trading.

## 1. Filosofía Central
El sistema opera bajo una lógica de **"Francotirador"**:
*   **Calidad sobre Cantidad**: Prefiere no operar a operar con riesgo.
*   **Supervivencia Primero**: La prioridad #1 es proteger el capital (Drawdown Limits).
*   **Anti-Correlación**: Nunca apuesta todo al mismo movimiento del mercado.

---

## 2. Los Números Maestros (Configuración Actual)

### 💰 Gestión de Capital
| Parámetro | Valor | Explicación |
| :--- | :--- | :--- |
| **Apalancamiento** | `10x` | Margen Aislado (Isolated). |
| **Riesgo por Trade** | `3.00%` | Del capital total disponible. |
| **Máx. Trades Simultáneos** | `2` | Nunca más de 2 posiciones abiertas. |
| **Límite Pérdida Diaria** | `-3.00%` | Si el balance cae 3% hoy, el bot se apaga hasta mañana. |

### 🎯 Objetivos de Ganancia (ROI)
*Calculados sobre el margen (con 10x leverage)*

| Tipo | Objetivo | En Precio (aprox.) | Acción |
| :--- | :--- | :--- | :--- |
| **Take Profit (Meta)** | `+8.0%` | `±0.8%` movimiento | Cierra la operación con victoria total. |
| **Trailing Activation** | `+3.0%` | `±0.3%` movimiento | **Despierta** el sistema de protección de ganancias. |
| **Trailing Lock** | `+2.2%` | `±0.22%` movimiento | Si se activa el Trailing, el Stop Loss sube inmediatamente aquí para asegurar ganancia neta. |

### 🛡️ Protección de Pérdida (Stop Loss)
| Tipo | Valor | En Precio (aprox.) | Acción |
| :--- | :--- | :--- | :--- |
| **Hard Stop Loss** | `-2.5%` | `±0.25%` movimiento | Cierre de emergencia inmediato. |
| **Time Stop** | `20 min` | - | Si en 20 minutos no ha funcionado, se cierra. |

---

## 3. Protocolo de Seguridad (Riesgo)

### 🧱 Muralla de Correlación
El bot divide el mercado en 3 grupos. **Regla de Oro**: Nunca abrir 2 trades del mismo grupo.

*   **GRUPO A (Majors):** BTC, ETH, SOL, BNB, AVAX, ADA, XRP, DOT, LTC.
*   **GRUPO B (Memes):** DOGE, SHIB, PEPE, FLOKI.
*   **GRUPO C (Otros):** Resto del mercado.

*Ejemplo: Si tienes abierto BTC (Grupo A), el bot **RECHAZARÁ** cualquier señal de ETH o SOL, pero podría aceptar una de DOGE.*

### ❄️ Sistema de Enfriamiento (Cool-down)
*   **Regla**: Si ocurren **2 pérdidas consecutivas**.
*   **Castigo**: El bot entra en "Hibernación" por **20 minutos**.
*   **Objetivo**: Evitar la "venganza" (revenge trading) y dejar que la volatilidad pase.

---

## 4. Estrategia de Entrada (El Cerebro)

El bot busca entradas usando **Mean Reversion (Reversión a la Media)** con 3 confirmaciones simultáneas:

1.  **Bandas de Bollinger (20, 2)**:
    *   *Long*: Precio toca banda inferior.
    *   *Short*: Precio toca banda superior.
    *   *%B Threshold*: `< 0.3` (Long) o `> 0.7` (Short).

2.  **RSI (14 periodos)**:
    *   *Long*: RSI < `45` (Sobreventa moderada/agresiva).
    *   *Short*: RSI > `55` (Sobrecompra moderada/agresiva).

3.  **Filtro de Tendencia (EMA 200)**:
    *   **SOLO Long** si el precio está por **ENCIMA** de la EMA 200 (Tendencia Alcista).
    *   **SOLO Short** si el precio está por **DEBAJO** de la EMA 200 (Tendencia Bajista).

---

## 5. Ciclos de Ejecución (El Motor)

*   **Escáner de Mercado**: Cada **10 minutos**.
    *   El bot despierta, descarga velas, analiza estrategias y busca entradas.
*   **Monitor de Salida**: Cada **5 segundos**.
    *   El bot revisa las posiciones abiertas para:
        *   Mover el Trailing Stop.
        *   Ejecutar Stop Loss / Take Profit.
        *   Cerrar por Tiempo (Timeout).

## 6. Ejecución de Órdenes (Ahorro de Comisiones)

El bot intenta ser **MAKER** (proveedor de liquidez) para pagar menos comisiones:
1.  Intenta poner una orden **LIMIT** al precio actual del libro ("Post-Only").
2.  Si el precio se escapa, reintenta 3 veces.
3.  Solo si falla 3 veces, usa una orden de **MERCADO** agresiva para asegurar la entrada.

---
*Documento generado automáticamente por Antigravity AI - Sistema V4.0*
