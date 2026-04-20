const OpenAI = require('openai');

const provider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
const openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434/v1';
const ollamaModel = process.env.OLLAMA_MODEL || 'phi3';
const aiTimeoutMs = Number.parseInt(process.env.AI_TIMEOUT_MS || '12000', 10);
const openaiFallbackModels = (process.env.OPENAI_FALLBACK_MODELS || 'gpt-4.1-mini,gpt-4o-mini')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
const ollamaFallbackModels = (process.env.OLLAMA_FALLBACK_MODELS || 'phi3:mini,phi3')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

function buildClient() {
  if (provider === 'ollama') {
    return new OpenAI({
      baseURL: ollamaBaseUrl,
      apiKey: process.env.OLLAMA_API_KEY || 'ollama',
    });
  }

  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

const client = buildClient();

function getModelCandidates() {
  const primary = provider === 'ollama' ? ollamaModel : openaiModel;
  const fallbacks = provider === 'ollama' ? ollamaFallbackModels : openaiFallbackModels;
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

function isModelCapacityError(error) {
  const status = error?.status || error?.statusCode;
  const msg = String(error?.message || '').toLowerCase();
  if (status === 429 || status === 503) return true;
  return (
    msg.includes('ai_timeout') ||
    msg.includes('timeout') ||
    msg.includes('aborted') ||
    msg.includes('at capacity') ||
    msg.includes('overloaded') ||
    msg.includes('rate limit') ||
    msg.includes('temporarily unavailable')
  );
}

async function createCompletionWithTimeout(payload, timeoutMs, modelLabel) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await client.chat.completions.create(payload, { signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`AI_TIMEOUT: ${modelLabel}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function parseJsonOutput(content) {
  if (!content || typeof content !== 'string') return null;

  try {
    return JSON.parse(content);
  } catch {
    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      return JSON.parse(content.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

async function chat(systemPrompt, userMessage, jsonMode = false, options = {}) {
  if (!client || provider === 'mock') {
    if (jsonMode) {
      return {
        demo: true,
        overallLevel: 'intermediate',
        learningPath: ['maths', 'francais', 'sciences'],
        strengths: ['logique', 'curiosite'],
        gaps: ['vocabulaire', 'calcul mental'],
      };
    }

    return {
      demo: true,
      text: 'Mode demo actif. Configure AI_PROVIDER=ollama + OLLAMA_MODEL=phi3 pour tests, ou OPENAI_API_KEY pour production.',
    };
  }

  const modelCandidates = getModelCandidates();
  const maxAttempts = Number.isInteger(options.maxAttempts) && options.maxAttempts > 0
    ? options.maxAttempts
    : modelCandidates.length;
  const effectiveTimeoutMs = Number.isInteger(options.timeoutMs) && options.timeoutMs > 0
    ? options.timeoutMs
    : aiTimeoutMs;
  const content = jsonMode
    ? `${userMessage}\n\nImportant: renvoie uniquement un JSON valide.`
    : userMessage;

  try {
    let lastError = null;

    for (const model of modelCandidates.slice(0, maxAttempts)) {
      try {
        const payload = {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content },
          ],
          temperature: 0.3,
        };

        if (jsonMode && provider !== 'ollama') {
          payload.response_format = { type: 'json_object' };
        }

        const completion = await createCompletionWithTimeout(payload, effectiveTimeoutMs, model);
        const text = completion?.choices?.[0]?.message?.content || '';

        if (!jsonMode) {
          return text || 'Je n\'ai pas de reponse pour le moment.';
        }

        const parsed = parseJsonOutput(text);
        if (parsed) return parsed;

        return {
          demo: true,
          overallLevel: 'intermediate',
          learningPath: [],
          strengths: [],
          gaps: [],
          raw: text,
        };
      } catch (error) {
        lastError = error;
        if (!isModelCapacityError(error)) break;
        console.warn(`Modele ${model} indisponible/sature, tentative fallback...`);
      }
    }

    throw lastError || new Error('Aucun modele disponible');
  } catch (error) {
    console.error('AI provider error:', error.message);

    if (jsonMode) {
      return {
        demo: true,
        overallLevel: 'intermediate',
        learningPath: [],
        strengths: [],
        gaps: [],
        error: error.message,
      };
    }

    return {
      demo: true,
      text: 'Le tuteur IA est temporairement indisponible. Reessaie dans un instant.',
      error: error.message,
    };
  }
}

module.exports = {
  chat,
  provider,
};
