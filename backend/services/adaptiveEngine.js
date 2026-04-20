const { chat } = require('./openaiService');


// Questions de diagnostic statiques (fallback mode dÃ©mo)
const DIAGNOSTIC_QUESTIONS = {
  maths: [
    {
      id: 'maths_1', skill: 'compter_1_10', difficulty: 'easy', age_min: 6,
      question: 'Combien font 3 + 4 ?',
      options: ['5', '6', '7', '8'], answer: '7', explanation: '3 + 4 = 7, on compte : 3, puis 4, 5, 6, 7'
    },
    {
      id: 'maths_2', skill: 'addition_simple', difficulty: 'easy', age_min: 6,
      question: 'Sophie a 5 pommes. Elle en mange 2. Combien lui en reste-t-il ?',
      options: ['2', '3', '4', '7'], answer: '3', explanation: '5 - 2 = 3 pommes restantes'
    },
    {
      id: 'maths_3', skill: 'multiplication_base', difficulty: 'medium', age_min: 8,
      question: 'Combien font 6 Ã— 7 ?',
      options: ['36', '42', '48', '54'], answer: '42', explanation: '6 Ã— 7 = 42 (table de 6)'
    },
    {
      id: 'maths_4', skill: 'fractions_intro', difficulty: 'hard', age_min: 10,
      question: 'Quelle fraction reprÃ©sente la moitiÃ© d\'un gÃ¢teau ?',
      options: ['1/4', '1/2', '2/3', '3/4'], answer: '1/2', explanation: 'La moitiÃ© = 1 partie sur 2 = 1/2'
    },
    {
      id: 'maths_5', skill: 'addition_retenue', difficulty: 'medium', age_min: 8,
      question: 'Combien font 47 + 35 ?',
      options: ['72', '82', '73', '83'], answer: '82', explanation: '47 + 35 : 7+5=12, je pose 2 et reporte 1, 4+3+1=8, donc 82'
    },
    {
      id: 'maths_6', skill: 'geometrie_base', difficulty: 'easy', age_min: 6,
      question: 'Combien de cÃ´tÃ©s a un triangle ?',
      options: ['2', '3', '4', '5'], answer: '3', explanation: 'Un triangle a exactement 3 cÃ´tÃ©s et 3 angles'
    },
  ],
  francais: [
    {
      id: 'fr_1', skill: 'mots_simples', difficulty: 'easy', age_min: 6,
      question: 'Combien de syllabes dans le mot "ma-ti-son" ?',
      options: ['1', '2', '3', '4'], answer: '3', explanation: 'Ma-i-son = 3 syllabes : MA - I - SON'
    },
    {
      id: 'fr_2', skill: 'accord_genre', difficulty: 'medium', age_min: 8,
      question: 'Laquelle de ces phrases est correcte ?',
      options: ['La chien est grand', 'Le chien est grande', 'Le chien est grand', 'La chien est grande'],
      answer: 'Le chien est grand', explanation: '"chien" est masculin â†’ "Le" et "grand" sans -e'
    },
    {
      id: 'fr_3', skill: 'conjugaison_present', difficulty: 'medium', age_min: 8,
      question: 'Conjugue "manger" : Nous ___ Ã  la cantine.',
      options: ['mange', 'manges', 'mangeons', 'mangent'], answer: 'mangeons', explanation: 'Nous mangeons - attention au "e" devant -ons pour garder le son doux'
    },
    {
      id: 'fr_4', skill: 'conjugaison_passe', difficulty: 'hard', age_min: 10,
      question: 'Quelle est la forme correcte au passÃ© composÃ© ? "Hier, elle ___ au parc."',
      options: ['allait', 'est allÃ©e', 'ira', 'va'], answer: 'est allÃ©e', explanation: 'PassÃ© composÃ© de "aller" avec "Ãªtre" : elle est allÃ©e'
    },
    {
      id: 'fr_5', skill: 'ponctuation', difficulty: 'easy', age_min: 7,
      question: 'Quel signe met-on Ã  la fin d\'une question ?',
      options: ['.', '!', '?', ','], answer: '?', explanation: 'Une question se termine par un point d\'interrogation ?'
    },
  ],
  sciences: [
    {
      id: 'sci_1', skill: 'vivant_non_vivant', difficulty: 'easy', age_min: 6,
      question: 'Lequel de ces Ã©lÃ©ments est vivant ?',
      options: ['Une pierre', 'Une voiture', 'Un arbre', 'Une chaise'], answer: 'Un arbre', explanation: 'Un arbre est vivant : il grandit, se nourrit et se reproduit'
    },
    {
      id: 'sci_2', skill: 'etats_matiere', difficulty: 'easy', age_min: 7,
      question: 'Dans quel Ã©tat est l\'eau quand elle gÃ¨le ?',
      options: ['Liquide', 'Solide', 'Gazeux', 'Chaud'], answer: 'Solide', explanation: 'Quand l\'eau gÃ¨le (Ã  0Â°C), elle devient solide : la glace'
    },
    {
      id: 'sci_3', skill: 'corps_humain', difficulty: 'easy', age_min: 6,
      question: 'Quel organe pompe le sang dans notre corps ?',
      options: ['Le poumon', 'Le cerveau', 'Le cÅ“ur', 'L\'estomac'], answer: 'Le cÅ“ur', explanation: 'Le cÅ“ur est une pompe musculaire qui fait circuler le sang'
    },
    {
      id: 'sci_4', skill: 'cycle_vie', difficulty: 'medium', age_min: 8,
      question: 'Dans quel ordre pousse une plante ?',
      options: ['Fleur â†’ Graine â†’ Pousse', 'Graine â†’ Pousse â†’ Fleur', 'Pousse â†’ Fleur â†’ Graine', 'Graine â†’ Fleur â†’ Pousse'],
      answer: 'Graine â†’ Pousse â†’ Fleur', explanation: 'Une plante naÃ®t d\'une graine, germe en pousse, puis fleurit'
    },
    {
      id: 'sci_5', skill: 'meteo_saisons', difficulty: 'easy', age_min: 6,
      question: 'En quelle saison les feuilles tombent-elles des arbres ?',
      options: ['Printemps', 'Ã‰tÃ©', 'Automne', 'Hiver'], answer: 'Automne', explanation: 'En automne, les feuilles changent de couleur et tombent'
    },
  ],
  logique: [
    {
      id: 'log_1', skill: 'suites_simples', difficulty: 'easy', age_min: 6,
      question: 'Quelle est la suite ? 2, 4, 6, 8, ___',
      options: ['9', '10', '11', '12'], answer: '10', explanation: 'On ajoute 2 Ã  chaque fois : 8 + 2 = 10'
    },
    {
      id: 'log_2', skill: 'comparaisons', difficulty: 'easy', age_min: 6,
      question: 'Lequel est le plus grand ? 345 ou 354 ?',
      options: ['345', '354', 'Ils sont Ã©gaux', 'Impossible Ã  dire'], answer: '354', explanation: '354 > 345 car au chiffre des dizaines : 5 > 4'
    },
    {
      id: 'log_3', skill: 'suites_complexes', difficulty: 'medium', age_min: 9,
      question: 'Quelle est la suite ? 1, 3, 6, 10, ___',
      options: ['13', '14', '15', '16'], answer: '15', explanation: 'On ajoute 2, puis 3, puis 4, puis 5 : 10 + 5 = 15'
    },
    {
      id: 'log_4', skill: 'problemes_logiques', difficulty: 'medium', age_min: 9,
      question: 'LÃ©a est plus grande que Tom. Tom est plus grand que Marc. Qui est le plus petit ?',
      options: ['LÃ©a', 'Tom', 'Marc', 'Impossible Ã  dire'], answer: 'Marc', explanation: 'LÃ©a > Tom > Marc, donc Marc est le plus petit'
    },
    {
      id: 'log_5', skill: 'deduction', difficulty: 'hard', age_min: 11,
      question: 'Tous les chats sont des animaux. Minou est un chat. Donc Minou est :',
      options: ['Peut-Ãªtre un animal', 'Certainement un animal', 'Pas un animal', 'On ne sait pas'],
      answer: 'Certainement un animal', explanation: 'Syllogisme : si tous les chats sont animaux et Minou est chat, alors Minou est certainement animal'
    },
  ]
};

/**
 * SÃ©lectionne les questions de diagnostic adaptÃ©es Ã  l'Ã¢ge
 */
function selectDiagnosticQuestions(age) {
  const questions = [];

  for (const subject of ['maths', 'francais', 'sciences', 'logique']) {
    const subjectQuestions = DIAGNOSTIC_QUESTIONS[subject]
      .filter(q => q.age_min <= age)
      .slice(0, 3); // max 3 par matiÃ¨re = 12 questions total
    questions.push(...subjectQuestions);
  }

  // MÃ©langer
  return questions.sort(() => Math.random() - 0.5);
}

/**
 * GÃ©nÃ¨re une mission (exercice) avec OpenAI ou fallback
 */
async function generateMission(skill, subject, difficulty, age, previousErrors = []) {
  const systemPrompt = `Tu es un professeur expert pour enfants de ${age} ans.
GÃ©nÃ¨re un exercice engageant pour travailler la compÃ©tence "${skill}" en ${subject}.
RÃ©ponds UNIQUEMENT en JSON valide, sans markdown.`;

  const errorContext = previousErrors.length > 0
    ? `L'enfant a fait des erreurs sur : ${previousErrors.join(', ')}. Adapte l'explication.`
    : 'Premier essai sur cette compÃ©tence.';

  const userMessage = `
CompÃ©tence Ã  travailler : ${skill}
MatiÃ¨re : ${subject}
Niveau de difficultÃ© : ${difficulty}
Ã‚ge de l'enfant : ${age} ans
${errorContext}

GÃ©nÃ¨re un exercice JSON :
{
  "question": "la question (claire, adaptÃ©e Ã  l'Ã¢ge, avec contexte concret)",
  "options": ["option1", "option2", "option3", "option4"],
  "answer": "la bonne rÃ©ponse (doit Ãªtre dans options)",
  "explanation": "explication bienveillante si erreur (2-3 phrases max)",
  "hint": "indice optionnel pour aider",
  "emoji": "1 emoji qui illustre la question",
  "xpReward": ${difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 35}
}`;

  const result = await chat(systemPrompt, userMessage, true, { timeoutMs: 4000, maxAttempts: 1 });

  if (result.demo || !result.question) {
    return getFallbackMission(skill, subject, difficulty);
  }

  return { ...result, skill, subject, difficulty, generated: true };
}

function getFallbackMission(skill, subject, difficulty) {
  const allQuestions = Object.values(DIAGNOSTIC_QUESTIONS).flat();
  const matching = allQuestions.filter(q => q.skill === skill);
  if (matching.length > 0) {
    const q = matching[Math.floor(Math.random() * matching.length)];
    return { ...q, xpReward: difficulty === 'easy' ? 10 : difficulty === 'medium' ? 20 : 35, emoji: 'ðŸ“š' };
  }
  // Question gÃ©nÃ©rique de fallback
  return {
    question: `Exercice de ${subject} - compÃ©tence : ${skill}`,
    options: ['RÃ©ponse A', 'RÃ©ponse B', 'RÃ©ponse C', 'RÃ©ponse D'],
    answer: 'RÃ©ponse A',
    explanation: 'Continue Ã  pratiquer pour maÃ®triser cette compÃ©tence !',
    hint: 'RÃ©flÃ©chis bien avant de rÃ©pondre',
    emoji: 'ðŸŽ¯',
    xpReward: 15,
    skill,
    subject,
  };
}

module.exports = { selectDiagnosticQuestions, generateMission, DIAGNOSTIC_QUESTIONS };


