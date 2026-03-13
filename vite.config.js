import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const providers = {
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    getHeaders: (env) => ({
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    }),
    buildBody: (p) => JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: p }],
    }),
    extractText: (d) => (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim(),
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    getHeaders: (env) => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    }),
    buildBody: (p) => JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1000,
      messages: [{ role: 'user', content: p }],
    }),
    extractText: (d) => d.choices?.[0]?.message?.content?.trim() ?? '',
  },
  gemini: {
    getUrl: (env) =>
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    getHeaders: () => ({ 'Content-Type': 'application/json' }),
    buildBody: (p) => JSON.stringify({
      contents: [{ parts: [{ text: p }] }],
      generationConfig: { maxOutputTokens: 1000 },
    }),
    extractText: (d) => d.candidates?.[0]?.content?.parts?.map(p => p.text).join('').trim() ?? '',
  },
}

function aiProxyPlugin(env) {
  return {
    name: 'ai-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/api/ai/generate' || req.method !== 'POST') return next()
        let body = ''
        req.on('data', (chunk) => (body += chunk))
        req.on('end', async () => {
          try {
            const { provider, prompt } = JSON.parse(body || '{}')
            const cfg = providers[provider]
            if (!cfg || !prompt) {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: 'Missing provider or prompt' }))
              return
            }
            const key = env[({ anthropic: 'ANTHROPIC_API_KEY', openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' })[provider]]
            if (!key) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: `${provider.toUpperCase()}_API_KEY not set in .env` }))
              return
            }
            const url = cfg.getUrl ? cfg.getUrl(env) : cfg.url
            const headers = cfg.getHeaders(env)
            const r = await fetch(url, { method: 'POST', headers, body: cfg.buildBody(prompt) })
            const data = await r.json()
            if (!r.ok) {
              res.statusCode = r.status
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ error: data.error?.message || data.message || JSON.stringify(data) }))
              return
            }
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ text: cfg.extractText(data) }))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: err.message }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') }
  return {
    plugins: [react(), tailwindcss(), aiProxyPlugin(env)],
  }
})
