import { FmedaFailureMode } from '../types/fmeda';
import { AISuggestion, AIConfig, FmedaSystemDeep, FmedaComponentDeep, FmedaFunctionDeep, FmedaFailureModeDeep, ProjectContext } from '../types/ai';
import { GoogleGenAI } from '@google/genai';

export interface AISuggestionContext {
  systemName?: string;
  subsystemName?: string;
  componentName?: string;
  functionName?: string;
  failureMode: Partial<FmedaFailureMode>;
}



// ─── JSON Parsing ───────────────────────────────────────────────────────────

function extractJson(text: string): any {
  const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const contentToParse = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim();

  try { return JSON.parse(contentToParse); } catch (e) {}

  const firstBrace = contentToParse.indexOf('{');
  const firstBracket = contentToParse.indexOf('[');

  const startIndex = firstBrace === -1 ? firstBracket :
                     firstBracket === -1 ? firstBrace :
                     Math.min(firstBrace, firstBracket);

  if (startIndex === -1) throw new Error('No JSON structure found');

  const isArray = contentToParse[startIndex] === '[';
  const openChar = isArray ? '[' : '{';
  const closeChar = isArray ? ']' : '}';

  let depth = 0;
  let endIndex = -1;
  let inString = false;
  let escapeNext = false;

  for (let i = startIndex; i < contentToParse.length; i++) {
    const char = contentToParse[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\') {
      escapeNext = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === openChar) depth++;
      else if (char === closeChar) {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
  }

  if (endIndex !== -1) {
    try {
      return JSON.parse(contentToParse.substring(startIndex, endIndex + 1));
    } catch (e) {}
  }

  throw new Error('Failed to parse extracted JSON');
}

// ─── AI Provider Calls ──────────────────────────────────────────────────────

async function callGeminiGeneric<T>(config: AIConfig, prompt: string): Promise<T> {
  const genAI = new GoogleGenAI({ apiKey: config.apiKey });

  const response = await genAI.models.generateContent({
    model: config.model || 'gemini-1.5-flash',
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseMimeType: "application/json",
    }
  });

  const contentText = response.text;
  if (!contentText) {
     throw new Error('No content returned from Gemini');
  }

  return extractJson(contentText) as T;
}

async function callAIGeneric<T>(config: AIConfig, prompt: string): Promise<T> {
  if (config.provider === 'gemini') {
    return callGeminiGeneric<T>(config, prompt);
  } else {
    throw new Error(`Provider ${config.provider} not implemented. Please select Google Gemini in settings.`);
  }
}

// ─── Context Builder ────────────────────────────────────────────────────────

function buildProjectContextBlock(ctx: ProjectContext): string {
  const parts: string[] = [];
  if (ctx.projectName) parts.push(`Project: ${ctx.projectName}`);
  if (ctx.safetyStandard) parts.push(`Safety Standard: ${ctx.safetyStandard}`);
  if (ctx.targetAsil) parts.push(`Target ASIL: ${ctx.targetAsil}`);
  if (ctx.safetyGoal) parts.push(`Safety Goal: ${ctx.safetyGoal}`);

  if (ctx.documentText) {
    parts.push('');
    parts.push('Technical Documentation:');
    parts.push('"""');
    parts.push(ctx.documentText.slice(0, 60000));
    parts.push('"""');
  }

  return parts.join('\n');
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const getAISuggestions = async (
  config: AIConfig,
  context: AISuggestionContext,
  contextText: string,
  targetField: keyof FmedaFailureMode
): Promise<AISuggestion[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const { systemName, subsystemName, componentName, functionName, failureMode } = context;

  const prompt = `
    You are an expert in Functional Safety and FMEDA (Failure Modes, Effects, and Diagnostic Analysis).
    Based on the following technical documentation context, suggest a value for the field "${targetField}" for the given FMEDA context.

    Context from documentation:
    """
    ${contextText.slice(0, 64000)}
    """

    Current FMEDA Context:
    - System: ${systemName || 'N/A'}
    - Subsystem: ${subsystemName || 'N/A'}
    - Component: ${componentName || 'N/A'}
    - Function: ${functionName || 'N/A'}
    - Failure Mode: ${failureMode.name || 'N/A'}
    - Local Effect: ${failureMode.localEffect || 'N/A'}
    - Safety Mechanism: ${failureMode.safetyMechanism || 'N/A'}

    Provide 3 suggestions for the field "${targetField}".
    Return the response as a JSON object with a "suggestions" array containing objects with "suggestion" and "reasoning" fields.
    Example: {"suggestions": [{"suggestion": "Value", "reasoning": "Because..."}]}
  `;

  const result = await callAIGeneric<{ suggestions: any[] } | any[]>(config, prompt);
  let suggestionsRaw = Array.isArray(result) ? result : (result?.suggestions || []);
  if (!Array.isArray(suggestionsRaw)) suggestionsRaw = [];

  return suggestionsRaw
    .filter((s: any) => s && (typeof s === 'object') && (s.suggestion || s.field || s.reasoning))
    .map((s: any) => ({
      field: targetField,
      suggestion: s.suggestion || s.field || 'Unknown',
      reasoning: s.reasoning || '',
    }));
};

/**
 * Step 2: Generate the system architecture (System → Subsystem → Component).
 * Uses the enriched ProjectContext.
 */
export const generateArchitecture = async (
  config: AIConfig,
  contextOrText: string | ProjectContext
): Promise<FmedaSystemDeep[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const contextBlock = typeof contextOrText === 'string'
    ? `Technical Documentation:\n"""\n${contextOrText.slice(0, 64000)}\n"""`
    : buildProjectContextBlock(contextOrText);

  const prompt = `
    You are an expert in Functional Safety and FMEDA.
    Based on the following project context and technical documentation, identify the system architecture for an FMEDA analysis.
    Extract the top 3 levels of the hierarchy: System -> Subsystem -> Component.

    ${contextBlock}

    Return the response as a JSON object with a "systems" array. Each system should have a "name" and a "subsystems" array. Each subsystem should have a "name" and a "components" array. Each component should have a "name".
    Example:
    {
      "systems": [
        {
          "name": "Braking System",
          "subsystems": [
            {
              "name": "Hydraulic Control Unit",
              "components": [
                { "name": "Pump Motor" },
                { "name": "Valve" }
              ]
            }
          ]
        }
      ]
    }
  `;

  const result = await callAIGeneric<{ systems: FmedaSystemDeep[] }>(config, prompt);
  return result.systems || [];
};

/**
 * Generate top-level systems for the project.
 */
export const generateSystems = async (
  config: AIConfig,
  projectContext: ProjectContext,
  existingSystems?: string[]
): Promise<{ name: string }[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const contextBlock = buildProjectContextBlock(projectContext);

  const prompt = `
    You are an expert in Functional Safety and FMEDA.
    Based on the following project context, identify the top-level systems for an FMEDA analysis.

    ${contextBlock}

    ${existingSystems && existingSystems.length > 0 ? `
    IMPORTANT: The following systems ALREADY EXIST. DO NOT generate these again or anything too similar. We want NEW systems.
    ${existingSystems.map(s => `- ${s}`).join('\n    ')}
    ` : ''}

    Identify 1-3 key high-level systems for this project.

    Return the response as a JSON object with a "systems" array. Each system should have a "name" field.
    Example:
    {
      "systems": [
         { "name": "Braking System" },
         { "name": "Steering System" }
      ]
    }
  `;

  const result = await callAIGeneric<{ systems: { name: string }[] }>(config, prompt);
  return result.systems || [];
};

/**
 * Generate subsystems for a single system.
 */
export const generateSubsystemsForSystem = async (
  config: AIConfig,
  projectContext: ProjectContext,
  systemName: string,
  existingSubsystems?: string[]
): Promise<{ name: string }[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const contextBlock = buildProjectContextBlock(projectContext);

  const prompt = `
    You are an expert in Functional Safety and FMEDA.
    Based on the following project context, identify the key subsystems for the specific system.

    ${contextBlock}

    System: ${systemName}

    ${existingSubsystems && existingSubsystems.length > 0 ? `
    IMPORTANT: The following subsystems ALREADY EXIST for this system. DO NOT generate these again or anything too similar. We want NEW subsystems.
    ${existingSubsystems.map(s => `- ${s}`).join('\n    ')}
    ` : ''}

    Identify 2-5 key subsystems that make up this system in the context of a ${projectContext.safetyStandard || 'functional safety'} architecture.

    Return the response as a JSON object with a "subsystems" array. Each subsystem should have a "name" field.
    Example:
    {
      "subsystems": [
         { "name": "Hydraulic Control Unit" },
         { "name": "Electronic Control Unit" }
      ]
    }
  `;

  const result = await callAIGeneric<{ subsystems: { name: string }[] }>(config, prompt);
  return result.subsystems || [];
};

/**
 * Generate components for a single subsystem.
 */
export const generateComponentsForSubsystem = async (
  config: AIConfig,
  projectContext: ProjectContext,
  systemName: string,
  subsystemName: string,
  existingComponents?: string[]
): Promise<{ name: string }[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const contextBlock = buildProjectContextBlock(projectContext);

  const prompt = `
    You are an expert in Functional Safety and FMEDA.
    Based on the following project context, identify the key components for a specific subsystem.

    ${contextBlock}

    System: ${systemName}
    Subsystem: ${subsystemName}

    ${existingComponents && existingComponents.length > 0 ? `
    IMPORTANT: The following components ALREADY EXIST for this subsystem. DO NOT generate these again or anything too similar. We want NEW components.
    ${existingComponents.map(c => `- ${c}`).join('\n    ')}
    ` : ''}

    Identify 3-8 key components that this subsystem comprises in the context of a ${projectContext.safetyStandard || 'functional safety'} analysis.

    Return the response as a JSON object with a "components" array. Each component should have a "name" field.
    Example:
    {
      "components": [
        { "name": "Pump Motor" },
        { "name": "Intake Valve" }
      ]
    }
  `;

  const result = await callAIGeneric<{ components: { name: string }[] }>(config, prompt);
  return result.components || [];
};

/**
 * Step 3: Generate functions for a single component.
 * Small, focused call — one per component.
 */
export const generateFunctionsForComponent = async (
  config: AIConfig,
  projectContext: ProjectContext,
  systemName: string,
  subsystemName: string,
  componentName: string,
  existingFunctions?: string[]
): Promise<FmedaFunctionDeep[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const contextBlock = buildProjectContextBlock(projectContext);

  const prompt = `
    You are an expert in Functional Safety and FMEDA.
    Based on the following project context, identify the key functions for a specific component.

    ${contextBlock}

    System: ${systemName}
    Subsystem: ${subsystemName}
    Component: ${componentName}

    ${existingFunctions && existingFunctions.length > 0 ? `
    IMPORTANT: The following functions ALREADY EXIST for this component. DO NOT generate these again or anything too similar. We want NEW functions.
    ${existingFunctions.map(f => `- ${f}`).join('\n    ')}
    ` : ''}

    Identify 2-5 key functions that this component performs in the context of a ${projectContext.safetyStandard || 'functional safety'} analysis${projectContext.targetAsil ? ` at ${projectContext.targetAsil} level` : ''}.

    Return the response as a JSON object with a "functions" array. Each function should have a "name" field.
    Example:
    {
      "functions": [
        { "name": "Control hydraulic pressure" },
        { "name": "Maintain pressure threshold" }
      ]
    }
  `;

  const result = await callAIGeneric<{ functions: FmedaFunctionDeep[] }>(config, prompt);
  return result.functions || [];
};

/**
 * Step 4: Generate failure modes for a single function.
 * Very focused call — one per function.
 */
export const generateFailureModesForFunction = async (
  config: AIConfig,
  projectContext: ProjectContext,
  systemName: string,
  subsystemName: string,
  componentName: string,
  functionName: string,
  existingFailureModes?: string[]
): Promise<FmedaFailureModeDeep[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const contextBlock = buildProjectContextBlock(projectContext);

  const prompt = `
    You are an expert in Functional Safety and FMEDA.
    Based on the following project context, identify realistic failure modes for a specific function.

    ${contextBlock}

    System: ${systemName}
    Subsystem: ${subsystemName}
    Component: ${componentName}
    Function: ${functionName}

    ${existingFailureModes && existingFailureModes.length > 0 ? `
    IMPORTANT: The following failure modes ALREADY EXIST for this function. DO NOT generate these again or anything too similar. We want NEW failure modes.
    ${existingFailureModes.map(fm => `- ${fm}`).join('\n    ')}
    ` : ''}

    Identify 2-4 realistic failure modes for this function.
    For each, provide:
    - name: descriptive failure mode name
    - localEffect: the immediate effect of this failure
    - safetyMechanism: applicable safety mechanism (or "None")
    - diagnosticCoverage: value between 0 and 1
    - fitRate: estimated FIT rate (integer)

    Return the response as a JSON object with a "failureModes" array.
    Example:
    {
      "failureModes": [
        {
          "name": "Valve stuck open",
          "localEffect": "Loss of pressure",
          "safetyMechanism": "Pressure sensor cross-check",
          "diagnosticCoverage": 0.9,
          "fitRate": 10
        }
      ]
    }
  `;

  const result = await callAIGeneric<{ failureModes: FmedaFailureModeDeep[] }>(config, prompt);
  return result.failureModes || [];
};

/**
 * Refine/Complete an existing failure mode's details using AI.
 * Used for the "Edit with AI" row action.
 */
export const refineFailureMode = async (
  config: AIConfig,
  projectContext: ProjectContext,
  systemName: string,
  subsystemName: string,
  componentName: string,
  functionName: string,
  failureMode: Partial<FmedaFailureModeDeep>
): Promise<FmedaFailureModeDeep> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const contextBlock = buildProjectContextBlock(projectContext);

  const prompt = `
    You are an expert in Functional Safety and FMEDA.
    Refine and complete the technical details for a SPECIFIC failure mode.

    ${contextBlock}

    Context:
    - System: ${systemName}
    - Subsystem: ${subsystemName}
    - Component: ${componentName}
    - Function: ${functionName}

    FAILURE MODE DATA:
    - Name: ${failureMode.name}
    - Current Local Effect: ${failureMode.localEffect || '(Empty)'}
    - Current Safety Mechanism: ${failureMode.safetyMechanism || '(Empty)'}
    - Current DC: ${failureMode.diagnosticCoverage !== undefined && failureMode.diagnosticCoverage !== null ? failureMode.diagnosticCoverage : '(Empty)'}
    - Current FIT: ${failureMode.fitRate !== undefined && failureMode.fitRate !== null ? failureMode.fitRate : '(Empty)'}

    TASK:
    1. If a field is (Empty) or missing, provide a realistic suggestion based on the context.
    2. If a field has content, refine it to be more technically precise for a ${projectContext.safetyStandard || 'safety'} analysis. If it is already perfect, keep it as is.
    3. Ensure the Diagnostic Coverage (DC) and FIT rate are realistic for this type of component.

    Return the response as a JSON object strictly following this structure:
    {
      "localEffect": "Description...",
      "safetyMechanism": "Mechanism...",
      "diagnosticCoverage": 0.9,
      "fitRate": 10
    }
  `;

  let result = await callAIGeneric<any>(config, prompt);

  // Normalize wrapped responses in case the AI added a wrapper object or array
  if (Array.isArray(result)) result = result[0] || {};
  if (result.failureMode) result = result.failureMode;
  if (Array.isArray(result.suggestions)) result = result.suggestions[0] || {};

  return {
    ...failureMode,
    localEffect: result.localEffect || result.local_effect || failureMode.localEffect || '',
    safetyMechanism: result.safetyMechanism || result.safety_mechanism || failureMode.safetyMechanism || '',
    diagnosticCoverage: typeof result.diagnosticCoverage === 'number' ? result.diagnosticCoverage : (parseFloat(result.diagnosticCoverage) || failureMode.diagnosticCoverage || 0),
    fitRate: typeof result.fitRate === 'number' ? result.fitRate : (parseFloat(result.fitRate) || failureMode.fitRate || 0),
  } as FmedaFailureModeDeep;
};

/**
 * Legacy: Generate failure modes for all components at once.
 * Kept for backward compatibility with existing features.
 */
export const generateFailureModes = async (
  config: AIConfig,
  contextText: string,
  architecture: FmedaSystemDeep[]
): Promise<FmedaSystemDeep[]> => {
  if (!config.apiKey) {
    throw new Error('API Key is missing');
  }

  const updatedArchitecture: FmedaSystemDeep[] = JSON.parse(JSON.stringify(architecture));

  const processComponent = async (component: FmedaComponentDeep, systemName: string, subsystemName: string) => {
    const prompt = `
      You are an expert in Functional Safety and FMEDA.
      Based on the following technical documentation context, identify the functions and their associated failure modes for the specific component.

      Context from documentation:
      """
      ${contextText.slice(0, 64000)}
      """

      System: ${systemName}
      Subsystem: ${subsystemName}
      Component: ${component.name}

      Return the response as a JSON object with a "functions" array. Each function should have a "name" and a "failureModes" array. Each failure mode should have "name", "localEffect", "safetyMechanism", "diagnosticCoverage" (number between 0 and 1), and "fitRate" (number) fields.
      Example:
      {
        "functions": [
          {
            "name": "Control hydraulic pressure",
            "failureModes": [
              {
                "name": "Valve stuck open",
                "localEffect": "Loss of pressure",
                "safetyMechanism": "Pressure sensor cross-check",
                "diagnosticCoverage": 0.9,
                "fitRate": 10
              }
            ]
          }
        ]
      }
    `;

    try {
      const result = await callAIGeneric<{ functions: FmedaFunctionDeep[] }>(config, prompt);
      component.functions = result.functions || [];
    } catch (error) {
      console.error(`Failed to generate failure modes for component ${component.name}:`, error);
      component.functions = [];
    }
  };

  for (const system of updatedArchitecture) {
    if (!system.subsystems) continue;
    for (const subsystem of system.subsystems) {
      if (!subsystem.components) continue;
      for (const component of subsystem.components) {
        await processComponent(component, system.name, subsystem.name);
      }
    }
  }

  return updatedArchitecture;
};
