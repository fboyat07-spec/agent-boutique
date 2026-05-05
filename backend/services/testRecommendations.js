// Fonction pour générer des recommandations de test

function generateTestRecommendations(globalMetrics, moduleStats) {
  const recommendations = [];
  
  // Recommandations basées sur les métriques globales
  if (globalMetrics.leadsTested === 0) {
    recommendations.push({
      type: 'critical',
      message: 'No leads tested yet',
      action: 'Run test scenarios to validate the system',
      priority: 'high'
    });
  }
  
  if (globalMetrics.errors > 0) {
    recommendations.push({
      type: 'warning',
      message: `${globalMetrics.errors} errors detected`,
      action: 'Review error logs and fix critical issues',
      priority: 'high'
    });
  }
  
  if (globalMetrics.duplicates > 0) {
    recommendations.push({
      type: 'warning',
      message: `${globalMetrics.duplicates} duplicates detected`,
      action: 'Check duplicate validation logic',
      priority: 'medium'
    });
  }
  
  if (!globalMetrics.conversionOk) {
    recommendations.push({
      type: 'info',
      message: 'No successful conversions yet',
      action: 'Run payment_conversion scenario to test full funnel',
      priority: 'medium'
    });
  }
  
  // Recommandations basées sur les stats des modules
  if (moduleStats.wrapperStats?.stats?.errorRate > 20) {
    recommendations.push({
      type: 'critical',
      message: 'High error rate in wrapped functions',
      action: 'Review function implementations and input validation',
      priority: 'high'
    });
  }
  
  if (moduleStats.validatorStats?.stats?.duplicateRate > 50) {
    recommendations.push({
      type: 'warning',
      message: 'High duplicate rate detected',
      action: 'Improve lead generation quality or deduplication logic',
      priority: 'medium'
    });
  }
  
  if (moduleStats.scenarioStats?.stats?.overallSuccessRate < 80) {
    recommendations.push({
      type: 'warning',
      message: 'Low scenario success rate',
      action: 'Fix failing scenarios and improve test coverage',
      priority: 'medium'
    });
  }
  
  // Recommandations générales
  if (globalMetrics.leadsTested > 0 && globalMetrics.errors === 0 && globalMetrics.duplicates === 0) {
    recommendations.push({
      type: 'success',
      message: 'System validation looks good',
      action: 'Continue monitoring and run more comprehensive tests',
      priority: 'low'
    });
  }
  
  return recommendations;
}

module.exports = { generateTestRecommendations };
