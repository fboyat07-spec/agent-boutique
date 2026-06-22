'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Produit du catalogue (importé via CSV depuis la console). Sous-doc, pas d'_id.
const ProductSchema = new mongoose.Schema({
  reference:   { type: String, default: '' },
  nom:         { type: String, default: '' },
  categorie:   { type: String, default: '' },
  genre:       { type: String, default: '' },   // homme/femme/enfant/mixte
  saison:      { type: String, default: '' },   // été/hiver/mi-saison/toute-saison (texte libre)
  tailles:     { type: [String], default: [] },
  couleurs:    { type: [String], default: [] },
  prix:        { type: Number, default: 0 },
  stock:       { type: Number, default: 0 },
  description: { type: String, default: '' },
}, { _id: false });

const UserSchema = new mongoose.Schema({
  user_id:             { type: String, default: () => uuidv4(), unique: true, index: true },
  tenant_id:           { type: String, required: true, index: true },
  email:               { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password_hash:       { type: String, required: true },

  role:                { type: String, enum: ['admin', 'parent', 'teacher', 'student'], default: 'admin' },

  first_name:          { type: String, default: '' },
  last_name:           { type: String, default: '' },
  phone:               { type: String, default: '' },
  store_name:          { type: String, default: '' },

  // SaaS / Stripe
  subscription_status: { type: String, enum: ['trial', 'active', 'cancelled', 'past_due', 'inactive'], default: 'inactive' },
  plan:                { type: String, default: 'starter' },
  stripe_customer_id:  { type: String, default: null },

  // Auth
  last_login:          { type: Date, default: null },
  login_count:         { type: Number, default: 0 },
  failed_attempts:     { type: Number, default: 0 },
  locked_until:        { type: Date, default: null },
  email_verified:      { type: Boolean, default: false },

  status:              { type: String, enum: ['active', 'inactive', 'suspended', 'deleted'], default: 'active' },

  // Instructions dynamiques injectées dans le system prompt de l'orchestrateur
  agent_instructions:  { type: String, default: '' },

  // Lien Calendly injecté dans le system prompt si renseigné
  calendly_link:       { type: String, default: '' },

  // Catalogue produits du tenant (importé CSV). Injecté dans le system prompt si non vide.
  catalog:             { type: [ProductSchema], default: [] },
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Hash automatique du mot de passe si modifié
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password_hash')) return next();
  // Si déjà un hash bcrypt ($2a$/$2b$/$2y$), on ne re-hash pas
  if (/^\$2[aby]\$/.test(this.password_hash)) return next();
  try {
    this.password_hash = await bcrypt.hash(this.password_hash, 12);
    next();
  } catch (err) {
    next(err);
  }
});

UserSchema.methods.comparePassword = function(plain) {
  if (!this.password_hash) return Promise.resolve(false);
  return bcrypt.compare(plain, this.password_hash);
};

UserSchema.methods.isLocked = function() {
  return this.locked_until && this.locked_until > new Date();
};

module.exports = mongoose.model('User', UserSchema);
