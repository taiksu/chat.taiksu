# DEPLOYMENT — Chat Taiksu

Guia rápido para implantar a aplicação em produção com atenção ao armazenamento de uploads.

## 1. Variáveis de ambiente essenciais
- `PORT` — porta do servidor (ex.: `3000`)
- `NODE_ENV=production`
- `SESSION_SECRET` — segredo das sessões
- `JWT_SECRET` — segredo JWT
- `DB_TYPE=mysql` — para produção
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `FILES_DIR` — caminho absoluto para armazenar uploads (IMPORTANTE)

Exemplo `.env.production` (parcial):

```
NODE_ENV=production
PORT=3000
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_NAME=chat_taiksu
DB_USER=usuario
DB_PASSWORD=sua_senha
FILES_DIR=/var/www/uploads
```

## 2. Preparar diretório de uploads
Crie o diretório absoluto e ajuste permissões:

Linux (systemd/nginx):
```bash
sudo mkdir -p /var/www/uploads
sudo chown -R www-data:www-data /var/www/uploads
sudo chmod -R 750 /var/www/uploads
```

Windows (IIS/serviços):
```powershell
New-Item -ItemType Directory -Path C:\apps\uploads -Force
# Ajuste permissões conforme usuário do serviço
```

## 3. Configurar o serviço (systemd) — exemplo
Crie `/etc/systemd/system/chat-taiksu.service` com:

```
[Unit]
Description=Chat Taiksu
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/chat.taiksu
EnvironmentFile=/var/www/chat.taiksu/.env.production
ExecStart=/usr/bin/node src/server.js
Restart=always

[Install]
WantedBy=multi-user.target
```

Depois:
```bash
sudo systemctl daemon-reload
sudo systemctl enable chat-taiksu
sudo systemctl start chat-taiksu
```

## 4. Servir uploads via Nginx (opcional)
Você pode deixar o Node servir `/uploads` ou configurar o Nginx para servir estático diretamente:

```
location /uploads/ {
    alias /var/www/uploads/;
    access_log off;
    expires 30d;
}
```

Se usar `alias`, assegure que o caminho termine com `/` e que o Nginx tenha permissão de leitura.

## 5. Backup e retenção
- Configure backups regulares do diretório `FILES_DIR` para um armazenamento externo (S3, backup em outra VM, etc.).
- Considere políticas de retenção para evitar crescimento descontrolado.

## 6. Nota sobre deploys
- Mantenha `FILES_DIR` fora do diretório do repositório — assim, pulls/updates não apagarão os uploads.
- Ao migrar uploads antigos, mova os arquivos para `FILES_DIR` antes de iniciar a nova versão.

## 7. Verificação pós-deploy
- Verifique logs do systemd: `sudo journalctl -u chat-taiksu -f`
- Teste upload pelo cliente do chat e confirme que o arquivo aparece em `FILES_DIR` e é acessível via `https://seu-dominio/uploads/<arquivo>`.

---

Se quiser, eu posso adicionar o bloco de serviço `systemd` já preenchido com seus caminhos atuais ou gerar um playbook simples para copiar uploads existentes.

## 8. Exemplos prontos (systemd e Nginx)

Arquivos de exemplo foram adicionados ao diretório `deploy/` deste repositório:

- `deploy/chat-taiksu.service` - template `systemd` (copie para `/etc/systemd/system/`):

```ini
[Unit]
Description=Chat Taiksu
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/chat.taiksu
EnvironmentFile=/var/www/chat.taiksu/.env.production
ExecStart=/usr/bin/node src/server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Instalar e iniciar:

```bash
sudo cp deploy/chat-taiksu.service /etc/systemd/system/chat-taiksu.service
sudo systemctl daemon-reload
sudo systemctl enable chat-taiksu
sudo systemctl start chat-taiksu
sudo journalctl -u chat-taiksu -f
```

- `deploy/nginx_chat_taiksu.conf` - exemplo de servidor Nginx que faz proxy para Node e serve `/uploads` diretamente. Copie esse bloco para sua configuração de site (ex.: `/etc/nginx/sites-available/example.com`) e habilite com `ln -s` para `sites-enabled`.

Após copiar o arquivo Nginx, teste e recarregue o Nginx:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Se quiser, eu adapto esses templates com seus caminhos e usuário específicos antes de você copiá-los para o servidor.