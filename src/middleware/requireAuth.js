const { validateSSOTokenDetailed } = require('./ssoValidation');
const SSOController = require('../controllers/SSOController');
const User = require('../models/User');

const TOKEN_COOKIE_NAME = process.env.SSO_TOKEN_COOKIE_NAME || 'taiksu_sso_token';
const SSO_ENABLED = String(process.env.ENABLE_SSO ?? 'true').toLowerCase() === 'true';

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const parsed = {};
  header.split(';').forEach((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) return;
    const key = part.slice(0, idx).trim();
    const value = decodeURIComponent(part.slice(idx + 1).trim());
    parsed[key] = value;
  });
  return parsed;
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return null;
  return authHeader.slice(7).trim();
}

function getRedirectUrl(req) {
  if (!SSO_ENABLED) {
    const nextUrl = encodeURIComponent(String(req.originalUrl || '/dashboard'));
    return `/auth/dev-login?redirect=${nextUrl}`;
  }
  return process.env.SSO_URL || '/';
}

function unauthorized(req, res, asApi) {
  const ssoUrl = getRedirectUrl(req);
  if (asApi) {
    return res.status(401).json({ error: 'Nao autenticado', redirect: ssoUrl });
  }
  return res.redirect(ssoUrl);
}

async function rehydrateSession(req, res, asApi) {
  if (!SSO_ENABLED) {
    // Em modo local/dev sem SSO, autenticação vem da sessão (ex.: /auth/dev-login).
    return Boolean(req.session?.user);
  }

  const cookies = parseCookies(req);
  const requestToken =
    req.query?.token ||
    extractBearerToken(req) ||
    null;
  const sessionToken = req.session?.ssoToken || null;
  const cookieToken = cookies[TOKEN_COOKIE_NAME] || null;
  const token = requestToken || sessionToken || cookieToken;

  // Se ja existe sessao e o token explicitamente informado e o mesmo,
  // preserva a sessao sem revalidar.
  if (req.session?.user && requestToken && sessionToken && requestToken === sessionToken) {
    return true;
  }

  // Se existe sessao, mas chegou token explicito diferente, precisa reidratar
  // para nao manter usuario antigo.
  if (req.session?.user && requestToken && sessionToken && requestToken !== sessionToken) {
    req.session.user = null;
    req.session.ssoUser = null;
    req.session.ssoToken = null;
  } else if (req.session?.user && !requestToken) {
    // Sem token explicito, seguimos com sessao atual (fluxo web normal).
    return true;
  }

  if (!token) return false;

  const validation = await validateSSOTokenDetailed(token);
  if (!validation.ok) {
    console.error('[AUTH] Falha ao revalidar sessao', {
      status: validation.status,
      error: validation.error,
      message: validation.message
    });
    return false;
  }

  const user = await SSOController.syncSSOUser(validation.userData);
  await User.updateStatus(user.id, 'online');

  req.session.user = user;
  req.session.ssoUser = validation.userData;
  req.session.ssoToken = token;

  if (req.query?.token) {
    const isProd = process.env.NODE_ENV === 'production';
    res.cookie(TOKEN_COOKIE_NAME, token, {
      httpOnly: true,
      secure: isProd,
      sameSite: process.env.SESSION_COOKIE_SAMESITE || 'lax',
      domain: process.env.SESSION_COOKIE_DOMAIN || undefined,
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
  }

  return new Promise((resolve) => {
    req.session.save((err) => {
      if (err) {
        console.error('[AUTH] Erro ao salvar sessao reidratada:', err);
        return resolve(false);
      }
      resolve(true);
    });
  });
}

function requireWebAuth(req, res, next) {
  rehydrateSession(req, res, false)
    .then((ok) => {
      if (!ok) return unauthorized(req, res, false);
      return next();
    })
    .catch((err) => {
      console.error('[AUTH] Erro inesperado no requireWebAuth:', err);
      return unauthorized(req, res, false);
    });
}

function requireApiAuth(req, res, next) {
  rehydrateSession(req, res, true)
    .then((ok) => {
      if (!ok) return unauthorized(req, res, true);
      return next();
    })
    .catch((err) => {
      console.error('[AUTH] Erro inesperado no requireApiAuth:', err);
      return unauthorized(req, res, true);
    });
}

module.exports = {
  requireWebAuth,
  requireApiAuth,
  TOKEN_COOKIE_NAME
};
