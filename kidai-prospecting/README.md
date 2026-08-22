# Prospection KidAI Learning — bibliothèques/médiathèques + éditeurs

Chantier relancé le 2026-08-22 après perte des CSV produits dans un scratchpad
de session non persistant. Les scripts ci-dessous reproduisent à l'identique
les décisions déjà validées par Florian.

**Ces scripts doivent être exécutés EN LOCAL** (machine avec accès internet).
Le container cloud de la session Claude Code n'a pas d'accès sortant vers
`data.gouv.fr` ni `recherche-entreprises.api.gouv.fr` (confirmé bloqué par la
politique réseau de l'environnement, 403 sur le proxy d'egress).

## Prérequis

```bash
npm install   # à la racine du repo (axios, csv-parser déjà en dépendances)
```

## Étape 1 — Bibliothèques/médiathèques

```bash
cd kidai-prospecting
node fetch_bibliotheques.js
```

Télécharge le dataset officiel data.gouv.fr, affiche les valeurs réelles de la
colonne Statut, filtre, et écrit `data/kidai_bibliotheques_filtrees.csv`.

## Étape 2 — Éditeurs

```bash
node fetch_editeurs.js
```

Interroge `recherche-entreprises.api.gouv.fr` (NAF 58.11Z, France entière),
filtre sur les tranches d'effectif 0-49 salariés, déduplique par SIRET, écrit
`data/kidai_editeurs_5811z.csv`.

## Étape 3 — Enrichissement Google Places (éditeurs uniquement)

```bash
export GOOGLE_PLACES_API_KEY=...   # ou GOOGLE_MAPS_API_KEY
node enrich_editeurs_places.js
```

Vérifie la clé sur une requête de test avant de lancer le batch. Si la clé est
absente/invalide, s'arrête sans rien consommer et affiche la marche à suivre
(Google Cloud Console → APIs & Services → Credentials → activer "Places API"
legacy). Checkpoint tous les 50 éditeurs (`data/enrich_editeurs.checkpoint.json`)
— relancer le script reprend automatiquement où il s'est arrêté.

**Ne PAS lancer cette étape sur les bibliothèques** — leur taux de téléphone
direct (~85%) déjà présent dans le dataset officiel suffit comme premier canal.

## Persistance

Chaque étape terminée doit être commitée séparément dans `data/` — ne pas
attendre la fin du chantier complet.
