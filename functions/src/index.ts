import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

// Initialiser Firebase Admin
admin.initializeApp();

// Importer les services
import { addXp } from "./services/xpService";
import { completeMission } from "./services/missionService";
import { checkBadges } from "./services/badgeService";
import { 
  sendPushNotification, 
  sendBulkNotifications, 
  checkInactiveUsers, 
  checkStreakAlerts,
  sendMissionReminder,
  sendLevelUpNotification,
  updateNotificationPreferences,
  scheduledNotifications
} from "./services/notificationService";

// Exporter les fonctions principales
export { addXp, completeMission, checkBadges };

// Exporter les fonctions de notification
export {
  sendPushNotification,
  sendBulkNotifications,
  checkInactiveUsers,
  checkStreakAlerts,
  sendMissionReminder,
  sendLevelUpNotification,
  updateNotificationPreferences,
  scheduledNotifications
};

// Importer et exporter les fonctions planifiées
import {
  resetDailyMissions,
  sendReEngagementNotifications,
  cleanupOldData,
  testScheduledFunctions
} from "./services/scheduledFunctions";

export {
  resetDailyMissions,
  sendReEngagementNotifications,
  cleanupOldData,
  testScheduledFunctions
};

// Importer et exporter les fonctions analytics améliorées
import {
  trackAnalyticsEvent,
  startSession,
  endSession,
  calculateRetention,
  trackPremiumConversion,
  getAnalyticsStats,
  dailyRetentionCalculation
} from "./services/analyticsService";

export {
  trackAnalyticsEvent,
  startSession,
  endSession,
  calculateRetention,
  trackPremiumConversion,
  getAnalyticsStats,
  dailyRetentionCalculation
};
