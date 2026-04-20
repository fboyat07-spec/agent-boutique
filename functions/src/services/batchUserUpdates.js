const { logger } = require("firebase-functions/v2");
const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const db = admin.firestore();

// Service pour les mises à jour batch utilisateur
exports.batchUserUpdates = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  // Vérifier l'authentification
  if (!request.auth) {
    logger.error("Utilisateur non authentifié");
    throw new Error("Authentification requise");
  }

  const userId = request.auth.uid;
  const { updates, batch = true } = request.data;

  if (!updates || typeof updates !== 'object') {
    throw new Error("Updates invalides");
  }

  try {
    logger.info(`Batch updates pour utilisateur ${userId}`, { updates, batch });

    if (batch) {
      // Utiliser une transaction batch pour les mises à jour multiples
      await db.runTransaction(async (transaction) => {
        const userRef = db.collection('users').doc(userId);
        
        // Lecture unique pour éviter les lectures inutiles
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists) {
          throw new Error("Utilisateur non trouvé");
        }

        const currentData = userDoc.data();
        const updateData = {};
        const analyticsEvents = [];

        // Traiter chaque type de mise à jour
        Object.entries(updates).forEach(([key, value]) => {
          if (key.startsWith('increment')) {
            const field = key.replace('increment', '');
            const currentValue = currentData[field] || 0;
            const newValue = currentValue + value;
            updateData[field] = newValue;
            
            analyticsEvents.push({
              type: 'field_increment',
              field,
              previousValue: currentValue,
              newValue,
              increment: value
            });
            
          } else if (key.startsWith('arrayUnion')) {
            const field = key.replace('arrayUnion', '');
            const currentArray = currentData[field] || [];
            const newArray = [...new Set([...currentArray, ...value])]; // Éviter les doublons
            updateData[field] = newArray;
            
            analyticsEvents.push({
              type: 'array_union',
              field,
              addedItems: value,
              previousLength: currentArray.length,
              newLength: newArray.length
            });
            
          } else if (key.startsWith('arrayRemove')) {
            const field = key.replace('arrayRemove', '');
            const currentArray = currentData[field] || [];
            const newArray = currentArray.filter(item => !value.includes(item));
            updateData[field] = newArray;
            
            analyticsEvents.push({
              type: 'array_remove',
              field,
              removedItems: value,
              previousLength: currentArray.length,
              newLength: newArray.length
            });
            
          } else {
            // Mise à jour simple
            updateData[key] = value;
            
            analyticsEvents.push({
              type: 'field_update',
              field: key,
              previousValue: currentData[key],
              newValue: value
            });
          }
        });

        // Ajouter les métadonnées
        updateData.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        updateData.lastBatchUpdate = admin.firestore.FieldValue.serverTimestamp();
        updateData.batchUpdateCount = admin.firestore.FieldValue.increment(1);

        // Appliquer la mise à jour
        transaction.update(userRef, updateData);

        // Logger les analytics events
        for (const event of analyticsEvents) {
          await db.collection('analytics').add({
            eventName: 'batch_update',
            userId,
            params: {
              batchId: `batch_${userId}_${Date.now()}`,
              ...event
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
          });
        }

        return {
          success: true,
          updatedFields: Object.keys(updateData),
          analyticsEvents: analyticsEvents.length,
          batchId: `batch_${userId}_${Date.now()}`
        };
      });

    } else {
      // Mises à jour individuelles (non batch)
      const userRef = db.collection('users').doc(userId);
      
      await userRef.update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastIndividualUpdate: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        updatedFields: Object.keys(updates),
        batch: false
      };
    }

  } catch (error) {
    logger.error("Erreur batch updates utilisateur", {
      userId,
      updates,
      error: error.message
    });
    
    throw new Error(`Erreur lors des mises à jour batch: ${error.message}`);
  }
});

// Fonction pour optimiser les mises à jour multiples utilisateurs
exports.batchMultiUserUpdates = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  // Vérifier l'authentification (admin uniquement)
  if (!request.auth) {
    throw new Error("Authentification requise");
  }

  // TODO: Vérifier si l'utilisateur est admin
  const { userUpdates } = request.data;

  if (!userUpdates || !Array.isArray(userUpdates)) {
    throw new Error("User updates invalides");
  }

  if (userUpdates.length > 100) {
    throw new Error("Trop de mises à jour (max 100)");
  }

  try {
    logger.info(`Batch multi-user updates`, { userCount: userUpdates.length });

    // Créer un batch pour les mises à jour multiples
    const batch = db.batch();
    const results = [];

    userUpdates.forEach(({ userId, updates }) => {
      if (!userId || !updates) {
        results.push({ userId, success: false, error: "Données invalides" });
        return;
      }

      try {
        const userRef = db.collection('users').doc(userId);
        
        // Préparer les données de mise à jour
        const updateData = {
          ...updates,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastAdminUpdate: admin.firestore.FieldValue.serverTimestamp()
        };

        batch.update(userRef, updateData);
        
        results.push({ userId, success: true, updatedFields: Object.keys(updates) });
        
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    });

    // Exécuter le batch
    await batch.commit();

    // Logger les analytics
    await db.collection('analytics').add({
      eventName: 'admin_batch_update',
      params: {
        userCount: userUpdates.length,
        successCount: results.filter(r => r.success).length,
        errorCount: results.filter(r => !r.success).length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`Batch multi-user updates terminé`, {
      total: userUpdates.length,
      success: results.filter(r => r.success).length,
      errors: results.filter(r => !r.success).length
    });

    return {
      success: true,
      results,
      totalUsers: userUpdates.length,
      successCount: results.filter(r => r.success).length,
      errorCount: results.filter(r => !r.success).length
    };

  } catch (error) {
    logger.error("Erreur batch multi-user updates", {
      userUpdates,
      error: error.message
    });
    
    throw new Error(`Erreur lors des mises à jour multi-utilisateurs: ${error.message}`);
  }
});

// Fonction pour optimiser les lectures multiples
exports.batchUserReads = onCall({
  region: "europe-west1",
  cors: true,
}, async (request) => {
  if (!request.auth) {
    throw new Error("Authentification requise");
  }

  const { userIds, fields = [] } = request.data;

  if (!userIds || !Array.isArray(userIds)) {
    throw new Error("User IDs invalides");
  }

  if (userIds.length > 50) {
    throw new Error("Trop d'utilisateurs (max 50)");
  }

  try {
    logger.info(`Batch user reads`, { userCount: userIds.length, fields });

    // Lire tous les utilisateurs en une seule fois
    const userRefs = userIds.map(userId => db.collection('users').doc(userId));
    const userDocs = await db.getAll(...userRefs);

    const results = {};

    userDocs.forEach((doc, index) => {
      const userId = userIds[index];
      
      if (doc.exists) {
        const userData = doc.data();
        
        // Filtrer les champs demandés
        if (fields.length > 0) {
          const filteredData = {};
          fields.forEach(field => {
            if (userData.hasOwnProperty(field)) {
              filteredData[field] = userData[field];
            }
          });
          results[userId] = filteredData;
        } else {
          results[userId] = userData;
        }
      } else {
        results[userId] = null;
      }
    });

    // Logger les analytics
    await db.collection('analytics').add({
      eventName: 'batch_user_reads',
      params: {
        userCount: userIds.length,
        fieldsCount: fields.length,
        foundUsers: Object.values(results).filter(r => r !== null).length
      },
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    logger.info(`Batch user reads terminé`, {
      requested: userIds.length,
      found: Object.values(results).filter(r => r !== null).length
    });

    return {
      success: true,
      users: results,
      requestedCount: userIds.length,
      foundCount: Object.values(results).filter(r => r !== null).length
    };

  } catch (error) {
    logger.error("Erreur batch user reads", {
      userIds,
      fields,
      error: error.message
    });
    
    throw new Error(`Erreur lors des lectures batch: ${error.message}`);
  }
});
