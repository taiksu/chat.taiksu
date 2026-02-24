# API de Status de Sala (Room Status)

## Visão Geral

Novo recurso adicionado para verificar o status de uma sala de chat (room) e determinar se está em modo read-only (somente leitura). Isso permite bloquear o envio de mensagens quando um chamado está fechado.

## Endpoints

### GET `/api/messages/room-status/:roomId`

Retorna o status atual de uma sala e se está em modo read-only baseado no status do chamado.

**Autenticação**: Requerida (Bearer Token)

**Parâmetros de Rota**:
- `roomId` (string, obrigatório): Identificador único da sala

**Resposta de Sucesso (200)**:
```json
{
  "code": "room_status",
  "success": true,
  "roomId": "abc123def456",
  "status": "open",
  "isReadOnly": false,
  "message": null
}
```

**Resposta quando Fechado (200)**:
```json
{
  "code": "room_status",
  "success": true,
  "roomId": "abc123def456",
  "status": "closed",
  "isReadOnly": true,
  "message": "Este chamado foi fechado. Você pode visualizar o histórico, mas não pode enviar novas mensagens."
}
```

**Resposta de Erro (400/500)**:
```json
{
  "code": "status_error",
  "success": false,
  "error": "Descrição do erro",
  "isReadOnly": true
}
```

## Modelos de Dados

### ChatRoom (Atualizado)

Novo campo adicionado ao modelo `ChatRoom`:

```javascript
{
  id: STRING(64) PRIMARY KEY,
  name: STRING(255),
  type: STRING(64),
  description: TEXT,
  owner_id: STRING(64),
  status: STRING(32) DEFAULT 'open',  // 'open' ou 'closed'
  created_at: DATE,
  updated_at: DATE
}
```

**Valores Válidos de Status**:
- `open`: Sala aberta para novas mensagens
- `closed`: Sala fechada, apenas leitura

## Métodos do Modelo ChatRoom

### `getRoomStatus(roomId)`

**Descrição**: Obtém o status de uma sala e se está em read-only

**Retorno**:
```javascript
{
  roomId: string,
  status: string ('open' | 'closed' | 'not_found' | 'error'),
  isReadOnly: boolean,
  message: string | null
}
```

### `closeRoom(roomId)`

**Descrição**: Fecha uma sala (muda status para 'closed')

**Retorno**:
```javascript
{
  success: boolean,
  status: 'closed' | undefined,
  error: string | undefined
}
```

**Exemplo**:
```javascript
const result = await ChatRoom.closeRoom('room-123');
if (result.success) {
  console.log('Sala fechada com sucesso');
}
```

### `reopenRoom(roomId)`

**Descrição**: Reabre uma sala (muda status para 'open')

**Retorno**:
```javascript
{
  success: boolean,
  status: 'open' | undefined,
  error: string | undefined
}
```

**Exemplo**:
```javascript
const result = await ChatRoom.reopenRoom('room-123');
if (result.success) {
  console.log('Sala reabierta com sucesso');
}
```

## Integração no Widget

### Novo Comportamento

O widget Taiksu agora:

1. **Verifica o status ao abrir**: Quando o widget é aberto, faz uma requisição ao endpoint para obter o status da sala
2. **Verifica periodicamente**: A cada 30 segundos, verifica o status enquanto a sala está aberta
3. **Bloqueia automaticamente**: Se a sala estiver em read-only, desabilita automaticamente:
   - Campo de entrada de texto
   - Botão de anexar arquivo
   - Botão de enviar mensagem
   - Botão de microphone

### Variáveis de Estado

```javascript
statusCheckTimer;     // Timer para verificação periódica
roomStatus: {
  isReadOnly: false,
  message: null
}                    // Estado atual do status da sala
```

### Novas Funções

#### `checkRoomStatus()`
Faz uma requisição GET para `/api/messages/room-status/:roomId` e atualiza o estado local do widget.

#### `stopStatusCheck()`
Para o timer de verificação periódica.

#### `scheduleStatusCheck()`
Agenda a próxima verificação de status após 30 segundos.

## Exemplos de Uso

### Backend - Fechar um Chamado

```javascript
const ChatRoom = require('./models/ChatRoom');

// Fechar uma sala
const result = await ChatRoom.closeRoom('room-id-123');

if (result.success) {
  console.log('Chamado fechado com sucesso');
  // Notificar clientes via WebSocket/SSE se necessário
}
```

### Backend - Em um Controller

```javascript
async closeChamado(req, res) {
  try {
    const { roomId } = req.params;
    
    const result = await ChatRoom.closeRoom(roomId);
    
    if (result.success) {
      // Opcionalmente, notificar via SSE
      broadcastRoomEvent(roomId, {
        type: 'room_closed',
        status: 'closed'
      });
      
      return res.json({ success: true, message: 'Chamado fechado' });
    }
    
    return res.status(500).json({ success: false, error: result.error });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
}
```

### Frontend - Inicializar Widget com Verificação

```javascript
// O widget automaticamente verifica o status ao inicializar
window.TaiksuChat.init({
  serverUrl: 'http://localhost:3000',
  roomId: 'room-123',
  userId: 'user-456',
  authToken: 'seu-token-jwt',
  autoOpen: true
});

// Quando a sala é fechada, o composer é automaticamente desabilitado
```

## Fluxo de Verificação no Widget

```
1. Widget é aberto (openWidget)
   ↓
2. checkRoomStatus() é chamado
   ↓
3. GET /api/messages/room-status/:roomId
   ↓
4. Se isReadOnly = true:
   - setComposerDisabled(true, message)
   - Desabilita input, buttons, etc
   ↓
5. scheduleStatusCheck() agenda próxima verificação em 30s
   ↓
6. Cada 30s, repete 2-5 enquanto widget estiver aberto
   ↓
7. Ao fechar widget (closeWidget):
   - stopStatusCheck() cancela timer
```

## Notas Importantes

1. **Sincronização Automática de Banco**: O novo campo `status` é criado automaticamente na primeira execução do sistema através do Sequelize sync.

2. **Compatibilidade Retrógrada**: Salas existentes mantêm o valor padrão `status = 'open'`.

3. **Verificação Periódica**: A verificação a cada 30 segundos garante que mudanças de status sejam refletidas rapidamente no cliente.

4. **SSE Optional**: Pode-se adicionar notificação via SSE para informar instantaneamente sobre mudanças de status (implementação futura).

5. **Tratamento de Erros**: Se a verificação falhar, o widget mantém o estado anterior e tenta novamente em 30 segundos.

## Próximas Melhorias Sugeridas

- [ ] Adicionar notificação real-time via SSE sobre mudança de status
- [ ] Adicionar endpoint POST `/api/messages/room-status/:roomId` para fechar/reabrir salas
- [ ] Armazenar timestamp de quando a sala foi fechada
- [ ] Adicionar razão de fechamento (campo `closed_reason`)
- [ ] Notificar usuários com mensagem de sistema quando sala é fechada
