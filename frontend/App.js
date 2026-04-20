import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text, View, ActivityIndicator } from 'react-native';
import { getProfile } from './services/api';

import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import HomeScreen from './screens/HomeScreen';
import DiagnosticScreen from './screens/DiagnosticScreen';
import DiagnosticResultScreen from './screens/DiagnosticResultScreen';
import MissionScreen from './screens/MissionScreen';
import MissionResultScreen from './screens/MissionResultScreen';
import AITutorScreen from './screens/AITutorScreen';
import ProgressScreen from './screens/ProgressScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function TabIcon({ name, focused }) {
  const icons = { Home: '🏠', Mission: '🎯', Tuteur: '🤖', Progrès: '📊' };
  return <Text style={{ fontSize: focused ? 24 : 20 }}>{icons[name]}</Text>;
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => <TabIcon name={route.name} focused={focused} />,
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#999',
        tabBarStyle: { paddingBottom: 5, height: 60 },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Accueil' }} />
      <Tab.Screen name="Mission" component={MissionScreen} options={{ title: 'Mission' }} />
      <Tab.Screen name="Tuteur" component={AITutorScreen} options={{ title: 'Tuteur IA' }} />
      <Tab.Screen name="Progrès" component={ProgressScreen} options={{ title: 'Progrès' }} />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const token = await AsyncStorage.getItem('token');
    console.log('Token trouve:', !!token);

    if (!token) {
      setIsLoggedIn(false);
      setIsLoading(false);
      return;
    }

    try {
      await getProfile();
      setIsLoggedIn(true);
    } catch (error) {
      console.log('Token invalide, nettoyage session locale');
      await AsyncStorage.multiRemove(['token', 'user']);
      setIsLoggedIn(false);
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F6FF' }}>
        <Text style={{ fontSize: 48, marginBottom: 20 }}>🧠</Text>
        <ActivityIndicator size="large" color="#6C63FF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isLoggedIn ? (
          <>
            <Stack.Screen name="Login">
              {(props) => <LoginScreen {...props} onLogin={() => setIsLoggedIn(true)} />}
            </Stack.Screen>
            <Stack.Screen name="Register">
              {(props) => <RegisterScreen {...props} onRegister={() => setIsLoggedIn(true)} />}
            </Stack.Screen>
          </>
        ) : (
          <>
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="Diagnostic" component={DiagnosticScreen} />
            <Stack.Screen name="DiagnosticResult" component={DiagnosticResultScreen} />
            <Stack.Screen name="MissionResult" component={MissionResultScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
