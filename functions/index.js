const { logger } = require("firebase-functions/v2");
const { setGlobalOptions } = require("firebase-functions/v2");

// Configuration globale des fonctions
setGlobalOptions({
  region: "europe-west1",
  maxInstances: 10,
  timeoutSeconds: 540,
  memory: "256MiB",
  cors: true
});

// Importer les modules
const xpModule = require('./xp/addXp');
const missionsModule = require('./missions/completeMission');
const badgesModule = require('./badges/checkBadges');

// Exporter les fonctions XP
exports.addXp = xpModule.addXp;
exports.getUserProgress = xpModule.getUserProgress;

// Exporter les fonctions de missions
exports.completeMission = missionsModule.completeMission;
exports.getAvailableMissions = missionsModule.getAvailableMissions;

// Exporter les fonctions de badges
exports.checkBadges = badgesModule.checkBadges;
exports.getAllBadges = badgesModule.getAllBadges;
exports.getUserBadges = badgesModule.getUserBadges;

// Fonction de santé pour vérifier que tout fonctionne
exports.healthCheck = require("firebase-functions/v2/https").onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  try {
    const timestamp = new Date().toISOString();
    const memory = process.memoryUsage();
    
    logger.info("Health check appelé", {
      timestamp,
      memory
    });

    return {
      success: true,
      data: {
        status: "healthy",
        timestamp,
        version: "1.0.0",
        environment: process.env.NODE_ENV || "development",
        memory: {
          used: Math.round(memory.heapUsed / 1024 / 1024) + "MB",
          total: Math.round(memory.heapTotal / 1024 / 1024) + "MB"
        },
        functions: {
          xp: ["addXp", "getUserProgress"],
          missions: ["completeMission", "getAvailableMissions"],
          badges: ["checkBadges", "getAllBadges", "getUserBadges"]
        }
      }
    };

  } catch (error) {
    logger.error("Erreur lors du health check", {
      error: error.message,
      stack: error.stack
    });

    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
});

// Logger de démarrage
logger.info("Backend Firebase Functions initialisé", {
  version: "1.0.0",
  region: "europe-west1",
  timestamp: new Date().toISOString()
});
