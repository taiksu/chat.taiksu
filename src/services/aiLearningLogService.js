const fs = require('fs');
const path = require('path');

class AiLearningLogService {
  constructor() {
    this.filePath = this.resolveFilePath();
    this.ready = false;
  }

  resolveFilePath() {
    const configured = String(process.env.AI_LEARNING_LOG_PATH || '').trim();
    if (configured) {
      return path.isAbsolute(configured)
        ? configured
        : path.resolve(process.cwd(), configured);
    }
    return path.resolve(process.cwd(), 'src', 'data', 'ai-learning-events.jsonl');
  }

  ensureReady() {
    if (this.ready) return;
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this.ready = true;
  }

  getFilePath() {
    return this.filePath;
  }

  async append(event, payload = {}) {
    try {
      this.ensureReady();
      const row = {
        ts: new Date().toISOString(),
        event: String(event || '').trim() || 'unknown',
        ...payload
      };
      await fs.promises.appendFile(this.filePath, `${JSON.stringify(row)}\n`, 'utf8');
    } catch (error) {
      console.warn('[AI_LEARNING_LOG] failed to append event:', error.message);
    }
  }
}

module.exports = new AiLearningLogService();
