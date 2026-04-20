import { useState, useCallback, useRef } from 'react';
import { doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../config/firebaseClean';

// Hook pour les opérations batch Firestore
const useBatchOperations = (maxBatchSize = 500, maxWaitTime = 5000) => {
  const [batch, setBatch] = useState(null);
  const [operations, setOperations] = useState([]);
  const [stats, setStats] = useState({
    batches: 0,
    operations: 0,
    errors: 0,
    lastBatchTime: null
  });

  const batchTimeoutRef = useRef(null);
  const operationsRef = useRef(operations);

  // Synchroniser les refs
  operationsRef.current = operations;

  // Créer un nouveau batch
  const createBatch = useCallback(() => {
    const newBatch = writeBatch(db);
    setBatch(newBatch);
    return newBatch;
  }, []);

  // Ajouter une opération au batch
  const addOperation = useCallback((type, docRef, data) => {
    const operation = {
      type,
      docRef,
      data,
      timestamp: Date.now()
    };

    setOperations(prev => [...prev, operation]);

    // Si on atteint la taille maximale, exécuter le batch
    if (operationsRef.current.length >= maxBatchSize - 1) {
      executeBatch();
    }
  }, [maxBatchSize]);

  // Ajouter une opération de mise à jour
  const update = useCallback((collectionPath, docId, data) => {
    const docRef = doc(db, collectionPath, docId);
    addOperation('update', docRef, data);
  }, [addOperation]);

  // Ajouter une opération de création
  const create = useCallback((collectionPath, docId, data) => {
    const docRef = doc(db, collectionPath, docId);
    addOperation('set', docRef, data);
  }, [addOperation]);

  // Ajouter une opération de suppression
  const remove = useCallback((collectionPath, docId) => {
    const docRef = doc(db, collectionPath, docId);
    addOperation('delete', docRef);
  }, [addOperation]);

  // Ajouter une opération d'incrémentation
  const increment = useCallback((collectionPath, docId, field, value = 1) => {
    const docRef = doc(db, collectionPath, docId);
    addOperation('update', docRef, {
      [field]: increment(value),
      updatedAt: serverTimestamp()
    });
  }, [addOperation]);

  // Ajouter une opération d'array union
  const arrayUnion = useCallback((collectionPath, docId, field, values) => {
    const docRef = doc(db, collectionPath, docId);
    addOperation('update', docRef, {
      [field]: arrayUnion(values),
      updatedAt: serverTimestamp()
    });
  }, [addOperation]);

  // Ajouter une opération d'array remove
  const arrayRemove = useCallback((collectionPath, docId, field, values) => {
    const docRef = doc(db, collectionPath, docId);
    addOperation('update', docRef, {
      [field]: arrayRemove(values),
      updatedAt: serverTimestamp()
    });
  }, [addOperation]);

  // Exécuter le batch
  const executeBatch = useCallback(async () => {
    if (operationsRef.current.length === 0) {
      return { success: true, operations: 0 };
    }

    try {
      const currentBatch = batch || createBatch();
      const currentOperations = [...operationsRef.current];

      // Ajouter toutes les opérations au batch
      currentOperations.forEach(operation => {
        switch (operation.type) {
          case 'set':
            currentBatch.set(operation.docRef, operation.data);
            break;
          case 'update':
            currentBatch.update(operation.docRef, operation.data);
            break;
          case 'delete':
            currentBatch.delete(operation.docRef);
            break;
        }
      });

      // Exécuter le batch
      await currentBatch.commit();

      // Mettre à jour les stats
      const batchStats = {
        batches: stats.batches + 1,
        operations: stats.operations + currentOperations.length,
        errors: stats.errors,
        lastBatchTime: Date.now()
      };

      setStats(batchStats);

      // Réinitialiser
      setBatch(null);
      setOperations([]);
      
      // Annuler le timeout
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }

      console.log(`✅ Batch exécuté: ${currentOperations.length} opérations`);
      
      return {
        success: true,
        operations: currentOperations.length,
        batchId: `batch_${Date.now()}`
      };

    } catch (error) {
      console.error('❌ Erreur batch:', error);
      
      // Mettre à jour les stats d'erreur
      setStats(prev => ({
        ...prev,
        errors: prev.errors + 1
      }));

      // Réinitialiser en cas d'erreur
      setBatch(null);
      setOperations([]);
      
      if (batchTimeoutRef.current) {
        clearTimeout(batchTimeoutRef.current);
        batchTimeoutRef.current = null;
      }

      return {
        success: false,
        error: error.message,
        operations: operationsRef.current.length
      };
    }
  }, [batch, operations, stats, createBatch]);

  // Exécuter le batch avec timeout
  const executeBatchWithTimeout = useCallback(async () => {
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }

    batchTimeoutRef.current = setTimeout(() => {
      if (operationsRef.current.length > 0) {
        console.log(`⏰ Timeout batch: exécution de ${operationsRef.current.length} opérations`);
        executeBatch();
      }
    }, maxWaitTime);
  }, [executeBatch, maxWaitTime]);

  // Démarrer le timeout automatique
  const startAutoExecute = useCallback(() => {
    executeBatchWithTimeout();
  }, [executeBatchWithTimeout]);

  // Ajouter plusieurs opérations en une fois
  const addMultipleOperations = useCallback((ops) => {
    ops.forEach(op => {
      switch (op.type) {
        case 'update':
          update(op.collection, op.id, op.data);
          break;
        case 'create':
          create(op.collection, op.id, op.data);
          break;
        case 'delete':
          remove(op.collection, op.id);
          break;
        case 'increment':
          increment(op.collection, op.id, op.field, op.value);
          break;
        case 'arrayUnion':
          arrayUnion(op.collection, op.id, op.field, op.values);
          break;
        case 'arrayRemove':
          arrayRemove(op.collection, op.id, op.field, op.values);
          break;
      }
    });

    // Démarrer l'auto-exécution
    startAutoExecute();
  }, [update, create, remove, increment, arrayUnion, arrayRemove, startAutoExecute]);

  // Forcer l'exécution immédiate
  const flush = useCallback(async () => {
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    
    return await executeBatch();
  }, [executeBatch]);

  // Annuler toutes les opérations en attente
  const cancel = useCallback(() => {
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
      batchTimeoutRef.current = null;
    }
    
    setBatch(null);
    setOperations([]);
    
    console.log('❌ Opérations batch annulées');
  }, []);

  // Obtenir les statistiques
  const getStats = useCallback(() => {
    return {
      ...stats,
      pendingOperations: operations.length,
      batchSize: maxBatchSize,
      maxWaitTime
    };
  }, [stats, operations.length, maxBatchSize, maxWaitTime]);

  // Nettoyer au démontage
  const cleanup = useCallback(() => {
    if (batchTimeoutRef.current) {
      clearTimeout(batchTimeoutRef.current);
    }
  }, []);

  return {
    // État
    operations,
    stats: getStats(),
    pendingOperations: operations.length,

    // Actions principales
    update,
    create,
    remove,
    increment,
    arrayUnion,
    arrayRemove,

    // Actions de groupe
    addMultipleOperations,
    flush,
    cancel,

    // Contrôle
    startAutoExecute,
    executeBatch,
    cleanup
  };
};

// Hook spécialisé pour les opérations utilisateur
export const useUserBatchOperations = (userId) => {
  const {
    update,
    increment,
    arrayUnion,
    arrayRemove,
    flush,
    addMultipleOperations,
    ...rest
  } = useBatchOperations();

  // Mettre à jour le profil utilisateur
  const updateUserProfile = useCallback((userData) => {
    update('users', userId, {
      ...userData,
      updatedAt: serverTimestamp()
    });
  }, [update, userId]);

  // Ajouter de l'XP
  const addXP = useCallback((amount, source = 'manual') => {
    increment('users', userId, 'xp', amount);
    update('users', userId, {
      lastXPSource: source,
      lastXPAt: serverTimestamp()
    });
  }, [update, increment, userId]);

  // Ajouter une mission complétée
  const completeMission = useCallback((missionId, missionData) => {
    arrayUnion('users', userId, 'missions.completed', missionId);
    increment('users', userId, 'missions.totalCompleted', 1);
    update('users', userId, {
      'missions.lastCompleted': missionId,
      'missions.lastCompletedAt': serverTimestamp()
    });
  }, [arrayUnion, increment, update, userId]);

  // Ajouter un badge
  const addBadge = useCallback((badge) => {
    arrayUnion('users', userId, 'badges', badge);
    update('users', userId, {
      'badges.lastAdded': badge,
      'badges.lastAddedAt': serverTimestamp()
    });
  }, [arrayUnion, update, userId]);

  // Mettre à jour le streak
  const updateStreak = useCallback((streak) => {
    update('users', userId, {
      streak,
      lastStreakUpdate: serverTimestamp()
    });
  }, [update, userId]);

  // Mise à jour groupée de l'utilisateur
  const batchUpdateUser = useCallback((updates) => {
    const operations = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (typeof value === 'number' && key.includes('increment')) {
        const field = key.replace('increment', '');
        operations.push({
          type: 'increment',
          collection: 'users',
          id: userId,
          field,
          value
        });
      } else if (Array.isArray(value) && key.includes('arrayUnion')) {
        const field = key.replace('arrayUnion', '');
        operations.push({
          type: 'arrayUnion',
          collection: 'users',
          id: userId,
          field,
          values: value
        });
      } else {
        operations.push({
          type: 'update',
          collection: 'users',
          id: userId,
          data: { [key]: value }
        });
      }
    });

    addMultipleOperations(operations);
  }, [addMultipleOperations, userId]);

  return {
    // Actions utilisateur
    updateUserProfile,
    addXP,
    completeMission,
    addBadge,
    updateStreak,
    batchUpdateUser,

    // Actions batch
    flush,
    addMultipleOperations,

    // État et contrôle
    ...rest
  };
};

export default useBatchOperations;
