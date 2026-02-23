# 📋 Como Fazer Deploy com Git

## 🎯 Resumo Rápido

Você tem dois ambientes:

1. **Desenvolvimento (localhost)** - SQLite
2. **Produção (servidor)** - MySQL

O código automaticamente detecta qual banco usar baseado em `DB_TYPE` no `.env`

## 🔧 Configuração no Servidor

### 1. Criar estrutura de pastas
```bash
sudo mkdir -p /var/www/chat.taiksu/{app,chat.git}
sudo chown -R www-data:www-data /var/www/chat.taiksu
```

### 2. Inicializar repositório nu (bare)
```bash
cd /var/www/chat.taiksu/chat.git
git init --bare
```

### 3. Criar hook de auto-deploy
```bash
cat > /var/www/chat.taiksu/chat.git/hooks/post-receive << 'EOF'
#!/bin/bash
export GIT_WORK_TREE=/var/www/chat.taiksu/app
export GIT_DIR=/var/www/chat.taiksu/chat.git
git checkout -f

cd $GIT_WORK_TREE
npm install
bash deploy.sh
EOF

chmod +x /var/www/chat.taiksu/chat.git/hooks/post-receive
sudo chown -R www-data:www-data /var/www/chat.taiksu
```

### 4. Configurar MySQL
```bash
# Criar banco e usuário
mysql -u root -p << 'EOF'
CREATE DATABASE chat_taiksu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'chat_user'@'localhost' IDENTIFIED BY 'sua_senha_segura';
GRANT ALL PRIVILEGES ON chat_taiksu.* TO 'chat_user'@'localhost';
FLUSH PRIVILEGES;
EOF
```

### 5. Criar arquivo de configuração
```bash
sudo nano /var/www/chat.taiksu/app/.env.production.local
```

Cole:
```env
NODE_ENV=production
PORT=3000
SESSION_SECRET=gerar_chave_aleatoria_segura_aqui
JWT_SECRET=gerar_outra_chave_aleatoria_segura_aqui
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=chat_taiksu
DB_USER=chat_user
DB_PASSWORD=sua_senha_segura
SSO_URL=https://login.taiksu.com.br
SSO_VALIDATE_ENDPOINT=/api/user/me
```

Salvar: `Ctrl+X` → `Y` → `Enter`

```bash
sudo chmod 600 /var/www/chat.taiksu/app/.env.production.local
```

### 6. Criar serviço systemd
```bash
sudo nano /etc/systemd/system/chat-taiksu.service
```

Cole:
```ini
[Unit]
Description=Chat Taiksu
After=network.target mysql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/chat.taiksu/app
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=10
EnvironmentFile=/var/www/chat.taiksu/app/.env.production.local
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
```

Ativar:
```bash
sudo systemctl daemon-reload
sudo systemctl enable chat-taiksu
sudo systemctl start chat-taiksu
```

## 💻 Fazer Push do Seu Computador

### 1. Adicionar origin do servidor (primeira vez)
```bash
cd c:\apps\chat.taiksu
git remote add production ssh://usuario@seu-servidor:/var/www/chat.taiksu/chat.git
```

### 2. Fazer commit e push
```bash
git add .
git commit -m "Deploy: descrição das mudanças"
git push production main
```

### 3. Pronto! ✅
O servidor irá automaticamente:
- ✅ Puxar código
- ✅ Instalar dependências
- ✅ Executar seed
- ✅ Reiniciar serviço
- ✅ Validar se está rodando

## 📊 Monitorar Deploys

### Ver logs de deploy
```bash
tail -f /var/log/chat-taiksu-deploy.log
```

### Ver logs da aplicação
```bash
sudo journalctl -u chat-taiksu -f
```

### Status do serviço
```bash
sudo systemctl status chat-taiksu
```

## 🔄 Fluxo Completo

```
Você (localhost)
    ↓
git add . && git commit -m "..."
    ↓
git push production main
    ↓
Servidor recebe push
    ↓
Hook post-receive executa
    ↓
deploy.sh roda automaticamente
    ↓
npm install (instala dependências)
    ↓
npm run seed (cria/atualiza banco)
    ↓
systemctl restart chat-taiksu
    ↓
✅ Nova versão online!
```

## ⚠️ Importante!

1. **Nunca commitar `.env.production.local`** - Arquivo sensível!
2. **Usar SSH key** - Não digitar senha toda vez
3. **Fazer backup** - Antes de grandes mudanças
4. **Testar localmente primeiro** - `npm start` antes de push

## 🐛 Troubleshooting

### Erro de permissão SSH
```bash
# Gerar chave SSH (se não tiver)
ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa

# Copiar para servidor
ssh-copy-id -i ~/.ssh/id_rsa.pub usuario@seu-servidor

# Testar
ssh usuario@seu-servidor
```

### Erro de aplicação após deploy
```bash
sudo journalctl -u chat-taiksu -n 50
sudo systemctl stop chat-taiksu
cd /var/www/chat.taiksu/app
npm start  # para testar manualmente
```

### Erro de banco MySQL
```bash
# Verificar conexão
mysql -h localhost -u chat_user -p chat_taiksu

# Reinicializar banco
node src/init-mysql.js
npm run seed
```

---

**Pronto para fazer seu primeiro deploy!** 🚀
