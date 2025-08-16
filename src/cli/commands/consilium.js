import fs from 'fs/promises';

/**
 * Generate a consilium request for complex decisions
 */
async function generateConsiliumRequest(task, complexity, agentId) {
  const request = {
    consilium_request: {
      request_id: `cons-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      requesting_agent: agentId,
      complexity_score: complexity,
      
      task: {
        type: task.type || "technical_decision",
        title: task.title,
        description: task.description,
        current_implementation: task.currentCode || "N/A",
        proposed_solution: task.proposedSolution || "To be determined",
        constraints: task.constraints || [],
        success_criteria: task.criteria || []
      },
      
      consilium_instructions: `
        You are a technical expert participating in a consilium decision.
        
        RESPOND WITH:
        1. Your expert opinion on the best approach
        2. Specific technical recommendations
        3. Potential risks and mitigation strategies
        4. Your confidence level (0-100%)
        
        FORMAT YOUR RESPONSE AS JSON:
        {
          "expert": "[Your Model Name]",
          "role": "[Your assigned role]",
          "recommendation": {
            "approach": "Detailed technical solution",
            "implementation_steps": ["step1", "step2"],
            "key_benefits": ["benefit1", "benefit2"],
            "risks": ["risk1", "risk2"],
            "mitigation": ["strategy1", "strategy2"]
          },
          "alternatives_considered": ["alt1", "alt2"],
          "confidence": 85,
          "critical_warnings": []
        }
      `,
      
      aggregation_rules: {
        minimum_confidence_required: 60,
        consensus_threshold: 0.66,
        veto_roles: ["security_auditor"],
        conflict_resolution: "weighted_average_with_discussion"
      }
    }
  };
  
  return request;
}

export async function generateConsilium(options) {
  console.log('🧠 Generating Consilium Request...');
  
  const task = {
    type: options.type || 'technical_decision',
    title: options.title || 'Technical Decision Required',
    description: options.description || 'Please provide a description',
    constraints: options.constraints ? options.constraints.split(',') : [],
    currentCode: options.snapshot || null
  };
  
  const complexity = options.complexity || 7;
  const agentId = options.agent || 'AGENT_ORCHESTRATOR';
  
  const request = await generateConsiliumRequest(task, complexity, agentId);
  
  const outputFile = options.output || 'consilium_request.json';
  await fs.writeFile(outputFile, JSON.stringify(request, null, 2));
  
  console.log(`✅ Consilium request saved to: ${outputFile}`);
  console.log('\n📋 Next steps:');
  console.log('1. Send this request to multiple LLM experts');
  console.log('2. Collect their responses');
  console.log('3. Run: eck-snapshot process-consilium <responses.json>');
}