import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// Interface pour les données de leaderboard
interface LeaderboardEntry {
  userId: string;
  username: string;
  avatar?: string;
  xp: number;
  level: number;
  streak: number;
  rank: number;
  updatedAt: admin.firestore.Timestamp;
}

// Interface pour le résultat de synchronisation
interface SyncLeaderboardResult {
  success: boolean;
  rank?: number;
  previousRank?: number;
  error?: string;
}

// Fonction pour synchroniser avec le leaderboard
export const syncLeaderboard = async (
  userId: string, 
  userData: { xp: number; level: number; username: string; avatar?: string }
): Promise<SyncLeaderboardResult> => {
  try {
    // Récupérer le rang actuel
    const currentEntry = await db
      .collection('leaderboard')
      .doc(userId)
      .get();

    const previousRank = currentEntry.exists() ? currentEntry.data()?.rank : null;

    // Créer ou mettre à jour l'entrée du leaderboard
    const leaderboardEntry: Partial<LeaderboardEntry> = {
      userId,
      username: userData.username,
      avatar: userData.avatar,
      xp: userData.xp,
      level: userData.level,
      streak: 0, // À récupérer depuis user data si nécessaire
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await db.collection('leaderboard').doc(userId).set(leaderboardEntry, { merge: true });

    // Calculer le nouveau rang
    const newRank = await calculateRank(userId, userData.xp);

    // Mettre à jour le rang
    await db.collection('leaderboard').doc(userId).update({ rank: newRank });

    console.log(`🏆 Leaderboard synchronisé: User ${userId}, XP: ${userData.xp}, Rank: ${newRank}`);

    return {
      success: true,
      rank: newRank,
      previousRank
    };

  } catch (error) {
    console.error('❌ Erreur synchronisation leaderboard:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erreur inconnue'
    };
  }
};

// Calculer le rang d'un utilisateur
async function calculateRank(userId: string, userXP: number): Promise<number> {
  try {
    // Compter le nombre d'utilisateurs avec plus d'XP
    const snapshot = await db
      .collection('leaderboard')
      .where('xp', '>', userXP)
      .count()
      .get();

    const usersWithMoreXP = snapshot.data().count;
    return usersWithMoreXP + 1;

  } catch (error) {
    console.error('❌ Erreur calcul rang:', error);
    return 999; // Valeur par défaut en cas d'erreur
  }
}

// Fonction pour obtenir le leaderboard
export const getLeaderboard = functions.https.onCall(async (data: { limit?: number; offset?: number }, context) => {
  // Vérifier l'authentification
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'L\'utilisateur doit être authentifié.'
    );
  }

  const { limit = 50, offset = 0 } = data;

  try {
    // Récupérer le leaderboard
    const snapshot = await db
      .collection('leaderboard')
      .orderBy('xp', 'desc')
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .offset(offset)
      .get();

    const leaderboard = snapshot.docs.map(doc => ({
      ...doc.data(),
      id: doc.id
    }));

    // Récupérer le rang de l'utilisateur actuel
    const userEntry = await db
      .collection('leaderboard')
      .doc(context.auth.uid)
      .get();

    const userRank = userEntry.exists() ? userEntry.data()?.rank : null;

    return {
      success: true,
      leaderboard,
      userRank,
      total: leaderboard.length
    };

  } catch (error) {
    console.error('❌ Erreur get leaderboard:', error);
    
    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      'Erreur lors de la récupération du leaderboard.',
      error instanceof Error ? error.message : 'Erreur inconnue'
    );
  }
});
