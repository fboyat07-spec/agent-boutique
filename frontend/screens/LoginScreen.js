import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { login } from '../services/api';

export default function LoginScreen({ navigation, onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Champs manquants', 'Remplis l\'email et le mot de passe');
      return;
    }
    setLoading(true);
    try {
      const res = await login({ email, password });
      await AsyncStorage.setItem('token', res.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(res.data.user));
      onLogin();
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Connexion impossible. Vérifie tes identifiants.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.emoji}>🧠</Text>
        <Text style={styles.title}>KidAI</Text>
        <Text style={styles.subtitle}>L'apprentissage adapté à ton enfant</Text>

        <View style={styles.card}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="parent@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.label}>Mot de passe</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity style={styles.btn} onPress={handleLogin} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Se connecter 🚀</Text>}
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.navigate('Register')}>
            <Text style={styles.link}>Pas encore de compte ? Créer un compte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emoji: { fontSize: 72, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 40, fontWeight: '900', textAlign: 'center', color: '#6C63FF' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#888', marginBottom: 32 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 8px 24px rgba(0,0,0,0.08)' }
      : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, elevation: 5 }),
  },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 16, color: '#333' },
  btn: { backgroundColor: '#6C63FF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  link: { textAlign: 'center', marginTop: 16, color: '#6C63FF', fontSize: 14 },
});
