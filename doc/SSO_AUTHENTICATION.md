# Autenticação SSO - Chat Taiksu

## 🔐 Visão Geral

O Chat Taiksu suporta autenticação centralizada via SSO (Single Sign-On) com o servidor `login.taiksu.com.br`. Isso permite que aplicações externas utilizem o chat sem gerenciar suas próprias sessões de autenticação.

## 🚀 Como Funciona

### Fluxo de Autenticação

1. **Aplicação Cliente** obtém um token JWT do servidor SSO
2. **Cliente** envia o token para o Chat Taiksu via endpoint `/api/auth/sso/validate`
3. **Chat Taiksu** valida o token consultando `https://login.taiksu.com.br/api/user/me`
4. **Servidor SSO** retorna dados do usuário
5. **Chat Taiksu** sincroniza o usuário no banco local e cria a sessão
6. **Cliente** pode agora acessar todos os recursos do chat

## ⚙️ Configuração

### Variáveis de Ambiente (.env)

```env
# SSO Configuration
SSO_URL=https://login.taiksu.com.br
SSO_VALIDATE_ENDPOINT=/api/user/me
SSO_TIMEOUT=5000
ENABLE_SSO=true
```

| Variável | Descrição | Padrão |
|----------|-----------|--------|
| `SSO_URL` | URL base do servidor SSO | https://login.taiksu.com.br |
| `SSO_VALIDATE_ENDPOINT` | Endpoint para validar token | /api/user/me |
| `SSO_TIMEOUT` | Timeout para validação (ms) | 5000 |
| `ENABLE_SSO` | Ativar autenticação SSO | true |

## 🔌 API Endpoints

### 1. Validar Token e Criar Sessão
```http
POST /api/auth/sso/validate
Content-Type: application/json

{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Resposta Sucesso (200):**
```json
{
  "success": true,
  "message": "Autenticação bem-sucedida",
  "user": {
    "id": "uuid-123",
    "name": "Bruno da Silva",
    "email": "bruno@example.com",
    "avatar": "https://...",
    "role": "user"
  }
}
```

**Resposta Erro (401):**
```json
{
  "success": false,
  "message": "Token inválido ou expirado"
}
```

### 2. Obter Dados do Usuário Autenticado
```http
GET /api/auth/sso/me
Authorization: Bearer <token>
Accept: application/json
```

**Resposta:**
```json
{
  "success": true,
  "user": {
    "id": "uuid-123",
    "name": "Bruno da Silva",
    "email": "bruno@example.com",
    "avatar": "https://...",
    "role": "user",
    "sso": true
  },
  "ssoData": {
    "id": 19,
    "name": "Bruno da Silva Pissinatti",
    "email": "pissinatti2019@gmail.com",
    "foto": "https://login.taiksu.com.br/frontend/profiles/...",
    "pin": "1099",
    "status": "ativo",
    "cpf": "022.794.582-41",
    "grupo_id": 5,
    "grupo_nome": "Desenvolvedor",
    "permissions": [],
    "unidade": { ... }
  }
}
```

### 3. Fazer Logout
```http
POST /api/auth/sso/logout
Authorization: Bearer <token>
```

**Resposta:**
```json
{
  "success": true,
  "message": "Desconectado com sucesso"
}
```

## 📱 Exemplo de Integração (Frontend)

### JavaScript / React

```javascript
// 1. Obter token do SSO (realizado na aplicação cliente)
const ssoToken = localStorage.getItem('sso_token');

// 2. Validar token no Chat Taiksu
async function validateSSOToken(token) {
  const response = await fetch('http://chat.taiksu.local:3000/api/auth/sso/validate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ token })
  });

  const data = await response.json();
  
  if (data.success) {
    console.log('Usuário autenticado:', data.user);
    // Guardar sessão localmente se necessário
    sessionStorage.setItem('user', JSON.stringify(data.user));
    return data.user;
  } else {
    console.error('Erro na autenticação:', data.message);
    return null;
  }
}

// 3. Usar o token para acessar recursos autenticados
async function sendChatMessage(roomId, message, token) {
  const response = await fetch(`http://chat.taiksu.local:3000/api/messages/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      roomId,
      content: message,
      type: 'text'
    })
  });

  return response.json();
}
```

### HTML + Fetch

```html
<!DOCTYPE html>
<html>
<head>
  <title>Chat Integrado</title>
</head>
<body>
  <div id="chat-container"></div>

  <script>
    const SSO_TOKEN = '{{sso_token}}'; // Vindo da aplicação cliente
    const CHAT_API = 'http://chat.taiksu.local:3000';

    // Autenticar
    fetch(`${CHAT_API}/api/auth/sso/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: SSO_TOKEN })
    })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        console.log('Autenticado como:', data.user.name);
        // Inicializar chat
        initializeChat(data.user, SSO_TOKEN);
      }
    });

    function initializeChat(user, token) {
      // Implementar lógica do chat aqui
      // Usar token em requisições autenticadas
    }
  </script>
</body>
</html>
```

## 🛡️ Segurança

### Pontos Importantes

1. **Validação de Token**
   - Sempre validar tokens via HTTPS
   - Tokens são validados contra o servidor SSO real
   - Timeout de 5 segundos para evitar travamentos

2. **Sincronização de Usuários**
   - Usuários são criados/atualizados automaticamente no banco local
   - Dados sensíveis (senha) não são armazenados para usuários SSO

3. **Sessão**
   - Sessões têm duração de 24 horas
   - Cookie seguro (HTTPS em produção)

4. **CORS**
   - Configurado para aceitar requisições de diferentes origins
   - Adicionar validação de domínios conforme necessário

## 🔄 Sincronização de Usuários

Quando um token é validado, o Chat Taiksu:

1. Consulta o servidor SSO com o token
2. Recebe dados completos do usuário (nome, email, foto, unidade, etc)
3. Procura o usuário no banco local pelo email
4. **Se não existe**: Cria novo usuário com dados do SSO
5. **Se existe**: Atualiza nome, avatar e role

Campos sincronizados:
- `name` - Nome completo do usuário
- `email` - Email
- `avatar` - URL da foto de perfil
- `role` - 'admin' se grupo_nome é 'Desenvolvedor', caso contrário 'user'
- `sso_id` - ID do usuário no SSO
- `sso_data` - Dados completos em JSON (unidade, permissions, etc)

## 📊 Dados Retornados pelo SSO

O endpoint do SSO (`/api/user/me`) retorna:

```json
{
  "id": 19,
  "name": "Bruno da Silva Pissinatti",
  "email": "pissinatti2019@gmail.com",
  "foto": "https://login.taiksu.com.br/frontend/profiles/68fff39fe1ba7.jpg",
  "pin": "1099",
  "status": "ativo",
  "cpf": "022.794.582-41",
  "grupo_id": 5,
  "grupo_nome": "Desenvolvedor",
  "permissions": [],
  "unidade": {
    "id": 8,
    "cep": "76900-058",
    "cidade": "Ji-Paraná",
    "bairro": "Centro",
    "rua": "Av. Marechal Rondon",
    "numero": "630",
    "cnpj": "54.643.082/0001-11",
    "estado": "RO",
    "status": 1,
    "telefone": "55699936519",
    "link_cardapio": "https://pedido.anota.ai/loja/taiksu-sushi-jiparana-1",
    "photo_path": "jipa.png",
    "data_abertura": "01/01/2023 07:44:59",
    "ultima_atualizacao": "30/10/2025 22:34:59"
  },
  "whatsapp_umbler": "5569984791753"
}
```

## 🐛 Troubleshooting

### Token inválido
- Verificar se o token está correto
- Verificar se o SSO_URL está configurado
- Verificar se o servidor SSO está acessível

### Timeout na validação
- Aumentar `SSO_TIMEOUT` se a rede for lenta
- Verificar conectividade com o servidor SSO

### Usuário não sincronizado
- Verificar logs do servidor
- Garantir que email retornado do SSO é válido
- Verificar se há campos obrigatórios faltando

## 📝 Notas

- Todas as requisições autenticadas devem incluir o header `Authorization: Bearer <token>`
- Cookies de sessão são criados automaticamente
- O sistema suporta múltiplos usuários da mesma aplicação
- Sincronização ocorre uma única vez (na primeira validação do token)

