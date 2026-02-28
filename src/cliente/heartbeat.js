function normalizeHeaderValue(value) {
  return String(value || '').trim();
}

function resolveServiceToken(req) {
  return normalizeHeaderValue(req.headers['service-token']);
}

function resolveExpectedToken() {
  return normalizeHeaderValue(
    process.env.EVENTS_SERVICE_TOKEN
      || process.env.SERVICE_TOKEN
      || ''
  );
}

function buildHeartbeatPayload() {
  return {
    message: String(process.env.EVENTS_HEARTBEAT_MESSAGE || 'Verona token is valid'),
    service: String(process.env.EVENTS_SERVICE_NAME || 'Chat Taiksu'),
    id: Number(process.env.EVENTS_SERVICE_ID || 0) || 0,
    status: 'online'
  };
}

function heartbeatMiddleware(req, res) {
  const expectedToken = resolveExpectedToken();
  const sentToken = resolveServiceToken(req);

  if (expectedToken && sentToken !== expectedToken) {
    return res.status(401).json({
      message: 'Invalid service token',
      service: String(process.env.EVENTS_SERVICE_NAME || 'Chat Taiksu'),
      id: Number(process.env.EVENTS_SERVICE_ID || 0) || 0,
      status: 'offline'
    });
  }

  return res.json(buildHeartbeatPayload());
}

module.exports = heartbeatMiddleware;
