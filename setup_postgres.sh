#!/bin/bash

# ═════════════════════════════════════════════════════════════════════════
# SCRIPT DE INSTALACIÓN Y CONFIGURACIÓN DE POSTGRESQL
# Para Trading Bot - Configuración Automatizada
# ═════════════════════════════════════════════════════════════════════════

set -e  # Detener si hay errores

echo "════════════════════════════════════════════════════════════════"
echo "  INSTALACIÓN DE POSTGRESQL PARA TRADING BOT"
echo "════════════════════════════════════════════════════════════════"
echo ""

# Colores para output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 1. Verificar si Homebrew está instalado
echo "📦 Paso 1/6: Verificando Homebrew..."
if ! command -v brew &> /dev/null; then
    echo -e "${RED}❌ Homebrew no está instalado${NC}"
    echo "Por favor instala Homebrew primero: https://brew.sh"
    exit 1
fi
echo -e "${GREEN}✅ Homebrew encontrado${NC}"
echo ""

# 2. Instalar PostgreSQL
echo "🐘 Paso 2/6: Instalando PostgreSQL..."
if brew list postgresql@14 &> /dev/null; then
    echo -e "${YELLOW}⚠️  PostgreSQL 14 ya está instalado${NC}"
else
    echo "Instalando PostgreSQL 14..."
    brew install postgresql@14
    echo -e "${GREEN}✅ PostgreSQL 14 instalado${NC}"
fi
echo ""

# 3. Agregar PostgreSQL al PATH
echo "🔧 Paso 3/6: Configurando PATH..."
POSTGRES_PATH="/opt/homebrew/opt/postgresql@14/bin"

if [[ ":$PATH:" != *":$POSTGRES_PATH:"* ]]; then
    echo "Agregando PostgreSQL al PATH..."
    
    # Detectar shell
    if [ -n "$ZSH_VERSION" ]; then
        SHELL_RC="$HOME/.zshrc"
    elif [ -n "$BASH_VERSION" ]; then
        SHELL_RC="$HOME/.bashrc"
    else
        SHELL_RC="$HOME/.profile"
    fi
    
    echo "" >> $SHELL_RC
    echo "# PostgreSQL 14" >> $SHELL_RC
    echo "export PATH=\"$POSTGRES_PATH:\$PATH\"" >> $SHELL_RC
    
    # Aplicar inmediatamente
    export PATH="$POSTGRES_PATH:$PATH"
    
    echo -e "${GREEN}✅ PATH configurado${NC}"
    echo -e "${YELLOW}⚠️  Ejecuta: source $SHELL_RC${NC}"
else
    echo -e "${GREEN}✅ PATH ya configurado${NC}"
fi
echo ""

# 4. Iniciar PostgreSQL
echo "🚀 Paso 4/6: Iniciando PostgreSQL..."
brew services start postgresql@14
sleep 3  # Esperar a que inicie
echo -e "${GREEN}✅ PostgreSQL iniciado${NC}"
echo ""

# 5. Crear base de datos
echo "💾 Paso 5/6: Creando base de datos..."
DB_NAME="trading_system"

# Usar el psql de la ruta completa
PSQL_PATH="$POSTGRES_PATH/psql"

if $PSQL_PATH -lqt | cut -d \| -f 1 | grep -qw $DB_NAME; then
    echo -e "${YELLOW}⚠️  Base de datos '$DB_NAME' ya existe${NC}"
else
    $PSQL_PATH postgres -c "CREATE DATABASE $DB_NAME;"
    echo -e "${GREEN}✅ Base de datos '$DB_NAME' creada${NC}"
fi
echo ""

# 6. Ejecutar schema
echo "📋 Paso 6/6: Aplicando schema..."
SCHEMA_FILE="src/database/schema.sql"

if [ -f "$SCHEMA_FILE" ]; then
    $PSQL_PATH $DB_NAME -f $SCHEMA_FILE
    echo -e "${GREEN}✅ Schema aplicado correctamente${NC}"
else
    echo -e "${RED}❌ No se encontró $SCHEMA_FILE${NC}"
    exit 1
fi
echo ""

# Verificación final
echo "════════════════════════════════════════════════════════════════"
echo "  ✅ INSTALACIÓN COMPLETADA"
echo "════════════════════════════════════════════════════════════════"
echo ""
echo "📊 Verificando instalación..."
echo ""

# Mostrar versión
$PSQL_PATH --version

# Listar tablas creadas
echo ""
echo "📋 Tablas creadas:"
$PSQL_PATH $DB_NAME -c "\dt"

echo ""
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  🎉 PostgreSQL está listo para usar${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════════════════${NC}"
echo ""
echo "DATABASE_URL actual en .env:"
echo "postgresql://localhost:5432/trading_system"
echo ""
echo "Para conectarte manualmente:"
echo -e "${YELLOW}$PSQL_PATH $DB_NAME${NC}"
echo ""
echo -e "${GREEN}✅ Puedes ejecutar: npm start${NC}"
echo ""
