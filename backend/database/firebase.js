const admin = require('firebase-admin');

let db = null;
let persistenceMode = 'memory';

function initFirebase() {
  // Mode demo si les cles Firebase ne sont pas configurees
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const allowMemoryFallback = process.env.FIREBASE_ALLOW_MEMORY_FALLBACK === 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  if (!projectId || !privateKey || !clientEmail ||
      projectId === 'ton-projet-firebase' ||
      privateKey === '' || clientEmail === '') {
    console.log("Firebase disabled");
    persistenceMode = 'memory';
    return null;
  }

  if (admin.apps.length > 0) {
    db = admin.firestore();
    persistenceMode = 'firestore';
    return admin.app();
  }

  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        privateKeyId: process.env.FIREBASE_PRIVATE_KEY_ID,
        privateKey: privateKey.replace(/\\n/g, '\n'),
        clientEmail,
      }),
    });
    db = admin.firestore();
    persistenceMode = 'firestore';
    console.log('Firebase connecte');
    return admin.app();
  } catch (err) {
    console.log("Firebase disabled");
    persistenceMode = 'memory';
    return null;
  }
}

// Store en memoire pour le mode demo
const memoryStore = {
  users: {},
  diagnosticSessions: {},
  missions: {},
  progress: {},
  tutorInteractions: {},
};

function sanitizeForFirestore(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeForFirestore(item))
      .filter((item) => item !== undefined);
  }
  if (typeof value === 'object') {
    const out = {};
    Object.entries(value).forEach(([k, v]) => {
      const cleaned = sanitizeForFirestore(v);
      if (cleaned !== undefined) out[k] = cleaned;
    });
    return out;
  }
  return value;
}

const store = {
  async get(collection, id) {
    if (db) {
      const doc = await db.collection(collection).doc(id).get();
      return doc.exists ? { id: doc.id, ...doc.data() } : null;
    }
    return memoryStore[collection]?.[id] || null;
  },

  async set(collection, id, data) {
    const cleanedData = sanitizeForFirestore(data);
    const record = { ...cleanedData, updatedAt: new Date().toISOString() };
    if (db) {
      await db.collection(collection).doc(id).set(
        {
          ...cleanedData,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
      return { id, ...cleanedData };
    }

    if (!memoryStore[collection]) memoryStore[collection] = {};
    memoryStore[collection][id] = {
      ...(memoryStore[collection][id] || {}),
      ...record,
    };
    return { id, ...record };
  },

  async query(collection, field, value) {
    if (db) {
      const snap = await db.collection(collection).where(field, '==', value).get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }

    return Object.entries(memoryStore[collection] || {})
      .filter(([, r]) => r[field] === value)
      .map(([id, r]) => ({ id, ...r }));
  },

  async delete(collection, id) {
    if (db) {
      await db.collection(collection).doc(id).delete();
      return;
    }
    delete memoryStore[collection]?.[id];
  },
};

initFirebase();

module.exports = {
  store,
  admin,
  get db() {
    return db;
  },
  isFirestoreEnabled: () => Boolean(db),
  getPersistenceMode: () => persistenceMode,
};
