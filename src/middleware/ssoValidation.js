/**
 * Middleware para validacao de tokens SSO
 */

function maskToken(token) {
  if (!token || token.length < 16) return '[token-curto]';
  return `${token.slice(0, 10)}...${token.slice(-8)}`;
}

async function validateSSOTokenDetailed(token) {
  if (!token) {
    return {
      ok: false,
      status: 0,
      error: 'missing_token',
      message: 'Token nao fornecido'
    };
  }

  const ssoUrl = process.env.SSO_URL;
  const endpoint = process.env.SSO_VALIDATE_ENDPOINT;
  const timeout = Number.parseInt(process.env.SSO_TIMEOUT || '5000', 10);

  if (!ssoUrl || !endpoint) {
    return {
      ok: false,
      status: 0,
      error: 'sso_not_configured',
      message: 'SSO_URL/SSO_VALIDATE_ENDPOINT nao configurados'
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  const target = `${ssoUrl}${endpoint}`;

  try {
    console.log(`[SSO] Validando token em ${target} token=${maskToken(token)}`);

    const response = await fetch(target, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const responseBody = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: 'sso_http_error',
        message: `SSO respondeu ${response.status}`,
        responseBody
      };
    }

    let userData = null;
    try {
      userData = JSON.parse(responseBody);
    } catch (_e) {
      return {
        ok: false,
        status: response.status,
        error: 'invalid_json',
        message: 'Resposta do SSO nao e JSON valido',
        responseBody
      };
    }

    return {
      ok: true,
      status: response.status,
      userData
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      status: 0,
      error: error.name === 'AbortError' ? 'timeout' : 'network_error',
      message: error.message
    };
  }
}

async function validateSSOToken(token) {
  const result = await validateSSOTokenDetailed(token);
  if (!result.ok) {
    console.error('[SSO] Falha na validacao:', {
      status: result.status,
      error: result.error,
      message: result.message,
      responseBody: result.responseBody
    });
    return null;
  }
  return result.userData;
}

function ssoAuthMiddleware(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();

  validateSSOToken(token)
    .then((userData) => {
      if (userData) {
        req.ssoUser = userData;
        req.session.ssoUser = userData;
        req.session.user = {
          id: userData.id?.toString(),
          name: userData.name,
          email: userData.email,
          avatar: userData.foto || null,
          role: userData.grupo_nome === 'Desenvolvedor' ? 'admin' : 'user',
          sso: true,
          ssoDados: userData
        };
      }
      next();
    })
    .catch((err) => {
      console.error('[SSO] Erro no middleware:', err);
      next();
    });
}

module.exports = {
  validateSSOToken,
  validateSSOTokenDetailed,
  ssoAuthMiddleware
};

