/**
 * Middleware para validação de tokens SSO
 * Valida tokens contra o servidor SSO centralizado
 */

/**
 * Valida um token Bearer contra o servidor SSO
 * @param {string} token - Token JWT/Bearer a validar
 * @returns {Promise<Object>} - Dados do usuário ou null se inválido
 */
async function validateSSOToken(token) {
  if (!token) {
    console.log('🔴 SSO: Token não fornecido');
    return null;
  }

  try {
    const ssoUrl = process.env.SSO_URL;
    const endpoint = process.env.SSO_VALIDATE_ENDPOINT;
    const timeout = parseInt(process.env.SSO_TIMEOUT || '5000');

    console.log('🔵 SSO: Iniciando validação');
    console.log(`  📍 URL: ${ssoUrl}${endpoint}`);
    console.log(`  ⏱️ Timeout: ${timeout}ms`);
    console.log(`  🔑 Token: ${token.substring(0, 20)}...${token.substring(token.length - 10)}`);

    if (!ssoUrl || !endpoint) {
      console.error('❌ SSO não configurado nas variáveis de ambiente');
      return null;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('⚠️ SSO: Timeout na requisição');
      controller.abort();
    }, timeout);

    console.log('📤 Enviando requisição para SSO...');
    
    const response = await fetch(`${ssoUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    console.log(`📥 Resposta recebida: Status ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ SSO validation failed: ${response.status}`);
      console.error(`   Resposta: ${errorText}`);
      return null;
    }

    const userData = await response.json();
    console.log(`✅ SSO: Validação bem-sucedida para usuário ${userData.email}`);
    return userData;
  } catch (error) {
    console.error('❌ Erro ao validar token SSO:');
    console.error(`   Nome: ${error.name}`);
    console.error(`   Mensagem: ${error.message}`);
    console.error(`   Stack: ${error.stack}`);
    return null;
  }
}

/**
 * Middleware para validar token SSO do header Authorization
 */
function ssoAuthMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return next();
  }

  const token = authHeader.replace('Bearer ', '');
  
  validateSSOToken(token).then(userData => {
    if (userData) {
      // Armazenar dados do SSO na sessão
      req.ssoUser = userData;
      req.session.ssoUser = userData;
      req.session.user = {
        id: userData.id.toString(),
        name: userData.name,
        email: userData.email,
        avatar: userData.foto || null,
        role: userData.grupo_nome === 'Administrador' ? 'admin' : 'user',
        sso: true,
        ssoDados: userData
      };
    }
    next();
  });
}

module.exports = {
  validateSSOToken,
  ssoAuthMiddleware
};
