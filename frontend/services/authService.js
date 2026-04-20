import AsyncStorage from '@react-native-async-storage/async-storage';
import { login, register } from './api';

class AuthService {
  async initialize() {
    return { success: true };
  }

  async register(email, password, displayName, age, parentEmail) {
    try {
      const res = await register({
        email,
        password,
        childName: displayName || 'Enfant',
        childAge: age,
        parentName: parentEmail || '',
      });
      return { success: true, data: res.data };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error.message };
    }
  }

  async login(email, password) {
    try {
      const res = await login({ email, password });
      if (res?.data?.token) {
        await AsyncStorage.setItem('token', res.data.token);
      }
      return { success: true, data: res.data };
    } catch (error) {
      return { success: false, error: error?.response?.data?.error || error.message };
    }
  }

  async logout() {
    await AsyncStorage.removeItem('token');
    await AsyncStorage.removeItem('user');
    return { success: true };
  }

  async getToken() {
    return AsyncStorage.getItem('token');
  }

  isAuthenticated() {
    return false;
  }

  onAuthStateChange() {
    return;
  }

  removeAuthListener() {
    return;
  }
}

export default new AuthService();
