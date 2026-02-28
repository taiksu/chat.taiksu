function normalizeHeaderValue(value) {
  return String(value || '').trim();
}

function resolveServiceToken(req) {
  const byHeader =
    normalizeHeaderValue(req.headers['service-token'])
    || normalizeHeaderValue(req.headers['x-service-token'])
    || normalizeHeaderValue(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (byHeader) return byHeader;
  return normalizeHeaderValue(req.query?.token || req.query?.service_token || '');
}

function resolveExpectedToken() {
  return normalizeHeaderValue(
    process.env.EVENTS_SERVICE_TOKEN
      || process.env.SERVICE_TOKEN
      || ''
  );
}

function shouldRequireToken() {
  // Heartbeat normalmente pode ser publico; ative true para exigir token.
  return String(process.env.EVENTS_HEARTBEAT_REQUIRE_TOKEN || 'false').trim().toLowerCase() === 'true';
}

function buildHeartbeatPayload() {
  return {
    success: true,
    message: String(process.env.EVENTS_HEARTBEAT_MESSAGE || 'Service is online'),
    time: new Date().toISOString()
  };
}

function heartbeatMiddleware(req, res) {
  const expectedToken = resolveExpectedToken();
  const sentToken = resolveServiceToken(req);

  if (shouldRequireToken() && expectedToken && sentToken !== expectedToken) {
    return res.status(401).json({
      success: false,
      message: 'Invalid service token',
      time: new Date().toISOString()
    });
  }

  return res.json(buildHeartbeatPayload());
}

module.exports = heartbeatMiddleware;
