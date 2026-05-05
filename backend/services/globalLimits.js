// ACTION 9 - Garde-fous globaux (limites actions)

// Configuration des limites
const DAILY_ACTION_LIMIT = parseInt(process.env.AGENT_DAILY_ACTION_LIMIT) || 100;
const RUN_ACTION_LIMIT = parseInt(process.env.AGENT_RUN_ACTION_LIMIT) || 10;

// Compteurs globaux (persistants en mémoire)
if (!global.actionCounters) {
  global.actionCounters = {
    daily: {
      count: 0,
      resetAt: new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000, // Demain minuit
      date: new Date().toDateString()
    },
    run: {
      count: 0,
      resetAt: Date.now() + 60000 // 1 minute
    }
  };
}

// Vérifier limite journalière
function checkDailyLimit(actionType = 'general') {
  const now = new Date();
  const daily = global.actionCounters.daily;
  
  // Reset si changement de jour
  if (now.toDateString() !== daily.date) {
    daily.count = 0;
    daily.date = now.toDateString();
    daily.resetAt = new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000;
    
    console.log('[DAILY_LIMIT_RESET]', {
      date: daily.date,
      resetAt: new Date(daily.resetAt)
    });
  }
  
  // Vérifier limite
  if (daily.count >= DAILY_ACTION_LIMIT) {
    console.log('[DAILY_LIMIT_REACHED]', {
      current: daily.count,
      limit: DAILY_ACTION_LIMIT,
      actionType,
      resetAt: new Date(daily.resetAt)
    });
    
    return {
      can: false,
      reason: 'daily_limit_reached',
      current: daily.count,
      limit: DAILY_ACTION_LIMIT,
      resetAt: daily.resetAt
    };
  }
  
  // Incrémenter
  daily.count++;
  
  console.log('[DAILY_ACTION]', {
    actionType,
    count: daily.count,
    limit: DAILY_ACTION_LIMIT,
    remaining: DAILY_ACTION_LIMIT - daily.count
  });
  
  return {
    can: true,
    count: daily.count,
    remaining: DAILY_ACTION_LIMIT - daily.count
  };
}

// Vérifier limite par run
function checkRunLimit(actionType = 'general') {
  const now = Date.now();
  const run = global.actionCounters.run;
  
  // Reset si dépassé
  if (now > run.resetAt) {
    run.count = 0;
    run.resetAt = now + 60000; // 1 minute
    
    console.log('[RUN_LIMIT_RESET]', {
      resetAt: new Date(run.resetAt)
    });
  }
  
  // Vérifier limite
  if (run.count >= RUN_ACTION_LIMIT) {
    console.log('[RUN_LIMIT_REACHED]', {
      current: run.count,
      limit: RUN_ACTION_LIMIT,
      actionType,
      resetAt: new Date(run.resetAt)
    });
    
    return {
      can: false,
      reason: 'run_limit_reached',
      current: run.count,
      limit: RUN_ACTION_LIMIT,
      resetAt: run.resetAt
    };
  }
  
  // Incrémenter
  run.count++;
  
  console.log('[RUN_ACTION]', {
    actionType,
    count: run.count,
    limit: RUN_ACTION_LIMIT,
    remaining: RUN_ACTION_LIMIT - run.count
  });
  
  return {
    can: true,
    count: run.count,
    remaining: RUN_ACTION_LIMIT - run.count
  };
}

// Vérifier toutes les limites
function checkLimits(actionType = 'general') {
  const daily = checkDailyLimit(actionType);
  const run = checkRunLimit(actionType);
  
  if (!daily.can) {
    return daily;
  }
  
  if (!run.can) {
    return run;
  }
  
  return {
    can: true,
    daily: daily,
    run: run
  };
}

// Arrêt propre si limite atteinte
function stopIfLimitReached(actionType = 'general') {
  const check = checkLimits(actionType);
  
  if (!check.can) {
    console.log('[AGENT_STOPPED]', {
      reason: check.reason,
      actionType,
      details: check
    });
    
    // Envoyer alerte si besoin
    if (check.reason === 'daily_limit_reached') {
      console.log('[ALERT] Daily action limit reached - agent stopped until tomorrow');
    } else if (check.reason === 'run_limit_reached') {
      console.log('[ALERT] Run action limit reached - agent will resume in 1 minute');
    }
    
    return false; // Stop
  }
  
  return true; // Continue
}

// Stats des limites
function getLimitStats() {
  const daily = global.actionCounters.daily;
  const run = global.actionCounters.run;
  
  return {
    daily: {
      current: daily.count,
      limit: DAILY_ACTION_LIMIT,
      remaining: DAILY_ACTION_LIMIT - daily.count,
      percentage: (daily.count / DAILY_ACTION_LIMIT) * 100,
      resetAt: daily.resetAt,
      date: daily.date
    },
    run: {
      current: run.count,
      limit: RUN_ACTION_LIMIT,
      remaining: RUN_ACTION_LIMIT - run.count,
      percentage: (run.count / RUN_ACTION_LIMIT) * 100,
      resetAt: run.resetAt
    }
  };
}

// Reset manuel (pour debug/admin)
function resetDailyLimit() {
  global.actionCounters.daily.count = 0;
  global.actionCounters.daily.date = new Date().toDateString();
  global.actionCounters.daily.resetAt = new Date().setHours(0, 0, 0, 0) + 24 * 60 * 60 * 1000;
  
  console.log('[DAILY_LIMIT_MANUAL_RESET]', {
    date: global.actionCounters.daily.date,
    resetAt: new Date(global.actionCounters.daily.resetAt)
  });
}

function resetRunLimit() {
  global.actionCounters.run.count = 0;
  global.actionCounters.run.resetAt = Date.now() + 60000;
  
  console.log('[RUN_LIMIT_MANUAL_RESET]', {
    resetAt: new Date(global.actionCounters.run.resetAt)
  });
}

// Wrapper pour actions avec limites
async function executeWithLimits(actionType, actionFunction) {
  if (!stopIfLimitReached(actionType)) {
    return { success: false, reason: 'limit_reached' };
  }
  
  try {
    const result = await actionFunction();
    return { success: true, result };
  } catch (error) {
    console.log('[LIMITED_ACTION_ERROR]', {
      actionType,
      error: error.message
    });
    return { success: false, reason: 'action_error', error: error.message };
  }
}

module.exports = {
  checkDailyLimit,
  checkRunLimit,
  checkLimits,
  stopIfLimitReached,
  getLimitStats,
  resetDailyLimit,
  resetRunLimit,
  executeWithLimits,
  DAILY_ACTION_LIMIT,
  RUN_ACTION_LIMIT
};
