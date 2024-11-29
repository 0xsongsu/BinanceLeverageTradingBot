const EventEmitter = require('events');
const AdvancedLeverageTradingBot = require('../leverageTradingBot');

class MonitorService extends EventEmitter {
  constructor(bot, config) {
    super();
    this.bot = bot;
    this.config = config;
    this.monitors = new Map(); // 存储所有监控器
    this.lastCheckTimes = new Map(); // 存储上次检查时间
    this.isShuttingDown = false;
  }

  // 创建交易监控
  createTradeMonitor(symbol) {
    console.log('\n开始监控交易...');
    
    if (this.monitors.has(symbol)) {
      console.log(`监控器已存在: ${symbol}`);
      return this.monitors.get(symbol);
    }

    const { addPositionRatio } = this.config.trading;
    this.lastCheckTimes.set(symbol, Date.now());

    const monitor = setInterval(async () => {
      if (this.isShuttingDown) return;

      try {
        await this.performMonitorCheck(symbol, addPositionRatio);
      } catch (error) {
        this.handleMonitorError(error, symbol, monitor);
      }
    }, this.config.checkInterval || 60000); // 默认每分钟检查一次

    this.monitors.set(symbol, monitor);
    return monitor;
  }

  // 执行监控检查
  async performMonitorCheck(symbol, addPositionRatio) {
    const now = Date.now();
    const lastCheckTime = this.lastCheckTimes.get(symbol);
    const timeSinceLastCheck = Math.floor((now - lastCheckTime) / 1000);

    // 获取当前状态
    const pnl = await this.bot.calculatePnL(symbol);
    if (pnl) {
      console.log(`\n状态更新 [${new Date().toLocaleTimeString()}] (距上次检查: ${timeSinceLastCheck}秒):`);
      console.log(`- 当前价格: ${pnl.currentPrice}`);
      console.log(`- 未实现盈亏: ${pnl.unrealizedPnL.toFixed(2)} USDT (${pnl.pnlPercentage.toFixed(2)}%)`);
      console.log(`- 持仓均价: ${pnl.averagePrice}`);
      console.log(`- 持仓数量: ${pnl.quantity}`);
      console.log(`- 加仓次数: ${pnl.addPositionCount}`);

      // 发出状态更新事件
      this.emit('statusUpdate', {
        symbol,
        ...pnl,
        timestamp: now
      });
    }

    // 检查加仓机会
    const addPositionResult = await this.bot.dynamicAddPosition(symbol, addPositionRatio);
    if (addPositionResult) {
      this.emit('positionAdded', {
        symbol,
        ...addPositionResult,
        timestamp: now
      });
    }

    this.lastCheckTimes.set(symbol, now);
  }

  // 处理监控错误
  handleMonitorError(error, symbol, monitor) {
    console.error(`监控 ${symbol} 出错:`, error.message);
    
    // 发出错误事件
    this.emit('monitorError', {
      symbol,
      error,
      timestamp: Date.now()
    });

    // 如果是严重错误，停止监控
    if (this.isCriticalError(error)) {
      console.error(`检测到严重错误，停止监控 ${symbol}`);
      this.stopMonitor(symbol);
      this.emit('monitorStopped', {
        symbol,
        reason: error.message,
        timestamp: Date.now()
      });
    }
  }

  // 判断是否为严重错误
  isCriticalError(error) {
    const criticalErrors = [
      'API-key',
      'signature',
      'insufficient balance',
      'Account has been frozen',
      'System error',
      'Market is closed'
    ];

    return criticalErrors.some(errText => error.message.includes(errText));
  }

  // 停止特定交易对的监控
  stopMonitor(symbol) {
    const monitor = this.monitors.get(symbol);
    if (monitor) {
      clearInterval(monitor);
      this.monitors.delete(symbol);
      this.lastCheckTimes.delete(symbol);
      console.log(`已停止 ${symbol} 的监控`);
    }
  }

  // 停止所有监控
  stopAllMonitors() {
    this.isShuttingDown = true;
    for (const [symbol, monitor] of this.monitors) {
      clearInterval(monitor);
      console.log(`已停止 ${symbol} 的监控`);
    }
    this.monitors.clear();
    this.lastCheckTimes.clear();
    console.log('已停止所有监控');
  }

  // 获取监控状态
  getMonitorStatus(symbol) {
    const monitor = this.monitors.get(symbol);
    const lastCheckTime = this.lastCheckTimes.get(symbol);
    
    if (!monitor) return null;

    return {
      symbol,
      isActive: true,
      lastCheckTime,
      timeSinceLastCheck: Date.now() - lastCheckTime
    };
  }

  // 获取所有监控状态
  getAllMonitorStatus() {
    const status = {};
    for (const symbol of this.monitors.keys()) {
      status[symbol] = this.getMonitorStatus(symbol);
    }
    return status;
  }
}

// 创建监控服务实例
function createMonitorService(bot, config) {
  return new MonitorService(bot, config);
}

// 设置错误处理
function setupErrorHandlers(monitorService) {
  process.on('unhandledRejection', (reason, promise) => {
    console.error('未处理的Promise拒绝:', reason);
    monitorService.emit('unhandledRejection', {
      reason,
      timestamp: Date.now()
    });
  });

  process.on('uncaughtException', (error) => {
    console.error('未捕获的异常:', error);
    gracefulShutdown(monitorService, error);
  });

  process.on('SIGINT', () => {
    gracefulShutdown(monitorService);
  });

  process.on('SIGTERM', () => {
    gracefulShutdown(monitorService);
  });

  async function gracefulShutdown(monitorService, error = null) {
    if (monitorService.isShuttingDown) return;
    monitorService.isShuttingDown = true;

    console.log('\n正在安全退出程序...');
    
    // 停止所有监控
    monitorService.stopAllMonitors();

    // 发出关闭事件
    monitorService.emit('shutdown', {
      reason: error ? 'error' : 'user',
      error,
      timestamp: Date.now()
    });

    // 等待一些异步操作完成
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log('程序已安全退出');
    } catch (err) {
      console.error('退出过程中发生错误:', err);
    } finally {
      process.exit(error ? 1 : 0);
    }
  }
}

module.exports = {
  MonitorService,
  createMonitorService,
  setupErrorHandlers
};