class ProgressionService {
  async initialize() {
    return { success: true };
  }

  async handleInteraction() {
    return { success: false, error: 'ProgressionService frontend desactive (legacy).' };
  }

  async getCurrentProgress() {
    return { success: false, progress: null };
  }

  calculateStats() {
    return null;
  }

  async simulateInteraction() {
    return { success: false };
  }

  async getRecentInteractions() {
    return { success: false, interactions: [] };
  }

  async resetProgress() {
    return { success: false };
  }
}

export default new ProgressionService();
