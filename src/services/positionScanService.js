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

  async checkAndAddPosition(asset) {
    try {
      const profitInfo = await this.accountService.getPositionProfitInfo(asset);
      
      // 检查是否需要加仓
      if (!this.shouldAddPosition(profitInfo)) {
        return false;
      }

      // 获取建议加仓金额
      const amount = profitInfo.suggestedAmount || this.config.defaultAmount;

      // 执行加仓
      await this.orderService.addPosition(asset, amount);
      
      // 发送通知
      await this.notificationService.sendAddPositionNotification(asset, profitInfo);
      
      return true;
    } catch (error) {
      console.error(`检查${asset}加仓失败:`, error);
      return false;
    }
  }

  shouldAddPosition(profitInfo) {
    // 移除盈利检查，只保留其他必要的检查条件
    if (!profitInfo) return false;
    
    // 检查加仓次数是否超过限制
    if (profitInfo.addPositionCount >= this.config.maxAddPositionCount) {
      console.log(`${profitInfo.asset}已达到最大加仓次数: ${profitInfo.addPositionCount}`);
      return false;
    }
    
    // 检查距离上次加仓时间是否足够
    const lastOrderTime = new Date(profitInfo.lastOrderTime);
    const timeSinceLastOrder = Date.now() - lastOrderTime.getTime();
    if (timeSinceLastOrder < this.config.minAddPositionInterval) {
      console.log(`${profitInfo.asset}距离上次加仓时间不足`);
      return false;
    }

    // 如果有亏损且有建议加仓金额，则允许加仓
    if (profitInfo.profit < 0 && profitInfo.suggestedAmount > 0) {
      console.log(`${profitInfo.asset}当前亏损，建议加仓金额: ${profitInfo.suggestedAmount}`);
      return true;
    }

    // 其他情况检查价格回调百分比
    const priceDropPercentage = ((profitInfo.lastPrice - profitInfo.currentPrice) / profitInfo.lastPrice) * 100;
    if (priceDropPercentage >= this.config.addPositionThreshold) {
      return true;
    }

    console.log(`${profitInfo.asset}不满足加仓条件`);
    return false;
  }
}

module.exports = PositionScanService;