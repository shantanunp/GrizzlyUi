# AI Write Setup

Supports **Anthropic**, **OpenAI**, and **Gemini**. One command, one `.env` file.

---

## Setup

1. **Copy `.env.example` to `.env`**
   ```bash
   cp .env.example .env
   ```

2. **Add your API key** in `.env` (at least one):
   - `ANTHROPIC_API_KEY` → [console.anthropic.com](https://console.anthropic.com/)
   - `OPENAI_API_KEY` → [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - `GEMINI_API_KEY` → [aistudio.google.com/apikey](https://aistudio.google.com/apikey)

3. **Switch provider** in `src/GrizzlyMapper.jsx` (~line 492):
   ```js
   const ACTIVE_AI_PROVIDER = 'anthropic';  // or 'openai' or 'gemini'
   ```

---

## Run

```bash
npm run dev
```

Open http://localhost:5173. That’s it—no separate proxy or extra processes.
