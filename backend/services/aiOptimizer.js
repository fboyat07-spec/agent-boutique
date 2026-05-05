const { getStats } = require('./aiMetrics');
const { loadStrategy, saveStrategy } = require('./aiStrategyMemory');

async function optimize() {
  const stats = await getStats();
  const strategy = loadStrategy();

  console.log('[AI OPTIMIZATION]', stats);

  if (stats.conversionRate < 0.1) {
    strategy.aggressiveness += 0.1;
  }

  if (stats.conversionRate > 0.3) {
    strategy.aggressiveness -= 0.05;
  }

  strategy.aggressiveness = Math.max(0.1, Math.min(1, strategy.aggressiveness));

  saveStrategy(strategy);

  console.log('[AI STRATEGY UPDATED]', strategy);
}

module.exports = { optimize };
