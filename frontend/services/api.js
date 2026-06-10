import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Fallback de securite : si EXPO_PUBLIC_API_BASE_URL manque a un build EAS,
// on pointe sur le backend Render public (jamais localhost, sinon l'APK
// appelle le telephone lui-meme et aucune requete n'atteint le serveur).
// NB: EXPO_PUBLIC_API_BASE_URL_WEB n'est volontairement pas branche ici
// (web et natif partagent la meme URL Render) - ne pas ajouter de logique
// Platform.OS sans la tester sur les deux plateformes.
const rawBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://kidai-learning-api.onrender.com';
const normalizedBaseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;
const BASE_URL = `${normalizedBaseUrl}/api`;

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
});

api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const status = error?.response?.status;
    if (status === 401 || status === 403) {
      await AsyncStorage.multiRemove(['token', 'user']);
    }
    return Promise.reject(error);
  }
);

export const register = (data) => api.post('/auth/register', data);
export const login = (data) => api.post('/auth/login', data);
export const getProfile = () => api.get('/auth/profile');

export const startDiagnostic = () => api.post('/diagnostic/start');
export const submitDiagnostic = (sessionId, answers) =>
  api.post('/diagnostic/submit', { sessionId, answers });
export const getDiagnosticResult = () => api.get('/diagnostic/result');

export const getNextMission = () => api.get('/missions/next');
export const answerMission = (missionId, answer, timeSpent) =>
  api.post('/missions/answer', { missionId, answer, timeSpent });
export const getStats = () => api.get('/missions/stats');

export const chatWithAI = (message, subject, skill) =>
  api.post('/ai/chat', { message, subject, skill });

export default api;
