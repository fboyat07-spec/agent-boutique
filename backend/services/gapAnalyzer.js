const { chat } = require('./openaiService');

// Service d'analyse de lacunes - mode dÃ©mo uniquement

// Graphe de compÃ©tences : chaque compÃ©tence a ses prÃ©requis
const KNOWLEDGE_GRAPH = {
  maths: {
    'compter_1_10':        { label: 'Compter de 1 Ã  10',          requires: [] },
    'compter_1_100':       { label: 'Compter de 1 Ã  100',         requires: ['compter_1_10'] },
    'addition_simple':     { label: 'Addition simple (<10)',       requires: ['compter_1_10'] },
    'soustraction_simple': { label: 'Soustraction simple (<10)',   requires: ['addition_simple'] },
    'addition_retenue':    { label: 'Addition avec retenue',       requires: ['addition_simple', 'compter_1_100'] },
    'multiplication_base': { label: 'Tables de multiplication',    requires: ['addition_simple'] },
    'division_base':       { label: 'Division simple',             requires: ['multiplication_base'] },
    'fractions_intro':     { label: 'Introduction aux fractions',  requires: ['division_base'] },
    'geometrie_base':      { label: 'Formes gÃ©omÃ©triques',         requires: ['compter_1_10'] },
  },
  francais: {
    'lettres_alphabet':    { label: 'Alphabet et lettres',         requires: [] },
    'syllabes':            { label: 'Syllabes et sons',            requires: ['lettres_alphabet'] },
    'mots_simples':        { label: 'Lecture de mots simples',     requires: ['syllabes'] },
    'phrases_simples':     { label: 'Lecture de phrases simples',  requires: ['mots_simples'] },
    'conjugaison_present': { label: 'Conjugaison au prÃ©sent',      requires: ['phrases_simples'] },
    'accord_genre':        { label: 'Accord genre/nombre',         requires: ['phrases_simples'] },
    'conjugaison_passe':   { label: 'Conjugaison au passÃ©',        requires: ['conjugaison_present'] },
    'ponctuation':         { label: 'Ponctuation de base',         requires: ['phrases_simples'] },
    'vocabulaire_base':    { label: 'Vocabulaire courant',         requires: ['mots_simples'] },
  },
  sciences: {
    'vivant_non_vivant':   { label: 'Vivant vs non-vivant',        requires: [] },
    'cycle_vie':           { label: 'Cycle de vie des plantes',    requires: ['vivant_non_vivant'] },
    'corps_humain':        { label: 'Parties du corps humain',     requires: ['vivant_non_vivant'] },
    'etats_matiere':       { label: 'Ã‰tats de la matiÃ¨re',         requires: [] },
    'meteo_saisons':       { label: 'MÃ©tÃ©o et saisons',            requires: [] },
    'animaux_habitats':    { label: 'Animaux et leurs habitats',   requires: ['vivant_non_vivant'] },
    'alimentation':        { label: 'Alimentation et digestion',   requires: ['corps_humain'] },
  },
  logique: {
    'suites_simples':      { label: 'Suites logiques simples',     requires: [] },
    'formes_couleurs':     { label: 'Trier par formes/couleurs',   requires: [] },
    'comparaisons':        { label: 'Plus grand, plus petit',      requires: ['suites_simples'] },
    'suites_complexes':    { label: 'Suites logiques complexes',   requires: ['suites_simples'] },
    'problemes_logiques':  { label: 'ProblÃ¨mes logiques',          requires: ['comparaisons'] },
    'deduction':           { label: 'Raisonnement dÃ©ductif',       requires: ['problemes_logiques'] },
  }
};

/**
 * Analyse les rÃ©ponses du diagnostic et dÃ©tecte les lacunes
 * @param {Array} answers - [{questionId, skill, subject, correct, timeSpent}]
 * @param {number} age
 * @returns {Object} - rapport complet avec lacunes et parcours
 */
async function analyzeGaps(answers, age) {
  // 1. Calculer les scores par compÃ©tence
  const skillScores = {};
  for (const answer of answers) {
    if (!skillScores[answer.skill]) {
      skillScores[answer.skill] = { correct: 0, total: 0, subject: answer.subject, avgTime: 0, times: [] };
    }
    skillScores[answer.skill].total++;
    if (answer.correct) skillScores[answer.skill].correct++;
    skillScores[answer.skill].times.push(answer.timeSpent || 0);
  }

  // Calculer moyennes temps
  for (const skill of Object.keys(skillScores)) {
    const times = skillScores[skill].times;
    skillScores[skill].avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    skillScores[skill].accuracy = skillScores[skill].correct / skillScores[skill].total;
  }

  // 2. Identifier les lacunes directes (accuracy < 60%)
  const directGaps = Object.entries(skillScores)
    .filter(([, s]) => s.accuracy < 0.6)
    .map(([skill, s]) => ({ skill, subject: s.subject, accuracy: s.accuracy, avgTime: s.avgTime }));

  // 3. Remonter aux prÃ©requis manquants (lacunes fondamentales)
  const fundamentalGaps = [];
  for (const gap of directGaps) {
    const subjectGraph = KNOWLEDGE_GRAPH[gap.subject];
    if (!subjectGraph || !subjectGraph[gap.skill]) continue;

    const prereqs = subjectGraph[gap.skill].requires;
    for (const prereq of prereqs) {
      // Si prÃ©requis pas testÃ© ou Ã©chouÃ© aussi
      const prereqScore = skillScores[prereq];
      if (!prereqScore || prereqScore.accuracy < 0.7) {
        fundamentalGaps.push({
          skill: prereq,
          subject: gap.subject,
          label: subjectGraph[prereq]?.label || prereq,
          causedBy: gap.skill,
          priority: 'high'
        });
      }
    }
  }

  // 4. Analyser avec l'IA pour un rapport pÃ©dagogique riche
  const aiAnalysis = await getAIAnalysis(skillScores, directGaps, fundamentalGaps, age);

  // 5. Construire le parcours personnalisÃ©
  const learningPath = buildLearningPath(directGaps, fundamentalGaps, age);

  return {
    skillScores,
    directGaps,
    fundamentalGaps: [...new Map(fundamentalGaps.map(g => [g.skill, g])).values()],
    aiAnalysis,
    learningPath,
    overallLevel: calculateOverallLevel(skillScores),
    strengths: Object.entries(skillScores)
      .filter(([, s]) => s.accuracy >= 0.8)
      .map(([skill, s]) => ({ skill, subject: s.subject, accuracy: s.accuracy })),
  };
}

async function getAIAnalysis(skillScores, directGaps, fundamentalGaps, age) {
  const systemPrompt = `Tu es un expert en pÃ©dagogie pour enfants de ${age} ans. 
Analyse les rÃ©sultats d'un diagnostic d'apprentissage et fournis un rapport bienveillant et actionnable.
RÃ©ponds UNIQUEMENT en JSON valide.`;

  const userMessage = `
Voici les rÃ©sultats du diagnostic :
- Scores par compÃ©tence : ${JSON.stringify(skillScores, null, 2)}
- Lacunes identifiÃ©es : ${JSON.stringify(directGaps, null, 2)}
- Lacunes fondamentales (prÃ©requis) : ${JSON.stringify(fundamentalGaps, null, 2)}

GÃ©nÃ¨re un rapport JSON avec :
{
  "summary": "rÃ©sumÃ© bienveillant en 2 phrases pour l'enfant",
  "parentSummary": "rÃ©sumÃ© pour les parents en 3 phrases",
  "mainWeakness": "LA lacune principale Ã  corriger en prioritÃ©",
  "mainStrength": "LE point fort principal",
  "encouragement": "message d'encouragement personnalisÃ©",
  "weeklyFocus": ["compÃ©tence1_Ã _travailler", "compÃ©tence2_Ã _travailler"]
}`;

  // Mode démo - analyse simulée sans IA
  const result = { demo: true };
  
  if (result.demo) {
    return {
      summary: "Super travail ! Tu as bien rÃ©pondu Ã  beaucoup de questions. Continuons Ã  explorer ensemble !",
      parentSummary: "Votre enfant montre de bonnes bases. Quelques lacunes spÃ©cifiques ont Ã©tÃ© identifiÃ©es et nous allons y travailler de maniÃ¨re ciblÃ©e.",
      mainWeakness: directGaps[0]?.skill || 'Ã€ dÃ©terminer',
      mainStrength: 'Engagement et participation',
      encouragement: "Tu es capable de grandes choses ! Chaque erreur est une occasion d'apprendre. ðŸŒŸ",
      weeklyFocus: directGaps.slice(0, 2).map(g => g.skill),
    };
  }

  return result;
}

function buildLearningPath(directGaps, fundamentalGaps, age) {
  // Prioriser : d'abord les fondamentaux, puis les lacunes directes
  const allGaps = [
    ...fundamentalGaps.map(g => ({ ...g, priority: 1 })),
    ...directGaps.map(g => ({ ...g, priority: 2 })),
  ];

  // DÃ©dupliquer
  const seen = new Set();
  const unique = allGaps.filter(g => {
    if (seen.has(g.skill)) return false;
    seen.add(g.skill);
    return true;
  });

  // CrÃ©er les missions pour chaque lacune
  return unique.slice(0, 6).map((gap, index) => ({
    order: index + 1,
    skill: gap.skill,
    subject: gap.subject,
    label: gap.label || gap.skill,
    missionsCount: 3,
    difficulty: age <= 8 ? 'easy' : age <= 11 ? 'medium' : 'hard',
    estimatedMinutes: age <= 8 ? 5 : 8,
  }));
}

function calculateOverallLevel(skillScores) {
  const accuracies = Object.values(skillScores).map(s => s.accuracy);
  if (accuracies.length === 0) return 'beginner';
  const avg = accuracies.reduce((a, b) => a + b, 0) / accuracies.length;
  if (avg >= 0.8) return 'advanced';
  if (avg >= 0.6) return 'intermediate';
  return 'beginner';
}

module.exports = { analyzeGaps, KNOWLEDGE_GRAPH };

