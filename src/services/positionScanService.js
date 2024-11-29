const EventEmitter = require('events');

class PositionScanService extends EventEmitter {
  constructor(bot, config) {
    super();
    this.bot = bot;
    this.config = config;
    this.scanInterval = null;
    this.knownPositions = new Map();
  }

  // 启动扫描
  startScanning() {
    console.log('启动持仓扫描...');
    this.scanInterval = setInterval(() => {
      this.scanPositions();
    }, this.config.trading.scanning.positionInterval);
  }

  // 停止扫描
  stopScanning() {
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
      console.log('持仓扫描已停止');
    }
  }

  // 扫描持仓
  async scanPositions() {
    try {
      const marginAccount = await this.bot.client.marginAccount();
      const currentPositions = new Map();

      // 处理每个持仓
      for (const asset of marginAccount.userAssets) {
        const borrowed = parseFloat(asset.borrowed);
        if (borrowed <= 0) continue;  // 跳过无借贷的资产

        const symbol = asset.asset + 'USDT';
        const position = {
          symbol,
          borrowed,
          free: parseFloat(asset.free),
          locked: parseFloat(asset.locked),
          interest: parseFloat(asset.interest)
        };

        // 计算持仓价值
        const currentPrice = await this.bot.getCurrentPrice(symbol);
        const positionValue = borrowed * currentPrice;

        // 检查是否满足最小价值要求
        if (positionValue < this.config.trading.scanning.minPositionValue) {
          continue;
        }

        currentPositions.set(symbol, position);

        // 检查是否是新持仓
        if (!this.knownPositions.has(symbol)) {
          position.currentPrice = currentPrice;
          position.positionValue = positionValue;
          this.emit('newPosition', position);
        }
      }

      // 更新已知持仓列表
      this.knownPositions = currentPositions;

    } catch (error) {
      console.error('扫描持仓失败:', error);
    }
  }

  // 获取持仓信息
  getPositionInfo(symbol) {
    return this.knownPositions.get(symbol);
  }

  // 获取所有持仓
  getAllPositions() {
    return Array.from(this.knownPositions.values());
  }
}

module.exports = PositionScanService;