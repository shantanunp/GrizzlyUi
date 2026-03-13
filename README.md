# FreeMarker Mapper (React + Tailwind v4)

This project implements a FreeMarker Mapper component using **React** and **Tailwind CSS v4**.

Due to changes in the Tailwind v4 CLI architecture, this project uses a manual setup with the `@tailwindcss/vite` plugin rather than the legacy PostCSS configuration.

## Create a new project
```bash
npm create vite@latest GrizzlyUi -- --template react

# Enter the directory
cd GrizzlyUi
npm install lucide-react
# Install standard dependencies
npm install
```
## 📂 Project Structure

Ensure your file tree matches this structure exactly:

```text
GrizzlyUi/
├── src/
│   ├── GrizzlyMapper.jsx   # (Paste your component code here)
│   ├── App.jsx                # Entry point rendering the Mapper
│   ├── main.jsx               # Imports index.css
│   └── index.css              # Tailwind v4 imports
├── package.json
└── vite.config.js             # Vite configuration with Tailwind plugin
```

## Configuration
### Update src/index.css
```css
/* ✅ Fonts first */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap');

/* ✅ Tailwind second */
@import "tailwindcss";
```
### Update src/App.jsx
```jsx
import GrizzlyMapper from './GrizzlyMapper.jsx';
import './index.css';

function App() {
    return (
        <div className="min-h-screen bg-slate-50">
            <GrizzlyMapper />
        </div>
    );
}

export default App;
```
### Install the Vite Plugin (Required for v4)
```bash
npm install @tailwindcss/vite
```

### update vite.config.js
```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
})
```

## run
```bash
npm run dev
```
Your browser should open to http://localhost:5173.

### AI Write (Anthropic / OpenAI / Gemini)

See **[AI_SETUP.md](./AI_SETUP.md)** – add your API key to `.env` and run `npm run dev`.