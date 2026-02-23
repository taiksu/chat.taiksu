# 🚀 Guia de Deploy - Chat Taiksu

## Arquitetura

O Chat Taiksu suporta dois ambientes:

```
┌─────────────────────────────────────────────┐
│          DESENVOLVIMENTO (localhost)         │
│  ✅ SQLite (banco.db local)                 │
│  ✅ Fácil de testar e debugar              │
│  ✅ Sem dependências externas              │
└─────────────────────────────────────────────┘
                     ⬇️
          npm run dev (nodemon)
                     ⬇️
┌─────────────────────────────────────────────┐
│         PRODUÇÃO (seu servidor)              │
│  ✅ MySQL (banco dados centralizado)        │
│  ✅ Escalável e robusto                    │
│  ✅ Múltiplas instâncias possíveis        │
└─────────────────────────────────────────────┘
```

## 📦 Pré-requisitos

### Desenvolvimento
- Node.js 18+
- npm ou yarn
- Nenhuma dependência de banco de dados

### Produção
- Node.js 18+
- MySQL 5.7+
- Servidor Linux (recomendado)
- Git (para CI/CD)

## 🔄 Deploy com Git

### 1. Criar Repository

```bash
# No servidor de produção
mkdir /var/www/chat.taiksu
cd /var/www/chat.taiksu
git init --bare chat.git

# Criar hook para auto-deploy
cat > chat.git/hooks/post-receive << 'EOF'
#!/bin/bash
cd /var/www/chat.taiksu/app
git checkout -f
npm install
npm run seed
systemctl restart chat-taiksu
EOF

chmod +x chat.git/hooks/post-receive
```

### 2. Configurar Origem

```bash
# No seu computador local
cd c:\apps\chat.taiksu

git remote add production usuario@seu-servidor:/var/www/chat.taiksu/chat.git

# Fazer commit e push
git add .
git commit -m "Deploy: Nova versão do chat"
git push production main
```

### 3. Automaticamente irá:
- ✅ Puxar código atualizado
- ✅ Instalar dependências
- ✅ Executar seed (se necessário)
- ✅ Reiniciar serviço

## 🗄️ Migração de SQLite para MySQL

### Opção 1: Inicializar MySQL (Recomendado)

```bash
# Remover ou atualizar .env
cat > .env << 'EOF'
PORT=3000
NODE_ENV=production
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=chat_taiksu
DB_USER=chat_user
DB_PASSWORD=sua_senha_segura
EOF

# Criar banco de dados e tabelas
node src/init-mysql.js

# Executar seed (cria dados de teste)
npm run seed

# Iniciar servidor
npm start
```

### Opção 2: Migrar Dados Existentes

```javascript
// Script: src/migrate-sqlite-to-mysql.js
const sqlite = require('sqlite3');
const mysql = require('mysql2/promise');

async function migrate() {
  // Implementar lógica de migração
  // 1. Ler dados do SQLite
  // 2. Inserir no MySQL
}

migrate();
```

## 🔐 Segurança em Produção

### 1. Variáveis de Ambiente

```bash
# NUNCA commit .env em git
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore

# Usar .env.production.local no servidor
cat > /var/www/chat.taiksu/app/.env.production.local << 'EOF'
NODE_ENV=production
SESSION_SECRET=chave-aleatoria-muito-segura-32-caracteres
JWT_SECRET=outra-chave-aleatoria-muito-segura-32-caracteres
DB_PASSWORD=senha_mysql_segura
SSO_URL=https://login.taiksu.com.br
EOF

chmod 600 .env.production.local
```

### 2. Certificados SSL

```bash
# Usar Let's Encrypt + Certbot
sudo certbot certonly -d chat.taiksu.com

# Nginx/Apache já configurado com certificados
```

### 3. MySQL Seguro

```bash
# Criar usuário específico do Chat
mysql -u root -p << 'EOF'
CREATE USER 'chat_user'@'localhost' IDENTIFIED BY 'senha_segura';
GRANT ALL PRIVILEGES ON chat_taiksu.* TO 'chat_user'@'localhost';
FLUSH PRIVILEGES;
EOF
```

## 🔧 Systemd Service (Linux)

```bash
# Criar arquivo de serviço
sudo nano /etc/systemd/system/chat-taiksu.service
```

```ini
[Unit]
Description=Chat Taiksu - Aplicação de Chat
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/chat.taiksu/app
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
EnvironmentFile=/var/www/chat.taiksu/app/.env.production.local

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=chat-taiksu

[Install]
WantedBy=multi-user.target
```

```bash
# Ativar serviço
sudo systemctl daemon-reload
sudo systemctl enable chat-taiksu
sudo systemctl start chat-taiksu

# Verificar status
sudo systemctl status chat-taiksu
sudo journalctl -u chat-taiksu -f
```

## 📊 Nginx Reverse Proxy

```nginx
upstream chat_taiksu {
    server 127.0.0.1:3000;
}

server {
    listen 443 ssl http2;
    server_name chat.taiksu.com;

    ssl_certificate /etc/letsencrypt/live/chat.taiksu.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/chat.taiksu.com/privkey.pem;

    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Compressão
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Cache
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=chat_cache:10m;

    location / {
        proxy_pass http://chat_taiksu;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # SSE (Server-Sent Events)
    location /api/messages/stream/ {
        proxy_pass http://chat_taiksu;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_cache off;
        proxy_set_header Connection "";
    }
}

# Redirecionar HTTP para HTTPS
server {
    listen 80;
    server_name chat.taiksu.com;
    return 301 https://$server_name$request_uri;
}
```

## 📝 Checklist de Deploy

- [ ] Variáveis de ambiente configuradas
- [ ] Banco MySQL criado e testado
- [ ] SSL/HTTPS configurado
- [ ] Backups configurados
- [ ] Logs configurados
- [ ] Monitoramento ativo
- [ ] Fire wall com portas corretas
- [ ] Rate limiting ativo
- [ ] CORS configurado para domínio correto
- [ ] SSO validando contra servidor centralizado

## 🐛 Troubleshooting

### Erro de conexão MySQL
```bash
# Verificar credenciais
mysql -h localhost -u chat_user -p chat_taiksu

# Verificar permissões
mysql -u root -p
> SHOW GRANTS FOR 'chat_user'@'localhost';
```

### Serviço não inicia
```bash
sudo journalctl -u chat-taiksu -n 50
npm start  # teste local primeiro
```

### Banco de dados não encontrado
```bash
node src/init-mysql.js
npm run seed
```

## 📞 Suporte

Para dúvidas ou problemas:
1. Verificar logs: `sudo journalctl -u chat-taiksu`
2. Testar localmente primeiro
3. Consultar documentação: `SSO_AUTHENTICATION.md`

---

**Data**: 23 de Fevereiro de 2026  
**Versão**: 1.0.0  
**Status**: Production Ready ✅
