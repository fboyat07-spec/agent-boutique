class DataService {
  async saveDiagnostic() {
    return { success: false, error: 'Module dataService frontend desactive. Utiliser API backend.' };
  }

  async getDiagnostics() {
    return { success: false, diagnostics: [] };
  }

  async getUserProgress() {
    return { success: false, progress: null };
  }

  async updateProgress() {
    return { success: false };
  }

  async saveLearningSession() {
    return { success: false };
  }

  async completeSession() {
    return { success: false };
  }

  async saveQuestionAnswer() {
    return { success: false };
  }

  async getRecommendations() {
    return { success: false, recommendations: [] };
  }

  async getRecentQuestions() {
    return { success: false, questions: [] };
  }

  async getPreferences() {
    return { success: false, preferences: {} };
  }

  async savePreferences() {
    return { success: false };
  }
}

export default new DataService();
