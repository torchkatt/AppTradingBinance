#!/bin/bash

echo ""
echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║           SISTEMA DE TRADING - ESTADO ACTUAL                 ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# Verificar Node.js
echo "📦 Node.js:"
if command -v node &> /dev/null; then
    node_version=$(node -v)
    echo "   ✅ Instalado: $node_version"
else
    echo "   ❌ No instalado"
    exit 1
fi

# Verificar dependencias
echo ""
echo "📚 Dependencias de npm:"
if [ -d "node_modules" ]; then
    echo "   ✅ Instaladas ($(ls -1 node_modules | wc -l | xargs) paquetes)"
else
    echo "   ❌ No instaladas - ejecuta: npm install"
fi

# Verificar archivo .env
echo ""
echo "⚙️  Configuración (.env):"
if [ -f ".env" ]; then
    echo "   ✅ Archivo .env existe"
    
    # Verificar campos críticos
    if grep -q "EXCHANGE_API_KEY=YOUR_API_KEY_HERE" .env; then
        echo "   ⚠️  API_KEY no configurado - edita .env"
    else
        echo "   ✅ API_KEY configurado"
    fi
    
    if grep -q "EXCHANGE_TESTNET=true" .env; then
        echo "   ✅ Modo TESTNET activado (seguro)"
    else
        echo "   🔴 Modo LIVE activado - ¡cuidado!"
    fi
else
    echo "   ❌ Archivo .env no existe"
fi

# Verificar PostgreSQL
echo ""
echo "🗄️  PostgreSQL:"
if command -v psql &> /dev/null; then
    echo "   ✅ Instalado"
    if psql -lqt | cut -d \| -f 1 | grep -qw trading_system; then
        echo "   ✅ Base de datos 'trading_system' existe"
    else
        echo "   ⚠️  Base de datos no existe - ejecuta: createdb trading_system"
    fi
else
    echo "   ⚠️  No instalado (opcional)"
fi

# Verificar compilación TypeScript
echo ""
echo "🔨 Compilación:"
if [ -d "dist" ]; then
    echo "   ✅ Proyecto compilado"
else
    echo "   ℹ️  No compilado - ejecuta: npm run build (opcional para dev)"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""
echo "💡 Próximos pasos:"
echo ""

# Determinar qué falta
needs_install=false
needs_config=false

if [ ! -d "node_modules" ]; then
    needs_install=true
fi

if [ ! -f ".env" ] || grep -q "YOUR_API_KEY_HERE" .env; then
    needs_config=true
fi

if [ "$needs_install" = true ]; then
    echo "1. Instalar dependencias:"
    echo "   npm install"
    echo ""
fi

if [ "$needs_config" = true ]; then
    echo "2. Configurar credenciales:"
    echo "   - Lee: SETUP_GUIDE.md"
    echo "   - Edita: .env"
    echo ""
fi

if [ "$needs_install" = false ] && [ "$needs_config" = false ]; then
    echo "✅ ¡Todo listo! Puedes:"
    echo ""
    echo "   npm run health-check    # Verificar configuración"
    echo "   npm run backtest --     # Hacer backtesting"
    echo "   npm run bot            # Iniciar en modo desarrollo"
    echo ""
fi

echo "═══════════════════════════════════════════════════════════════"
echo ""
