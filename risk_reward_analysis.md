# Análisis Completo: Riesgo vs Recompensa

## Setup Actual (Verificado del Código)

### Capital y Posiciones
```
Capital total: $1,000
Max posiciones: 4
Inversión por posición: $100 (10% del capital)
Leverage: 10x
Exposición por posición: $1,000
```

### Configuración de Estrategia (del código)
```typescript
// MeanReversionStrategy.ts
atrMultiplier: 1.5  // Stop Loss a 1.5 × ATR
```

## Cálculo de Riesgo REAL por Posición

### Take Profit Actual
```
TP configurado: +0.7% del precio de entrada
Exposición: $1,000
Movimiento: 0.7%

Ganancia bruta = $1,000 × 0.7% = $7
Comisión apertura = $1.10
Comisión cierre = $1.10
Ganancia NETA = $7 - $2.20 = $4.80 ✅
```

### Stop Loss Actual  
```
SL configurado: 1.5 × ATR (promedio ~1% en mercado normal)
Exposición: $1,000
Movimiento: ~1%

Pérdida bruta = $1,000 × 1% = $10
Comisión apertura = $1.10
Pérdida TOTAL = $10 + $1.10 = $11.10 ❌
```

## Ratio Riesgo/Recompensa

```
Por cada trade:
Riesgo: $11.10
Ganancia: $4.80

Ratio R:R = 11.10 : 4.80 = 2.31:1

Esto significa: Arriesgas $2.31 por cada $1 que ganas
```

## Win Rate Necesario para Break-Even

```
Formula: Win Rate = Riesgo / (Riesgo + Ganancia)

Win Rate = 11.10 / (11.10 + 4.80)
Win Rate = 11.10 / 15.90
Win Rate = 69.8%

NECESITAS GANAR EL 70% DE LAS VECES SOLO PARA NO PERDER DINERO ❌
```

## Matemática de 30 Trades/Día

### Escenario: 70% Win Rate (Break-even)
```
Trades totales: 30
Wins: 21 × $4.80 = +$100.80
Losses: 9 × $11.10 = -$99.90
NET: +$0.90 (básicamente $0)
```

### Escenario: 65% Win Rate (Realista)
```
Trades totales: 30
Wins: 19.5 × $4.80 = +$93.60
Losses: 10.5 × $11.10 = -$116.55
NET: -$22.95 ❌ PÉRDIDA DIARIA
```

### Escenario: 75% Win Rate (Muy difícil)
```
Trades totales: 30
Wins: 22.5 × $4.80 = +$108
Losses: 7.5 × $11.10 = -$83.25
NET: +$24.75 ✅ Ganancia
```

## El Problema Identificado

### ❌ Configuración Actual NO es Rentable

1. **Ratio demasiado desfavorable**: 2.31:1 riesgo/ganancia
2. **Win rate imposible**: Necesitas 70%+ consistentemente
3. **Comisiones te matan**: $2.20 por trade es 46% de tu ganancia objetivo

### 📊 Por Qué Parecía Que Funcionaba

Tus posiciones actuales están en ganancia porque:
- Se abrieron hace horas (mucho tiempo para moverse)
- Algunas tienen +2-3% (mucho más que el TP de 0.7%)
- No han tocado el TP automático todavía (son posiciones viejas)

Pero cuando el nuevo TP de 0.7% empiece a cerrar trades rápido, verás el problema.

## Soluciones Propuestas

### Opción 1: TP y SL Balanceados (RECOMENDADO)
```
Take Profit: 1% (+$10 - $2.20 comisiones = +$7.80 net)
Stop Loss: 0.8% (-$8 - $1.10 comisión = -$9.10)

Ratio: 9.10:7.80 = 1.17:1
Win rate necesario: 53.8%

Con 60% win rate:
30 trades: 18W × $7.80 + 12L × -$9.10 = +$30.90/día ✅
```

### Opción 2: TP Mayor que SL (AGRESIVO)
```
Take Profit: 1.2% (+$12 - $2.20 = +$9.80)
Stop Loss: 0.8% (-$8 - $1.10 = -$9.10)

Ratio: 9.10:9.80 = 0.93:1
Win rate necesario: 48.1%

Con 55% win rate:
30 trades: 16.5W × $9.80 + 13.5L × -$9.10 = +$38.85/día ✅
```

### Opción 3: TP Igual a SL (CONSERVADOR)
```
Take Profit: 0.9% (+$9 - $2.20 = +$6.80)
Stop Loss: 0.9% (-$9 - $1.10 = -$10.10)

Ratio: 10.10:6.80 = 1.49:1
Win rate necesario: 59.8%

Con 65% win rate:
30 trades: 19.5W × $6.80 + 10.5L × -$10.10 = +$26.65/día ✅
```

## Respuesta a Tu Pregunta Original

> "esto traduce a que se arriesga 400 usd para ganar unos 20 usd cada 5 minutos?"

### NO exactamente, pero casi:

**Exposición:** Sí, $4,000 total (4 posiciones × $1,000)
**Riesgo real:** $44.40 máximo (4 × $11.10 si todas pierden)
**Ganancia esperada:** $19.20 si las 4 ganan (4 × $4.80)

**El problema es:**
- Arriesgas $44.40 para ganar $19.20
- Ratio 2.31:1 = MALO
- Necesitas 70% win rate = MUY DIFÍCIL

**La exposición de $4,000 no es tu riesgo**, pero el ratio de lo que puedes perder vs ganar SÍ es malo.

## Recomendación Final

Cambiar a **Opción 2**:
- TP: 1.2%
- SL: 0.8%
- Win rate necesario: 48%
- Ganancia esperada: $30-40/día con 55% win rate

Esto es mucho más realista y rentable.

¿Quieres que implemente este ajuste?
