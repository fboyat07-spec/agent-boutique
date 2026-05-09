'use strict';

const axios = require('axios');

const PLACES_TEXT_SEARCH = 'https://maps.googleapis.com/maps/api/place/textsearch/json';
const PLACES_DETAILS     = 'https://maps.googleapis.com/maps/api/place/details/json';
const DETAILS_FIELDS     = 'name,formatted_phone_number,formatted_address,website,rating,user_ratings_total';

if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.warn('[PROSPECTING] Variable manquante : GOOGLE_MAPS_API_KEY — searchProspects retournera []');
}

/**
 * Normalise un numéro de téléphone vers le format international.
 * Supporte les numéros français locaux (06/07/04…) → +33.
 */
function normalizePhone(raw) {
  if (!raw) return null;
  // Enlever tout sauf chiffres et +
  let n = raw.replace(/[\s.\-()]/g, '');
  // Numéro français local : commence par 0
  if (/^0\d{9}$/.test(n)) {
    n = '+33' + n.slice(1);
  }
  return n;
}

/**
 * Récupère les détails (téléphone, website…) d'un lieu Google Places.
 */
async function fetchDetails(placeId, apiKey) {
  const { data } = await axios.get(PLACES_DETAILS, {
    params: { place_id: placeId, fields: DETAILS_FIELDS, key: apiKey },
    timeout: 8000,
  });
  return data.result || {};
}

/**
 * Recherche des prospects via Google Places Text Search + Place Details.
 *
 * @param {object} opts
 * @param {string} opts.query       - Type de commerce, ex : "restaurant"
 * @param {string} opts.location    - Ville ou zone, ex : "Lyon"
 * @param {number} opts.radius      - Rayon en mètres (défaut 5000)
 * @param {number} opts.maxResults  - Nombre max de résultats (défaut 20)
 * @returns {Promise<Array>}
 */
async function searchProspects({ query, location, radius = 5000, maxResults = 20 }) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.error('[PROSPECTING] GOOGLE_MAPS_API_KEY manquant — annulation recherche');
    return [];
  }

  try {
    // 1. Text Search — on fusionne query + location dans la requête
    const searchQuery = location ? `${query} ${location}` : query;
    console.log('[PROSPECTING] Text Search:', searchQuery, 'radius:', radius);

    const { data: searchData } = await axios.get(PLACES_TEXT_SEARCH, {
      params: { query: searchQuery, radius, key: apiKey },
      timeout: 10000,
    });

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      console.error('[PROSPECTING] Text Search erreur:', searchData.status, searchData.error_message);
      return [];
    }

    const places = (searchData.results || []).slice(0, maxResults);
    console.log('[PROSPECTING] Résultats bruts:', places.length);

    // 2. Place Details en parallèle pour obtenir le téléphone
    const detailsResults = await Promise.allSettled(
      places.map(p => fetchDetails(p.place_id, apiKey))
    );

    const prospects = [];

    for (let i = 0; i < places.length; i++) {
      const settlement = detailsResults[i];
      if (settlement.status !== 'fulfilled') {
        console.warn('[PROSPECTING] Details échoué pour', places[i].name, settlement.reason?.message);
        continue;
      }

      const details = settlement.value;
      const phone   = normalizePhone(details.formatted_phone_number);

      // Filtre : numéro obligatoire
      if (!phone) continue;

      prospects.push({
        name:         details.name         || places[i].name,
        phone,
        address:      details.formatted_address || places[i].formatted_address || '',
        website:      details.website || '',
        rating:       details.rating ?? null,
        ratingsTotal: details.user_ratings_total ?? null,
      });
    }

    console.log('[PROSPECTING] Prospects avec téléphone:', prospects.length);
    return prospects;

  } catch (err) {
    console.error('[PROSPECTING] Erreur Google Places:', err.message);
    return [];
  }
}

module.exports = { searchProspects };
