const fs = require('fs');
const path = require('path');

class LogManager {
  constructor() {
    this.logDir = path.join(__dirname, '../logs');
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  getCurrentTimestamp() {
    return new Date().toISOString();
  }

  getLogFilePath(symbol) {
    const date = new Date().toISOString().split('T')[0];
    return path.join(this.logDir, `${symbol}_${date}.log`);
  }

  async logPosition(symbol, type, data) {
    const logEntry = {
      timestamp: this.getCurrentTimestamp(),
      type,
      symbol,
      ...data
    };

    const logFile = this.getLogFilePath(symbol);
    const logLine = JSON.stringify(logEntry) + '\n';

    try {
      await fs.promises.appendFile(logFile, logLine);
      console.log(`Position logged: ${type} for ${symbol}`);
    } catch (error) {
      console.error('Error logging position:', error);
    }
  }

  async getLastPosition(symbol) {
    try {
      const logFile = this.getLogFilePath(symbol);
      if (!fs.existsSync(logFile)) return null;

      const logs = await fs.promises.readFile(logFile, 'utf8');
      const lines = logs.trim().split('\n');
      if (lines.length === 0) return null;

      return JSON.parse(lines[lines.length - 1]);
    } catch (error) {
      console.error('Error reading last position:', error);
      return null;
    }
  }
}

module.exports = LogManager;