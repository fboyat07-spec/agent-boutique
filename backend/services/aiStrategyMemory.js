const fs = require('fs');

const FILE = './backend/data/ai_strategy.json';

function loadStrategy() {
  try {
    return JSON.parse(fs.readFileSync(FILE));
  } catch {
    return { tone: 'standard', aggressiveness: 0.5 };
  }
}

function saveStrategy(data) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

module.exports = { loadStrategy, saveStrategy };
