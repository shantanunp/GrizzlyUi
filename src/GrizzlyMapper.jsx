import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Move, Code, Search, File, Folder, Database, X, Upload, FileCode, ArrowRight, ArrowLeft, Layers, CheckCircle2, Play, FlaskConical, BookOpen, Eye, Save, Pencil } from 'lucide-react';

const uid = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// Staging path for Validate & Save — backend writes transform.py here. Supports Linux + Windows.
// Examples: '/tmp/grizzly/transform.py' (Linux/Mac) or 'C:\\Users\\you\\grizzly\\transform.py' (Windows)
const GRIZZLY_STAGING_PATH = '/home/shantanu/Workspace/vscode/GrizzlyUi/src/data/transform.py';

// ── Prism-based syntax highlighter ───────────────────────────────────────────
// Uses prism-react-renderer. Theme is VS Dark — change themes.vsDark to any
// other export from 'prism-react-renderer' e.g. themes.github, themes.dracula
import { Highlight, themes as prismThemes } from 'prism-react-renderer';

// Minimal editable code block: prism-react-renderer Highlight behind, transparent textarea on top.
const EditableCodeBlock = ({ value, onChange, placeholder, rows = 8, language = 'python', style, fillHeight = false }) => {
  const preRef = useRef(null);
  const taRef = useRef(null);
  const sharedStyle = {
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: '12px',
    lineHeight: 1.6,
    padding: 12,
    margin: 0,
    ...style,
  };
  const lineHeight = 1.6 * 12;
  const minHeight = fillHeight ? undefined : Math.round(rows * lineHeight + 24);
  const heightStyle = fillHeight ? { height: '100%' } : {};

  useEffect(() => {
    if (!preRef.current || !taRef.current) return;
    const sync = () => { preRef.current.scrollTop = taRef.current.scrollTop; preRef.current.scrollLeft = taRef.current.scrollLeft; };
    const ta = taRef.current;
    ta.addEventListener('scroll', sync);
    return () => ta.removeEventListener('scroll', sync);
  }, []);

  return (
    <div className={`relative overflow-hidden ${fillHeight ? 'h-full' : ''}`} style={{ minHeight, ...heightStyle }}>
      <div ref={preRef} className="absolute inset-0 overflow-auto bg-slate-50" style={{ pointerEvents: 'none' }}>
        <Highlight theme={prismThemes.github} code={value || ' '} language={language}>
          {({ className, style: themeStyle, tokens, getLineProps, getTokenProps }) => (
            <pre className={className} style={{ ...themeStyle, ...sharedStyle, overflow: 'auto', border: 'none', borderRadius: 0 }}>
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        rows={rows}
        className="absolute inset-0 w-full resize-none border-0 bg-transparent text-transparent caret-slate-800 outline-none placeholder:text-slate-500 placeholder:opacity-90"
        style={{ ...sharedStyle, padding: sharedStyle.padding }}
      />
    </div>
  );
};

//  Dark (current)
// <Highlight theme={prismThemes.vsDark} ...>

//  Light options — swap vsDark for any of these:
// <Highlight theme={prismThemes.github} ...>       // ← most popular light theme
// <Highlight theme={prismThemes.vsLight} ...>      // VS Code light
// <Highlight theme={prismThemes.nightOwlLight} ... // Night Owl light variant
// <Highlight theme={prismThemes.duotoneLight} ...> // Minimal duotone
const PrismCode = ({ code, language = 'python', wrap = false }) => (
  <Highlight theme={prismThemes.github} code={(code || '').trimEnd()} language={language}>
    {({ className, style, tokens, getLineProps, getTokenProps }) => (
      <pre
        className={className}
        style={{
          ...style,
          margin: 0,
          padding: '12px 16px',
          fontSize: '12px',
          lineHeight: '1.6',
          overflowX: wrap ? 'visible' : 'auto',
          whiteSpace: wrap ? 'pre-wrap' : 'pre',
          wordBreak: wrap ? 'break-word' : 'normal',
          borderRadius: '0',
          border: 'none',
        }}
      >
        {tokens.map((line, i) => (
          <div key={i} {...getLineProps({ line })} style={{ display: 'table-row' }}>
            <span style={{ display: 'table-cell', paddingRight: '16px', userSelect: 'none', opacity: 0.35, textAlign: 'right', minWidth: '28px', fontSize: '11px' }}>
              {i + 1}
            </span>
            <span style={{ display: 'table-cell' }}>
              {line.map((token, key) => (
                <span key={key} {...getTokenProps({ token })} />
              ))}
            </span>
          </div>
        ))}
      </pre>
    )}
  </Highlight>
);
// ─────────────────────────────────────────────────────────────────────────────

// ── Shared value-type config (used in both plain assignment and for-loop/static-list field rows) ──
const VALUE_TYPE_CONFIG = {
  input:    { label: '⬅ Input',  activeClass: 'border-green-300  bg-green-50   text-green-700'  },
  static:   { label: '" Text',   activeClass: 'border-slate-400  bg-slate-100  text-slate-800'  },
  number:   { label: '# Num',    activeClass: 'border-blue-300   bg-blue-50    text-blue-700'   },
  function: { label: 'ƒ Fn',     activeClass: 'border-orange-300 bg-orange-50  text-orange-700' },
};

const defaultInputSchema = {
  type: 'object',
  properties: {
    customer: {
      type: 'object',
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        age: { type: 'number' },
        email: { type: 'string' },
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
            zipCode: { type: 'string' }
          }
        }
      }
    },
    orders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          amount: { type: 'number' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productId: { type: 'string' },
                quantity: { type: 'number' },
                price: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }
};

const defaultOutputSchema = {
  type: 'object',
  properties: {
    fullName: { type: 'string' },
    contactEmail: { type: 'string' },
    isAdult: { type: 'boolean' },
    location: {
      type: 'object',
      properties: {
        cityName: { type: 'string' },
        postalCode: { type: 'string' }
      }
    },
    orderHistory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          totalAmount: { type: 'number' },
          productList: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                productCode: { type: 'string' },
                qty: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }
};

const jsonToSchema = (obj) => {
  if (obj == null) return { type: 'string' };
  if (Array.isArray(obj)) return { type: 'array', items: obj[0] != null ? jsonToSchema(obj[0]) : { type: 'string' } };
  if (typeof obj === 'object') {
    const properties = {};
    Object.entries(obj).forEach(([k, v]) => { properties[k] = jsonToSchema(v); });
    return { type: 'object', properties };
  }
  return { type: typeof obj };
};

// ── Parse a Grizzly template back into UI model ──────────────────────────────
const parseTemplate = (pythonCode) => {
  const lines = pythonCode.split('\n');

  // ── Helpers ──────────────────────────────────────────────────────────────

  // Parse a scalar Python value into exprType fields
  const parseScalar = (raw) => {
    raw = raw.trim();
    if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      const val = raw.slice(1, -1);
      return { exprType: 'static', staticValue: val, expression: raw, funcName: 'now', funcArgs: '' };
    }
    if (/^-?\d+(\.\d+)?$/.test(raw)) {
      return { exprType: 'number', staticValue: raw, expression: raw, funcName: 'now', funcArgs: '' };
    }
    const fnMatch = raw.match(/^([a-zA-Z_]\w*)\((.*)?\)$/s);
    if (fnMatch && !/^(INPUT|input)/.test(raw)) {
      const name = fnMatch[1];
      const args = (fnMatch[2] || '').trim();
      return { exprType: 'function', funcName: name, funcArgs: args, expression: raw, staticValue: '' };
    }
    const normalized = raw
      .replace(/^INPUT\??\./i, 'input.')           // leading INPUT?. prefix
      .replace(/\bINPUT\??\.(?=\w)/gi, 'input.');  // INPUT?. anywhere else in expr
    return { exprType: 'input', expression: normalized, staticValue: '', funcName: 'now', funcArgs: '' };
  };

  // Detect (chained) ternary: ( val1 if (cond1) else val2 if (cond2) … else default )
  const parseTernary = (text) => {
    text = text.trim();
    if (!text.startsWith('(') || !text.endsWith(')')) return null;
    let inner = text.slice(1, -1).trim();

    const branches = [];
    while (inner.length > 0) {
      const m = inner.match(/^([\s\S]+?)\s+if\s+\(/);
      if (!m) break;
      const value = m[1].trim();
      if (!value) break;
      const afterParen = inner.slice(m[0].length);
      let depth = 1, condEnd = -1;
      for (let i = 0; i < afterParen.length; i++) {
        if (afterParen[i] === '(') depth++;
        if (afterParen[i] === ')') { depth--; if (depth === 0) { condEnd = i; break; } }
      }
      if (condEnd === -1) break;
      branches.push({ expr: value, condition: afterParen.slice(0, condEnd).trim() });
      inner = afterParen.slice(condEnd + 1).trim();
      const em = inner.match(/^else\b\s*/);
      if (em) { inner = inner.slice(em[0].length); } else { inner = ''; break; }
    }

    if (branches.length === 0) return null;
    const elseExpr = inner.trim() || 'None';
    return {
      condition: branches[0].condition,
      ifExpr: branches[0].expr,
      elifBranches: branches.slice(1).map(b => ({ condition: b.condition, expr: b.expr })),
      elseExpr,
    };
  };

  // Split text at top-level commas
  const splitTopLevel = (text) => {
    const parts = []; let depth = 0, cur = '';
    for (const c of text) {
      if ('{[('.includes(c)) depth++;
      else if ('}])'.includes(c)) depth--;
      else if (c === ',' && depth === 0) { parts.push(cur.trim()); cur = ''; continue; }
      cur += c;
    }
    if (cur.trim()) parts.push(cur.trim());
    return parts;
  };

  // Flatten a Python dict text into [{path, ...scalar/ternary}] relative field entries
  const flattenDict = (dictText, parentPath = '') => {
    dictText = dictText.trim();
    if (dictText.startsWith('{')) dictText = dictText.slice(1, dictText.lastIndexOf('}')).trim();
    const fields = [];
    const entries = splitTopLevel(dictText);
    for (const entry of entries) {
      if (!entry) continue;
      const km = entry.match(/^"{1,2}([^"]+)"{1,2}\s*:\s*([\s\S]+)$/s);
      if (!km) continue;
      const key = km[1];
      const val = km[2].trim();
      const fullPath = parentPath ? parentPath + '.' + key : key;
      if (val.startsWith('{')) {
        flattenDict(val, fullPath).forEach(f => fields.push(f));
      } else {
        const ternary = parseTernary(val);
        if (ternary) {
          fields.push({ id: uid(), path: fullPath, isTernary: true, ...ternary, elifBranches: ternary.elifBranches || [] });
        } else {
          fields.push({ id: uid(), path: fullPath, isTernary: false, ...parseScalar(val) });
        }
      }
    }
    return fields;
  };

  // Collect a multi-line block starting at lineIdx
  const collectBlock = (lineArr, lineIdx, startToken) => {
    let depth = 0;
    const blockLines = [startToken];
    for (const c of startToken) { if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) depth--; }
    let j = lineIdx + 1;
    while (j < lineArr.length && depth > 0) {
      const l = lineArr[j];
      if (l.trim().startsWith('def ')) break;
      blockLines.push(l);
      for (const c of l) { if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) depth--; }
      j++;
    }
    return { text: blockLines.join('\n'), endIdx: j - 1 };
  };

  // Parse a complete OUTPUT value block into UI assignment item(s)
  const parseOutputBlock = (key, valueText) => {
    valueText = valueText.trim();

    // Plain scalar
    if (!valueText.startsWith('{')) {
      const scalar = parseScalar(valueText);
      return [{ id: uid(), type: 'assignment', target: `output.${key}`, listComp: false, ...scalar }];
    }

    // Dict wrapper: { "outerKey": [ ... ] }
    const inner = valueText.slice(1, valueText.lastIndexOf('}')).trim();
    const listKeyMatch = inner.match(/^"([^"]+)"\s*:\s*\[([\s\S]*)\]\s*$/s);

    if (listKeyMatch) {
      const listBody = listKeyMatch[2].trim();
      // Dynamic list comprehension: ends with  for X in (iterable or [])
      const forMatch = listBody.match(/for\s+(\w+)\s+in\s+\((\S+)\s+or\s+\[\]\)\s*$/s);
      if (forMatch) {
        const iterator = forMatch[1];
        const iterable = forMatch[2].replace(/^INPUT\??\./i, 'input.');
        const dictPart = listBody.slice(0, listBody.lastIndexOf('for')).trim();
        const childFields = flattenDict(dictPart);
        const lcChildren = childFields.map(f => {
          if (f.isTernary) {
            return { id: uid(), type: 'if', lcTarget: f.path, condition: f.condition, ifExpr: f.ifExpr, elifBranches: f.elifBranches || [], elseExpr: f.elseExpr };
          }
          return { id: uid(), type: 'assignment', target: f.path, expression: f.expression, exprType: f.exprType, staticValue: f.staticValue || '', funcName: f.funcName || 'now', funcArgs: f.funcArgs || '' };
        });
        return [{
          id: uid(), type: 'assignment',
          target: `output.${key}.${key}`,
          listComp: true, lcMode: 'dynamic',
          lcIterator: iterator, lcIterable: iterable,
          lcChildren, lcElements: [{ id: uid(), fields: [] }],
          exprType: 'input', expression: '', staticValue: '', funcName: 'now', funcArgs: '',
        }];
      }

      // Static list: one or more { } items
      const staticItems = [];
      let depth = 0, start = -1;
      for (let i = 0; i < listBody.length; i++) {
        if (listBody[i] === '{') { if (depth === 0) start = i; depth++; }
        else if (listBody[i] === '}') { depth--; if (depth === 0 && start >= 0) staticItems.push(listBody.slice(start, i + 1)); }
      }
      const lcElements = staticItems.map(itemText => ({
        id: uid(),
        fields: flattenDict(itemText).map(f => ({
          id: uid(), target: f.path,
          exprType: f.exprType || 'input', expression: f.expression || '',
          staticValue: f.staticValue || '', funcName: f.funcName || 'now', funcArgs: f.funcArgs || '',
        }))
      }));
      return [{
        id: uid(), type: 'assignment',
        target: `output.${key}.${listKeyMatch[1]}`,
        listComp: true, lcMode: 'static',
        lcIterator: 'item', lcIterable: '',
        lcChildren: [], lcElements,
        exprType: 'input', expression: '', staticValue: '', funcName: 'now', funcArgs: '',
      }];
    }

    // Nested dict (no list wrapper) — emit as multiple flat assignments
    return flattenDict(valueText).map(f => ({
      id: uid(), type: 'assignment', target: `output.${key}.${f.path}`, listComp: false,
      expression: f.expression || '', exprType: f.exprType || 'input',
      staticValue: f.staticValue || '', funcName: f.funcName || 'now', funcArgs: f.funcArgs || '',
    }));
  };

  // ── Main parse loop ───────────────────────────────────────────────────────
  const modules = [];
  let currentModule = null;
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    // def transform(INPUT): → main module
    if (trimmed.match(/^def transform\(INPUT\):/)) {
      currentModule = { id: uid(), name: 'main', mappings: [] };
      modules.push(currentModule);
      i++; continue;
    }

    // def mapXxx(INPUT, OUTPUT): → named module
    const mapDefCamel = trimmed.match(/^def map([A-Z]\w*)\(INPUT, OUTPUT\):/);
    const mapDefSnake = trimmed.match(/^def map_(\w+)\(INPUT, OUTPUT\):/);
    const mapDef = mapDefCamel || mapDefSnake;
    if (mapDef) {
      let rawName = mapDef[1];
      if (mapDefCamel) rawName = rawName.charAt(0).toLowerCase() + rawName.slice(1);
      currentModule = { id: uid(), name: rawName, mappings: [] };
      modules.push(currentModule);
      i++; continue;
    }

    if (trimmed.startsWith('def ')) { currentModule = null; i++; continue; }
    if (!currentModule) { i++; continue; }

    // Skip docstrings, blanks, boilerplate
    if (!trimmed || trimmed.startsWith('#') || trimmed === 'OUTPUT = {}' || trimmed === 'return OUTPUT') { i++; continue; }
    if (trimmed.startsWith('"""') || trimmed.startsWith("\"\"\"")) { i++; continue; }

    // Module call: mapXxx(INPUT, OUTPUT)
    const moduleCallCamel = trimmed.match(/^map([A-Z]\w*)\(INPUT, OUTPUT\)/);
    const moduleCallSnake = trimmed.match(/^map_(\w+)\(INPUT, OUTPUT\)/);
    const moduleCallMatch = moduleCallCamel || moduleCallSnake;
    if (moduleCallMatch) {
      let callName = moduleCallMatch[1];
      if (moduleCallCamel) callName = callName.charAt(0).toLowerCase() + callName.slice(1);
      currentModule.mappings.push({ id: uid(), type: 'module_call', moduleName: callName });
      i++; continue;
    }

    // Variable: name = expr (not OUTPUT)
    const varMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*=\s*(.+)$/);
    if (varMatch && !trimmed.startsWith('OUTPUT')) {
      currentModule.mappings.push({
        id: uid(), type: 'variable',
        varName: varMatch[1],
        expression: (varMatch[2] || '')
          .replace(/^INPUT\??\./i, 'input.')
          .replace(/\bINPUT\??\.(?=\w)/gi, 'input.')
          .trim()
      });
      i++; continue;
    }

    // OUTPUT["key"] = value (possibly multi-line)
    const assignMatch = trimmed.match(/^OUTPUT\["([^"]+)"\]\s*=\s*([\s\S]*)$/);
    if (assignMatch) {
      const key = assignMatch[1];
      const rest = assignMatch[2].trim();
      let valueText = rest; let endI = i;
      let depth = 0;
      for (const c of rest) { if ('{[('.includes(c)) depth++; else if ('}])'.includes(c)) depth--; }
      if (depth > 0) { const block = collectBlock(lines, i, rest); valueText = block.text; endI = block.endIdx; }
      parseOutputBlock(key, valueText).forEach(item => currentModule.mappings.push(item));
      i = endI + 1;
      continue;
    }

    i++;
  }

  // main always first
  const mainIdx = modules.findIndex(m => m.name === 'main');
  if (mainIdx > 0) { const [main] = modules.splice(mainIdx, 1); modules.unshift(main); }

  return modules.length ? modules : [{ id: uid(), name: 'main', mappings: [] }];
};


// Flatten all mapping items from all modules (recursive) for diffing
const flattenMappings = (modules) => {
  const out = [];
  const walk = (items, moduleName) => {
    if (!items) return;
    items.forEach((item) => {
      out.push({ moduleName, item });
      if (item.children?.length) walk(item.children, moduleName);
      if (item.elifBlocks) item.elifBlocks.forEach((eb) => walk(eb.children, moduleName));
      if (item.elseBlock?.children?.length) walk(item.elseBlock.children, moduleName);
    });
  };
  modules.forEach((mod) => walk(mod.mappings || [], mod.name));
  return out;
};

// Signature for change detection (type + main fields only)
const getItemSignature = (item) => {
  if (!item) return '';
  const base = { type: item.type };
  if (item.type === 'assignment') return JSON.stringify({ ...base, target: item.target, expression: item.expression });
  if (item.type === 'variable') return JSON.stringify({ ...base, varName: item.varName, expression: item.expression });
  if (item.type === 'module_call') return JSON.stringify({ ...base, moduleName: item.moduleName });
  if (item.type === 'if') return JSON.stringify({ ...base, condition: item.condition });
  if (item.type === 'for') return JSON.stringify({ ...base, iterator: item.iterator, iterable: item.iterable });
  return JSON.stringify(base);
};

// Describe a mapping item in one line for dashboard
const describeItem = (item) => {
  if (!item) return '';
  if (item.type === 'assignment') return `${item.target || '?'} ← ${(item.expression || '').slice(0, 40)}${(item.expression || '').length > 40 ? '…' : ''}`;
  if (item.type === 'variable') return `${item.varName || '?'} = ${(item.expression || '').slice(0, 40)}${(item.expression || '').length > 40 ? '…' : ''}`;
  if (item.type === 'module_call') return `call ${item.moduleName || '?'}`;
  if (item.type === 'if') return `if (${(item.condition || '').slice(0, 50)}${(item.condition || '').length > 50 ? '…' : ''})`;
  if (item.type === 'for') return `for ${item.iterator || '?'} in ${(item.iterable || '').slice(0, 30)}${(item.iterable || '').length > 30 ? '…' : ''}`;
  return item.type || 'mapping';
};

// Collect all expandable node IDs from a schema (same path logic as renderSchemaNode)
const collectExpandableNodeIds = (schema, path, isInput) => {
  const prefix = isInput ? 'input' : 'output';
  const nodeId = path ? `${prefix}-${path}` : prefix;
  const ids = [];
  if (schema?.type === 'object' && schema.properties) {
    ids.push(nodeId);
    Object.entries(schema.properties).forEach(([key, value]) => {
      ids.push(...collectExpandableNodeIds(value, path ? `${path}.${key}` : key, isInput));
    });
  } else if (schema?.type === 'array' && schema.items) {
    ids.push(nodeId);
    ids.push(...collectExpandableNodeIds(schema.items, `${path || ''}[*]`, isInput));
  }
  return ids;
};

// Ensure roots and all nodes are in the set (roots use path '' -> 'input' / 'output')
const getAllExpandedIds = (inputSchema, outputSchema) => {
  const inputIds = collectExpandableNodeIds(inputSchema, '', true);
  const outputIds = collectExpandableNodeIds(outputSchema, '', false);
  return new Set(['input', 'output', ...inputIds, ...outputIds]);
};

// ── AI Provider ─────────────────────────────────────────────────────────────
// Handled by Vite dev server. Add API key to .env. Change provider below.
// Switch: 'anthropic' | 'openai' | 'gemini'
const ACTIVE_AI_PROVIDER = 'anthropic';
// ─────────────────────────────────────────────────────────────────────────────

const GrizzlyMappingTool = () => {
  const [step, setStep] = useState(1);
  const [inputSchema, setInputSchema] = useState(defaultInputSchema);
  const [outputSchema, setOutputSchema] = useState(defaultOutputSchema);
  const [inputFileName, setInputFileName] = useState('');
  const [outputFileName, setOutputFileName] = useState('');
  const [templateFileName, setTemplateFileName] = useState('');
  const [baselineModules, setBaselineModules] = useState(null);
  const [modules, setModules] = useState([{ id: uid(), name: 'main', mappings: [] }]);
  const [activeModule, setActiveModule] = useState(0);
  const [renamingModuleIdx, setRenamingModuleIdx] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [codeWrap, setCodeWrap] = useState(true);

  // ── Registered Functions ─────────────────────────────────────────────────
  const BUILTIN_REG_FUNCTIONS = [
    { id: 'rf_now',        name: 'now',        desc: 'Current date and time',               args: false, builtin: true },
    { id: 'rf_formatDate', name: 'formatDate', desc: 'Format a date value',                 args: true,  builtin: true, argsPlaceholder: 'now(), "yyyy-MM-dd HH:mm:ss"' },
    { id: 'rf_concat',     name: 'concat',     desc: 'Join values with separator, skipping null/empty', args: true, builtin: true, argsPlaceholder: '" ", INPUT.a, INPUT.b' },
  ];
  const [registeredFunctions, setRegisteredFunctions] = useState(BUILTIN_REG_FUNCTIONS);
  const [showRegFnPanel, setShowRegFnPanel] = useState(false);
  const [showFnSheet, setShowFnSheet] = useState(false);
  const [regFnForm, setRegFnForm] = useState(null); // null = closed, {} = new/edit
  const [regFnExpanded, setRegFnExpanded] = useState(new Set());

  const allFunctions = registeredFunctions; // single source of truth

  // ── Generic AI function writer ───────────────────────────────────────────
  const callAiApi = (description) => {
    const prompt =
      `Write a Python helper function for a data transformation pipeline.\n` +
      `Description: "${description}"\n\n` +
      `Rules:\n` +
      `- Start with def function_name(...):\n` +
      `- Use a clear, descriptive snake_case function name\n` +
      `- Add a one-line docstring\n` +
      `- Keep it concise and practical\n` +
      `- Return only the raw Python code, no markdown, no explanation`;
    return fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: ACTIVE_AI_PROVIDER, prompt }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        return data.text || '';
      });
  };
  // ────────────────────────────────────────────────────────────────────────

  const toggleRegFnExpand = (id) => setRegFnExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const openRegFnForm = () => setRegFnForm({ desc: '', body: '' });
  const closeRegFnForm = () => setRegFnForm(null);

  // Parse "def funcname(a, b, c):" from the first def line in the body
  const parseDefLine = (body) => {
    const m = (body || '').trim().match(/^def\s+([a-zA-Z_]\w*)\s*\(([^)]*)\)\s*:/m);
    if (!m) return { name: '', params: [] };
    const name = m[1];
    const params = m[2].split(',').map(p => p.trim()).filter(p => p && p !== 'self').map(p => ({ id: uid(), name: p.replace(/[=:].*/,'').trim(), hint: '' }));
    return { name, params };
  };

  // Inject """desc""" as the first line inside a def body if not already present
  const injectDocstring = (body, desc) => {
    if (!desc.trim()) return body;
    const lines = body.split('\n');
    const defIdx = lines.findIndex(l => l.trim().match(/^def\s+/));
    if (defIdx === -1) return body;
    const afterDef = defIdx + 1;
    // Check if docstring already present
    if (afterDef < lines.length && lines[afterDef].trim().startsWith('"""')) return body;
    // Find indentation of the body (use next non-empty line or default 4 spaces)
    const bodyLine = lines.slice(afterDef).find(l => l.trim());
    const indent = bodyLine ? bodyLine.match(/^(\s*)/)[1] : '    ';
    const docLines = [`${indent}"""${desc.trim()}"""`];
    lines.splice(afterDef, 0, ...docLines);
    return lines.join('\n');
  };

  const saveRegFn = () => {
    const body = regFnForm?.body?.trim();
    if (!body) return;
    const { name, params } = parseDefLine(body);
    if (!name) return;
    const desc = regFnForm.desc.trim() || `${name} helper`;
    const finalBody = injectDocstring(body, desc);
    const newFn = {
      id: uid(),
      name,
      desc,
      args: params.length > 0,
      argsPlaceholder: params.map(p => p.name).join(', '),
      params,
      body: finalBody,
      builtin: false,
    };
    setRegisteredFunctions(prev => [...prev, newFn]);
    setRegFnExpanded(prev => new Set([...prev, newFn.id]));
    closeRegFnForm();
  };

  const deleteRegFn = (id) => setRegisteredFunctions(prev => prev.filter(f => f.id !== id));

  const mappings = modules[activeModule]?.mappings || [];

  const updateModuleMappings = (moduleIdx, newMappings) => {
    setModules(prev => {
      const next = [...prev];
      next[moduleIdx] = { ...next[moduleIdx], mappings: newMappings };
      return next;
    });
  };

  const addModule = () => {
    setModules(prev => [...prev, { id: uid(), name: `module_${prev.length}`, mappings: [] }]);
    setActiveModule(modules.length);
  };

  const deleteModule = (idx) => {
    if (modules.length <= 1) return;
    setModules(prev => prev.filter((_, i) => i !== idx));
    setActiveModule(prev => (prev >= idx && prev > 0 ? prev - 1 : prev));
  };

  const updateModuleName = (idx, name) => {
    if (modules[idx].name === 'main') return;
    setModules(prev => prev.map((m, i) => i === idx ? { ...m, name } : m));
  };

  const [expandedBlocks, setExpandedBlocks] = useState(new Set());
  
  // Sidebar state
  const [expandedNodes, setExpandedNodes] = useState(new Set(['input', 'output']));
  const [inputSearchTerm, setInputSearchTerm] = useState('');
  const [outputSearchTerm, setOutputSearchTerm] = useState('');
  
  // ── Unified path-input selection state ──────────────────────────────────────
  // selectedInput: { key, pathMode, setter, appendMode }
  //   key:        arbitrary unique string to identify the focused input
  //   pathMode:   'root-input'  - accept input.* paths (root-prefixed)
  //               'root-output' - accept output.* paths (root-prefixed)
  //               'root-both'   - accept any path (root-prefixed)
  //               'relative'    - accept any path, strip input./output. prefix
  //   setter:     (path: string) => void  — called with the resolved path
  //   appendMode: if true, append to existing value with ' + ' instead of replace
  const [selectedInput, setSelectedInput] = useState(null);
  const [autocompleteState, setAutocompleteState] = useState({
    show: false,
    suggestions: [],
    position: { top: 0, left: 0 },
    cursorPosition: 0,
    searchTerm: '',
    currentValue: '',
    setter: null,
    pathMode: null,
  });

  // Refs for autocomplete
  const autocompleteRef = useRef(null);

  // Generate unique ID
  const generateId = () => Math.random().toString(36).substr(2, 9);

  // Build flat list of all schema paths
  const buildSchemaPathsList = (schema, prefix = '', isInput = true) => {
    const paths = [];
    
    const traverse = (obj, path) => {
      if (obj.type === 'object' && obj.properties) {
        Object.entries(obj.properties).forEach(([key, value]) => {
          const newPath = path ? `${path}.${key}` : key;
          traverse(value, newPath);
        });
      } else if (obj.type === 'array' && obj.items) {
        // Include the array node itself so it can be used as an iterable
        paths.push({
          path: prefix + (path || ''),
          type: 'array',
          isInput
        });
        traverse(obj.items, `${path}[*]`);
      } else {
        // Leaf node
        paths.push({
          path: prefix + (path || ''),
          type: obj.type,
          isInput
        });
      }
    };
    
    traverse(schema, '');
    return paths;
  };

  const inputPaths = buildSchemaPathsList(inputSchema, 'input.', true);
  const outputPaths = buildSchemaPathsList(outputSchema, 'output.', false);
  const allPaths = [...inputPaths, ...outputPaths];

  // Collect all mapped field paths across all modules for highlighting
  const { mappedInputPaths, mappedOutputPaths } = useMemo(() => {
    const inp = new Set();
    const out = new Set();
    const addPath = (p, set) => {
      if (!p || typeof p !== 'string') return;
      let s = p.trim()
        .replace(/^INPUT\??\./i, 'input.')
        .replace(/^OUTPUT\??\./i, 'output.')
        .replace(/\[\*\]/g, '');
      if (!s.startsWith('input.') && !s.startsWith('output.')) {
        s = (set === out ? 'output.' : 'input.') + s;
      }
      set.add(s);
    };
    const extractFromExpr = (expr) => {
      if (!expr || typeof expr !== 'string') return;
      const re = /(?:input|INPUT)\??\.([\w.[\]*?]+)/gi;
      let m;
      while ((m = re.exec(expr)) !== null) addPath('input.' + m[1].replace(/\[\*\]/g, '').replace(/\?/g, ''), inp);
    };
    const walk = (items) => {
      (items || []).forEach((item) => {
        if (item.type === 'assignment') {
          if (item.target) addPath(item.target, out);
          if (item.expression) extractFromExpr(item.expression);
          if (item.lcIterable) addPath(item.lcIterable, inp);

          if (item.listComp) {
            const base = item.target || '';
            if (item.lcMode === 'static' || item.lcMode === 'object') {
              (item.lcElements || []).forEach(el => {
                (el.fields || []).forEach(f => {
                  if (f.target) addPath(base + '.' + f.target, out);
                  if (f.exprType === 'input' && f.expression) extractFromExpr(f.expression);
                });
              });
            } else {
              (item.lcChildren || []).forEach(child => {
                if (child.type === 'assignment' && child.lcTarget) {
                  addPath(base + '.' + child.lcTarget, out);
                  if (child.expression) extractFromExpr(child.expression);
                }
                if (child.type === 'if') {
                  if (child.lcTarget) addPath(base + '.' + child.lcTarget, out);
                  if (child.ifExpr) extractFromExpr(child.ifExpr);
                  if (child.elseExpr) extractFromExpr(child.elseExpr);
                  if (child.condition) extractFromExpr(child.condition);
                }
              });
            }
          }
        }
        if (item.type === 'variable' && item.expression) extractFromExpr(item.expression);
        if (item.type === 'for') {
          if (item.iterable) addPath(item.iterable, inp);
          if (item.lcIterable) addPath(item.lcIterable, inp);
        }
        if (item.type === 'if' && item.condition) extractFromExpr(item.condition);
        walk(item.children);
        (item.elifBlocks || []).forEach((eb) => walk(eb.children));
        if (item.elseBlock) walk(item.elseBlock.children);
      });
    };
    modules.forEach((mod) => walk(mod.mappings || []));
    return { mappedInputPaths: inp, mappedOutputPaths: out };
  }, [modules]);

  // Expand both schema trees when entering step 2 (sync after DOM so roots stay expanded)
  const expandBothTrees = () => {
    setExpandedNodes(getAllExpandedIds(inputSchema, outputSchema));
  };

  // Run synchronously when step becomes 2 so trees are expanded before first paint
  useLayoutEffect(() => {
    if (step === 2) {
      setExpandedNodes(getAllExpandedIds(inputSchema, outputSchema));
    }
  }, [step, inputSchema, outputSchema]);

  // Toggle schema node expansion
  const toggleNode = (nodeId) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  // Toggle mapping block expansion
  const toggleBlock = (id) => {
    const newExpanded = new Set(expandedBlocks);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedBlocks(newExpanded);
  };

  // ── Resolve a path for a given pathMode ──────────────────────────────────
  const resolvePath = (rawPath, pathMode) => {
    if (!rawPath) return rawPath;
    if (pathMode === 'relative') return rawPath.replace(/^(input|output)\./, '');
    return rawPath; // root-* modes keep full prefix
  };

  // ── Check if a schema node (isInput flag) is acceptable for a given pathMode ──
  const pathModeAccepts = (isInput, pathMode) => {
    if (pathMode === 'root-input')  return isInput;
    if (pathMode === 'root-output') return !isInput;
    return true; // root-both, relative
  };

  // ── Get the autocomplete path pool for a given pathMode ──
  const pathsForMode = (pathMode) => {
    if (pathMode === 'root-input')  return inputPaths;
    if (pathMode === 'root-output') return outputPaths;
    return allPaths; // root-both, relative
  };

  // ── makeBind: returns props to spread onto any <input> that accepts a path ──
  //   key       - unique string (e.g. item.id + '.expression')
  //   pathMode  - 'root-input' | 'root-output' | 'root-both' | 'relative'
  //   getValue  - () => string   current value
  //   setValue  - (v: string) => void   write new value
  //   appendMode - if true, clicking schema appends with ' + ' instead of replacing
  const makeBind = (key, pathMode, getValue, setValue, appendMode = false) => ({
    value: getValue(),
    onFocus: () => setSelectedInput({ key, pathMode, setter: (path) => {
      const resolved = resolvePath(path, pathMode);
      if (appendMode) {
        const cur = getValue();
        setValue(cur ? `${cur} + ${resolved}` : resolved);
      } else {
        setValue(resolved);
      }
    }}),
    onBlur: () => {},   // keep selectedInput for double-click; cleared by click-outside
    onChange: (e) => {
      const value = e.target.value;
      setValue(value);
      const cursor = e.target.selectionStart;
      const rect = e.target.getBoundingClientRect();
      const textBeforeCursor = value.substring(0, cursor);
      const lastWord = textBeforeCursor.split(/[\s+\-*/(),[\]{}]/).pop() || '';
      if (lastWord.length >= 1) {
        let suggestions = pathsForMode(pathMode).filter(p =>
          (p.path || '').toLowerCase().includes(lastWord.toLowerCase())
        );
        if (pathMode === 'relative') {
          // strip prefix for display in relative mode
          suggestions = suggestions.map(s => ({ ...s, path: s.path.replace(/^(input|output)\./, '') }));
        }
        suggestions = suggestions.slice(0, 10);
        if (suggestions.length > 0) {
          setAutocompleteState({
            show: true, suggestions,
            position: { top: rect.bottom + window.scrollY, left: rect.left + window.scrollX },
            cursorPosition: cursor, searchTerm: lastWord,
            currentValue: value, setter: setValue, pathMode,
          });
          return;
        }
      }
      setAutocompleteState(prev => ({ ...prev, show: false }));
    },
    onDrop: (e) => {
      e.preventDefault(); e.stopPropagation();
      try {
        const d = JSON.parse(e.dataTransfer.getData('application/json'));
        if (d && d.path && pathModeAccepts(d.isInput, pathMode)) {
          const resolved = resolvePath(d.path, pathMode);
          if (appendMode) {
            const cur = getValue();
            setValue(cur ? `${cur} + ${resolved}` : resolved);
          } else {
            setValue(resolved);
          }
        }
      } catch {}
    },
    onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); },
  });

  // ── Handle schema node double-click — delegates to selectedInput.setter ──
  const handleSchemaDoubleClick = (path, isInput, e) => {
    if (e) e.stopPropagation();
    if (!selectedInput || !selectedInput.setter) return;
    if (!pathModeAccepts(isInput, selectedInput.pathMode)) return;
    selectedInput.setter(path);
  };

  // Find item by ID
  const findItemById = (items, targetId) => {
    for (const item of items) {
      if (item.id === targetId) return item;
      if (item.children) {
        const found = findItemById(item.children, targetId);
        if (found) return found;
      }
      if (item.elifBlocks) {
        for (const elif of item.elifBlocks) {
          if (elif.id === targetId) return elif;
          const found = findItemById(elif.children || [], targetId);
          if (found) return found;
        }
      }
      if (item.elseBlock) {
        if (item.elseBlock.id === targetId) return item.elseBlock;
        const found = findItemById(item.elseBlock.children || [], targetId);
        if (found) return found;
      }
    }
    return null;
  };

  // ── Autocomplete selection ────────────────────────────────────────────────
  const handleAutocompleteSelect = (path) => {
    const { cursorPosition, searchTerm, currentValue, setter, pathMode } = autocompleteState;
    if (!setter) return;
    const resolved = pathMode === 'relative' ? path.replace(/^(input|output)\./, '') : path;
    const textBeforeCursor = currentValue.substring(0, cursorPosition);
    const textAfterCursor = currentValue.substring(cursorPosition);
    const beforeLastWord = textBeforeCursor.substring(0, textBeforeCursor.lastIndexOf(searchTerm));
    setter(beforeLastWord + resolved + textAfterCursor);
    setAutocompleteState(prev => ({ ...prev, show: false }));
  };

  // Click outside autocomplete
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(e.target)) {
        setAutocompleteState({ ...autocompleteState, show: false });
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [autocompleteState]);

  // Render schema tree
  const renderSchemaNode = (name, schema, path, isInput = true, searchTerm = '') => {
    const nodeId = path ? `${isInput ? 'input' : 'output'}-${path}` : (isInput ? 'input' : 'output');
    const isExpanded = expandedNodes.has(nodeId);
    const fullPath = path ? `${isInput ? 'input' : 'output'}.${path}` : (isInput ? 'input' : 'output');
    
    // Search filter
    if (searchTerm && !fullPath.toLowerCase().includes(searchTerm.toLowerCase())) {
      if (schema.properties) {
        const childMatches = Object.keys(schema.properties).some(key => 
          `${fullPath}.${key}`.toLowerCase().includes(searchTerm.toLowerCase())
        );
        if (!childMatches && schema.type === 'object') {
          // Check deeper
          const hasDeepMatch = checkDeepMatch(schema, fullPath, searchTerm);
          if (!hasDeepMatch) return null;
        }
      } else if (schema.type !== 'object' && schema.type !== 'array') {
        return null;
      }
    }

    const mappedSet = isInput ? mappedInputPaths : mappedOutputPaths;
    const normalizedPath = fullPath.replace(/\[\*\]/g, '');
    const isMapped = mappedSet.has(normalizedPath);

    const handleDragStart = (e) => {
      if (schema.type !== 'object' || !schema.properties) {
        const dragData = {
          path: fullPath,
          type: schema.type,
          isInput: isInput
        };
        e.dataTransfer.setData('application/json', JSON.stringify(dragData));
        e.dataTransfer.effectAllowed = 'copy';
      }
    };

    const handleDoubleClick = (ev) => {
      if (schema.type !== 'object' || !schema.properties) {
        handleSchemaDoubleClick(fullPath, isInput, ev);
      }
    };

    if (schema.type === 'object' && schema.properties) {
      return (
        <div key={nodeId} className="ml-0">
          <div
            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
            onClick={() => toggleNode(nodeId)}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Folder className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium">{name}</span>
            <span className="text-xs text-gray-500 ml-auto">object</span>
          </div>
          {isExpanded && (
            <div className="ml-4 border-l-2 border-gray-200 pl-2">
              {Object.entries(schema.properties).map(([key, value]) =>
                renderSchemaNode(key, value, path ? `${path}.${key}` : key, isInput, searchTerm)
              )}
            </div>
          )}
        </div>
      );
    } else if (schema.type === 'array' && schema.items) {
      return (
        <div key={nodeId} className="ml-0">
          <div
            draggable={isInput}
            onDragStart={isInput ? (e) => {
              const dragData = { path: fullPath, type: 'array', isInput };
              e.dataTransfer.setData('application/json', JSON.stringify(dragData));
              e.dataTransfer.effectAllowed = 'copy';
            } : undefined}
            onDoubleClick={isInput ? (ev) => {
              ev.stopPropagation();
              if (selectedInput && selectedInput.setter && pathModeAccepts(true, selectedInput.pathMode)) {
                selectedInput.setter(fullPath);
              }
            } : undefined}
            className={`flex items-center gap-2 p-2 hover:bg-gray-100 rounded ${isInput ? 'cursor-move' : 'cursor-pointer'} ${
              selectedInput && isInput && pathModeAccepts(true, selectedInput.pathMode) ? 'bg-green-50 ring-1 ring-green-300' : ''
            } ${isMapped ? 'bg-emerald-50 border-l-2 border-emerald-400' : ''}`}
            onClick={() => toggleNode(nodeId)}
            title={isInput ? 'Double-click or drag to use as FOR iterable' : undefined}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Database className={`w-4 h-4 ${isMapped ? 'text-emerald-600' : 'text-green-600'}`} />
            <span className="text-sm font-medium">{name}</span>
            {isMapped && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-auto" />}
            <span className="text-xs text-gray-500 ml-auto">array</span>
          </div>
          {isExpanded && (
            <div className="ml-4 border-l-2 border-gray-200 pl-2">
              {renderSchemaNode('[item]', schema.items, `${path}[*]`, isInput, searchTerm)}
            </div>
          )}
        </div>
      );
    } else {
      const activeHighlight = selectedInput &&
        ((selectedInput.pathMode === 'root-output' && !isInput) ||
         (selectedInput.pathMode === 'root-input'  &&  isInput) ||
         (selectedInput.pathMode === 'root-both') ||
         (selectedInput.pathMode === 'relative'));
      return (
        <div
          key={nodeId}
          draggable
          onDragStart={handleDragStart}
          onDoubleClick={handleDoubleClick}
          className={`flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-move ${
            activeHighlight ? 'bg-blue-50' : isMapped ? 'bg-emerald-50 border-l-2 border-emerald-400' : ''
          }`}
          title="Double-click to insert into selected field"
        >
          <File className={`w-4 h-4 ${isMapped ? 'text-emerald-600' : 'text-slate-600'}`} />
          <span className="text-sm">{name}</span>
          {isMapped && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
          <span className="text-xs text-gray-500 ml-auto">{schema.type}</span>
        </div>
      );
    }
  };

  // Helper to check deep matches in schema
  const checkDeepMatch = (schema, basePath, searchTerm) => {
    if (schema.type === 'object' && schema.properties) {
      return Object.entries(schema.properties).some(([key, value]) => {
        const newPath = `${basePath}.${key}`;
        if (newPath.toLowerCase().includes(searchTerm.toLowerCase())) return true;
        return checkDeepMatch(value, newPath, searchTerm);
      });
    } else if (schema.type === 'array' && schema.items) {
      return checkDeepMatch(schema.items, `${basePath}[*]`, searchTerm);
    }
    return false;
  };

  // Add new mapping item
  const addItem = (parentId = null, type = 'assignment', index = null) => {
    const newItem = {
      id: generateId(),
      type: type,
    };

    if (type === 'assignment') {
      newItem.target = '';
      newItem.expression = '';
      newItem.exprType = 'input'; // 'input' | 'static' | 'number' | 'function'
      newItem.staticValue = '';
      newItem.funcName = '';
      newItem.funcArgs = '';
      newItem.listComp = false;
      newItem.lcMode = 'dynamic';   // 'dynamic' = FOR loop, 'static' = fixed list
      newItem.lcIterator = 'item';
      newItem.lcIterable = '';
      newItem.lcChildren = [];      // used by dynamic mode
      newItem.lcElements = [{ id: uid(), fields: [] }]; // used by static mode — each element = one list item
    } else if (type === 'variable') {
      newItem.varName = '';
      newItem.expression = '';
    } else if (type === 'if') {
      newItem.condition = '';
      newItem.children = [];
      newItem.elifBlocks = [];
      newItem.elseBlock = null;
    } else if (type === 'for') {
      newItem.iterator = 'item';
      newItem.iterable = '';
      newItem.children = [];
    }

    if (parentId === null) {
      if (index !== null) {
        const newMappings = [...mappings];
        newMappings.splice(index + 1, 0, newItem);
        updateModuleMappings(activeModule,newMappings);
      } else {
        updateModuleMappings(activeModule,[...mappings, newItem]);
      }
    } else {
      const newMappings = addToParent([...mappings], parentId, newItem);
      updateModuleMappings(activeModule,newMappings);
    }

    if (type !== 'assignment') {
      setExpandedBlocks(new Set([...expandedBlocks, newItem.id]));
    }
  };

  const addToParent = (items, parentId, newItem) => {
    return items.map(item => {
      // Direct match on item itself
      if (item.id === parentId) {
        return { ...item, children: [...(item.children || []), newItem] };
      }
      // Must check ALL branches — never early-return after one
      let u = { ...item };
      if (u.children) {
        u = { ...u, children: addToParent(u.children, parentId, newItem) };
      }
      if (u.elifBlocks) {
        u = {
          ...u,
          elifBlocks: u.elifBlocks.map(elif => {
            // elif itself may be the parent
            if (elif.id === parentId) {
              return { ...elif, children: [...(elif.children || []), newItem] };
            }
            return { ...elif, children: addToParent(elif.children || [], parentId, newItem) };
          })
        };
      }
      if (u.elseBlock) {
        // elseBlock itself may be the parent
        if (u.elseBlock.id === parentId) {
          u = { ...u, elseBlock: { ...u.elseBlock, children: [...(u.elseBlock.children || []), newItem] } };
        } else {
          u = { ...u, elseBlock: { ...u.elseBlock, children: addToParent(u.elseBlock.children || [], parentId, newItem) } };
        }
      }
      return u;
    });
  };

  const deleteItem = (id) => {
    const deleteFromParent = (items, targetId) => {
      return items.map(item => {
        let result = { ...item };
        if (item.children) {
          result = {
            ...result,
            children: item.children.filter(child => child.id !== targetId)
              .map(child => deleteFromParent([child], targetId)[0])
          };
        }
        if (item.elifBlocks) {
          result = {
            ...result,
            elifBlocks: item.elifBlocks.map(elif => ({
              ...elif,
              children: elif.children.filter(child => child.id !== targetId)
                .map(child => deleteFromParent([child], targetId)[0])
            }))
          };
        }
        if (item.elseBlock) {
          result = {
            ...result,
            elseBlock: {
              ...item.elseBlock,
              children: (item.elseBlock.children || []).filter(child => child.id !== targetId)
                .map(child => deleteFromParent([child], targetId)[0])
            }
          };
        }
        return result;
      }).filter(item => item.id !== targetId);
    };
    updateModuleMappings(activeModule,deleteFromParent(mappings, id));
  };

  // Update multiple fields on one item in a single state update (avoids stale closure when switching exprType)
  const updateItemFields = (id, updates) => {
    const updateInItems = (items) => {
      return items.map(it => {
        if (it.id === id) {
          return { ...it, ...updates };
        }
        let result = { ...it };
        if (it.children) result = { ...result, children: updateInItems(it.children) };
        if (it.elifBlocks) result = { ...result, elifBlocks: it.elifBlocks.map(elif => ({ ...elif, children: updateInItems(elif.children) })) };
        if (it.elseBlock) result = { ...result, elseBlock: { ...it.elseBlock, children: updateInItems(it.elseBlock.children || []) } };
        return result;
      });
    };
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const updateItem = (id, field, value) => {
    const updateInItems = (items) => {
      return items.map(item => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        // IF blocks have children, elifBlocks, AND elseBlock — must process all
        let result = { ...item };
        if (item.children) {
          result = { ...result, children: updateInItems(item.children) };
        }
        if (item.elifBlocks) {
          result = {
            ...result,
            elifBlocks: item.elifBlocks.map(elif => ({
              ...elif,
              children: updateInItems(elif.children)
            }))
          };
        }
        if (item.elseBlock) {
          result = {
            ...result,
            elseBlock: {
              ...item.elseBlock,
              children: updateInItems(item.elseBlock.children || [])
            }
          };
        }
        return result;
      });
    };
    updateModuleMappings(activeModule,updateInItems(mappings));
  };

  const updateElifCondition = (ifBlockId, elifIdx, newCondition) => {
    const updateInItems = (items) => {
      return items.map(item => {
        if (item.id === ifBlockId && item.type === 'if') {
          return {
            ...item,
            elifBlocks: item.elifBlocks.map((eb, idx) =>
              idx === elifIdx ? { ...eb, condition: newCondition } : eb
            )
          };
        }
        let result = { ...item };
        if (item.children) result = { ...result, children: updateInItems(item.children) };
        if (item.elifBlocks) result = { ...result, elifBlocks: item.elifBlocks.map(elif => ({ ...elif, children: updateInItems(elif.children) })) };
        if (item.elseBlock) result = { ...result, elseBlock: { ...item.elseBlock, children: updateInItems(item.elseBlock.children || []) } };
        return result;
      });
    };
    updateModuleMappings(activeModule,updateInItems(mappings));
  };

  const addElif = (ifBlockId) => {
    const newElif = {
      id: generateId(),
      condition: '',
      children: []
    };
    
    const updateInItems = (items) => {
      return items.map(item => {
        if (item.id === ifBlockId && item.type === 'if') {
          return {
            ...item,
            elifBlocks: [...(item.elifBlocks || []), newElif]
          };
        }
        if (item.children) {
          return { ...item, children: updateInItems(item.children) };
        }
        if (item.elifBlocks) {
          return {
            ...item,
            elifBlocks: item.elifBlocks.map(elif => ({
              ...elif,
              children: updateInItems(elif.children)
            }))
          };
        }
        if (item.elseBlock) {
          return {
            ...item,
            elseBlock: {
              ...item.elseBlock,
              children: updateInItems(item.elseBlock.children || [])
            }
          };
        }
        return item;
      });
    };
    updateModuleMappings(activeModule,updateInItems(mappings));
    setExpandedBlocks(new Set([...expandedBlocks, newElif.id]));
  };

  const addElse = (ifBlockId) => {
    let newElseId = null;
    const updateInItems = (items) => {
      return items.map(item => {
        if (item.id === ifBlockId && item.type === 'if') {
          newElseId = generateId();
          return { ...item, elseBlock: { id: newElseId, children: [] } };
        }
        let result = { ...item };
        if (item.children) result = { ...result, children: updateInItems(item.children) };
        if (item.elifBlocks) result = { ...result, elifBlocks: item.elifBlocks.map(elif => ({ ...elif, children: updateInItems(elif.children) })) };
        if (item.elseBlock) result = { ...result, elseBlock: { ...item.elseBlock, children: updateInItems(item.elseBlock.children || []) } };
        return result;
      });
    };
    updateModuleMappings(activeModule, updateInItems(mappings));
    if (newElseId) setExpandedBlocks(prev => new Set([...prev, newElseId]));
  };

  const deleteElif = (ifBlockId, elifIdx) => {
    const updateInItems = (items) => {
      return items.map(item => {
        if (item.id === ifBlockId && item.type === 'if') {
          return { ...item, elifBlocks: item.elifBlocks.filter((_, i) => i !== elifIdx) };
        }
        if (item.children) return { ...item, children: updateInItems(item.children) };
        if (item.elifBlocks) return { ...item, elifBlocks: item.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children) })) };
        if (item.elseBlock) return { ...item, elseBlock: { ...item.elseBlock, children: updateInItems(item.elseBlock.children || []) } };
        return item;
      });
    };
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const deleteElse = (ifBlockId) => {
    const updateInItems = (items) => {
      return items.map(item => {
        if (item.id === ifBlockId && item.type === 'if') {
          return { ...item, elseBlock: null };
        }
        if (item.children) return { ...item, children: updateInItems(item.children) };
        if (item.elifBlocks) return { ...item, elifBlocks: item.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children) })) };
        if (item.elseBlock) return { ...item, elseBlock: { ...item.elseBlock, children: updateInItems(item.elseBlock.children || []) } };
        return item;
      });
    };
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  // ── Static list element helpers ──────────────────────────────────────────
  const addLcElement = (assignmentId) => {
    const newEl = { id: uid(), fields: [] };
    const update = (items) => items.map(item => {
      if (item.id === assignmentId) return { ...item, lcElements: [...(item.lcElements || []), newEl] };
      let u = { ...item };
      if (u.children) u = { ...u, children: update(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: update(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: update(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, update(mappings));
  };

  const deleteLcElement = (assignmentId, elId) => {
    const update = (items) => items.map(item => {
      if (item.id === assignmentId) return { ...item, lcElements: (item.lcElements || []).filter(e => e.id !== elId) };
      let u = { ...item };
      if (u.children) u = { ...u, children: update(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: update(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: update(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, update(mappings));
  };

  const addLcElementField = (assignmentId, elId) => {
    const newField = { id: uid(), target: '', expression: '', exprType: 'input', staticValue: '', funcName: 'now', funcArgs: '' };
    const update = (items) => items.map(item => {
      if (item.id === assignmentId) return { ...item, lcElements: (item.lcElements || []).map(e => e.id === elId ? { ...e, fields: [...(e.fields || []), newField] } : e) };
      let u = { ...item };
      if (u.children) u = { ...u, children: update(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: update(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: update(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, update(mappings));
  };

  const updateLcElementField = (assignmentId, elId, fieldId, key, value) => {
    const update = (items) => items.map(item => {
      if (item.id === assignmentId) return {
        ...item,
        lcElements: (item.lcElements || []).map(e => e.id !== elId ? e : {
          ...e,
          fields: (e.fields || []).map(f => f.id !== fieldId ? f : { ...f, [key]: value })
        })
      };
      let u = { ...item };
      if (u.children) u = { ...u, children: update(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: update(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: update(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, update(mappings));
  };

  // Replace an entire field object at once (avoids stale-state from multi-key forEach)
  const replaceLcElementField = (assignmentId, elId, fieldId, newField) => {
    const update = (items) => items.map(item => {
      if (item.id === assignmentId) return {
        ...item,
        lcElements: (item.lcElements || []).map(e => e.id !== elId ? e : {
          ...e,
          fields: (e.fields || []).map(f => f.id !== fieldId ? f : { ...f, ...newField })
        })
      };
      let u = { ...item };
      if (u.children) u = { ...u, children: update(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: update(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: update(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, update(mappings));
  };

    const deleteLcElementField = (assignmentId, elId, fieldId) => {
    const update = (items) => items.map(item => {
      if (item.id === assignmentId) return {
        ...item,
        lcElements: (item.lcElements || []).map(e => e.id !== elId ? e : { ...e, fields: (e.fields || []).filter(f => f.id !== fieldId) })
      };
      let u = { ...item };
      if (u.children) u = { ...u, children: update(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: update(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: update(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, update(mappings));
  };

    const addLcChild = (assignmentId, type) => {
    const newChild = { id: generateId(), type };
    if (type === 'assignment') {
      newChild.target = '';
      newChild.expression = '';
      newChild.exprType = 'input';
      newChild.staticValue = '';
      newChild.funcName = 'now';
      newChild.funcArgs = '';
    }
    else if (type === 'if') { newChild.lcTarget = ''; newChild.condition = ''; newChild.ifExpr = ''; newChild.elifBranches = []; newChild.elseExpr = ''; }
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) return { ...item, lcChildren: [...(item.lcChildren || []), newChild] };
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
    if (type === 'if') setExpandedBlocks(prev => new Set([...prev, newChild.id]));
  };

  const updateLcChild = (assignmentId, childId, field, value) => {
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) {
        return { ...item, lcChildren: (item.lcChildren || []).map(c => c.id === childId ? { ...c, [field]: value } : c) };
      }
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const updateLcChildFull = (assignmentId, childId, replacement) => {
    const { id: _id, ...rest } = replacement;
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) {
        return { ...item, lcChildren: (item.lcChildren || []).map(c => c.id === childId ? { ...c, ...rest } : c) };
      }
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const deleteLcChild = (assignmentId, childId) => {
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) return { ...item, lcChildren: (item.lcChildren || []).filter(c => c.id !== childId) };
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const addLcChildElifBranch = (assignmentId, childId) => {
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) {
        return { ...item, lcChildren: (item.lcChildren || []).map(c => {
          if (c.id !== childId) return c;
          return { ...c, elifBranches: [...(c.elifBranches || []), { condition: '', expr: '' }] };
        })};
      }
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const updateLcChildElifBranch = (assignmentId, childId, elifIdx, field, value) => {
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) {
        return { ...item, lcChildren: (item.lcChildren || []).map(c => {
          if (c.id !== childId) return c;
          const updated = (c.elifBranches || []).map((eb, i) => i === elifIdx ? { ...eb, [field]: value } : eb);
          return { ...c, elifBranches: updated };
        })};
      }
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const deleteLcChildElifBranch = (assignmentId, childId, elifIdx) => {
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) {
        return { ...item, lcChildren: (item.lcChildren || []).map(c => {
          if (c.id !== childId) return c;
          return { ...c, elifBranches: (c.elifBranches || []).filter((_, i) => i !== elifIdx) };
        })};
      }
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const addLcChildIfElse = (assignmentId, childIfId, type) => {
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) {
        return {
          ...item, lcChildren: (item.lcChildren || []).map(c => {
            if (c.id !== childIfId) return c;
            if (type === 'else' && !c.elseBlock) return { ...c, elseBlock: { id: generateId(), children: [] } };
            if (type === 'elif') return { ...c, elifBlocks: [...(c.elifBlocks || []), { id: generateId(), condition: '', children: [] }] };
            return c;
          })
        };
      }
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };

  const updateLcChildIfBranch = (assignmentId, childIfId, branchType, branchIdx, field, value) => {
    const updateInItems = (items) => items.map(item => {
      if (item.id === assignmentId) {
        return {
          ...item, lcChildren: (item.lcChildren || []).map(c => {
            if (c.id !== childIfId) return c;
            if (branchType === 'if') return { ...c, [field]: value };
            if (branchType === 'if-child') {
              // field is '_childExpr', update first child's expression
              const newChildren = (c.children || []).length > 0
                ? c.children.map((ch, i) => i === 0 ? { ...ch, expression: value } : ch)
                : [{ id: generateId(), type: 'assignment', target: '', expression: value }];
              return { ...c, children: newChildren };
            }
            if (branchType === 'else-child') {
              const newChildren = (c.elseBlock?.children || []).length > 0
                ? c.elseBlock.children.map((ch, i) => i === 0 ? { ...ch, expression: value } : ch)
                : [{ id: generateId(), type: 'assignment', target: '', expression: value }];
              return { ...c, elseBlock: { ...c.elseBlock, children: newChildren } };
            }
            if (branchType === 'else-del') return { ...c, elseBlock: null };
            if (branchType === 'else') return { ...c, elseBlock: { ...(c.elseBlock || { id: generateId() }), [field]: value } };
            if (branchType === 'elif') return { ...c, elifBlocks: (c.elifBlocks || []).map((eb, i) => i === branchIdx ? { ...eb, [field]: value } : eb) };
            return c;
          })
        };
      }
      let u = { ...item };
      if (u.children) u = { ...u, children: updateInItems(u.children) };
      if (u.elifBlocks) u = { ...u, elifBlocks: u.elifBlocks.map(eb => ({ ...eb, children: updateInItems(eb.children || []) })) };
      if (u.elseBlock) u = { ...u, elseBlock: { ...u.elseBlock, children: updateInItems(u.elseBlock.children || []) } };
      return u;
    });
    updateModuleMappings(activeModule, updateInItems(mappings));
  };


  // Render individual mapping item
  const renderItem = (item, depth = 0, parentId = null, index = 0) => {
    const isExpanded = expandedBlocks.has(item.id);
    const indentWidth = depth * 24;

    if (item.type === 'module_call') {
      const otherModules = modules.filter((m, i) => i !== activeModule && m.name !== 'main');
      return (
        <div key={item.id} className="group hover:bg-slate-50 rounded-lg transition-colors" style={{ marginLeft: `${indentWidth}px` }}>
          <div className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg bg-slate-50/50">
            <Layers className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-xs text-slate-500 shrink-0">Call module</span>
              <select
                value={item.moduleName || ''}
                onChange={(e) => updateItem(item.id, 'moduleName', e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded text-sm font-mono bg-white focus:outline-none focus:border-slate-400"
              >
                <option value="">— Select module —</option>
                {otherModules.map(m => (
                  <option key={m.id} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
            <button type="button" onClick={() => deleteItem(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    if (item.type === 'variable') {
      return (
        <div key={item.id} className="group hover:bg-slate-50 rounded-lg transition-colors" style={{ marginLeft: `${indentWidth}px` }}>
          <div className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg bg-slate-50/50">
            <Code className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="flex-1 grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Variable name (e.g. item_list)"
                value={item.varName || ''}
                onChange={(e) => updateItem(item.id, 'varName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded text-sm font-mono bg-white focus:outline-none focus:border-slate-400"
              />
              <div className="relative">
                <input
                  type="text"
                  placeholder="Value (drag from Input or type: number, text, list...)"
                  {...makeBind(`var-${item.id}-expr`, 'root-input', () => item.expression || '', v => updateItem(item.id, 'expression', v), false)}
                  className={`w-full px-3 py-2 border rounded text-sm font-mono focus:outline-none focus:border-slate-400 ${
                    selectedInput?.key === `var-${item.id}-expr`
                      ? 'border-slate-500 bg-slate-100'
                      : 'border-slate-200 bg-white'
                  }`}
                />
              </div>
            </div>
            <button type="button" onClick={() => deleteItem(item.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    if (item.type === 'assignment') {
      // makeBind wires: per-field bindings for drag, drop, focus, change, autocomplete
      const bindTarget   = makeBind(`asgn-${item.id}-target`,   'root-output', () => item.target,      v => updateItem(item.id, 'target', v));
      const bindExpr     = makeBind(`asgn-${item.id}-expr`,     'root-input',  () => item.expression,  v => updateItem(item.id, 'expression', v), true);
      const bindIterable = makeBind(`asgn-${item.id}-iterable`, 'root-input',  () => item.lcIterable || '', v => updateItem(item.id, 'lcIterable', v));

      // Render a compact IF / ELIF / ELSE ternary block inside the list comp body.
      const renderLcIf = (child) => {
        const isExp = expandedBlocks.has(child.id);
        const elifBranches = child.elifBranches || [];
        return (
          <div key={child.id} className="my-1 border border-purple-300 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-purple-100">
              <button onClick={() => toggleBlock(child.id)} className="p-0.5 text-purple-600">
                {isExp ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
              </button>
              <span className="font-bold text-purple-800 text-xs">
                {elifBranches.length > 0 ? 'IF / ELIF / ELSE  ternary' : 'IF / ELSE  ternary'}
              </span>
              {!isExp && child.lcTarget && (
                <span className="text-xs text-purple-500 font-mono truncate">{child.lcTarget}</span>
              )}
              <button onClick={() => deleteLcChild(item.id, child.id)} className="ml-auto p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>
            </div>
            {isExp && (
              <div className="p-2 space-y-1.5 bg-white">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-16 shrink-0">field path</span>
                  <input type="text" placeholder="e.g. field.nested.value"
                    {...makeBind(`lcif-${child.id}-target`, 'relative', () => child.lcTarget || '', v => updateLcChild(item.id, child.id, 'lcTarget', v))}
                    className={`flex-1 px-2 py-1 border rounded text-xs font-mono focus:outline-none ${selectedInput?.key === `lcif-${child.id}-target` ? 'border-amber-400 bg-amber-50' : 'border-slate-300 bg-yellow-50'}`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-700 w-16 shrink-0">IF</span>
                  <input type="text" placeholder="condition  (e.g. item?.type == 'X')"
                    {...makeBind(`lcif-${child.id}-cond`, 'root-input', () => child.condition || '', v => updateLcChild(item.id, child.id, 'condition', v))}
                    className={`flex-1 px-2 py-1 border rounded text-xs font-mono focus:outline-none ${selectedInput?.key === `lcif-${child.id}-cond` ? 'border-purple-500 bg-purple-100' : 'border-purple-300 bg-purple-50'}`} />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-600 w-16 shrink-0 text-right">→ value</span>
                  <input type="text" placeholder="value when condition is true"
                    {...makeBind(`lcif-${child.id}-if`, 'root-input', () => child.ifExpr || '', v => updateLcChild(item.id, child.id, 'ifExpr', v), true)}
                    className={`flex-1 px-2 py-1 border rounded text-xs font-mono focus:outline-none ${selectedInput?.key === `lcif-${child.id}-if` ? 'border-green-400 bg-green-50' : 'border-purple-200 bg-white'}`} />
                </div>
                {/* ELIF branches */}
                {elifBranches.map((eb, idx) => (
                  <React.Fragment key={`elif-${idx}`}>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-indigo-700 w-16 shrink-0">ELIF</span>
                      <input type="text" placeholder="condition"
                        value={eb.condition || ''}
                        onChange={e => updateLcChildElifBranch(item.id, child.id, idx, 'condition', e.target.value)}
                        className="flex-1 px-2 py-1 border border-indigo-300 rounded text-xs font-mono bg-indigo-50 focus:outline-none" />
                      <button onClick={() => deleteLcChildElifBranch(item.id, child.id, idx)}
                        className="p-1 text-red-400 hover:text-red-600 shrink-0"><Trash2 className="w-3 h-3"/></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-indigo-600 w-16 shrink-0 text-right">→ value</span>
                      <input type="text" placeholder="value for this elif branch"
                        value={eb.expr || ''}
                        onChange={e => updateLcChildElifBranch(item.id, child.id, idx, 'expr', e.target.value)}
                        className="flex-1 px-2 py-1 border border-indigo-200 rounded text-xs font-mono bg-white focus:outline-none" />
                    </div>
                  </React.Fragment>
                ))}
                <div className="flex items-center gap-2">
                  <span className="w-16 shrink-0" />
                  <button onClick={() => addLcChildElifBranch(item.id, child.id)}
                    className="px-2 py-0.5 text-xs font-medium text-indigo-600 border border-dashed border-indigo-300 rounded hover:bg-indigo-50">
                    + ELIF branch
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-pink-700 w-16 shrink-0">ELSE →</span>
                  <input type="text" placeholder="default value"
                    {...makeBind(`lcif-${child.id}-else`, 'root-input', () => child.elseExpr || '', v => updateLcChild(item.id, child.id, 'elseExpr', v), true)}
                    className={`flex-1 px-2 py-1 border rounded text-xs font-mono focus:outline-none ${selectedInput?.key === `lcif-${child.id}-else` ? 'border-green-400 bg-green-50' : 'border-pink-200 bg-pink-50'}`} />
                </div>
              </div>
            )}
          </div>
        );
      };

      if (item.listComp) {
        // ── LIST mode: Dynamic (FOR loop) or Static (literal items) ─────────────
        const lcMode = item.lcMode || 'dynamic';
        const lcExpanded = expandedBlocks.has(item.id + '_lc');

        const LC_FUNCS = allFunctions.map(f => ({
          name: f.name,
          label: f.args ? `${f.name}(${f.argsPlaceholder || '…'})` : `${f.name}()`,
          args: f.args,
          ph: f.argsPlaceholder || '',
          builtin: f.builtin,
        }));
        // valTypes / valColors derived from shared VALUE_TYPE_CONFIG
        const valTypes  = Object.fromEntries(Object.entries(VALUE_TYPE_CONFIG).map(([k,v]) => [k, v.label]));
        const valColors = Object.fromEntries(Object.entries(VALUE_TYPE_CONFIG).map(([k,v]) => [k, v.activeClass]));

        // Shared field row — used in both static elements and dynamic FOR body
        // lcFieldContext: { assignmentId, elementId, fieldId } when in static list — enables schema drag/double-click/autocomplete for field
        const renderFieldRow = (fid, field, onUpdate, onDelete, lcFieldContext = null) => {
          const et = field.exprType || 'input';
          const sync = (type, vals) => {
            const upd = { ...field, ...vals, exprType: type };
            if (type === 'static')   upd.expression = `"${(vals.staticValue||'').replace(/"/g,'\\"')}"`;
            if (type === 'number')   upd.expression = vals.staticValue || '0';
            if (type === 'function') { const a=(vals.funcArgs||'').trim(); upd.expression = a ? `${vals.funcName||'now'}(${a})` : `${vals.funcName||'now'}()`; }
            onUpdate(upd);
          };
          const selFn = LC_FUNCS.find(f => f.name === (field.funcName||'now')) || LC_FUNCS[0];
          const bindFieldExpr = makeBind(`fr-${fid}-expr`, 'root-input', () => field.expression || '', v => onUpdate({ ...field, expression: v }), true);
          return (
            <div key={fid} className="border border-slate-100 rounded-lg bg-white overflow-hidden mb-1.5">
              {/* field path row — plain free-type, no drag/autocomplete */}
              <div className="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
                <span className="text-xs text-slate-300 w-10 shrink-0">field</span>
                <div className="flex-1 min-w-0">
                  <input type="text"
                    placeholder="e.g. version  or  address.city"
                    value={field.target || ''}
                    onChange={e => onUpdate({ ...field, target: e.target.value })}
                    className="flex-1 w-full px-2 py-1 border border-yellow-200 rounded text-xs font-mono focus:outline-none focus:border-amber-400 bg-yellow-50" />
                </div>
                <button onClick={onDelete} className="p-1 text-red-200 hover:text-red-400 shrink-0"><Trash2 className="w-3 h-3"/></button>
              </div>
              {/* value type + input row */}
              <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5 flex-wrap">
                <span className="text-xs text-slate-300 w-10 shrink-0">value</span>
                <div className="flex gap-1">
                  {Object.entries(valTypes).map(([t, lbl]) => (
                    <button key={t}
                      onClick={() => sync(t, { staticValue: field.staticValue||'', funcName: field.funcName||'now', funcArgs: field.funcArgs||'' })}
                      className={`px-1.5 py-0.5 rounded text-xs border transition-colors ${et===t ? valColors[t] : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
                {et==='input'    && <input type="text"   placeholder="drag from Input or type path…" {...bindFieldExpr}                                                                                                                        className={`flex-1 min-w-0 px-2 py-1 border rounded text-xs font-mono focus:outline-none ${selectedInput?.key===`fr-${fid}-expr` ? 'border-green-400 bg-green-100' : 'border-green-300 bg-green-50'}`}/>}
                {et==='static'   && <input type="text"   placeholder="type the value, e.g.  1.0.0"  value={field.staticValue||''} onChange={e=>sync('static',  {staticValue:e.target.value, funcName:field.funcName||'now', funcArgs:field.funcArgs||''})} className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs bg-white focus:outline-none"/>}
                {et==='number'   && <input type="number" placeholder="0"                            value={field.staticValue||''} onChange={e=>sync('number',  {staticValue:e.target.value, funcName:field.funcName||'now', funcArgs:field.funcArgs||''})} className="flex-1 min-w-0 px-2 py-1 border border-blue-300 rounded text-xs font-mono bg-blue-50 focus:outline-none"/>}
                {et==='function' && (
                  <div className="flex gap-1 flex-1 min-w-0">
                    <select value={field.funcName||'now'} onChange={e=>sync('function',{funcName:e.target.value,funcArgs:field.funcArgs||'',staticValue:''})} className="px-1.5 py-1 border border-orange-300 rounded text-xs bg-orange-50 focus:outline-none shrink-0">
                      <optgroup label="Built-in">{LC_FUNCS.filter(f=>f.builtin).map(f=><option key={f.name} value={f.name}>{f.name}()</option>)}</optgroup>
                      {LC_FUNCS.filter(f=>!f.builtin).length>0 && <optgroup label="Registered">{LC_FUNCS.filter(f=>!f.builtin).map(f=><option key={f.name} value={f.name}>{f.name}()</option>)}</optgroup>}
                    </select>
                    {selFn.args && <input type="text" placeholder={selFn.ph||'args…'} value={field.funcArgs||''} onChange={e=>sync('function',{funcName:field.funcName||'now',funcArgs:e.target.value,staticValue:''})} className="flex-1 min-w-0 px-2 py-1 border border-orange-200 rounded text-xs font-mono bg-white focus:outline-none"/>}
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div key={item.id} className="group rounded-lg my-2" style={{ marginLeft: `${indentWidth}px` }}>
            <div className="border-2 border-blue-400 rounded-xl overflow-hidden shadow-sm">

              {/* Header: OUTPUT key + mode badge + Plain + delete */}
              <div className={`flex items-center gap-2 px-3 py-2 border-b ${lcMode==='object' ? 'bg-violet-50 border-violet-200' : 'bg-blue-50 border-blue-200'}`}>
                <Move className={`w-4 h-4 cursor-move shrink-0 ${lcMode==='object' ? 'text-violet-300' : 'text-blue-300'}`} />
                <div className="flex-1">
                  <input type="text" placeholder="OUTPUT key  (e.g.  AboutVersion)"
                    {...bindTarget}
                    className={`w-full px-3 py-1.5 border rounded text-sm font-mono focus:outline-none ${selectedInput?.key===`asgn-${item.id}-target`
                      ? (lcMode==='object' ? 'border-violet-500 bg-yellow-100' : 'border-blue-500 bg-yellow-100')
                      : (lcMode==='object' ? 'border-violet-300 bg-yellow-50' : 'border-blue-300 bg-yellow-50')}`} />
                </div>
                <span className={`text-xs font-bold px-2 py-1 rounded shrink-0 font-mono ${lcMode==='object' ? 'text-violet-700 bg-violet-100' : 'text-blue-700 bg-blue-100'}`}>
                  {lcMode==='object' ? '= { }' : '= [ … ]'}
                </span>
                <button onClick={() => deleteItem(item.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded shrink-0"><Trash2 className="w-4 h-4"/></button>
              </div>

              {/* Mode switcher — only shown for array modes (object mode has no sub-type) */}
              {lcMode !== 'object' && (
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">Array type</span>
                <button onClick={() => updateItem(item.id,'lcMode','dynamic')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${lcMode==='dynamic' ? 'bg-green-100 border-green-400 text-green-800' : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'}`}>
                  🔄 Dynamic — loop over input array
                </button>
                <button onClick={() => updateItem(item.id,'lcMode','static')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${lcMode==='static' ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'}`}>
                  📋 Static — fixed items I fill in
                </button>
              </div>
              )}

              {/* ══ STATIC body ════════════════════════════════════════════════════ */}
              {lcMode==='static' && (
                <div className="p-3 bg-white space-y-2">
                  {(item.lcElements||[{id:'_default',fields:[]}]).map((el, elIdx) => {
                    const elExpanded = expandedBlocks.has(el.id) || elIdx===0;
                    return (
                      <div key={el.id} className="border border-amber-200 rounded-xl overflow-hidden">
                        {/* element header */}
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border-b border-amber-100">
                          <button onClick={() => toggleBlock(el.id)} className="p-0.5 text-amber-500">
                            {elExpanded ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
                          </button>
                          <span className="text-xs font-bold text-amber-800">Item {elIdx+1}</span>
                          <span className="text-xs text-amber-400 ml-1">({(el.fields||[]).length} field{(el.fields||[]).length!==1?'s':''})</span>
                          <div className="flex-1"/>
                          {(item.lcElements||[]).length > 1 && (
                            <button onClick={() => deleteLcElement(item.id, el.id)} className="p-1 text-red-300 hover:text-red-500"><Trash2 className="w-3 h-3"/></button>
                          )}
                        </div>
                        {/* element fields */}
                        {elExpanded && (
                          <div className="p-2">
                            {(el.fields||[]).length===0 && (
                              <p className="text-xs text-slate-300 text-center py-3">No fields yet — click + Add Field below</p>
                            )}
                            {(el.fields||[]).map(field =>
                              renderFieldRow(
                                field.id, field,
                                (updated) => replaceLcElementField(item.id, el.id, field.id, updated),
                                () => deleteLcElementField(item.id, el.id, field.id),
                                { assignmentId: item.id, elementId: el.id, fieldId: field.id }
                              )
                            )}
                            <button onClick={() => addLcElementField(item.id, el.id)}
                              className="w-full mt-1 px-3 py-1.5 border border-dashed border-amber-300 text-amber-600 rounded-lg text-xs hover:bg-amber-50 flex items-center justify-center gap-1">
                              <Plus className="w-3 h-3"/> Add Field
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <button onClick={() => addLcElement(item.id)}
                    className="w-full px-3 py-2 border-2 border-dashed border-amber-300 text-amber-700 rounded-xl text-xs hover:bg-amber-50 flex items-center justify-center gap-2 font-medium">
                    <Plus className="w-3 h-3"/> Add List Item
                  </button>
                </div>
              )}

              {/* ══ OBJECT body ═══════════════════════════════════════════════════ */}
              {lcMode==='object' && (() => {
                // Object mode: single set of fields, assigned as a dict (no array wrapper)
                const objEl = (item.lcElements && item.lcElements[0]) || { id: uid(), fields: [] };
                // Ensure element exists in state
                if (!item.lcElements || item.lcElements.length === 0) {
                  updateItem(item.id, 'lcElements', [objEl]);
                }
                return (
                  <div className="p-3 bg-white">
                    <div className="border border-violet-200 rounded-xl overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-violet-50 border-b border-violet-100">
                        <span className="text-xs font-bold text-violet-800">&#123; &#125; Fields</span>
                        <span className="text-xs text-violet-400 ml-1">({(objEl.fields||[]).length} field{(objEl.fields||[]).length!==1?'s':''})</span>
                      </div>
                      <div className="p-2">
                        {(objEl.fields||[]).length===0 && (
                          <p className="text-xs text-slate-300 text-center py-3">No fields yet — click + Add Field below</p>
                        )}
                        {(objEl.fields||[]).map(field =>
                          renderFieldRow(
                            field.id, field,
                            (updated) => replaceLcElementField(item.id, objEl.id, field.id, updated),
                            () => deleteLcElementField(item.id, objEl.id, field.id),
                            { assignmentId: item.id, elementId: objEl.id, fieldId: field.id }
                          )
                        )}
                        <button onClick={() => addLcElementField(item.id, objEl.id)}
                          className="w-full mt-1 px-3 py-1.5 border border-dashed border-violet-300 text-violet-600 rounded-lg text-xs hover:bg-violet-50 flex items-center justify-center gap-1">
                          <Plus className="w-3 h-3"/> Add Field
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* ══ DYNAMIC body (FOR loop) ════════════════════════════════════════ */}
              {lcMode==='dynamic' && (
                <>
                  {/* FOR iterator IN iterable */}
                  <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border-b border-green-200">
                    <button onClick={() => toggleBlock(item.id+'_lc')} className="p-0.5 text-green-700">
                      {lcExpanded ? <ChevronDown className="w-4 h-4"/> : <ChevronRight className="w-4 h-4"/>}
                    </button>
                    <span className="font-bold text-green-800 text-sm">FOR</span>
                    <input type="text" placeholder="item" value={item.lcIterator||'item'}
                      onChange={e => updateItem(item.id,'lcIterator',e.target.value)}
                      className="w-24 px-2 py-1.5 border border-green-300 rounded text-sm font-mono bg-white focus:outline-none"/>
                    <span className="font-bold text-green-800 text-sm">IN</span>
                    <div className="flex-1">
                      <input type="text" placeholder="Drag array field or type (e.g. input.items)"
                        {...bindIterable}
                        className={`w-full px-3 py-1.5 border rounded text-sm font-mono focus:outline-none ${selectedInput?.key===`asgn-${item.id}-iterable` ? 'border-green-500 bg-green-200' : 'border-green-300 bg-white'}`}/>
                    </div>
                  </div>
                  {/* FOR body */}
                  {lcExpanded && (
                    <div className="p-3 bg-white space-y-2">
                      {(item.lcChildren||[]).length===0 && (
                        <p className="text-xs text-slate-400 text-center py-3">Add fields or IF/ELSE inside the loop body</p>
                      )}
                      {(item.lcChildren||[]).map(child => {
                        if (child.type==='if') return renderLcIf(child);
                        return renderFieldRow(
                          child.id, child,
                          (updated) => updateLcChildFull(item.id, child.id, { ...child, ...updated }),
                          () => deleteLcChild(item.id, child.id)
                        );
                      })}
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => addLcChild(item.id,'assignment')} className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded text-xs hover:bg-green-50 flex items-center gap-1"><Plus className="w-3 h-3"/> Add Field</button>
                        <button onClick={() => addLcChild(item.id,'if')}        className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded text-xs hover:bg-purple-50 flex items-center gap-1"><Plus className="w-3 h-3"/> IF / ELSE</button>
                      </div>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
        );
      }

      // ── PLAIN expression mode ────────────────────────────────────────────────
      const exprType = item.exprType || 'input';

      // Sync derived expression into item.expression based on exprType (single update so exprType + expression apply together)
      const syncExpr = (type, vals) => {
        const upd = { ...vals, exprType: type };
        if (type === 'static') upd.expression = `"${(vals.staticValue || '').replace(/"/g, '\\"')}"`;
        else if (type === 'number') upd.expression = vals.staticValue || '0';
        else if (type === 'function') {
          const args = (vals.funcArgs || '').trim();
          upd.expression = args ? `${vals.funcName || 'now'}(${args})` : `${vals.funcName || 'now'}()`;
        }
        updateItemFields(item.id, upd);
      };

      const BUILTIN_FUNCTIONS = allFunctions;

      const typeConfig = VALUE_TYPE_CONFIG;

      const renderValueInput = () => {
        if (exprType === 'input') {
          return (
            <div className="flex-1 min-w-0 relative">
              <input type="text" placeholder="Drag from Input schema or type path…"
                {...bindExpr}
                className={`w-full px-3 py-2 border rounded focus:outline-none text-sm font-mono ${selectedInput?.key === `asgn-${item.id}-expr` ? 'border-green-500 bg-green-100' : 'border-green-300 bg-green-50'}`} />
            </div>
          );
        }
        if (exprType === 'static') {
          return (
            <div className="flex-1 min-w-0 relative">
              <input type="text" placeholder='Type the static text value, e.g.  1.0.0'
                value={item.staticValue || ''}
                onChange={e => syncExpr('static', { staticValue: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded focus:outline-none text-sm bg-white" />
              <span className="absolute right-2 top-2 text-xs text-slate-400 pointer-events-none">text</span>
            </div>
          );
        }
        if (exprType === 'number') {
          return (
            <div className="flex-1 min-w-0 relative">
              <input type="number" placeholder="0"
                value={item.staticValue || ''}
                onChange={e => syncExpr('number', { staticValue: e.target.value })}
                className="w-full px-3 py-2 border border-blue-300 rounded focus:outline-none text-sm bg-blue-50 font-mono" />
            </div>
          );
        }
        if (exprType === 'function') {
          const selFn = BUILTIN_FUNCTIONS.find(f => f.name === (item.funcName || 'now')) || BUILTIN_FUNCTIONS[0];
          const builtins = BUILTIN_FUNCTIONS.filter(f => f.builtin);
          const customs  = BUILTIN_FUNCTIONS.filter(f => !f.builtin);
          return (
            <div className="flex-1 flex gap-2 min-w-0">
              <select value={item.funcName || 'now'}
                onChange={e => syncExpr('function', { funcName: e.target.value, funcArgs: item.funcArgs || '', staticValue: item.staticValue || '' })}
                className="px-2 py-2 border border-orange-300 rounded text-sm bg-orange-50 focus:outline-none shrink-0">
                <optgroup label="Built-in">
                  {builtins.map(f => <option key={f.id} value={f.name}>{f.name}()</option>)}
                </optgroup>
                {customs.length > 0 && (
                  <optgroup label="Registered helpers">
                    {customs.map(f => <option key={f.id} value={f.name}>{f.name}()</option>)}
                  </optgroup>
                )}
              </select>
              {selFn.args && (
                <input type="text" placeholder={selFn.argsPlaceholder || 'arguments…'}
                  value={item.funcArgs || ''}
                  onChange={e => syncExpr('function', { funcName: item.funcName || 'now', funcArgs: e.target.value, staticValue: item.staticValue || '' })}
                  className="flex-1 min-w-0 px-3 py-2 border border-orange-200 rounded text-sm font-mono bg-white focus:outline-none" />
              )}
              {!selFn.args && <span className="flex-1 px-3 py-2 text-xs text-orange-500 flex items-center">{selFn.desc}</span>}
            </div>
          );
        }
        return null;
      };

      return (
        <div key={item.id} className="group rounded-lg transition-colors my-1" style={{ marginLeft: `${indentWidth}px` }}>
          <div className="flex flex-col gap-0 border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
            {/* Row 1: target field */}
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
              <Move className="w-3.5 h-3.5 text-gray-300 cursor-move shrink-0" />
              <span className="text-xs text-slate-400 shrink-0 w-14">Output</span>
              <div className="flex-1">
                <input type="text" placeholder="Output field  (drag from Output schema or type)"
                  {...bindTarget}
                  className={`w-full px-3 py-1.5 border rounded focus:outline-none text-sm ${selectedInput?.key === `asgn-${item.id}-target` ? 'border-blue-500 bg-yellow-100' : 'border-yellow-300 bg-yellow-50'}`} />
              </div>
              <button onClick={() => deleteItem(item.id)} className="p-1.5 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Row 2: value type selector + value input */}
            <div className="flex items-center gap-2 px-3 pb-2.5 pt-1">
              <span className="w-3.5 shrink-0" />
              <span className="text-xs text-slate-400 shrink-0 w-14">Value</span>
              {/* Type pill buttons */}
              <div className="flex gap-1 shrink-0">
                {Object.entries(typeConfig).map(([t, cfg]) => (
                  <button key={t} onClick={() => { if (t === 'input') updateItem(item.id, 'exprType', 'input'); else syncExpr(t, { staticValue: item.staticValue || '', funcName: item.funcName || 'now', funcArgs: item.funcArgs || '' }); }}
                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${exprType === t ? `${cfg.activeClass} shadow-sm` : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
                    {cfg.label}
                  </button>
                ))}
              </div>
              {renderValueInput()}
            </div>
          </div>
        </div>
      );
    }

    if (item.type === 'if') {
      // Helper: add-item bar used inside IF/ELIF/ELSE bodies
      const addBar = (parentId, borderColor, textColor, hoverColor) => (
        <div className="flex gap-2 mt-2 pl-6">
          <button onClick={() => addItem(parentId, 'variable')}  className={`px-3 py-1.5 bg-white border ${borderColor} ${textColor} rounded ${hoverColor} text-xs flex items-center gap-1`}><Code className="w-3 h-3" /> Variable</button>
          <button onClick={() => addItem(parentId, 'assignment')} className={`px-3 py-1.5 bg-white border ${borderColor} ${textColor} rounded ${hoverColor} text-xs flex items-center gap-1`}><ArrowRight className="w-3 h-3" /> Map Field</button>
          <button onClick={() => addItem(parentId, 'if')}         className={`px-3 py-1.5 bg-white border ${borderColor} ${textColor} rounded ${hoverColor} text-xs flex items-center gap-1`}><Plus className="w-3 h-3" /> If</button>
          <button onClick={() => addItem(parentId, 'for')}        className={`px-3 py-1.5 bg-white border ${borderColor} ${textColor} rounded ${hoverColor} text-xs flex items-center gap-1`}><Plus className="w-3 h-3" /> For</button>
        </div>
      );

      return (
        <div key={item.id} className="my-2" style={{ marginLeft: `${indentWidth}px` }}>

          {/* ── IF header + body ── */}
          <div className="border-l-4 border-purple-400 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 p-3 bg-purple-100 rounded-t-lg">
              <button onClick={() => toggleBlock(item.id)} className="p-1">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <span className="font-semibold text-purple-900 text-sm">IF</span>
              <input
                type="text"
                placeholder="Condition (e.g., item?.accountNumber == 1234)"
                {...makeBind(`if-${item.id}-cond`, 'root-input', () => item.condition, v => updateItem(item.id, 'condition', v))}
                className={`flex-1 px-3 py-2 border rounded focus:outline-none text-sm font-mono ${
                  selectedInput?.key === `if-${item.id}-cond`
                    ? 'border-purple-500 bg-purple-200' : 'border-purple-300 bg-white'
                }`}
              />
              <button onClick={() => deleteItem(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded" title="Delete IF block">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {isExpanded && (
              <div className="p-3 space-y-2">
                {item.children?.map((child, idx) => renderItem(child, depth + 1, item.id, idx))}
                {addBar(item.id, 'border-purple-300', 'text-purple-700', 'hover:bg-purple-50')}
              </div>
            )}
          </div>

          {/* ── ELIF blocks — same visual level as IF ── */}
          {item.elifBlocks?.map((elif, elifIdx) => (
            <div key={elif.id} className="border-l-4 border-indigo-400 bg-indigo-50 rounded-lg mt-1">
              <div className="flex items-center gap-2 p-3 bg-indigo-100 rounded-t-lg">
                <button onClick={() => toggleBlock(elif.id)} className="p-1">
                  {expandedBlocks.has(elif.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <span className="font-semibold text-indigo-900 text-sm">ELIF</span>
                <input
                  type="text"
                  placeholder="Condition"
                  {...makeBind(`elif-${elif.id}-cond`, 'root-input', () => elif.condition, v => updateElifCondition(item.id, elifIdx, v))}
                  className={`flex-1 px-3 py-2 border rounded focus:outline-none text-sm font-mono ${
                    selectedInput?.key === `elif-${elif.id}-cond`
                      ? 'border-indigo-500 bg-indigo-200' : 'border-indigo-300 bg-white'
                  }`}
                />
                <button onClick={() => deleteElif(item.id, elifIdx)} className="p-2 text-red-500 hover:bg-red-50 rounded" title="Delete ELIF">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {expandedBlocks.has(elif.id) && (
                <div className="p-3 space-y-2">
                  {elif.children?.map((child, idx) => renderItem(child, depth + 1, elif.id, idx))}
                  {addBar(elif.id, 'border-indigo-300', 'text-indigo-700', 'hover:bg-indigo-50')}
                </div>
              )}
            </div>
          ))}

          {/* ── ELSE block — same visual level as IF ── */}
          {item.elseBlock && (
            <div className="border-l-4 border-pink-400 bg-pink-50 rounded-lg mt-1">
              <div className="flex items-center gap-2 p-3 bg-pink-100 rounded-t-lg">
                <button onClick={() => toggleBlock(item.elseBlock.id)} className="p-1">
                  {expandedBlocks.has(item.elseBlock.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <span className="font-semibold text-pink-900 text-sm">ELSE</span>
                <div className="flex-1" />
                <button onClick={() => deleteElse(item.id)} className="p-2 text-red-500 hover:bg-red-50 rounded" title="Delete ELSE">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              {expandedBlocks.has(item.elseBlock.id) && (
                <div className="p-3 space-y-2">
                  {item.elseBlock.children?.map((child, idx) => renderItem(child, depth + 1, item.elseBlock.id, idx))}
                  {addBar(item.elseBlock.id, 'border-pink-300', 'text-pink-700', 'hover:bg-pink-50')}
                </div>
              )}
            </div>
          )}

          {/* ── Add ELIF / Add ELSE controls ── */}
          <div className="flex gap-2 mt-1 pl-1">
            <button onClick={() => addElif(item.id)} className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs">+ Add ELIF</button>
            {!item.elseBlock && (
              <button onClick={() => addElse(item.id)} className="px-3 py-1 bg-pink-600 text-white rounded hover:bg-pink-700 text-xs">+ Add ELSE</button>
            )}
          </div>
        </div>
      );
    }

    if (item.type === 'for') {
      return (
        <div
          key={item.id}
          className="my-2"
          style={{ marginLeft: `${indentWidth}px` }}
        >
          <div className="border-l-4 border-green-400 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 p-3 bg-green-100 rounded-t-lg">
              <button onClick={() => toggleBlock(item.id)} className="p-1">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <span className="font-semibold text-green-900 text-sm">FOR</span>
              <input
                type="text"
                placeholder="item"
                value={item.iterator}
                onChange={(e) => updateItem(item.id, 'iterator', e.target.value)}
                className="w-32 px-3 py-2 border border-green-300 rounded focus:outline-none focus:border-gray-400 text-sm font-mono bg-white"
              />
              <span className="text-green-900 font-semibold">IN</span>
              <div className="flex-1 relative">
              <input
                type="text"
                placeholder="Drag array field or type (e.g., input.accounts)"
                {...makeBind(`for-${item.id}-iterable`, 'root-input', () => item.iterable, v => updateItem(item.id, 'iterable', v))}
                className={`w-full px-3 py-2 border rounded focus:outline-none focus:border-gray-400 text-sm font-mono ${
                  selectedInput?.key === `for-${item.id}-iterable`
                    ? 'border-green-500 bg-green-200'
                    : 'border-green-300 bg-white'
                }`}
              />
              </div>
              <button
                onClick={() => deleteItem(item.id)}
                className="p-2 text-red-600 hover:bg-red-50 rounded"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {isExpanded && (
              <div className="p-3 space-y-2">
                {item.children?.map((child, idx) => renderItem(child, depth + 1, item.id, idx))}
                
                <div className="flex gap-2 mt-2" style={{ marginLeft: `${24}px` }}>
                  <button onClick={() => addItem(item.id, 'variable')} className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded hover:bg-green-50 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Variable</button>
                  <button onClick={() => addItem(item.id, 'assignment')} className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded hover:bg-green-50 text-xs flex items-center gap-1"><Plus className="w-3 h-3" /> Assignment</button>
                  <button
                    onClick={() => addItem(item.id, 'if')}
                    className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded hover:bg-green-50 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> If
                  </button>
                  <button
                    onClick={() => addItem(item.id, 'for')}
                    className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded hover:bg-green-50 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> For
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  const generateTemplate = () => {
    const convertToTemplate = (items) => {
      return items.map(item => {
        if (item.type === 'assignment') {
          return { [item.target]: item.expression };
        } else if (item.type === 'if') {
          const result = {
            if: item.condition,
            then: convertToTemplate(item.children || [])
          };
          if (item.elifBlocks && item.elifBlocks.length > 0) {
            result.elif = item.elifBlocks.map(elif => ({
              condition: elif.condition,
              then: convertToTemplate(elif.children || [])
            }));
          }
          if (item.elseBlock) {
            result.else = convertToTemplate(item.elseBlock.children || []);
          }
          return result;
        } else if (item.type === 'for') {
          return {
            for: item.iterator,
            in: item.iterable,
            do: convertToTemplate(item.children || [])
          };
        }
        return null;
      }).filter(Boolean);
    };

    const template = convertToTemplate(mappings);
    console.log(JSON.stringify(template, null, 2));
    alert('Template generated! Check console for output.');
  };

  const generateCode = () => {
    const lines = [];

    // Convert to PascalCase for function name: "items" -> "Items", "about_version" -> "AboutVersion"
    const toCamelFuncName = (name) => {
      if (!name) return '';
      if (name.includes('_')) {
        return name.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
      }
      return name.charAt(0).toUpperCase() + name.slice(1);
    };

    // Human-readable docstring title: "aboutVersion" -> "About Version", "items" -> "Items"
    const toDocTitle = (name) => {
      // Split on underscores or camelCase boundaries
      const words = name
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2');
      return words
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    };

    // Helper to clean target path: strip output./input. prefix AND [*] array markers
    const cleanPath = (path) => {
      if (!path) return '';
      if (path.startsWith('output.')) path = path.substring(7);
      else if (path.startsWith('input.')) path = path.substring(6);
      return path.replace(/\[\*\]/g, '');
    };

    // Extract root key from a cleaned target path
    const rootKeyOf = (cleanedTarget) => cleanedTarget.replace(/\[\*\]/g, '').split('.')[0];

    // Normalise expression: replace 'input.' prefix with 'INPUT?.'
    // and ensure all property accesses use ?. to avoid null pointer errors
    const addSafeNav = (expr) => {
      if (!expr) return expr;
      // Replace every bare '.' that is NOT already preceded by '?' with '?.'
      // Skip dots inside string literals (single or double quoted).
      // Also skip '[' that is an array slice (followed by digit, ':', or '-') — these
      // are Python slices like [0:2] or [2:] and must never become ?.[...].
      let result = '';
      let inSingle = false, inDouble = false;
      for (let i = 0; i < expr.length; i++) {
        const ch = expr[i];
        if (ch === "'" && !inDouble) { inSingle = !inSingle; result += ch; continue; }
        if (ch === '"' && !inSingle) { inDouble = !inDouble; result += ch; continue; }
        if (!inSingle && !inDouble && ch === '.' && expr[i - 1] !== '?') {
          result += '?.';
        } else {
          result += ch;
        }
      }
      return result;
    };

    // Strip any spurious ?. that ended up immediately before a Python slice bracket.
    // e.g.  expr?.[0:2]  →  expr[0:2]   (slice, not property access)
    // A slice bracket is [ followed by: digit, ':', or '-'
    const stripSliceSafeNav = (expr) => {
      if (!expr) return expr;
      return expr.replace(/\?\.\[(?=[\d:\-])/g, '[');
    };

    const cleanExpr = (expr) => {
      if (!expr) return '""';
      // 1. Replace input. prefix with INPUT?.
      let e = expr.replace(/\binput\./gi, 'INPUT?.');
      // 2. Ensure all remaining dot-navigations are safe ?.
      e = addSafeNav(e);
      // 3. Remove any ?. that was accidentally inserted before a Python slice bracket.
      //    e.g.  foo?.[0:2]  →  foo[0:2]
      e = stripSliceSafeNav(e);
      return e;
    };

    // Inside a for-loop body rewrite expressions: INPUT?.accounts[*].foo → iterator?.foo
    const rewriteForExpr = (expr, iterator, iterable) => {
      if (!expr || !iterable) return expr;
      const iterableBase = iterable
        .replace(/^INPUT\?\./i, '')
        .replace(/^input\./i, '')
        .replace(/\[\*\]/g, '');
      const escaped = iterableBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return expr
        .replace(new RegExp('INPUT\\?\\.' + escaped + '\\[\\*\\]\\.', 'gi'), iterator + '?.')
        .replace(new RegExp('INPUT\\?\\.' + escaped + '\\.', 'gi'), iterator + '?.');
    };

    // ─── Dict / list-comprehension builder ───────────────────────────────────

    // Generate Python dict literal lines at a given indent level.
    // `obj` is a plain JS object where string values are Python expressions
    // and nested objects are sub-dicts.  Special key `_directValue` means
    // the object itself IS that expression.
    const generateDict = (obj, indent) => {
      const pre = '    '.repeat(indent);
      const result = [];

      if (obj._directValue !== undefined) return [obj._directValue];

      const entries = Object.entries(obj).filter(([k]) => k !== '_directValue');
      if (entries.length === 0) return ['{}'];

      result.push('{');
      entries.forEach(([key, value], idx) => {
        const isLast = idx === entries.length - 1;
        if (typeof value === 'string') {
          result.push(`${pre}    "${key}": ${value}${isLast ? '' : ','}`);
        } else if (value && value._listComp) {
          // List comprehension node produced by buildNestedStructure
          const compLines = value._listComp;
          if (compLines.length === 1) {
            result.push(`${pre}    "${key}": ${compLines[0]}${isLast ? '' : ','}`);
          } else {
            result.push(`${pre}    "${key}": ${compLines[0]}`);
            compLines.slice(1, -1).forEach(l => result.push(`${pre}        ${l}`));
            result.push(`${pre}        ${compLines[compLines.length - 1]}${isLast ? '' : ','}`);
          }
        } else {
          const childLines = generateDict(value, indent + 1);
          if (childLines.length === 1) {
            result.push(`${pre}    "${key}": ${childLines[0]}${isLast ? '' : ','}`);
          } else {
            result.push(`${pre}    "${key}": ${childLines[0]}`);
            childLines.slice(1, -1).forEach(l => result.push(l));
            result.push(`${childLines[childLines.length - 1]}${isLast ? '' : ','}`);
          }
        }
      });
      result.push(`${pre}}`);
      return result;
    };

    // Build a nested JS object from a flat list of assignments sharing a root key.
    // Assignments that come from a `for` block are represented as list comprehensions.
    const buildNestedStructure = (assignments) => {
      const structure = {};

      assignments.forEach(({ cleanedTarget, expression, _forMeta }) => {
        const parts = cleanedTarget.split('.');
        const subParts = parts.slice(1); // strip root key

        if (subParts.length === 0) {
          structure._directValue = expression;
          return;
        }

        let current = structure;
        for (let i = 0; i < subParts.length - 1; i++) {
          const part = subParts[i];
          if (!current[part]) current[part] = {};
          current = current[part];
        }

        const lastPart = subParts[subParts.length - 1];

        if (_forMeta) {
          // Represent as list comprehension: [{ "key": expr } for iter in iterable]
          current[lastPart] = {
            _listComp: buildListComp(_forMeta)
          };
        } else {
          current[lastPart] = expression;
        }
      });

      return structure;
    };

    // Build list comprehension lines for a for-block.
    // _forMeta = { iterator, iterable, children, isFromListComp? }  where children are assignment items.
    const buildListComp = ({ iterator, iterable, children, isFromListComp = false }) => {
      const innerAssignments = collectForChildren(children, iterator, iterable, isFromListComp);
      const innerStructure = buildInnerDict(innerAssignments);
      const dictLines = generateDict(innerStructure, 3); // deep indent for the comp body

      const iterClean = cleanExpr(iterable);
      const safeIterable = `(${iterClean} or [])`;

      if (dictLines.length === 1) {
        return [`[${dictLines[0]} for ${iterator} in ${safeIterable}]`];
      }
      // Multi-line list comp with hanging indent
      const result = [`[`];
      dictLines.forEach(l => result.push(`    ${l}`));
      result.push(`    for ${iterator} in ${safeIterable}`);
      result.push(`]`);
      return result;
    };

    // Collect assignments from for-loop children and convert paths using iterator var.
    // Supports plain assignments AND LC-IF ternary blocks.
    // When isFromListComp: lcChildren targets (e.g. subjectProperty.address.x) are already relative.
    // When not: old-style FOR children may have rootKey prefix to strip.
    const collectForChildren = (children, iterator, iterable, isFromListComp = false) => {
      const results = [];
      (children || []).forEach(item => {
        if (item.type === 'assignment' && item.target) {
          const cleaned = cleanPath(item.target);
          const expr = rewriteForExpr(cleanExpr(item.expression || '""'), iterator, iterable);
          results.push({ cleanedTarget: cleaned, expression: expr, isRelative: isFromListComp });
        } else if (item.type === 'if' && item.lcTarget) {
          const cleaned = item.lcTarget.trim();
          const cond = rewriteForExpr(cleanExpr(item.condition || 'False'), iterator, iterable);
          const ifVal = item.ifExpr
            ? rewriteForExpr(cleanExpr(item.ifExpr), iterator, iterable)
            : '""';
          const elseVal = item.elseExpr
            ? rewriteForExpr(cleanExpr(item.elseExpr), iterator, iterable)
            : '""';
          let expr = `(\n                            ${ifVal}\n                            if (${cond})`;
          if (item.elifBranches && item.elifBranches.length > 0) {
            item.elifBranches.forEach(eb => {
              const ebCond = rewriteForExpr(cleanExpr(eb.condition || 'False'), iterator, iterable);
              const ebVal = eb.expr ? rewriteForExpr(cleanExpr(eb.expr), iterator, iterable) : '""';
              expr += `\n                            else ${ebVal}\n                            if (${ebCond})`;
            });
          }
          expr += `\n                            else ${elseVal})`;
          results.push({ cleanedTarget: cleaned, expression: expr, isRelative: true });
        }
      });
      return results;
    };

    // Build inner dict structure for list-comp body.
    // For LC-IF ternary items (isRelative=true), the cleanedTarget is already relative
    // (e.g. "field.nested.value") — use it as-is.
    // For old-style FOR children, strip the rootKey prefix segment.
    const buildInnerDict = (assignments) => {
      const structure = {};
      assignments.forEach(({ cleanedTarget, expression, isRelative }) => {
        const parts = cleanedTarget.split('.');
        let innerParts;
        if (isRelative) {
          // Already relative — use full path
          innerParts = parts;
        } else {
          // Strip leading rootKey prefix(es)
          innerParts = parts.length > 1 && parts[0] === parts[1]
            ? parts.slice(2)
            : parts.length > 1
              ? parts.slice(1)
              : parts;
        }
        let current = structure;
        for (let i = 0; i < innerParts.length - 1; i++) {
          if (!current[innerParts[i]]) current[innerParts[i]] = {};
          current = current[innerParts[i]];
        }
        current[innerParts[innerParts.length - 1]] = expression;
      });
      return structure;
    };

    // ─── Group consecutive assignments by root key ────────────────────────────

    const groupAssignmentsByRoot = (items) => {
      const groups = [];
      let currentGroup = null;

      items.forEach(item => {
        // ── List Comp assignment (the [ ] mode) ──
        if (item.type === 'assignment' && item.listComp && item.target) {
          const cleanedTarget = cleanPath(item.target);
          const rootKey = rootKeyOf(cleanedTarget);
          if (currentGroup) { groups.push(currentGroup); currentGroup = null; }
          const lcMode = item.lcMode || 'dynamic';
          if (lcMode === 'static') {
            // Static list: emit a literal [ {...}, {...} ] with no FOR loop
            groups.push({
              rootKey,
              assignments: [{
                type: 'assignment',
                cleanedTarget: `${rootKey}.__staticList__`,
                expression: '',
                _staticMeta: { elements: item.lcElements || [], rootKey }
              }]
            });
          } else if (lcMode === 'object') {
            // Object mode: emit a single dict (no array wrapper)
            groups.push({
              rootKey,
              assignments: [{
                type: 'assignment',
                cleanedTarget: `${rootKey}.__objectDict__`,
                expression: '',
                _objectMeta: { fields: (item.lcElements && item.lcElements[0] && item.lcElements[0].fields) || [], rootKey }
              }]
            });
          } else {
            // Dynamic list: FOR loop / list comprehension
            groups.push({
              rootKey,
              assignments: [{
                type: 'assignment',
                cleanedTarget: `${rootKey}.__listComp__`,
                expression: '',
                _forMeta: { iterator: item.lcIterator || 'item', iterable: item.lcIterable || '', children: item.lcChildren || [], isFromListComp: true }
              }]
            });
          }
          return;
        }
        if (item.type === 'assignment' && item.target) {
          const cleanedTarget = cleanPath(item.target);
          const rootKey = rootKeyOf(cleanedTarget);

          if (!currentGroup || currentGroup.rootKey !== rootKey) {
            if (currentGroup) groups.push(currentGroup);
            currentGroup = { rootKey, assignments: [] };
          }
          currentGroup.assignments.push({ ...item, cleanedTarget, expression: cleanExpr(item.expression) });

        } else if (item.type === 'for' && item.children && item.children.length > 0) {
          // Peek: does this for-loop feed a single root OUTPUT key via its children?
          const childAssignments = item.children.filter(c => c.type === 'assignment' && c.target);
          if (childAssignments.length > 0) {
            const rootKey = rootKeyOf(cleanPath(childAssignments[0].target));
            const allSameRoot = childAssignments.every(c => rootKeyOf(cleanPath(c.target)) === rootKey);

            if (allSameRoot) {
              // Merge into current group or start new one targeting rootKey
              if (!currentGroup || currentGroup.rootKey !== rootKey) {
                if (currentGroup) groups.push(currentGroup);
                currentGroup = { rootKey, assignments: [] };
              }
              currentGroup.assignments.push({
                type: 'assignment',
                cleanedTarget: `${rootKey}.__listComp__`,
                expression: '',
                _forMeta: { iterator: item.iterator, iterable: item.iterable, children: item.children }
              });
              return;
            }
          }
          // Fall through: emit as standalone for-loop
          if (currentGroup) { groups.push(currentGroup); currentGroup = null; }
          groups.push({ rootKey: null, item });

        } else {
          if (currentGroup) { groups.push(currentGroup); currentGroup = null; }
          groups.push({ rootKey: null, item });
        }
      });

      if (currentGroup) groups.push(currentGroup);
      return groups;
    };

    // ─── Emit lines ───────────────────────────────────────────────────────────

    const emitLines = (items, indent, forCtx = null) => {
      const pre = '    '.repeat(indent);
      const groups = groupAssignmentsByRoot(items);

      groups.forEach(group => {
        if (group.item) {
          emitSingleItem(group.item, indent, forCtx);
        } else if (group.assignments && group.assignments.length > 0) {
          const { rootKey, assignments } = group;

          // Single direct assignment (no nesting)
          if (assignments.length === 1 && !assignments[0].cleanedTarget.includes('.') && !assignments[0]._forMeta && !assignments[0]._staticMeta) {
            const expr = forCtx ? rewriteForExpr(assignments[0].expression, forCtx.iterator, forCtx.iterable) : assignments[0].expression;
            lines.push(`${pre}OUTPUT["${rootKey}"] = ${expr}`);
            return;
          }

          // Static list → OUTPUT["key"] = { "key": [{...}, {...}] }
          if (assignments.length === 1 && assignments[0]._staticMeta) {
            const { elements, rootKey: rk } = assignments[0]._staticMeta;

            // Build one Python dict literal per element
            const renderStaticDict = (fields, depth) => {
              const i0 = '    '.repeat(depth);
              const i1 = '    '.repeat(depth + 1);
              if (!fields || fields.length === 0) return [`${i0}{}`];
              // Group fields into nested structure
              const struct = {};
              fields.forEach(f => {
                if (!f.target) return;
                const parts = f.target.trim().split('.');
                let cur = struct;
                for (let i = 0; i < parts.length - 1; i++) {
                  if (!cur[parts[i]]) cur[parts[i]] = {};
                  cur = cur[parts[i]];
                }
                cur[parts[parts.length - 1]] = cleanExpr(f.expression);
              });
              const dictToLines = (obj, d) => {
                const ii0 = '    '.repeat(d);
                const ii1 = '    '.repeat(d + 1);
                const ents = Object.entries(obj);
                if (ents.length === 0) return [`${ii0}{}`];
                const out = [`${ii0}{`];
                ents.forEach(([k, v], idx) => {
                  const comma = idx < ents.length - 1 ? ',' : '';
                  if (typeof v === 'string') {
                    out.push(`${ii1}"${k}": ${v}${comma}`);
                  } else {
                    const child = dictToLines(v, d + 1);
                    out.push(`${ii1}"${k}": ${child[0].trim()}`);
                    child.slice(1, -1).forEach(l => out.push(l));
                    out.push(`${child[child.length-1]}${comma}`);
                  }
                });
                out.push(`${ii0}}`);
                return out;
              };
              return dictToLines(struct, depth);
            };

            const i1 = '    '.repeat(indent + 1);
            const i2 = '    '.repeat(indent + 2);
            lines.push(`${pre}OUTPUT["${rk}"] = {`);
            lines.push(`${i1}"${rk}": [`);
            (elements || []).forEach((el, elIdx) => {
              const elLines = renderStaticDict(el.fields || [], indent + 2);
              const isLast = elIdx === (elements.length - 1);
              elLines.forEach((l, li) => {
                if (li === elLines.length - 1) {
                  lines.push(`${l}${isLast ? '' : ','}`);
                } else {
                  lines.push(l);
                }
              });
            });
            lines.push(`${i1}]`);
            lines.push(`${pre}}`);
            return;
          }

          // Object dict → OUTPUT["key"] = { "field1": val1, "field2": val2 }
          if (assignments.length === 1 && assignments[0]._objectMeta) {
            const { fields: objFields, rootKey: rk } = assignments[0]._objectMeta;
            // Reuse renderStaticDict to build a nested dict from flat field paths
            const renderObjDict = (fields, depth) => {
              const ii0 = '    '.repeat(depth);
              const ii1 = '    '.repeat(depth + 1);
              if (!fields || fields.length === 0) return [`${ii0}{}`];
              const struct = {};
              fields.forEach(f => {
                if (!f.target) return;
                const parts = f.target.trim().split('.');
                let cur = struct;
                for (let i = 0; i < parts.length - 1; i++) {
                  if (!cur[parts[i]]) cur[parts[i]] = {};
                  cur = cur[parts[i]];
                }
                cur[parts[parts.length - 1]] = cleanExpr(f.expression);
              });
              const dictToLines = (obj, d) => {
                const a0 = '    '.repeat(d);
                const a1 = '    '.repeat(d + 1);
                const ents = Object.entries(obj);
                if (ents.length === 0) return [`${a0}{}`];
                const out = [`${a0}{`];
                ents.forEach(([k, v], idx) => {
                  const comma = idx < ents.length - 1 ? ',' : '';
                  if (typeof v === 'string') {
                    out.push(`${a1}"${k}": ${v}${comma}`);
                  } else {
                    const child = dictToLines(v, d + 1);
                    out.push(`${a1}"${k}": ${child[0].trim()}`);
                    child.slice(1, -1).forEach(l => out.push(l));
                    out.push(`${child[child.length-1]}${comma}`);
                  }
                });
                out.push(`${a0}}`);
                return out;
              };
              return dictToLines(struct, depth);
            };
            const dictLines = renderObjDict(objFields, indent + 1);
            lines.push(`${pre}OUTPUT["${rk}"] = ${dictLines[0].trim()}`);
            dictLines.slice(1).forEach(l => lines.push(l));
            return;
          }
          if (assignments.length === 1 && assignments[0]._forMeta) {
            const { iterator, iterable, isFromListComp } = assignments[0]._forMeta;

            let safeIterable;
            if (isFromListComp) {
              safeIterable = `(${cleanExpr(iterable)} or [])`;
            } else {
              const iterVarName = `${iterator}_list`;
              lines.push(`${pre}${iterVarName} = ${cleanExpr(iterable)}`);
              lines.push('');
              safeIterable = `(${iterVarName} or [])`;
            }

            const innerAssignments = collectForChildren(assignments[0]._forMeta.children, iterator, iterable, isFromListComp);
            const innerStructure = buildInnerDict(innerAssignments);

            // Render the inner item dict with proper indentation.
            // indent+3 = 3 levels inside: OUTPUT[..] > list > item dict body
            const renderInnerDict = (obj, depth) => {
              const i0 = '    '.repeat(depth);
              const i1 = '    '.repeat(depth + 1);
              const entries = Object.entries(obj).filter(([k]) => k !== '_directValue');
              if (entries.length === 0) return [`{}`];
              const out = ['{'];
              entries.forEach(([key, val], idx) => {
                const comma = idx < entries.length - 1 ? ',' : '';
                if (typeof val === 'string') {
                  // Multi-line value (ternary): indent each line by i1+4, closing paren at i1
                  const valLines = val.split('\n');
                  if (valLines.length === 1) {
                    out.push(`${i1}"${key}": ${val}${comma}`);
                  } else {
                    // valLines: ["(", "    ifVal", "    if ...", "    else ...", ")"]
                    out.push(`${i1}"${key}": ${valLines[0]}`);
                    valLines.slice(1, -1).forEach(vl => out.push(`${i1}    ${vl.trim()}`));
                    // closing paren at i1 level (same as the key), then comma
                    out.push(`${i1}${valLines[valLines.length-1].trim()}${comma}`);
                  }
                } else {
                  const childLines = renderInnerDict(val, depth + 1);
                  if (childLines.length === 1) {
                    out.push(`${i1}"${key}": ${childLines[0]}${comma}`);
                  } else {
                    out.push(`${i1}"${key}": ${childLines[0]}`);
                    childLines.slice(1, -1).forEach(l => out.push(l));
                    out.push(`${childLines[childLines.length-1]}${comma}`);
                  }
                }
              });
              out.push(`${i0}}`);
              return out;
            };

            // depth=indent+2: item dict { is at the list item level
            const itemLines = renderInnerDict(innerStructure, indent + 2);
            const i2 = '    '.repeat(indent + 2);
            const i1 = '    '.repeat(indent + 1);

            lines.push(`${pre}OUTPUT["${rootKey}"] = {`);
            lines.push(`${i1}"${rootKey}": [`);
            itemLines.forEach(l => lines.push(l));
            lines.push(`${i2}for ${iterator} in ${safeIterable}`);
            lines.push(`${i1}]`);
            lines.push(`${pre}}`);
            return;
          }

          // Nested assignments → declarative dict
          const structure = buildNestedStructure(assignments);
          const dictLines = generateDict(structure, indent);

          if (dictLines.length === 1) {
            lines.push(`${pre}OUTPUT["${rootKey}"] = ${dictLines[0]}`);
          } else {
            lines.push(`${pre}OUTPUT["${rootKey}"] = ${dictLines[0]}`);
            dictLines.slice(1).forEach(l => lines.push(l));
          }
        }
      });
    };

    const emitSingleItem = (m, indent, forCtx = null) => {
      const pre = '    '.repeat(indent);

      if (m.type === 'module_call' && m.moduleName) {
        lines.push(`${pre}map${toCamelFuncName(m.moduleName)}(INPUT, OUTPUT)`);
        return;
      }

      if (m.type === 'variable' && m.varName) {
        let expr = cleanExpr(m.expression || '""');
        if (forCtx) expr = rewriteForExpr(expr, forCtx.iterator, forCtx.iterable);
        lines.push(`${pre}${m.varName} = ${expr}`);
        return;
      }

      if (m.type === 'assignment' && m.target) {
        const cleaned = cleanPath(m.target);
        let expr = cleanExpr(m.expression);
        if (forCtx) expr = rewriteForExpr(expr, forCtx.iterator, forCtx.iterable);
        lines.push(`${pre}OUTPUT["${cleaned}"] = ${expr}`);
        return;
      }

      if (m.type === 'if') {
        const rawCond = forCtx ? rewriteForExpr(cleanExpr(m.condition || 'False'), forCtx.iterator, forCtx.iterable) : cleanExpr(m.condition || 'False');
        const cond = rawCond;
        lines.push(`${pre}if ${cond}:`);
        if ((m.children || []).length > 0) {
          emitLines(m.children, indent + 1, forCtx);
        } else {
          lines.push(`${pre}    pass`);
        }
        (m.elifBlocks || []).forEach(eb => {
          const elifCond = forCtx
            ? rewriteForExpr(cleanExpr(eb.condition || 'False'), forCtx.iterator, forCtx.iterable)
            : cleanExpr(eb.condition || 'False');
          lines.push(`${pre}elif ${elifCond}:`);
          if ((eb.children || []).length > 0) {
            emitLines(eb.children, indent + 1, forCtx);
          } else {
            lines.push(`${pre}    pass`);
          }
        });
        if (m.elseBlock) {
          lines.push(`${pre}else:`);
          if ((m.elseBlock.children || []).length > 0) {
            emitLines(m.elseBlock.children, indent + 1, forCtx);
          } else {
            lines.push(`${pre}    pass`);
          }
        }
        return;
      }

      if (m.type === 'for') {
        const iterExpr = cleanExpr((m.iterable || '').replace(/\[\*\]/g, ''));
        const iterator = m.iterator || 'item';
        const newForCtx = { iterator, iterable: iterExpr };
        lines.push(`${pre}for ${iterator} in (${iterExpr} or []):`);
        if ((m.children || []).length > 0) {
          emitLines(m.children, indent + 1, newForCtx);
        } else {
          lines.push(`${pre}    pass`);
        }
      }
    };

    // ─── Top-level emission ───────────────────────────────────────────────────

    lines.push('# GRIZZLY_TEMPLATE_V1');
    lines.push('');

    // Emit custom registered function bodies before the generated mapXxx functions
    const customFns = registeredFunctions.filter(f => !f.builtin && f.body && f.body.trim());
    if (customFns.length > 0) {
      lines.push('# ── Helper functions (registered via Grizzly) ──────────────────────────────');
      lines.push('');
      customFns.forEach(fn => {
        fn.body.trim().split('\n').forEach(l => lines.push(l));
        lines.push('');
        lines.push('');
      });
    }

    modules.filter(m => m.name !== 'main' && m.mappings.length > 0).forEach(mod => {
      const funcName = `map${toCamelFuncName(mod.name)}`;
      const docTitle = `Map ${toDocTitle(mod.name)}`;
      lines.push(`def ${funcName}(INPUT, OUTPUT):`);
      lines.push(`    """${docTitle}"""`);
      emitLines(mod.mappings, 1);
      lines.push('');
      lines.push('');
    });

    const main = modules.find(m => m.name === 'main');
    if (main) {
      lines.push('def transform(INPUT):');
      lines.push('    """Transform"""');
      lines.push('    OUTPUT = {}');
      emitLines(main.mappings, 1);
      lines.push('    return OUTPUT');
    }

    return lines.join('\n');
  };

  const handleFile = (type, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      if (type === 'template') {
        setTemplateFileName(file?.name || '');
        try {
          const mods = parseTemplate(content);
          if (mods && mods.length) {
            setModules(mods);
            setActiveModule(0);
          }
        } catch (err) {
          console.error(err);
        }
        return;
      }
      try {
        const parsed = JSON.parse(content);
        if (type === 'input') {
          setInputSchema(parsed.type && parsed.properties ? parsed : jsonToSchema(parsed));
          setInputFileName(file?.name || '');
        } else if (type === 'output') {
          setOutputSchema(parsed.type && parsed.properties ? parsed : jsonToSchema(parsed));
          setOutputFileName(file?.name || '');
        }
      } catch (err) {
        console.error(err);
      }
    };
    reader.readAsText(file);
  };

  const step2OrderedMappings = [...mappings.filter(m => m.type === 'module_call'), ...mappings.filter(m => m.type !== 'module_call')];

  // Changes dashboard: compare current modules to baseline (set when entering step 2)
  const mappingChanges = (() => {
    if (!baselineModules || step !== 3) return { added: [], deleted: [], changed: [] };
    const baseFlat = flattenMappings(baselineModules);
    const currFlat = flattenMappings(modules);
    const byId = (list) => {
      const m = new Map();
      list.forEach(({ moduleName, item }) => m.set(item.id, { moduleName, item }));
      return m;
    };
    const baseMap = byId(baseFlat);
    const currMap = byId(currFlat);
    const added = [];
    const deleted = [];
    const changed = [];
    currMap.forEach((curr, id) => {
      if (!baseMap.has(id)) added.push(curr);
      else if (getItemSignature(baseMap.get(id).item) !== getItemSignature(curr.item)) changed.push({ before: baseMap.get(id), after: curr });
    });
    baseMap.forEach((base, id) => {
      if (!currMap.has(id)) deleted.push(base);
    });
    return { added, deleted, changed };
  })();

  const goToStep2 = () => {
    setBaselineModules(JSON.parse(JSON.stringify(modules)));
    expandBothTrees();
    setStep(2);
  };

  // ── Preview & Golden Dataset state ──────────────────────────────────────────
  // Relative path — Vite dev server proxies /api/grizzly → http://localhost:8080
  // so there are zero CORS issues. In prod, point this at your deployed backend.
  const GRIZZLY_API = '/api/grizzly';

  // Preview
  const [previewInput, setPreviewInput]       = useState('');
  const [previewOutput, setPreviewOutput]     = useState(null);   // null=not run, string=result
  const [previewError, setPreviewError]       = useState(null);
  const [previewRunning, setPreviewRunning]   = useState(false);
  const [previewRanOk, setPreviewRanOk]       = useState(false);  // gate for Save

  // Golden dataset
  const [gdTab, setGdTab]                     = useState('list'); // 'list' | 'add' | 'run'
  const [gdCases, setGdCases]                 = useState([]);
  const [gdLoading, setGdLoading]             = useState(false);
  const [gdFilterSvc, setGdFilterSvc]         = useState('');
  const [gdFilterStatus, setGdFilterStatus]   = useState('');
  const [gdFilterName, setGdFilterName]       = useState('');
  const [gdRunFamily, setGdRunFamily]         = useState('');
  const [gdRunResults, setGdRunResults]       = useState(null);
  const [gdRunning, setGdRunning]             = useState(false);
  const [gdSaving, setGdSaving]               = useState(false);
  const [gdSaveStatus, setGdSaveStatus]       = useState(null); // null | 'saving' | 'saved' | 'blocked'
  const [gdSaveFailures, setGdSaveFailures]   = useState([]);
  // Add form
  const [newCaseSvc, setNewCaseSvc]           = useState('');
  const [newCaseFamily, setNewCaseFamily]     = useState('');
  const [newCaseName, setNewCaseName]         = useState('');
  const [newCaseInput, setNewCaseInput]       = useState('');
  const [newCaseExpected, setNewCaseExpected] = useState('');
  const [newCaseMsg, setNewCaseMsg]           = useState(null); // {ok, text}
  const [gdViewCase, setGdViewCase]           = useState(null);  // case to view (modal)
  const [gdEditCase, setGdEditCase]          = useState(null);  // case to edit (pre-fills add form)

  // Derive mapping family name from modules (fallback to 'default')
  const mappingFamily = modules[0]?.name || 'main';

  // ── Preview: call POST /api/grizzly/preview ──────────────────────────────
  const runPreview = async () => {
    setPreviewRunning(true);
    setPreviewOutput(null);
    setPreviewError(null);
    setPreviewRanOk(false);
    let inputJson;
    try { inputJson = JSON.parse(previewInput); }
    catch (e) { setPreviewError('Invalid JSON: ' + e.message); setPreviewRunning(false); return; }
    try {
      const res = await fetch(`${GRIZZLY_API}/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateCode: generateCode(), sampleInput: inputJson }),
      });
      const data = await res.json();
      // Backend returns { output: {...}, error: "..." }
      // error field is used (not message)
      if (!res.ok || data.error) {
        setPreviewError(data.error || data.message || 'Preview failed');
      } else {
        // output may be nested under data.output or returned flat
        const outputObj = data.output !== undefined ? data.output : data;
        setPreviewOutput(JSON.stringify(outputObj, null, 2));
        setPreviewRanOk(true);
      }
    } catch (e) {
      setPreviewError('Cannot reach Grizzly Engine: ' + e.message);
    }
    setPreviewRunning(false);
  };

  // ── Save: call POST /api/grizzly/validate-and-save ───────────────────────
  const validateAndSave = async () => {
    setGdSaving(true);
    setGdSaveStatus('saving');
    setGdSaveFailures([]);
    try {
      const res = await fetch(`${GRIZZLY_API}/validate-and-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingFamily, generatedCode: generateCode() }),
      });
      const data = await res.json();
      if (res.ok && data.saved) {
        setGdSaveStatus('saved');
      } else {
        setGdSaveStatus('blocked');
        setGdSaveFailures(data.failures || []);
      }
    } catch (e) {
      setGdSaveStatus('blocked');
      setGdSaveFailures([{ testName: 'network', error: e.message }]);
    }
    setGdSaving(false);
  };

  // ── Golden dataset: load list ────────────────────────────────────────────
  // Accept explicit filter args so callers can pass fresh values without
  // depending on state that may not have settled yet.
  const loadGdCases = async (svc = gdFilterSvc, status = gdFilterStatus) => {
    setGdLoading(true);
    try {
      const params = new URLSearchParams();
      if (svc)    params.set('service', svc);
      if (status) params.set('status', status);
      const url = `${GRIZZLY_API}/test-cases${params.toString() ? '?' + params : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGdCases(Array.isArray(data) ? data : []);
    } catch (e) {
      setGdCases([]);
    }
    setGdLoading(false);
  };

  const deleteGdCase = async (id) => {
    if (!window.confirm('Soft delete this test case?')) return;
    try {
      const res = await fetch(`${GRIZZLY_API}/test-cases/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setGdCases(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  const addGdCase = async () => {
    setNewCaseMsg(null);
    if (!newCaseName.trim() || !newCaseInput.trim() || !newCaseExpected.trim()) {
      setNewCaseMsg({ ok: false, text: 'Fill in service, mapping family, test name, input and expected.' }); return;
    }
    let parsedInput, parsedExpected;
    try { parsedInput = JSON.parse(newCaseInput); }
    catch (e) { setNewCaseMsg({ ok: false, text: 'Input JSON invalid: ' + e.message }); return; }
    try { parsedExpected = JSON.parse(newCaseExpected); }
    catch (e) { setNewCaseMsg({ ok: false, text: 'Expected JSON invalid: ' + e.message }); return; }
    const isEdit = !!gdEditCase;
    try {
      const body = {
        service: newCaseSvc.trim() || 'default',
        mappingFamily: newCaseFamily.trim() || mappingFamily,
        testName: newCaseName.trim(),
        input: parsedInput,
        expected: parsedExpected,
      };
      const res = isEdit
        ? await fetch(`${GRIZZLY_API}/test-cases/${gdEditCase.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(`${GRIZZLY_API}/test-cases`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNewCaseMsg({ ok: true, text: isEdit ? 'Test case updated!' : 'Test case saved!' });
      setNewCaseName(''); setNewCaseInput(''); setNewCaseExpected(''); setGdEditCase(null);
      setTimeout(() => { setNewCaseMsg(null); setGdTab('list'); loadGdCases(); }, 900);
    } catch (e) { setNewCaseMsg({ ok: false, text: e.message }); }
  };

  const runGdRegression = async () => {
    setGdRunning(true);
    setGdRunResults(null);
    try {
      const res = await fetch(`${GRIZZLY_API}/test-cases/run-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingFamily: gdRunFamily.trim() || mappingFamily, generatedCode: generateCode() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGdRunResults(data);
    } catch (e) {
      setGdRunResults({ error: e.message });
    }
    setGdRunning(false);
  };

  // Publish: run all golden dataset tests, then save only if all pass
  const handlePublish = async () => {
    setGdSaving(true);
    setGdSaveStatus(null);
    setGdSaveFailures([]);
    setGdRunResults(null);
    try {
      const res = await fetch(`${GRIZZLY_API}/test-cases/run-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mappingFamily, generatedCode: generateCode() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setGdRunResults(data);
      if (data.error || (data.failed !== undefined && data.failed > 0)) {
        setGdSaveStatus('blocked');
        setGdSaveFailures((data.results || []).filter(r => r.status === 'FAIL').map(r => ({
          testName: r.testName,
          expected: r.diff ? Object.fromEntries(Object.entries(r.diff).map(([k, v]) => [k, v.expected])) : null,
          actual: r.diff ? Object.fromEntries(Object.entries(r.diff).map(([k, v]) => [k, v.actual])) : r.error || null,
        })));
        setGdSaving(false);
        return;
      }
      await validateAndSave();
    } catch (e) {
      setGdSaveStatus('blocked');
      setGdSaveFailures([{ testName: 'error', error: e.message }]);
    }
    setGdSaving(false);
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <FileCode className="w-6 h-6 text-slate-600" />
          <span className="font-bold text-slate-800">Grizzly</span>
        </div>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4].map(n => (
            <span key={n} className={`flex items-center justify-center text-xs font-bold rounded-full w-8 h-8
              ${step === n ? 'bg-slate-700 text-white' : step > n ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
              {n === 4 ? <Eye className="w-4 h-4" /> : String(n)}
            </span>
          ))}
        </div>
      </header>

      {step === 1 && (
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-xl font-bold text-slate-800 mb-4">Step 1: Load schemas</h1>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <label className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50">
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <span className="block font-medium text-slate-700">Input schema</span>
              <span className="block mt-1 text-sm text-slate-500 min-h-[2rem]">
                {inputFileName ? (
                  <><span className="font-medium text-slate-700 truncate block" title={inputFileName}>{inputFileName}</span><span className="text-slate-500">{inputPaths.length} field{inputPaths.length !== 1 ? 's' : ''}</span></>
                ) : 'No file chosen'}
              </span>
              <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && handleFile('input', e.target.files[0])} />
            </label>
            <label className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50">
              <Upload className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <span className="block font-medium text-slate-700">Output schema</span>
              <span className="block mt-1 text-sm text-slate-500 min-h-[2rem]">
                {outputFileName ? (
                  <><span className="font-medium text-slate-700 truncate block" title={outputFileName}>{outputFileName}</span><span className="text-slate-500">{outputPaths.length} field{outputPaths.length !== 1 ? 's' : ''}</span></>
                ) : 'No file chosen'}
              </span>
              <input type="file" accept=".json" className="hidden" onChange={e => e.target.files?.[0] && handleFile('output', e.target.files[0])} />
            </label>
            <label className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer hover:border-slate-400 hover:bg-slate-50">
              <FileCode className="w-8 h-8 mx-auto mb-2 text-slate-400" />
              <span className="block font-medium text-slate-700">Template (optional)</span>
              <span className="block mt-1 text-sm text-slate-500 min-h-[2rem]">
                {templateFileName ? (
                  <><span className="font-medium text-slate-700 truncate block" title={templateFileName}>{templateFileName}</span><span className="text-slate-500">{modules.length} module{modules.length !== 1 ? 's' : ''}</span></>
                ) : 'No file chosen'}
              </span>
              <input type="file" accept=".py" className="hidden" onChange={e => e.target.files?.[0] && handleFile('template', e.target.files[0])} />
            </label>
          </div>
          <div className="flex justify-end">
            <button onClick={goToStep2} className="px-6 py-2 bg-slate-700 text-white rounded-lg font-medium flex items-center gap-2">
              Next <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
    <div className="flex h-[calc(100vh-4rem)] bg-gray-100">
      {/* Left - Output schema */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Output</h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search fields..."
              value={outputSearchTerm}
              onChange={(e) => setOutputSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-400 text-sm"
            />
            {outputSearchTerm && (
              <button onClick={() => setOutputSearchTerm('')} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            💡 Drag or double-click fields
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {renderSchemaNode('root', outputSchema, '', false, outputSearchTerm)}
        </div>
      </div>

      {/* Center - Mapping canvas (module strip + same real estate) */}
      <div className="flex-1 overflow-y-auto p-6 min-w-0">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-xl shadow-lg p-6">
            {/* Module strip: ƒ [fn…] [+ ƒ]  ·  [mod…] [main] [+ Module] */}
            <div className="flex items-center gap-1.5 mb-4 pb-3 border-b border-slate-200 flex-wrap">

              {/* ── Functions ── */}
              <button
                type="button"
                onClick={() => { setShowFnSheet(true); setRegFnForm(null); }}
                className={`px-2.5 py-1 rounded text-xs font-medium border transition-colors ${showFnSheet ? 'bg-orange-100 border-orange-400 text-orange-800' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700'}`}
                title="Browse & register functions">
                ƒ Fn
              </button>

              {/* divider */}
              <span className="w-px h-5 bg-slate-200 mx-1 shrink-0" />

              {/* ── Map modules ── */}
              {modules.map((mod, idx) => (
                <div key={mod.id} className="flex items-center gap-1">
                  {renamingModuleIdx === idx ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => { if (renameValue.trim()) updateModuleName(idx, renameValue.trim()); setRenamingModuleIdx(null); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { if (renameValue.trim()) updateModuleName(idx, renameValue.trim()); setRenamingModuleIdx(null); }
                        if (e.key === 'Escape') setRenamingModuleIdx(null);
                      }}
                      className="px-2 py-0.5 rounded text-xs font-medium border border-slate-400 bg-white w-28 focus:outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => { setActiveModule(idx); setShowFnSheet(false); setRegFnForm(null); }}
                      onDoubleClick={() => { if (mod.name !== 'main') { setRenamingModuleIdx(idx); setRenameValue(mod.name); } }}
                      title={mod.name !== 'main' ? 'Double-click to rename' : undefined}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${activeModule === idx && !showFnSheet ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {mod.name === 'main' ? 'main' : mod.name}
                    </button>
                  )}
                  {modules.length > 1 && mod.name !== 'main' && renamingModuleIdx !== idx && (
                    <button type="button" onClick={() => deleteModule(idx)} className="p-0.5 text-slate-400 hover:text-red-600"><X className="w-3 h-3" /></button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addModule} className="px-2.5 py-1 rounded text-xs font-medium text-slate-600 border border-dashed border-slate-300 hover:bg-slate-50">
                + Module
              </button>
            </div>

            <div className="flex justify-between items-center mb-4">
              {showFnSheet
                ? <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2"><span className="font-mono text-orange-500">ƒ</span> Functions</h1>
                : <h1 className="text-xl font-bold text-gray-900">Mapping Builder</h1>
              }
              <div className="flex items-center gap-2">
                {showFnSheet && (
                  <button onClick={() => { setShowFnSheet(false); setRegFnForm(null); }}
                    className="px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-50">
                    <X className="w-4 h-4" /> Close
                  </button>
                )}
                <button onClick={() => setStep(3)} className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2 text-sm">
                  Generate Template <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* ── FUNCTION VIEW ── */}
            {showFnSheet && (
              <div className="space-y-6">

                {/* Built-in */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Built-in</p>
                  <div className="grid grid-cols-2 gap-2">
                    {allFunctions.filter(f => f.builtin).map(fn => (
                      <div key={fn.id} className="flex flex-col gap-0.5 px-3 py-2.5 rounded-lg bg-slate-50 border border-slate-200">
                        <span className="font-mono text-xs font-semibold text-orange-600">{fn.name}({fn.argsPlaceholder || ''})</span>
                        <span className="text-xs text-slate-500">{fn.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Registered */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Registered</p>
                  {allFunctions.filter(f => !f.builtin).length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No custom functions yet — register one below.</p>
                  ) : (
                    <div className="space-y-2">
                      {allFunctions.filter(f => !f.builtin).map(fn => {
                        const isOpen = regFnExpanded.has(fn.id);
                        return (
                          <div key={fn.id} className="border border-violet-200 rounded-lg overflow-hidden">
                            <div className="flex items-center gap-3 px-3 py-2.5 bg-violet-50 cursor-pointer select-none" onClick={() => toggleRegFnExpand(fn.id)}>
                              <div className="flex-1 min-w-0">
                                <span className="font-mono text-xs font-semibold text-violet-700">{fn.name}({fn.argsPlaceholder || ''})</span>
                                <span className="ml-2 text-xs text-slate-500">{fn.desc}</span>
                              </div>
                              <button onClick={e => { e.stopPropagation(); deleteRegFn(fn.id); }} className="p-1 text-red-300 hover:text-red-500 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                            </div>
                            {isOpen && fn.body && (
                              <div className="border-t border-violet-100 overflow-hidden">
                                <PrismCode code={fn.body} language="python" />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Register new */}
                <div className="border-t border-slate-100 pt-5">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Register new function</p>
                  {regFnForm === null ? (
                    <button onClick={() => setRegFnForm({ desc: '', body: '', aiLoading: false, aiError: '' })}
                      className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-orange-300 rounded-xl text-sm text-orange-600 hover:bg-orange-50 font-medium transition-colors">
                      <Plus className="w-4 h-4" /> Register a function
                    </button>
                  ) : (
                    <div className="space-y-3">
                      {/* ── Step 1: Description ── */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">What does it do? <span className="text-slate-400 font-normal">(describe your function)</span></label>
                        <div className="flex gap-2">
                          <input
                            autoFocus
                            type="text"
                            value={regFnForm.desc}
                            onChange={e => setRegFnForm(f => ({...f, desc: e.target.value}))}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && regFnForm.desc.trim() && !regFnForm.aiLoading) {
                                setRegFnForm(f => ({...f, aiLoading: true, aiError: ''}));
                                callAiApi(regFnForm.desc.trim())
                                  .then(code => setRegFnForm(f => ({...f, body: code, aiLoading: false})))
                                  .catch(() => setRegFnForm(f => ({...f, aiLoading: false, aiError: 'AI generation failed. Write it manually below.'})));
                              }
                            }}
                            placeholder="e.g. Builds address text from format type"
                            className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-orange-400"
                          />
                          <button
                            onClick={() => {
                              if (!regFnForm.desc.trim() || regFnForm.aiLoading) return;
                              setRegFnForm(f => ({...f, aiLoading: true, aiError: ''}));
                              callAiApi(regFnForm.desc.trim())
                                .then(code => setRegFnForm(f => ({...f, body: code, aiLoading: false})))
                                .catch(() => setRegFnForm(f => ({...f, aiLoading: false, aiError: 'AI generation failed. Write it manually below.'})));
                            }}
                            disabled={!regFnForm.desc.trim() || regFnForm.aiLoading}
                            className="px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0 transition-colors"
                            title="Generate function with AI (or press Enter)">
                            {regFnForm.aiLoading
                              ? <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="32" strokeDashoffset="8"/></svg>
                              : <span>✦</span>
                            }
                            {regFnForm.aiLoading ? 'Writing…' : 'AI Write'}
                          </button>
                        </div>
                        {regFnForm.aiError && <p className="text-xs text-red-500 mt-1">{regFnForm.aiError}</p>}
                      </div>

                      {/* ── Step 2: Function body ── */}
                      <div>
                        <label className="block text-xs font-medium text-slate-600 mb-1">Function body <span className="text-red-400">*</span></label>
                        <div className="rounded-lg border border-slate-300 overflow-hidden focus-within:border-orange-400">
                          <EditableCodeBlock
                            value={regFnForm.body}
                            onChange={code => setRegFnForm(f => ({...f, body: code}))}
                            placeholder={`def my_helper(value):\n    # your logic here\n    return value`}
                            rows={8}
                          />
                        </div>
                        {(() => {
                          const { name, params } = parseDefLine(regFnForm.body);
                          if (!regFnForm.body.trim()) return null;
                          if (!name) return <p className="text-xs text-amber-600 mt-1">⚠ No <code className="bg-amber-50 px-0.5 rounded">def name(...):</code> found</p>;
                          return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                              <span>Detected:</span>
                              <span className="font-mono">{name}()</span>
                              {params.length > 0 && params.map(p => <span key={p.id} className="font-mono text-slate-400">{p.name}</span>)}
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex gap-2">
                        <button onClick={() => setRegFnForm(null)} className="flex-1 py-2 border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50">Cancel</button>
                        <button onClick={saveRegFn} disabled={!parseDefLine(regFnForm.body).name}
                          className="flex-1 py-2 bg-slate-700 text-white rounded-lg text-sm font-medium hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed">
                          Register function
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── MAPPING BUILDER ── */}
            {!showFnSheet && (
              <>
            <p className="mb-4 text-xs text-slate-500">Drag or double-click from trees; or type with autocomplete.</p>

            <div className="space-y-3">
              {step2OrderedMappings.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Database className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                  <p>No mappings yet. Add assignments, if/for, or import a module.</p>
                </div>
              ) : (
                step2OrderedMappings.map((item, index) => renderItem(item, 0, null, index))
              )}
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              <button
                type="button"
                onClick={() => updateModuleMappings(activeModule,[...mappings, { id: uid(), type: 'module_call', moduleName: '' }])}
                className="px-4 py-2 bg-slate-100 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-200 flex items-center gap-2 text-sm"
              >
                <Layers className="w-4 h-4" /> Import Module
              </button>

              {/* ── Add Variable ── */}
              <button
                onClick={() => addItem(null, 'variable')}
                className="px-4 py-2 bg-slate-50 border-2 border-dashed border-slate-300 text-slate-600 rounded-lg hover:bg-slate-100 flex items-center gap-2 text-sm"
              >
                <Code className="w-4 h-4" /> Add Variable
              </button>

              {/* ── Map Field (plain assignment) ── */}
              <button
                onClick={() => addItem(null, 'assignment')}
                className="px-4 py-2 bg-yellow-50 border-2 border-dashed border-yellow-300 text-yellow-700 rounded-lg hover:bg-yellow-100 flex items-center gap-2 text-sm"
              >
                <ArrowRight className="w-4 h-4" /> Map Field
              </button>

              {/* ── Map Object (listComp + object mode) ── */}
              <button
                onClick={() => {
                  const newItem = {
                    id: generateId(), type: 'assignment',
                    target: '', expression: '', exprType: 'input',
                    staticValue: '', funcName: '', funcArgs: '',
                    listComp: true, lcMode: 'object',
                    lcIterator: 'item', lcIterable: '',
                    lcChildren: [], lcElements: [{ id: uid(), fields: [] }],
                  };
                  updateModuleMappings(activeModule, [...mappings, newItem]);
                }}
                className="px-4 py-2 bg-violet-50 border-2 border-dashed border-violet-300 text-violet-700 rounded-lg hover:bg-violet-100 flex items-center gap-2 text-sm"
              >
                <span className="font-mono font-bold text-base leading-none">{'{}'}</span> Map Object
              </button>

              {/* ── Map Array (listComp + dynamic mode, auto-expand) ── */}
              <button
                onClick={() => {
                  const newId = generateId();
                  const newItem = {
                    id: newId, type: 'assignment',
                    target: '', expression: '', exprType: 'input',
                    staticValue: '', funcName: '', funcArgs: '',
                    listComp: true, lcMode: 'dynamic',
                    lcIterator: 'item', lcIterable: '',
                    lcChildren: [], lcElements: [{ id: uid(), fields: [] }],
                  };
                  updateModuleMappings(activeModule, [...mappings, newItem]);
                  setExpandedBlocks(prev => new Set([...prev, newId + '_lc']));
                }}
                className="px-4 py-2 bg-blue-50 border-2 border-dashed border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100 flex items-center gap-2 text-sm"
              >
                <span className="font-mono font-bold text-sm leading-none">[…]</span> Map Array
              </button>

            </div>
            </>)}
          </div>
        </div>
      </div>

      {/* Right - Input schema */}
      <div className="w-80 bg-white border-l border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Input</h2>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={inputSearchTerm}
              onChange={(e) => setInputSearchTerm(e.target.value)}
              className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-400 text-sm"
            />
            {inputSearchTerm && (
              <button onClick={() => setInputSearchTerm('')} className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {renderSchemaNode('root', inputSchema, '', true, inputSearchTerm)}
        </div>
      </div>

      {/* Autocomplete Dropdown */}
      {autocompleteState.show && (
        <div
          ref={autocompleteRef}
          className="fixed bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto z-50"
          style={{
            top: `${autocompleteState.position.top}px`,
            left: `${autocompleteState.position.left}px`,
            minWidth: '300px'
          }}
        >
          {autocompleteState.suggestions.map((suggestion, idx) => (
            <div
              key={idx}
              onClick={() => handleAutocompleteSelect(suggestion.path)}
              className="px-4 py-2 hover:bg-slate-50 cursor-pointer flex items-center justify-between"
            >
              <span className="text-sm font-mono">{suggestion.path}</span>
              <span className="text-xs text-gray-500">{suggestion.type}</span>
            </div>
          ))}
        </div>
      )}
    </div>
      )}



      {step === 4 && (
        <div className="max-w-5xl mx-auto p-6">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
              <Eye className="w-5 h-5 text-slate-500" /> Publish Template
            </h1>
            <div className="flex gap-2">
              <button onClick={() => { setStep(3); loadGdCases(); }} className="px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-2 text-sm text-slate-600 hover:bg-slate-50">
                <ArrowLeft className="w-4 h-4" /> Back to code
              </button>
              <button
                onClick={handlePublish}
                disabled={gdSaving}
                title="Runs all golden dataset tests, then publishes only if all pass"
                className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-800"
              >
                <Upload className="w-4 h-4" />
                {gdSaving ? 'Running tests...' : 'Publish'}
              </button>
            </div>
          </div>

          {/* ── TOP: Preview panel ─────────────────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl mb-6 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-slate-700 text-sm">Preview transform</span>
                <span className="text-xs text-slate-400 ml-1">— calls <code className="bg-slate-100 px-1 rounded text-xs">POST /api/grizzly/preview</code></span>
              </div>
              <div className="flex items-center gap-2">
                {previewRanOk && !previewError && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Preview OK
                  </span>
                )}
                {previewError && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">Error</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-200 min-h-[24rem]">
              {/* Input pane */}
              <div className="p-4 flex flex-col min-h-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 shrink-0">Sample input (JSON)</p>
                <textarea
                  value={previewInput}
                  onChange={e => { setPreviewInput(e.target.value); setPreviewRanOk(false); }}
                  placeholder="Paste JSON or type sample input here..."
                  spellCheck={false}
                  className="flex-1 min-h-0 w-full p-3 text-xs font-mono border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-slate-400 resize-none placeholder:text-slate-500"
                />
              </div>
              {/* Output pane */}
              <div className="p-4 flex flex-col min-h-0">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 shrink-0">Transformed output</p>
                <div className={`flex-1 min-h-0 rounded-lg overflow-auto border flex flex-col
                  ${previewError ? 'border-red-200 bg-red-50'
                    : previewOutput ? 'border-emerald-200 bg-emerald-50'
                    : 'border-slate-200 bg-slate-50'}`}>
                  {previewRunning ? (
                    <div className="p-3 text-slate-400 italic">Running...</div>
                  ) : previewError ? (
                    <div className="p-3 font-mono text-xs text-red-700">{previewError}</div>
                  ) : previewOutput ? (
                    <pre className="flex-1 min-h-0 p-3 text-xs font-mono overflow-auto whitespace-pre-wrap">{previewOutput}</pre>
                  ) : (
                    <div className="p-3 text-slate-500 font-mono text-xs select-none opacity-90">Run preview to see output here...</div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center gap-3">
                <button
                  onClick={runPreview}
                  disabled={previewRunning}
                  className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2 text-sm disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {previewRunning ? 'Running...' : 'Run preview'}
                </button>
                <span className="text-xs text-slate-400">Preview never saves — safe to experiment.</span>
              </div>
              {(gdSaveStatus === 'saved' || gdSaveStatus === 'blocked') && (
                <div className="flex items-center gap-3">
                  {gdSaveStatus === 'saved' && (
                    <span className="text-xs text-emerald-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>
                  )}
                  {gdSaveStatus === 'blocked' && (
                    <span className="text-xs text-red-600">Regression failed — not saved</span>
                  )}
                </div>
              )}
            </div>

            {/* Regression failures inline under save */}
            {gdSaveStatus === 'blocked' && gdSaveFailures.length > 0 && (
              <div className="border-t border-red-200 bg-red-50 px-4 py-3">
                <p className="text-xs font-semibold text-red-700 mb-2">Regression failures — fix mapping before saving:</p>
                <div className="space-y-1">
                  {gdSaveFailures.map((f, i) => (
                    <div key={i} className="text-xs font-mono bg-white border border-red-100 rounded px-3 py-2">
                      <span className="text-red-600 font-semibold">{f.testName}</span>
                      {f.expected && <span className="ml-2 text-slate-500">expected: <span className="text-slate-700">{JSON.stringify(f.expected)}</span></span>}
                      {f.actual   && <span className="ml-2 text-slate-500">got: <span className="text-red-600">{JSON.stringify(f.actual)}</span></span>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── BOTTOM: Golden Dataset panel ──────────────────────────────── */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-slate-700 text-sm">Golden dataset</span>
                <span className="text-xs text-slate-400 ml-1">— regression test cases (in-memory store)</span>
              </div>
              {/* Sub-tabs */}
              <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
                {[
                  { key: 'list', label: 'Test cases' },
                  { key: 'add',  label: '+ Add case' },
                  { key: 'run',  label: 'Run regression' },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => { setGdTab(t.key); if (t.key === 'list') loadGdCases(); }}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors
                      ${gdTab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── LIST tab ── */}
            {gdTab === 'list' && (
              <div className="p-4">
                {/* Filters */}
                <div className="flex gap-2 mb-3 flex-wrap">
                  <input
                    value={gdFilterName}
                    onChange={e => setGdFilterName(e.target.value)}
                    placeholder="Search test name..."
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 w-44"
                  />
                  <select
                    value={gdFilterSvc}
                    onChange={e => { setGdFilterSvc(e.target.value); loadGdCases(e.target.value, gdFilterStatus); }}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white">
                    <option value="">All services</option>
                    <option value="order-service">order-service</option>
                    <option value="mismo-service">mismo-service</option>
                    <option value="payment-service">payment-service</option>
                    <option value="default">default</option>
                  </select>
                  <select
                    value={gdFilterStatus}
                    onChange={e => { setGdFilterStatus(e.target.value); loadGdCases(gdFilterSvc, e.target.value); }}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none bg-white">
                    <option value="">All status</option>
                    <option value="PASS">Pass</option>
                    <option value="FAIL">Fail</option>
                    <option value="PENDING">Pending</option>
                  </select>
                  <button onClick={() => loadGdCases()}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600">
                    Refresh
                  </button>
                </div>

                {gdLoading ? (
                  <p className="text-xs text-slate-400 py-6 text-center">Loading...</p>
                ) : gdCases.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">
                    <BookOpen className="w-8 h-8 mx-auto mb-2 text-slate-300" />
                    <p className="text-sm">No test cases yet.</p>
                    <p className="text-xs mt-1">Add cases via the <span className="font-medium">+ Add case</span> tab, or push from your microservices.</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Service</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Mapping family</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Test name</th>
                          <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Status</th>
                          <th className="px-3 py-2 text-right">View</th>
                          <th className="px-3 py-2 text-right">Edit</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {gdCases
                          .filter(c =>
                            (!gdFilterSvc    || c.service === gdFilterSvc) &&
                            (!gdFilterStatus || c.lastRunStatus === gdFilterStatus) &&
                            (!gdFilterName   || c.testName.toLowerCase().includes(gdFilterName.toLowerCase()))
                          )
                          .map(c => (
                            <tr key={c.id} className="hover:bg-slate-50">
                              <td className="px-3 py-2 font-mono text-slate-500">{c.service}</td>
                              <td className="px-3 py-2 font-mono text-slate-600">{c.mappingFamily}</td>
                              <td className="px-3 py-2 font-mono text-slate-800">{c.testName}</td>
                              <td className="px-3 py-2">
                                {c.lastRunStatus === 'PASS'
                                  ? <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-medium">PASS</span>
                                  : c.lastRunStatus === 'FAIL'
                                  ? <span className="px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200 text-[10px] font-medium">FAIL</span>
                                  : <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-medium">PENDING</span>}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => setGdViewCase(c)} className="p-1 text-slate-400 hover:text-slate-700 transition-colors" title="View">
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => { setGdEditCase(c); setGdTab('add'); setNewCaseSvc(c.service||''); setNewCaseFamily(c.mappingFamily||''); setNewCaseName(c.testName||''); setNewCaseInput(typeof c.input==='object'?JSON.stringify(c.input,null,2):(c.input||'')); setNewCaseExpected(typeof c.expected==='object'?JSON.stringify(c.expected,null,2):(c.expected||'')); }}
                                  className="p-1 text-slate-400 hover:text-slate-700 transition-colors" title="Edit">
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button onClick={() => deleteGdCase(c.id)}
                                  className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Soft delete">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── ADD tab ── */}
            {gdTab === 'add' && (
              <div className="p-4">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Service</label>
                    <input value={newCaseSvc} onChange={e => setNewCaseSvc(e.target.value)}
                      placeholder="e.g. order-service"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Mapping family</label>
                    <input value={newCaseFamily} onChange={e => setNewCaseFamily(e.target.value)}
                      placeholder={mappingFamily}
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400" />
                  </div>
                </div>
                <div className="mb-3">
                  <label className="block text-xs font-medium text-slate-500 mb-1">Test name</label>
                  <input value={newCaseName} onChange={e => setNewCaseName(e.target.value)}
                    placeholder="e.g. null-field-handling"
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400" />
                </div>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Input JSON</label>
                    <textarea value={newCaseInput} onChange={e => setNewCaseInput(e.target.value)}
                      placeholder={'{\n  "key": "value"\n}'}
                      className="w-full h-32 font-mono text-xs p-3 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-slate-400 resize-none"
                      spellCheck={false} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Expected output JSON</label>
                    <textarea value={newCaseExpected} onChange={e => setNewCaseExpected(e.target.value)}
                      placeholder={'{\n  "outputKey": "outputValue"\n}'}
                      className="w-full h-32 font-mono text-xs p-3 border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-slate-400 resize-none"
                      spellCheck={false} />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button onClick={addGdCase}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm flex items-center gap-2">
                    <Save className="w-4 h-4" /> {gdEditCase ? 'Update test case' : 'Save test case'}
                  </button>
                  <button onClick={() => { setGdTab('list'); setGdEditCase(null); loadGdCases(); }}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  {newCaseMsg && (
                    <span className={`text-xs ${newCaseMsg.ok ? 'text-emerald-600' : 'text-red-600'}`}>
                      {newCaseMsg.text}
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* ── RUN tab ── */}
            {gdTab === 'run' && (
              <div className="p-4">
                <p className="text-xs text-slate-500 mb-3">Runs all active test cases for a mapping family — calls <code className="bg-slate-100 px-1 rounded">POST /api/grizzly/test-cases/run-all</code></p>
                <div className="flex items-center gap-3 mb-4">
                  <input value={gdRunFamily} onChange={e => setGdRunFamily(e.target.value)}
                    placeholder={`Mapping family (default: ${mappingFamily})`}
                    className="px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400 w-64" />
                  <button onClick={runGdRegression} disabled={gdRunning}
                    className="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm flex items-center gap-2 disabled:opacity-50">
                    <Play className="w-4 h-4" />
                    {gdRunning ? 'Running...' : 'Run regression'}
                  </button>
                </div>

                {gdRunResults && (
                  <div>
                    {gdRunResults.error ? (
                      <p className="text-xs text-red-600">Error: {gdRunResults.error}</p>
                    ) : (
                      <>
                        <div className="border border-slate-200 rounded-lg overflow-hidden mb-2">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50 border-b border-slate-200">
                              <tr>
                                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Service</th>
                                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Test name</th>
                                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Result</th>
                                <th className="text-left px-3 py-2 font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Diff</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {(gdRunResults.results || []).map((r, i) => (
                                <tr key={i} className={r.status === 'PASS' ? 'bg-emerald-50' : 'bg-red-50'}>
                                  <td className="px-3 py-2 font-mono text-slate-500">{r.service}</td>
                                  <td className="px-3 py-2 font-mono text-slate-800">{r.testName}</td>
                                  <td className="px-3 py-2">
                                    {r.status === 'PASS'
                                      ? <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">PASS</span>
                                      : <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-semibold">FAIL</span>}
                                  </td>
                                  <td className="px-3 py-2 font-mono text-[10px]">
                                    {r.status === 'FAIL' && r.diff && Object.keys(r.diff).length > 0 && (
                                      <div className="space-y-0.5">
                                        {Object.entries(r.diff).map(([field, delta]) => (
                                          <div key={field} className="flex items-start gap-1">
                                            <span className="text-slate-400 shrink-0">{field}:</span>
                                            <span className="text-red-500">{typeof delta.expected === 'object' ? JSON.stringify(delta.expected) : String(delta.expected)}</span>
                                            <span className="text-slate-400 shrink-0">→</span>
                                            <span className="text-emerald-600">{typeof delta.actual === 'object' ? JSON.stringify(delta.actual) : String(delta.actual)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {r.status === 'FAIL' && r.error && (
                                      <span className="text-red-500">{r.error}</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="text-xs text-slate-500">
                          {gdRunResults.total} tests · <span className="text-emerald-600">{gdRunResults.passed} passed</span> · <span className="text-red-500">{gdRunResults.failed} failed</span>
                          {gdRunResults.durationMs && <span className="ml-2">· {gdRunResults.durationMs}ms</span>}
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* View modal */}
            {gdViewCase && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setGdViewCase(null)}>
                <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] overflow-hidden m-4" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-slate-50">
                    <h3 className="font-semibold text-slate-700">View: {gdViewCase.testName}</h3>
                    <button onClick={() => setGdViewCase(null)} className="p-1.5 text-slate-400 hover:text-slate-700 rounded"><X className="w-4 h-4" /></button>
                  </div>
                  <div className="p-4 overflow-y-auto max-h-[calc(85vh-4rem)] grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Input JSON</p>
                      <div className="rounded-lg overflow-hidden border border-slate-200">
                        <PrismCode code={typeof gdViewCase.input === 'object' ? JSON.stringify(gdViewCase.input, null, 2) : (gdViewCase.input || '{}')} language="json" />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-500 uppercase mb-2">Expected output JSON</p>
                      <div className="rounded-lg overflow-hidden border border-slate-200">
                        <PrismCode code={typeof gdViewCase.expected === 'object' ? JSON.stringify(gdViewCase.expected, null, 2) : (gdViewCase.expected || '{}')} language="json" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {step === 3 && (
        <div className="pl-8 pr-6 py-6 pb-12 min-h-screen">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h1 className="text-xl font-bold text-slate-800">Generated template</h1>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
                <input type="checkbox" checked={codeWrap} onChange={e => setCodeWrap(e.target.checked)} className="rounded border-slate-300" />
                Word wrap
              </label>
              <div className="flex gap-2">
                <button onClick={() => { expandBothTrees(); setStep(2); }} className="px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-2 text-slate-700 hover:bg-slate-50">
                  <ArrowLeft className="w-4 h-4" /> Back to mapping
                </button>
                <button onClick={() => { loadGdCases(); setStep(4); }} className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2 text-sm">
                  <Eye className="w-4 h-4" /> Test Template
                </button>
              </div>
            </div>
          </div>
          <div className="bg-white">
            <PrismCode code={generateCode()} language="python" wrap={codeWrap} />
          </div>
        </div>
      )}

    </div>
  );
};

export default GrizzlyMappingTool;
