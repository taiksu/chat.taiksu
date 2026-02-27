const MessageController = require('./MessageController');

class MemoryDebugController {
  isAdmin(req) {
    return String(req.session?.user?.role || '').toLowerCase() === 'admin';
  }

  denyPage(req, res) {
    return res.status(403).render('error', {
      title: 'Acesso negado',
      message: 'Apenas administradores podem acessar debug de memoria da IA',
      user: req.session.user
    });
  }

  denyApi(res) {
    return res.status(403).json({ error: 'Acesso restrito para admin' });
  }

  page(req, res) {
    if (!this.isAdmin(req)) return this.denyPage(req, res);
    return res.render('dashboard/memory-debug', {
      title: 'Debug Memoria IA - Chat Taiksu',
      user: req.session.user
    });
  }

  data(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    const items = MessageController.getMemoryDebugList();
    return res.json({
      success: true,
      ttlMinutes: Number(process.env.AI_MEMORY_TTL_MINUTES || 30),
      items
    });
  }

  clearRoom(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    const roomId = String(req.params?.roomId || '').trim();
    if (!roomId) return res.status(400).json({ error: 'roomId obrigatorio' });
    const removed = MessageController.clearRoomMemory(roomId);
    return res.json({ success: true, roomId, removed });
  }

  clearAll(req, res) {
    if (!this.isAdmin(req)) return this.denyApi(res);
    const removed = MessageController.clearAllMemory();
    return res.json({ success: true, removed });
  }
}

module.exports = new MemoryDebugController();
