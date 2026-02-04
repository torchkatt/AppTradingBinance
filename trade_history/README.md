# Trade History System

Este directorio contiene el historial completo de trading del bot.

## Archivos

### `trades.json`
Registro completo de todos los trades ejecutados:
- Entrada y salida de cada posición
- Señales que generaron el trade
- PnL, comisiones, duración
- Metadata completa

### `daily_stats.json`
Estadísticas agregadas por día:
- Win rate diario
- PnL total y neto
- Promedio de wins/losses
- Mejor y peor trade del día

## Cómo Ver el Historial

```bash
# Ver historial completo
npx tsx view_history.ts

# Ver solo trades de hoy
npx tsx view_history.ts | grep "$(date +%Y-%m-%d)"
```

## Estructura de Datos

### TradeRecord
```typescript
{
  timestamp: string,
  symbol: string,
  side: 'long' | 'short',
  entryPrice: number,
  exitPrice?: number,
  quantity: number,
  signal: {
    type: 'long' | 'short',
    confidence: number,
    rsi: number,
    percentB: number
  },
  takeProfit: number,
  stopLoss: number,
  status: 'open' | 'closed_tp' | 'closed_sl' | 'closed_manual',
  pnl?: number,
  pnlPercent?: number,
  commissions?: number
}
```

### DailyStats
```typescript
{
  date: string,
  totalTrades: number,
  wins: number,
  losses: number,
  winRate: number,
  totalPnL: number,
  netPnL: number,
  averageWin: number,
  averageLoss: number
}
```

## Notas

- Este historial es **persistente** - sobrevive reinicios del bot
- Se actualiza automáticamente con cada trade
- Útil para analizar performance y tomar decisiones
