#!/bin/bash
# Script de deploy automático para Chat Taiksu
# Este arquivo deve estar em: /var/www/chat.taiksu/deploy.sh

set -e  # Parar em caso de erro

DEPLOY_DIR="/var/www/chat.taiksu/app"
LOG_FILE="/var/log/chat-taiksu-deploy.log"
APP_USER="www-data"
APP_GROUP="www-data"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
  echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
  exit 1
}

warning() {
  echo -e "${YELLOW}[WARN]${NC} $1" | tee -a "$LOG_FILE"
}

log "═══════════════════════════════════════════════════"
log "🚀 Iniciando Deploy - Chat Taiksu"
log "═══════════════════════════════════════════════════"

# 1. Atualizar código
log "\n📥 Atualizando código do repositório..."
cd "$DEPLOY_DIR"
git fetch origin main || error "Falha ao fazer fetch"
git reset --hard origin/main || error "Falha ao fazer reset"

# 2. Instalar dependências
log "\n📦 Instalando dependências..."
npm ci --prefer-offline --no-audit || error "Falha ao instalar dependências"

# 3. Verificar tipo de banco de dados
if grep -q "DB_TYPE=mysql" .env.production.local 2>/dev/null; then
  log "\n🗄️  Banco MySQL detectado"
  
  # 4. Executar migrations/seed
  log "\n🌱 Executando seed..."
  npm run seed || warning "Seed pode ter tido problemas"
else
  log "\n🗄️  Banco SQLite detectado"
fi

# 5. Parar aplicação anterior
log "\n⏹️  Parando serviço anterior..."
systemctl stop chat-taiksu || warning "Serviço não estava rodando"

# 6. Iniciar nova versão
log "\n▶️  Iniciando nova versão..."
systemctl start chat-taiksu || error "Falha ao iniciar serviço"

# 7. Verificar status
sleep 2
if systemctl is-active --quiet chat-taiksu; then
  log "✅ Serviço rodando corretamente"
else
  error "Serviço não está rodando!"
fi

# 8. Verificar conectividade
log "\n🔍 Verificando conectividade..."
if curl -s http://localhost:3000 > /dev/null; then
  log "✅ Aplicação respondendo em HTTP"
else
  warning "Aplicação não respondendo em HTTP (pode ser esperado se HTTPS)"
fi

log "\n═══════════════════════════════════════════════════"
log "✅ Deploy concluído com sucesso!"
log "═══════════════════════════════════════════════════\n"

# Enviar notificação (opcional)
# curl -X POST https://seu-webhook.com/deploy \
#   -H "Content-Type: application/json" \
#   -d "{\"status\": \"success\", \"timestamp\": \"$(date)\"}"

exit 0
