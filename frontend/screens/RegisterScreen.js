import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, Alert, ActivityIndicator
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { register } from '../services/api';

export default function RegisterScreen({ navigation, onRegister }) {
  const [form, setForm] = useState({ email: '', password: '', childName: '', childAge: '', parentName: '' });
  const [loading, setLoading] = useState(false);

  const update = (field, value) => setForm(f => ({ ...f, [field]: value }));

  async function handleRegister() {
    if (!form.email || !form.password || !form.childName || !form.childAge) {
      Alert.alert('Champs manquants', 'Remplis tous les champs obligatoires *');
      return;
    }
    const age = parseInt(form.childAge);
    if (isNaN(age) || age < 5 || age > 16) {
      Alert.alert('Ã‚ge invalide', 'L\'Ã¢ge doit Ãªtre entre 5 et 16 ans');
      return;
    }
    setLoading(true);
    try {
      const res = await register({ ...form, childAge: age });
      await AsyncStorage.setItem('token', res.data.token);
      await AsyncStorage.setItem('user', JSON.stringify(res.data.user));
      onRegister();
    } catch (err) {
      Alert.alert('Erreur', err.response?.data?.error || 'Inscription impossible');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.back}>
          <Text style={styles.backText}>â† Retour</Text>
        </TouchableOpacity>

        <Text style={styles.emoji}>ðŸŒŸ</Text>
        <Text style={styles.title}>CrÃ©er un compte</Text>
        <Text style={styles.subtitle}>Pour commencer l'aventure !</Text>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Informations enfant</Text>
          <Text style={styles.label}>PrÃ©nom de l'enfant *</Text>
          <TextInput style={styles.input} placeholder="Ex: LÃ©a" value={form.childName} onChangeText={v => update('childName', v)} />

          <Text style={styles.label}>Ã‚ge de l'enfant *</Text>
          <TextInput style={styles.input} placeholder="Ex: 9" value={form.childAge} onChangeText={v => update('childAge', v)} keyboardType="numeric" />

          <Text style={styles.sectionTitle}>Compte parent</Text>
          <Text style={styles.label}>PrÃ©nom du parent</Text>
          <TextInput style={styles.input} placeholder="Ex: Marie" value={form.parentName} onChangeText={v => update('parentName', v)} />

          <Text style={styles.label}>Email *</Text>
          <TextInput style={styles.input} placeholder="votre@email.com" value={form.email} onChangeText={v => update('email', v)} keyboardType="email-address" autoCapitalize="none" />

          <Text style={styles.label}>Mot de passe *</Text>
          <TextInput style={styles.input} placeholder="Minimum 6 caractÃ¨res" value={form.password} onChangeText={v => update('password', v)} secureTextEntry />

          <TouchableOpacity style={styles.btn} onPress={handleRegister} disabled={loading}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>CrÃ©er le compte ðŸŽ‰</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F6FF' },
  scroll: { flexGrow: 1, padding: 24 },
  back: { marginBottom: 16 },
  backText: { color: '#6C63FF', fontSize: 16 },
  emoji: { fontSize: 60, textAlign: 'center', marginBottom: 8 },
  title: { fontSize: 32, fontWeight: '900', textAlign: 'center', color: '#6C63FF' },
  subtitle: { fontSize: 16, textAlign: 'center', color: '#888', marginBottom: 24 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0px 8px 24px rgba(0,0,0,0.08)' }
      : { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, elevation: 5 }),
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#6C63FF', marginTop: 12, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 6 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 12, padding: 14, fontSize: 16, marginBottom: 14, color: '#333' },
  btn: { backgroundColor: '#6C63FF', borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});

