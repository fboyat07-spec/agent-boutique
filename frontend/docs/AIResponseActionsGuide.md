# 🎯 Guide des Boutons d'Action IA

## 📦 Composant AIResponseActions

Composant qui affiche 3 boutons d'action après chaque réponse IA pour guider l'enfant dans la conversation.

### 🎨 Boutons disponibles

1. **Continuer** ▶️ (Bleu)
   - Action : Poursuivre la conversation sur le même sujet
   - Gradient : `['#007AFF', '#5AC8FA']`
   - Usage : "Super ! Continuons sur cette lancée..."

2. **J'ai compris** ✅ (Vert)
   - Action : Valider la compréhension
   - Gradient : `['#34C759', '#30D158']`
   - Usage : "Génial ! Je suis content que tu aies compris..."

3. **Encore une question** ❓ (Orange)
   - Action : Poser une nouvelle question
   - Gradient : `['#FF9500', '#FF6B00']`
   - Usage : "Parfait ! J'adore ta curiosité. Vas-y..."

## 🚀 Utilisation

### Import
```javascript
import AIResponseActions from '../components/AIResponseActions';
```

### Props
```javascript
<AIResponseActions
  onContinue={() => console.log('Continuer')}
  onUnderstood={() => console.log('J\'ai compris')}
  onMoreQuestions={() => console.log('Plus de questions')}
  disabled={false}
  style={{ marginVertical: 12 }}
/>
```

### Props détaillées
- **onContinue** (function) - Callback bouton "Continuer"
- **onUnderstood** (function) - Callback bouton "J'ai compris"
- **onMoreQuestions** (function) - Callback bouton "Encore une question"
- **disabled** (boolean) - Désactiver tous les boutons (défaut: false)
- **style** (object) - Style personnalisé du conteneur

## 🔧 Intégration avec ChatBubble

### Mise à jour de ChatBubble
```javascript
const ChatBubble = ({ 
  message, 
  isUser = false, 
  showActions = false,
  onContinue,
  onUnderstood,
  onMoreQuestions
}) => {
  return (
    <View style={styles.container}>
      {/* Message bubble */}
      <Text>{message}</Text>
      
      {/* Boutons d'action uniquement pour les messages IA */}
      {!isUser && !isTyping && showActions && (
        <AIResponseActions
          onContinue={onContinue}
          onUnderstood={onUnderstood}
          onMoreQuestions={onMoreQuestions}
          disabled={isTyping}
        />
      )}
    </View>
  );
};
```

## 📱 Hook useChatAnimation mis à jour

### Nouvelle fonctionnalité
```javascript
const addAIResponse = useCallback((text, onTypingComplete, showActions = true) => {
  // ... logique existante
  
  setMessages(prev => [...prev, {
    id: messageId,
    text,
    isUser: false,
    isTyping: true,
    showActions: false, // Actions cachées pendant typing
  }]);
  
  // Les actions apparaissent après le typing
  setTimeout(() => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, isTyping: false, showActions } : msg
    ));
  }, typingDuration);
}, []);
```

## 🎨 Personnalisation

### Modifier les couleurs
```javascript
// Dans AIResponseActions.js
const gradients = {
  continue: ['#007AFF', '#5AC8FA'],    // Bleu
  understood: ['#34C759', '#30D158'],  // Vert
  moreQuestions: ['#FF9500', '#FF6B00'] // Orange
};
```

### Modifier les icônes
```javascript
const icons = {
  continue: '▶️',
  understood: '✅',
  moreQuestions: '❓'
};
```

### Modifier le texte
```javascript
const buttonTexts = {
  continue: 'Continuer',
  understood: 'J\'ai compris',
  moreQuestions: 'Encore une question'
};
```

## 🎯 Exemple d'utilisation complet

```javascript
import React, { useState } from 'react';
import ChatBubble from '../components/ChatBubble';
import useChatAnimation from '../hooks/useChatAnimation';

const ChatScreen = () => {
  const [inputText, setInputText] = useState('');
  const { messages, addUserMessage, addAIResponse } = useChatAnimation();

  const handleContinue = () => {
    addAIResponse("Super ! Continuons sur cette lancée. Quelle serait ta prochaine question ?");
  };

  const handleUnderstood = () => {
    addAIResponse("Génial ! Je suis content que tu aies compris. N'hésite pas si tu as d'autres questions !");
  };

  const handleMoreQuestions = () => {
    addAIResponse("Parfait ! J'adore ta curiosité. Vas-y, je suis prêt pour ta question !");
  };

  const renderMessage = ({ item }) => (
    <ChatBubble
      message={item.text}
      isUser={item.isUser}
      isTyping={item.isTyping}
      showActions={item.showActions}
      onContinue={handleContinue}
      onUnderstood={handleUnderstood}
      onMoreQuestions={handleMoreQuestions}
    />
  );

  return (
    <FlatList
      data={messages}
      renderItem={renderMessage}
      keyExtractor={item => item.id.toString()}
    />
  );
};
```

## ✨ Caractéristiques avancées

### 🎬 Animations
- **Fade in** : Apparition progressive des boutons
- **Press feedback** : Animation légère au toucher
- **Disabled state** : Opacité réduite quand désactivé

### 🎨 Design
- **Gradient buttons** : Boutons avec dégradé moderne
- **Icons** : Icônes emoji pour reconnaissance rapide
- **Responsive** : S'adapte à la taille de l'écran
- **Shadow** : Ombre subtile pour effet de profondeur

### 🧠 Comportement intelligent
- **Apparition différée** : Les boutons apparaissent après le typing
- **Disabled pendant typing** : Pas d'action pendant l'animation
- **Auto-scroll** : Scroll automatique vers les nouveaux messages

## 🔧 Bonnes pratiques

### Quand afficher les boutons
- ✅ **Après chaque réponse IA** complète
- ❌ **Pendant le typing** de l'IA
- ❌ **Pour les messages utilisateur**
- ❌ **Pendant le chargement**

### Réponses appropriées
```javascript
// Bouton Continuer
"Super ! Continuons sur cette lancée. Quelle serait ta prochaine question ?"

// Bouton J'ai compris
"Génial ! Je suis content que tu aies compris. N'hésite pas si tu as d'autres questions !"

// Bouton Encore une question
"Parfait ! J'adore ta curiosité. Vas-y, je suis prêt pour ta question !"
```

### Accessibilité
- **Texte clair** et concis
- **Icônes reconnaissables**
- **Couleurs contrastées**
- **Feedback tactile** au toucher

---

**Pro tip :** Les boutons d'action encouragent l'enfant à continuer la conversation de manière structurée ! 🚀
