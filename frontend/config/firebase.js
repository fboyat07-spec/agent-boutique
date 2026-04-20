// Module Firebase client desactive en mode backend-API.
// Conserve ce fichier pour compatibilite legacy sans casser le build.

const disabledResult = {
  success: false,
  error: 'Module Firebase client desactive. Utiliser l\'API backend (/api/*).',
};

export const app = null;
export const auth = null;
export const db = null;
export const storage = null;

export const authService = {
  register: async () => disabledResult,
  login: async () => disabledResult,
  logout: async () => disabledResult,
  resetPassword: async () => disabledResult,
  onAuthStateChanged: () => () => {},
  getCurrentUser: () => null,
  getIdToken: async () => null,
};

export const dataService = {
  saveDiagnostic: async () => disabledResult,
  getUserDiagnostics: async () => disabledResult,
  getUserProgress: async () => disabledResult,
  updateUserProgress: async () => disabledResult,
  saveLearningSession: async () => disabledResult,
  saveQuestionAnswer: async () => disabledResult,
  getUserPreferences: async () => disabledResult,
  saveUserPreferences: async () => disabledResult,
};
