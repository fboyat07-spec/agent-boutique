class InteractionService {
  async initialize() {
    return { success: true };
  }

  async handleInteraction() {
    return { success: false, error: 'InteractionService frontend desactive (legacy).' };
  }

  async sendMessage() {
    return { success: false, error: 'InteractionService frontend desactive (legacy).' };
  }

  async getInteractionStats() {
    return { success: false, stats: null, interactions: [] };
  }

  async resetTestData() {
    return { success: false };
  }
}

export default new InteractionService();
