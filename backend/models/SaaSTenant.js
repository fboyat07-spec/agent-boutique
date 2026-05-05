const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const SaaSTenantSchema = new mongoose.Schema({
  tenant_id: { type: String, default: () => uuidv4(), unique: true },
  name: { type: String, required: true },
  whatsapp_token: { type: String, required: true },
  phone_number_id: { type: String, required: true },
  verify_token: { type: String, required: true },
  webhook_url: { type: String, default: null },
  settings: {
    business_name: { type: String, default: '' },
    business_category: { type: String, default: '' },
    timezone: { type: String, default: 'Europe/Paris' },
    auto_reply_enabled: { type: Boolean, default: true },
    working_hours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '18:00' },
      timezone: { type: String, default: 'Europe/Paris' }
    },
    ai_settings: {
      provider: { type: String, enum: ['openai', 'ollama'], default: 'openai' },
      model: { type: String, default: 'gpt-4' },
      temperature: { type: Number, default: 0.7 },
      max_tokens: { type: Number, default: 150 }
    },
    stripe_settings: {
      price_id: { type: String, default: 'price_1month' },
      currency: { type: String, default: 'eur' },
      trial_days: { type: Number, default: 7 }
    }
  },
  subscription_status: { 
    type: String, 
    enum: ['trial', 'active', 'cancelled', 'past_due'], 
    default: 'trial' 
  },
  stripe_subscription_id: { type: String, default: null },
  created_by: { type: String, required: true },
  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SaaSTenant', SaaSTenantSchema);
