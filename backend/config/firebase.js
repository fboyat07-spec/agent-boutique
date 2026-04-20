const admin = require('firebase-admin');
const serviceAccount = require('../../firebase-service-account.json');

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://kidai-claude-default-rtdb.firebaseio.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'kidai-claude-default'
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

module.exports = {
  db,
  auth,
  storage,
  admin
};
