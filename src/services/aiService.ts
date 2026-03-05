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

// ─── Rate Limiting ──────────────────────────────────────────────────────────

const RATE_LIMIT_KEY = 'fmeda-ai-rate-limit';
const MAX_PER_MINUTE = 5;
const MAX_PER_DAY = 30;

interface RateLimitData {
  minuteTimestamps: number[];
  dayTimestamps: number[];
}

function getRateLimitData(): RateLimitData {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore parse errors */ }
  return { minuteTimestamps: [], dayTimestamps: [] };
}

function saveRateLimitData(data: RateLimitData): void {
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(data));
}

function cleanTimestamps(timestamps: number[], windowMs: number): number[] {
  const cutoff = Date.now() - windowMs;
  return timestamps.filter(t => t > cutoff);
}

export function getAIQuota(): { minuteRemaining: number; dayRemaining: number; minuteMax: number; dayMax: number } {
  const data = getRateLimitData();
  const minuteCleaned = cleanTimestamps(data.minuteTimestamps, 60_000);
  const dayCleaned = cleanTimestamps(data.dayTimestamps, 24 * 60 * 60_000);
  return {
    minuteRemaining: Math.max(0, MAX_PER_MINUTE - minuteCleaned.length),
    dayRemaining: Math.max(0, MAX_PER_DAY - dayCleaned.length),
    minuteMax: MAX_PER_MINUTE,
    dayMax: MAX_PER_DAY,
  };
}

function checkAndRecordRequest(): void {
  const data = getRateLimitData();
  const now = Date.now();
  
  data.minuteTimestamps = cleanTimestamps(data.minuteTimestamps, 60_000);
  data.dayTimestamps = cleanTimestamps(data.dayTimestamps, 24 * 60 * 60_000);
  
  if (data.minuteTimestamps.length >= MAX_PER_MINUTE) {
    const oldestInMinute = data.minuteTimestamps[0];
    const waitSeconds = Math.ceil((60_000 - (now - oldestInMinute)) / 1000);
    throw new Error(`Rate limit: max ${MAX_PER_MINUTE} requests per minute. Please wait ${waitSeconds}s.`);
  }
  
  if (data.dayTimestamps.length >= MAX_PER_DAY) {
    throw new Error(`Daily limit reached: max ${MAX_PER_DAY} AI requests per day. Resets in 24 hours.`);
  }
  
  data.minuteTimestamps.push(now);
  data.dayTimestamps.push(now);
  saveRateLimitData(data);
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

async function callOpenAIGeneric<T>(config: AIConfig, prompt: string): Promise<T> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant that provides responses in JSON format.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    let message = `OpenAI API error (${response.status})`;
    try {
      const error = await response.json();
      message = error.error?.message || message;
    } catch { /* response is not JSON */ }
    throw new Error(message);
  }

  const data = await response.json();
  const contentText = data.choices[0].message.content;
  
  return extractJson(contentText) as T;
}

async function callAIGeneric<T>(config: AIConfig, prompt: string): Promise<T> {
  // Enforce rate limiting before every call
  checkAndRecordRequest();
  
  if (config.provider === 'openai') {
    return callOpenAIGeneric<T>(config, prompt);
  } else if (config.provider === 'gemini') {
    return callGeminiGeneric<T>(config, prompt);
  } else {
    throw new Error(`Provider ${config.provider} not implemented. Please select OpenAI or Google Gemini in settings.`);
  }
}

// ─── Context Builder ────────────────────────────────────────────────────────

function buildProjectContextBlock(ctx: ProjectContext): string {
  const parts: string[] = [];
  if (ctx.projectName) parts.push(`Project: ${ctx.projectName}`);
  if (ctx.safetyStandard) parts.push(`Safety Standard: ${ctx.safetyStandard}`);
  if (ctx.targetAsil) parts.push(`Target ASIL: ${ctx.targetAsil}`);
  if (ctx.safetyGoal) parts.push(`Safety Goal: ${ctx.safetyGoal}`);
  
  parts.push('');
  parts.push('Technical Documentation:');
  parts.push('"""');
  parts.push(ctx.documentText.slice(0, 60000));
  parts.push('"""');
  
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
 * Step 3: Generate functions for a single component.
 * Small, focused call — one per component.
 */
export const generateFunctionsForComponent = async (
  config: AIConfig,
  projectContext: ProjectContext,
  systemName: string,
  subsystemName: string,
  componentName: string
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
  functionName: string
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
