// Service d'optimisation des lectures Firestore
class FirestoreOptimizer {
  constructor() {
    this.cache = new Map();
    this.batchSize = 10;
    this.maxCacheSize = 100;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    this.pendingReads = new Map();
    this.readQueue = [];
    this.isProcessingQueue = false;
  }

  // Mettre en cache un document
  setCache(docId, data) {
    // Limiter la taille du cache
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(docId, {
      data,
      timestamp: Date.now(),
      hits: 0
    });
  }

  // Obtenir depuis le cache
  getCache(docId) {
    const cached = this.cache.get(docId);
    
    if (!cached) {
      return null;
    }

    // Vérifier si le cache est expiré
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(docId);
      return null;
    }

    // Incrémenter le compteur de hits
    cached.hits++;
    
    return cached.data;
  }

  // Vérifier si un document est en cache
  hasCache(docId) {
    const cached = this.cache.get(docId);
    if (!cached) return false;
    
    // Vérifier l'expiration
    if (Date.now() - cached.timestamp > this.cacheTimeout) {
      this.cache.delete(docId);
      return false;
    }
    
    return true;
  }

  // Lecture optimisée avec cache
  async getDocument(docRef) {
    const docId = typeof docRef === 'string' ? docRef : docRef.id;
    
    // Vérifier le cache d'abord
    if (this.hasCache(docId)) {
      console.log(`📄 Cache HIT: ${docId}`);
      return this.getCache(docId);
    }

    // Vérifier si une lecture est déjà en cours
    if (this.pendingReads.has(docId)) {
      console.log(`📄 Pending read: ${docId}`);
      return await this.pendingReads.get(docId);
    }

    // Ajouter à la file d'attente pour batch processing
    return new Promise((resolve, reject) => {
      this.readQueue.push({
        docRef,
        docId,
        resolve,
        reject
      });

      this.processQueue();
    });
  }

  // Traiter la file d'attente par lots
  async processQueue() {
    if (this.isProcessingQueue || this.readQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      // Traiter par lots
      const batch = this.readQueue.splice(0, this.batchSize);
      
      // Créer les promesses pour chaque lecture
      const readPromises = batch.map(({ docRef, docId, resolve, reject }) => {
        const pendingPromise = this.performRead(docRef, docId);
        this.pendingReads.set(docId, pendingPromise);
        
        return pendingPromise
          .then(resolve)
          .catch(reject)
          .finally(() => {
            this.pendingReads.delete(docId);
          });
      });

      // Attendre toutes les lectures du lot
      await Promise.all(readPromises);
      
    } catch (error) {
      console.error('❌ Erreur processing queue:', error);
    } finally {
      this.isProcessingQueue = false;
      
      // Continuer si'il reste des éléments dans la queue
      if (this.readQueue.length > 0) {
        setTimeout(() => this.processQueue(), 50);
      }
    }
  }

  // Effectuer une lecture individuelle
  async performRead(docRef, docId) {
    try {
      const { getDoc } = await import('firebase/firestore');
      
      const docSnapshot = await getDoc(docRef);
      const data = docSnapshot.exists() ? docSnapshot.data() : null;
      
      // Mettre en cache
      if (data) {
        this.setCache(docId, data);
      }
      
      console.log(`📄 Cache MISS: ${docId}`);
      return data;
      
    } catch (error) {
      console.error(`❌ Erreur lecture ${docId}:`, error);
      throw error;
    }
  }

  // Lecture multiple optimisée
  async getDocuments(docRefs) {
    const results = new Map();
    const uncachedRefs = [];
    const uncachedIds = [];

    // Séparer les documents en cache et non-cachés
    docRefs.forEach((docRef, index) => {
      const docId = typeof docRef === 'string' ? docRef : docRef.id;
      
      if (this.hasCache(docId)) {
        results.set(docId, this.getCache(docId));
      } else {
        uncachedRefs.push(docRef);
        uncachedIds.push(docId);
      }
    });

    // Lire les documents non-cachés par lots
    if (uncachedRefs.length > 0) {
      const { getDocs } = await import('firebase/firestore');
      
      // Pour l'instant, lire individuellement (à optimiser avec batched reads)
      const readPromises = uncachedRefs.map(async (docRef, index) => {
        const docId = uncachedIds[index];
        
        try {
          const data = await this.getDocument(docRef);
          results.set(docId, data);
        } catch (error) {
          console.error(`❌ Erreur lecture multiple ${docId}:`, error);
          results.set(docId, null);
        }
      });

      await Promise.all(readPromises);
    }

    return results;
  }

  // Écoute optimisée avec cache
  onSnapshot(docRef, callback, options = {}) {
    const docId = typeof docRef === 'string' ? docRef : docRef.id;
    
    // Vérifier le cache d'abord
    if (this.hasCache(docId) && !options.skipCache) {
      const cachedData = this.getCache(docId);
      callback({ exists: true, data: () => cachedData });
    }

    // Créer l'écoute Firestore
    const { onSnapshot: fsOnSnapshot } = await import('firebase/firestore');
    
    return fsOnSnapshot(docRef, (docSnapshot) => {
      if (docSnapshot.exists()) {
        const data = docSnapshot.data();
        
        // Mettre à jour le cache
        this.setCache(docId, data);
        
        console.log(`📄 Snapshot updated: ${docId}`);
      }
      
      callback(docSnapshot);
    }, options.onError || ((error) => {
      console.error(`❌ Erreur snapshot ${docId}:`, error);
    }));
  }

  // Lecture de collection optimisée
  async getCollection(collectionRef, options = {}) {
    const collectionId = typeof collectionRef === 'string' ? collectionRef : collectionRef.id;
    
    // Clé de cache pour la collection
    const cacheKey = `collection_${collectionId}_${JSON.stringify(options)}`;
    
    // Vérifier le cache
    if (this.hasCache(cacheKey) && !options.skipCache) {
      console.log(`📁 Collection Cache HIT: ${collectionId}`);
      return this.getCache(cacheKey);
    }

    try {
      const { getDocs, query, orderBy, limit, where } = await import('firebase/firestore');
      
      let q = collectionRef;
      
      // Appliquer les options
      if (options.orderBy) {
        q = query(q, orderBy(options.orderBy.field, options.orderBy.direction));
      }
      
      if (options.limit) {
        q = query(q, limit(options.limit));
      }
      
      if (options.where) {
        q = query(q, where(options.where.field, options.where.operator, options.where.value));
      }

      const querySnapshot = await getDocs(q);
      const documents = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Mettre en cache
      this.setCache(cacheKey, documents);
      
      console.log(`📁 Collection Cache MISS: ${collectionId}`);
      return documents;
      
    } catch (error) {
      console.error(`❌ Erreur lecture collection ${collectionId}:`, error);
      throw error;
    }
  }

  // Précharger des documents
  async preloadDocuments(docRefs) {
    console.log(`📄 Préchargement de ${docRefs.length} documents`);
    
    try {
      await this.getDocuments(docRefs);
      console.log(`✅ Préchargement terminé`);
    } catch (error) {
      console.error(`❌ Erreur préchargement:`, error);
    }
  }

  // Vider le cache
  clearCache(docId = null) {
    if (docId) {
      this.cache.delete(docId);
      console.log(`🗑️ Cache vidé pour: ${docId}`);
    } else {
      this.cache.clear();
      console.log(`🗑️ Cache entièrement vidé`);
    }
  }

  // Obtenir les statistiques du cache
  getCacheStats() {
    const stats = {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      queueSize: this.readQueue.length,
      pendingReads: this.pendingReads.size,
      isProcessingQueue: this.isProcessingQueue
    };

    // Calculer les hits et misses
    let totalHits = 0;
    let totalAge = 0;

    this.cache.forEach((cached, key) => {
      totalHits += cached.hits;
      totalAge += Date.now() - cached.timestamp;
    });

    stats.averageHits = this.cache.size > 0 ? totalHits / this.cache.size : 0;
    stats.averageAge = this.cache.size > 0 ? totalAge / this.cache.size : 0;

    return stats;
  }

  // Nettoyer le cache expiré
  cleanupExpiredCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (now - cached.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🗑️ Nettoyage: ${cleanedCount} éléments expirés supprimés`);
    }

    return cleanedCount;
  }

  // Optimiser le cache (supprimer les moins utilisés)
  optimizeCache() {
    if (this.cache.size <= this.maxCacheSize * 0.8) {
      return; // Pas besoin d'optimiser
    }

    // Trier par hits (du moins au plus utilisé)
    const sortedEntries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.hits - b.hits);

    // Supprimer les 20% les moins utilisés
    const toRemove = Math.floor(sortedEntries.length * 0.2);
    
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(sortedEntries[i][0]);
    }

    console.log(`🗑️ Optimisation: ${toRemove} éléments peu utilisés supprimés`);
  }

  // Configurer l'optimiseur
  configure(options = {}) {
    if (options.batchSize) this.batchSize = options.batchSize;
    if (options.maxCacheSize) this.maxCacheSize = options.maxCacheSize;
    if (options.cacheTimeout) this.cacheTimeout = options.cacheTimeout;
    
    console.log(`⚙️ FirestoreOptimizer configuré:`, {
      batchSize: this.batchSize,
      maxCacheSize: this.maxCacheSize,
      cacheTimeout: this.cacheTimeout
    });
  }
}

// Instance singleton
const firestoreOptimizer = new FirestoreOptimizer();

export default firestoreOptimizer;
