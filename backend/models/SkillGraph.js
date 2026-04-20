/**
 * Skill Dependency Graph System
 * Defines learning dependencies and prerequisites for adaptive learning
 */
class SkillGraph {
  constructor() {
    this.skills = this.initializeSkills();
    this.dependencies = this.initializeDependencies();
    this.difficultyLevels = this.initializeDifficultyLevels();
  }

  initializeSkills() {
    return {
      // Foundational Skills
      'counting': {
        id: 'counting',
        name: 'Compter',
        category: 'numbers',
        description: 'Compter des objets et reconnaître les chiffres',
        grade_min: 'CP',
        grade_max: 'CP',
        estimated_time: 5 // minutes to learn
      },
      'number_recognition': {
        id: 'number_recognition',
        name: 'Reconnaissance des nombres',
        category: 'numbers',
        description: 'Reconnaître et écrire les nombres',
        grade_min: 'CP',
        grade_max: 'CE1',
        estimated_time: 10
      },
      
      // Basic Operations
      'addition_concept': {
        id: 'addition_concept',
        name: 'Concept d\'addition',
        category: 'operations',
        description: 'Comprendre ce qu\'est une addition',
        grade_min: 'CP',
        grade_max: 'CP',
        estimated_time: 15
      },
      'addition_facts': {
        id: 'addition_facts',
        name: 'Tables d\'addition',
        category: 'operations',
        description: 'Maîtriser les additions simples',
        grade_min: 'CP',
        grade_max: 'CE1',
        estimated_time: 20
      },
      'subtraction_concept': {
        id: 'subtraction_concept',
        name: 'Concept de soustraction',
        category: 'operations',
        description: 'Comprendre ce qu\'est une soustraction',
        grade_min: 'CP',
        grade_max: 'CE1',
        estimated_time: 15
      },
      'subtraction_facts': {
        id: 'subtraction_facts',
        name: 'Tables de soustraction',
        category: 'operations',
        description: 'Maîtriser les soustractions simples',
        grade_min: 'CE1',
        grade_max: 'CE2',
        estimated_time: 20
      },
      
      // Advanced Operations
      'multiplication_concept': {
        id: 'multiplication_concept',
        name: 'Concept de multiplication',
        category: 'operations',
        description: 'Comprendre la multiplication comme addition répétée',
        grade_min: 'CE2',
        grade_max: 'CE2',
        estimated_time: 20
      },
      'multiplication_facts': {
        id: 'multiplication_facts',
        name: 'Tables de multiplication',
        category: 'operations',
        description: 'Maîtriser les tables de multiplication',
        grade_min: 'CE2',
        grade_max: 'CM1',
        estimated_time: 30
      },
      'division_concept': {
        id: 'division_concept',
        name: 'Concept de division',
        category: 'operations',
        description: 'Comprendre la division comme partage',
        grade_min: 'CM1',
        grade_max: 'CM1',
        estimated_time: 25
      },
      'division_facts': {
        id: 'division_facts',
        name: 'Tables de division',
        category: 'operations',
        description: 'Maîtriser les divisions simples',
        grade_min: 'CM1',
        grade_max: 'CM2',
        estimated_time: 30
      },
      
      // Fractions and Decimals
      'fractions_concept': {
        id: 'fractions_concept',
        name: 'Concept de fractions',
        category: 'fractions',
        description: 'Comprendre ce qu\'est une fraction',
        grade_min: 'CM1',
        grade_max: 'CM2',
        estimated_time: 25
      },
      'fraction_operations': {
        id: 'fraction_operations',
        name: 'Opérations sur les fractions',
        category: 'fractions',
        description: 'Additionner et soustraire des fractions',
        grade_min: 'CM2',
        grade_max: '6e',
        estimated_time: 35
      },
      'decimals': {
        id: 'decimals',
        name: 'Nombres décimaux',
        category: 'numbers',
        description: 'Comprendre et utiliser les nombres décimaux',
        grade_min: 'CM2',
        grade_max: '6e',
        estimated_time: 30
      },
      
      // Geometry
      'shapes_2d': {
        id: 'shapes_2d',
        name: 'Formes géométriques 2D',
        category: 'geometry',
        description: 'Reconnaître et décrire les formes planes',
        grade_min: 'CP',
        grade_max: 'CE1',
        estimated_time: 15
      },
      'shapes_3d': {
        id: 'shapes_3d',
        name: 'Formes géométriques 3D',
        category: 'geometry',
        description: 'Reconnaître et décrire les solides',
        grade_min: 'CE2',
        grade_max: 'CM1',
        estimated_time: 20
      },
      'area_perimeter': {
        id: 'area_perimeter',
        name: 'Aire et périmètre',
        category: 'geometry',
        description: 'Calculer l\'aire et le périmètre',
        grade_min: 'CM2',
        grade_max: '6e',
        estimated_time: 30
      },
      
      // Measurement
      'length_measurement': {
        id: 'length_measurement',
        name: 'Mesure de longueur',
        category: 'measurement',
        description: 'Mesurer et comparer des longueurs',
        grade_min: 'CE1',
        grade_max: 'CE2',
        estimated_time: 20
      },
      'weight_measurement': {
        id: 'weight_measurement',
        name: 'Mesure de poids',
        category: 'measurement',
        description: 'Mesurer et comparer des poids',
        grade_min: 'CE2',
        grade_max: 'CM1',
        estimated_time: 20
      },
      'time_telling': {
        id: 'time_telling',
        name: 'Lire l\'heure',
        category: 'measurement',
        description: 'Lire l\'heure sur une horloge',
        grade_min: 'CE1',
        grade_max: 'CE2',
        estimated_time: 15
      },
      'money': {
        id: 'money',
        name: 'Argent et monnaie',
        category: 'measurement',
        description: 'Comprendre et utiliser la monnaie',
        grade_min: 'CE2',
        grade_max: 'CM2',
        estimated_time: 25
      },
      
      // Problem Solving
      'word_problems_simple': {
        id: 'word_problems_simple',
        name: 'Problèmes simples',
        category: 'problem_solving',
        description: 'Résoudre des problèmes mathématiques simples',
        grade_min: 'CE1',
        grade_max: 'CE2',
        estimated_time: 25
      },
      'word_problems_complex': {
        id: 'word_problems_complex',
        name: 'Problèmes complexes',
        category: 'problem_solving',
        description: 'Résoudre des problèmes mathématiques complexes',
        grade_min: 'CM2',
        grade_max: '6e',
        estimated_time: 35
      },
      
      // Data and Statistics
      'data_representation': {
        id: 'data_representation',
        name: 'Représentation de données',
        category: 'data',
        description: 'Lire et créer des graphiques simples',
        grade_min: 'CM2',
        grade_max: '6e',
        estimated_time: 25
      },
      'averages': {
        id: 'averages',
        name: 'Moyennes',
        category: 'data',
        description: 'Calculer des moyennes simples',
        grade_min: '6e',
        grade_max: '6e',
        estimated_time: 20
      }
    };
  }

  initializeDependencies() {
    return {
      'addition_concept': ['counting', 'number_recognition'],
      'addition_facts': ['addition_concept'],
      'subtraction_concept': ['addition_concept', 'counting'],
      'subtraction_facts': ['subtraction_concept', 'addition_facts'],
      'multiplication_concept': ['addition_facts'],
      'multiplication_facts': ['multiplication_concept', 'addition_facts'],
      'division_concept': ['multiplication_facts', 'subtraction_facts'],
      'division_facts': ['division_concept', 'multiplication_facts'],
      'fractions_concept': ['division_concept'],
      'fraction_operations': ['fractions_concept', 'addition_facts', 'subtraction_facts'],
      'decimals': ['fractions_concept'],
      'area_perimeter': ['multiplication_facts', 'addition_facts'],
      'word_problems_simple': ['addition_facts', 'subtraction_facts'],
      'word_problems_complex': ['multiplication_facts', 'division_facts', 'word_problems_simple'],
      'averages': ['addition_facts', 'division_facts'],
      'data_representation': ['counting', 'number_recognition']
    };
  }

  initializeDifficultyLevels() {
    return {
      'counting': { easy: 0.1, medium: 0.3, hard: 0.5 },
      'number_recognition': { easy: 0.2, medium: 0.4, hard: 0.6 },
      'addition_concept': { easy: 0.2, medium: 0.4, hard: 0.6 },
      'addition_facts': { easy: 0.3, medium: 0.5, hard: 0.7 },
      'subtraction_concept': { easy: 0.3, medium: 0.5, hard: 0.7 },
      'subtraction_facts': { easy: 0.4, medium: 0.6, hard: 0.8 },
      'multiplication_concept': { easy: 0.4, medium: 0.6, hard: 0.8 },
      'multiplication_facts': { easy: 0.5, medium: 0.7, hard: 0.9 },
      'division_concept': { easy: 0.5, medium: 0.7, hard: 0.9 },
      'division_facts': { easy: 0.6, medium: 0.8, hard: 1.0 },
      'fractions_concept': { easy: 0.5, medium: 0.7, hard: 0.9 },
      'fraction_operations': { easy: 0.7, medium: 0.8, hard: 1.0 },
      'decimals': { easy: 0.6, medium: 0.8, hard: 1.0 },
      'shapes_2d': { easy: 0.2, medium: 0.4, hard: 0.6 },
      'shapes_3d': { easy: 0.3, medium: 0.5, hard: 0.7 },
      'area_perimeter': { easy: 0.6, medium: 0.8, hard: 1.0 },
      'length_measurement': { easy: 0.3, medium: 0.5, hard: 0.7 },
      'weight_measurement': { easy: 0.4, medium: 0.6, hard: 0.8 },
      'time_telling': { easy: 0.3, medium: 0.5, hard: 0.7 },
      'money': { easy: 0.4, medium: 0.6, hard: 0.8 },
      'word_problems_simple': { easy: 0.4, medium: 0.6, hard: 0.8 },
      'word_problems_complex': { easy: 0.7, medium: 0.8, hard: 1.0 },
      'data_representation': { easy: 0.4, medium: 0.6, hard: 0.8 },
      'averages': { easy: 0.6, medium: 0.8, hard: 1.0 }
    };
  }

  getSkill(skillId) {
    return this.skills[skillId] || null;
  }

  getDependencies(skillId) {
    return this.dependencies[skillId] || [];
  }

  getPrerequisites(skillId) {
    const visited = new Set();
    const prerequisites = [];
    
    const traverse = (currentSkill) => {
      if (visited.has(currentSkill)) return;
      visited.add(currentSkill);
      
      const deps = this.getDependencies(currentSkill);
      deps.forEach(dep => {
        prerequisites.push(dep);
        traverse(dep);
      });
    };
    
    traverse(skillId);
    return [...new Set(prerequisites)]; // Remove duplicates
  }

  getSkillsByGrade(grade) {
    const gradeOrder = ['CP', 'CE1', 'CE2', 'CM1', 'CM2', '6e'];
    const gradeIndex = gradeOrder.indexOf(grade);
    
    return Object.values(this.skills).filter(skill => {
      const skillMinIndex = gradeOrder.indexOf(skill.grade_min);
      const skillMaxIndex = gradeOrder.indexOf(skill.grade_max);
      return gradeIndex >= skillMinIndex && gradeIndex <= skillMaxIndex;
    });
  }

  getSkillsByCategory(category) {
    return Object.values(this.skills).filter(skill => skill.category === category);
  }

  getRecommendedSkills(mastery, grade) {
    const gradeSkills = this.getSkillsByGrade(grade);
    
    return gradeSkills.map(skill => {
      const skillMastery = mastery[skill.id] || 0;
      const prerequisites = this.getPrerequisites(skill.id);
      const prerequisitesMet = prerequisites.every(prereq => (mastery[prereq] || 0) >= 0.6);
      
      return {
        skill: skill,
        mastery: skillMastery,
        ready: prerequisitesMet,
        priority: this.calculatePriority(skillMastery, prerequisitesMet, skill.estimated_time)
      };
    }).filter(item => item.ready).sort((a, b) => b.priority - a.priority);
  }

  calculatePriority(mastery, prerequisitesMet, estimatedTime) {
    if (!prerequisitesMet) return 0;
    
    // Priority based on mastery gap and learning time
    const masteryGap = 1 - mastery;
    const timeEfficiency = 1 / estimatedTime;
    
    return masteryGap * timeEfficiency * 100;
  }

  findRootCauses(weakSkills, mastery) {
    const rootCauses = [];
    
    weakSkills.forEach(weakSkill => {
      const prerequisites = this.getPrerequisites(weakSkill);
      const weakPrerequisites = prerequisites.filter(prereq => (mastery[prereq] || 0) < 0.6);
      
      if (weakPrerequisites.length > 0) {
        rootCauses.push({
          observed_gap: weakSkill,
          root_cause: weakPrerequisites,
          confidence: this.calculateConfidence(weakPrerequisites, mastery),
          recommended_path: this.getRecommendedLearningPath(weakPrerequisites)
        });
      }
    });
    
    return rootCauses;
  }

  calculateConfidence(rootCauses, mastery) {
    const avgMasteryGap = rootCauses.reduce((sum, cause) => 
      sum + (1 - (mastery[cause] || 0)), 0) / rootCauses.length;
    
    return Math.min(0.95, avgMasteryGap * 1.2);
  }

  getRecommendedLearningPath(rootCauses) {
    return rootCauses
      .sort((a, b) => (this.skills[a]?.estimated_time || 999) - (this.skills[b]?.estimated_time || 999))
      .slice(0, 3); // Top 3 priority skills
  }

  getDifficultyForSkill(skillId, level = 'medium') {
    return this.difficultyLevels[skillId]?.[level] || 0.5;
  }

  getAllSkills() {
    return Object.values(this.skills);
  }

  getCategories() {
    const categories = [...new Set(Object.values(this.skills).map(skill => skill.category))];
    return categories;
  }
}

module.exports = SkillGraph;
