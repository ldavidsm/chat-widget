// OpenAI-compatible Chat Completions (OpenAI, Groq, Together, LM Studio,
// Ollama's /v1 endpoint, LiteLLM, vLLM…).
//
// IMPORTANT: point `endpoint` at YOUR backend, not at api.openai.com.
// Anything in this config ships to the browser, so an API key placed here is
// public. Your backend holds the key and forwards the request.

export function openai({
  endpoint,
  model = 'gpt-4o-mini',
  system,
  stream = true,
  temperature,
  ...rest
} = {}) {
  if (/\bapi\.openai\.com\b/.test(String(endpoint))) {
    console.warn(
      '[chat-widget] endpoint points straight at api.openai.com. ' +
      'Any key sent from the browser is public — proxy through your own backend instead.'
    );
  }

  return {
    endpoint,
    stream,
    transformRequest: (message, ctx) => ({
      model,
      stream,
      ...(temperature != null ? { temperature } : null),
      messages: [
        system ? { role: 'system', content: system } : null,
        ...ctx.history.map(({ role, content }) => ({ role, content })),
        { role: 'user', content: message },
      ].filter(Boolean),
    }),
    // Both the streaming deltas and the non-streaming shape are understood by
    // the default parsers, so no transformResponse is needed here.
    ...rest,
  };
}
