const path = require('path');
const fs = require('fs');
const AdvancedLeverageTradingBot = require('./src/leverageTradingBot');
const CheckService = require('./src/services/checkService');

// 加载配置文件
function loadConfig() {
  try {
    let configPath = path.resolve(__dirname, 'config.json');
    
    if (!fs.existsSync(configPath)) {
      configPath = path.resolve(__dirname, 'config', 'config.json');
    }

    if (!fs.existsSync(configPath)) {
      throw new Error('未找到配置文件，请确保 config.json 存在于项目根目录或 config 目录中');
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    return JSON.parse(configContent);
  } catch (error) {
    console.error('❌ 配置加载失败:', error.message);
    process.exit(1);
  }
}

// 打印状态信息
async function printStatus(bot) {
  try {
    const accountInfo = await bot.accountService.getAccountInfo(false);
    if (!accountInfo || !accountInfo.positions) return;

    console.log('\n' + '='.repeat(50));
    console.log(`时间: ${new Date().toLocaleString()}`);

    if (accountInfo.positions.length > 0) {
      console.log('当前持仓:');
      
      for (const position of accountInfo.positions) {
        try {
          if (!position.asset || !position.quantity) continue;

          const symbol = `${position.asset}USDT`;
          let currentPrice;

          try {
            currentPrice = await bot.getCurrentPrice(symbol);
            if (!currentPrice || isNaN(currentPrice)) {
              console.log(`\n${position.asset}: 无效的当前价格`);
              continue;
            }
          } catch (error) {
            console.log(`\n${position.asset}: 获取价格失败 - ${error.message}`);
            continue;
          }

          const positionValue = position.quantity * currentPrice;

          if (positionValue >= bot.minTrackingValue) {
            // 获取订单历史和开仓均价
            const orderInfo = await bot.accountService.getMarginOrders(position.asset);
            if (!orderInfo) {
              console.log(`\n${position.asset}: 无法获取订单历史`);
              continue;
            }

            const entryPrice = orderInfo.entryPrice;
            const profit = (currentPrice - entryPrice) * position.quantity;
            const priceChangePercent = ((currentPrice - entryPrice) / entryPrice * 100);

            // 获取最后的持仓信息
            const lastPosition = bot.lastPositions.get(symbol);
            if (!lastPosition) {
              console.log(`\n${position.asset}: 无法获取持仓信息`);
              continue;
            }

            // 打印持仓信息
            console.log(`\n${position.asset}:`);
            console.log(`代币价格: ${currentPrice.toFixed(6)} USDT`);
            console.log(`开仓均价: ${entryPrice.toFixed(6)} USDT (收益率 ${priceChangePercent.toFixed(2)}%)`);
            console.log(`持仓数量: ${position.quantity.toFixed(8)}`);
            console.log(`持仓价值: ${positionValue.toFixed(2)} USDT`);
            console.log(`最后加仓价格: ${lastPosition.lastAddPrice.toFixed(6)} USDT`);  // 添加最后加仓价格
            console.log(`下次加仓价格: ${lastPosition.nextAddPrice.toFixed(6)} USDT`);
            console.log(`当前利润: ${profit.toFixed(2)} USDT`);
            console.log(`加仓次数: ${orderInfo.addPositionCount}`);
          }
        } catch (error) {
          console.error(`处理${position.asset}持仓信息失败:`, error);
          continue;
        }
      }
    } else {
      console.log('\n当前无持仓');
    }
    
    console.log('=' .repeat(50));
  } catch (error) {
    console.error('获取状态信息失败:', error.message);
  }
}

// 主函数
async function main() {
  let bot = null;
  let statusInterval = null;
  let isShuttingDown = false;  // 添加状态标记

  try {
    // 加载配置
    const config = loadConfig();
    
    // 创建交易机器人实例
    bot = new AdvancedLeverageTradingBot(config);

    // 创建检查服务实例
    const checkService = new CheckService(bot, config);

    // 运行启动检查
    const checkResult = await checkService.runAllChecks();
    if (!checkResult.success) {
      throw new Error('启动检查未通过：' + checkResult.error);
    }

    // 初始化系统
    await bot.initialize();

    // 设置状态打印定时器
    statusInterval = setInterval(async () => {
      try {
        await printStatus(bot);
      } catch (error) {
        console.error('打印状态失败:', error.message);
      }
    }, config.trading.scanning.statusInterval || 30000);

    // 注册退出处理
    process.on('SIGINT', async () => {
      // 防止重复执行退出流程
      if (isShuttingDown) return;
      isShuttingDown = true;

      if (statusInterval) {
        clearInterval(statusInterval);
      }
      if (bot) {
        await bot.stop();
      }
      process.exit(0);
    });

    // 打印初始状态
    await printStatus(bot);

  } catch (error) {
    console.error('程序初始化失败:', error.message);
    if (statusInterval) clearInterval(statusInterval);
    if (bot && !isShuttingDown) {  // 只在未开始关闭时执行停止
      await bot.stop();
    }
    process.exit(1);
  }
}

// 启动程序
main().catch(error => {
  console.error('程序执行失败:', error.message);
  process.exit(1);
});