// ACTION 2 - Persistance minimale lead (mémoire sécurisée Map + déduplication)

const crypto = require('crypto');

// Mémoire sécurisée pour les leads (Map globale)
if (!global.leadMemory) {
  global.leadMemory = new Map();
}

// Hash téléphone pour sécurité
function hashPhone(phone) {
  return crypto.createHash('sha256').update(phone).digest('hex').slice(0, 16);
}

// Créer ou retrouver lead (SAFE)
function createOrGetLead(phone, tenant_id) {
  const phoneHash = hashPhone(phone);
  const key = `${phoneHash}:${tenant_id}`;
  
  let lead = global.leadMemory.get(key);
  
  if (!lead) {
    lead = {
      phone,
      status: 'NEW',
      score: 0,
      createdAt: new Date(),
      lastContactAt: null,
      paymentLinkSentAt: null,
      tenant_id,
      followUpSentAt: null
    };
    
    global.leadMemory.set(key, lead);
    console.log('[LEAD_CREATED]', { phone, tenant_id });
  } else {
    console.log('[LEAD_FOUND]', { phone, status: lead.status });
  }
  
  return lead;
}

// Mettre à jour lead (SAFE)
function updateLead(phone, tenant_id, updates) {
  const phoneHash = hashPhone(phone);
  const key = `${phoneHash}:${tenant_id}`;
  
  const lead = global.leadMemory.get(key);
  if (!lead) {
    console.log('[LEAD_UPDATE_FAILED] Not found', { phone, tenant_id });
    return null;
  }
  
  // Protection: ne pas modifier WON/LOST
  if (lead.status === 'WON' || lead.status === 'LOST') {
    console.log('[LEAD_UPDATE_BLOCKED] Final status', { phone, status: lead.status });
    return lead;
  }
  
  // Appliquer updates
  Object.assign(lead, updates, { updatedAt: new Date() });
  
  console.log('[LEAD_UPDATED]', { phone, updates: Object.keys(updates) });
  return lead;
}

// Récupérer lead
function getLead(phone, tenant_id) {
  const phoneHash = hashPhone(phone);
  const key = `${phoneHash}:${tenant_id}`;
  return global.leadMemory.get(key) || null;
}

// Stats mémoire
function getMemoryStats() {
  return {
    totalLeads: global.leadMemory.size,
    byStatus: Array.from(global.leadMemory.values()).reduce((acc, lead) => {
      acc[lead.status] = (acc[lead.status] || 0) + 1;
      return acc;
    }, {})
  };
}

module.exports = {
  createOrGetLead,
  updateLead,
  getLead,
  getMemoryStats
};
