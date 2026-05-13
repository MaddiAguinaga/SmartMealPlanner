const fetch = globalThis.fetch || require('node-fetch');

const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
const configuredEndpoints = [
  process.env.OPENAI_BASE_URL,
  process.env.OPENAI_API_BASE,
  process.env.OPENROUTER_API_BASE,
].filter(Boolean);

const defaultEndpoints = [
  'https://openrouter.ai/api/v1',
];

if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY or OPENAI_API_KEY is required to run this application.');
}

const normalizeURL = (value) => {
  const raw = String(value || '').trim().replace(/\/+$/, '');
  if (!raw) {
    return '';
  }

  return raw
    .replace(/^https?:\/\/openrouter\.ai\/v1$/i, 'https://openrouter.ai/api/v1')
    .replace(/^https?:\/\/api\.openrouter\.ai\/v1$/i, 'https://openrouter.ai/api/v1');
};

const endpoints = [...new Set([...configuredEndpoints.map(normalizeURL), ...defaultEndpoints.map(normalizeURL)])];

async function fetchOpenRouter(options) {
  const body = JSON.stringify(options);
  let lastError = null;

  console.log('[OpenRouter] endpoints:', endpoints);

  for (const rawBaseURL of endpoints) {
    const baseURL = normalizeURL(rawBaseURL);
    if (!baseURL) {
      continue;
    }

    const url = `${baseURL}/chat/completions`;
    console.log('[OpenRouter] trying url:', url);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (error) {
        // If the endpoint returns HTML or another unexpected page, try the next fallback.
        lastError = new Error(`OpenRouter returned non-JSON response from ${url}: ${text.slice(0, 200)}`);
        lastError.status = response.status;
        lastError.headers = response.headers;
        continue;
      }

      if (!response.ok) {
        const err = new Error(data.error?.message || `OpenRouter request failed with status ${response.status} from ${url}`);
        err.status = response.status;
        err.headers = response.headers;
        err.response = data;
        throw err;
      }

      return data;
    } catch (error) {
      console.error('[OpenRouter] request failed for', url, error.message);
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error('Unable to reach OpenRouter API.');
}

const client = {
  chat: {
    completions: {
      create: fetchOpenRouter,
    },
  },
};

module.exports = client;
