import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Move, Code, Search, File, Folder, Database, X, Upload, FileCode, ArrowRight, ArrowLeft, Download, Layers, CheckCircle2 } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import Prism from 'prismjs';
import 'prismjs/components/prism-python';

// Extend Python grammar to highlight custom ?. optional chaining operator
if (Prism.languages.python && !Prism.languages.python['optional-chaining']) {
  Prism.languages.python['optional-chaining'] = { pattern: /\?\./, alias: 'operator' };
}

const uid = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

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
    const fnMatch = raw.match(/^([a-zA-Z_]\w*)\((.+)\)$/s);
    if (fnMatch && !/^(INPUT|input)/.test(raw)) {
      const KNOWN = ['now','formatDate','today','uuid','upper','lower','concat','coalesce'];
      const name = fnMatch[1];
      const args = fnMatch[2].trim();
      if (KNOWN.includes(name)) {
        return { exprType: 'function', funcName: name, funcArgs: args, expression: raw, staticValue: '' };
      }
    }
    const normalized = raw.replace(/^INPUT\??\./i, 'input.');
    return { exprType: 'input', expression: normalized, staticValue: '', funcName: 'now', funcArgs: '' };
  };

  // Detect multi-line ternary: ( ifVal \n if (cond) \n else elseVal )
  const parseTernary = (text) => {
    const m = text.match(/\(\s*([\s\S]+?)\s+if\s+\(([\s\S]+?)\)\s+else\s+([\s\S]+?)\s*\)/s);
    if (m) return { condition: m[2].trim(), ifExpr: m[1].trim(), elseExpr: m[3].trim() };
    return null;
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
      const km = entry.match(/^"([^"]+)"\s*:\s*([\s\S]+)$/s);
      if (!km) continue;
      const key = km[1];
      const val = km[2].trim();
      const fullPath = parentPath ? parentPath + '.' + key : key;
      if (val.startsWith('{')) {
        flattenDict(val, fullPath).forEach(f => fields.push(f));
      } else {
        const ternary = parseTernary(val);
        if (ternary) {
          fields.push({ id: uid(), path: fullPath, isTernary: true, ...ternary });
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
            return { id: uid(), type: 'if', lcTarget: f.path, condition: f.condition, ifExpr: f.ifExpr, elseExpr: f.elseExpr };
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
        expression: (varMatch[2] || '').replace(/^INPUT\??\./i, 'input.').trim()
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
  
  // Selection and autocomplete state
  const [selectedInput, setSelectedInput] = useState(null); // { id, field: 'target' | 'expression' | 'condition' | 'iterable' }
  const [autocompleteState, setAutocompleteState] = useState({
    show: false,
    suggestions: [],
    inputId: null,
    field: null,
    position: { top: 0, left: 0 },
    cursorPosition: 0
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
            if (item.lcMode === 'static') {
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

  // Handle double click on schema node
  const handleSchemaDoubleClick = (path, isInput, e) => {
    if (e) e.stopPropagation();
    if (!selectedInput) return;

    const { id, field } = selectedInput;

    // Determine if the path is appropriate for the field
    if (field === 'target' && isInput) return; // Target should be from output
    if (field === 'expression' && !isInput) return; // Expression should be from input
    if ((field === 'condition' || field === 'iterable') && !isInput) return; // Condition/iterable use input paths

    // Update the item
    if (field === 'expression') {
      // Append to expression
      const item = findItemById(mappings, id);
      if (item) {
        const currentValue = item[field] || '';
        const newValue = currentValue ? `${currentValue} + ${path}` : path;
        updateItem(id, field, newValue);
      }
    } else {
      // Replace for target, condition, iterable
      updateItem(id, field, path);
    }
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

  // Handle input focus for autocomplete
  const handleInputFocus = (e, id, field) => {
    setSelectedInput({ id, field });
  };

  // Handle input change with autocomplete
  const handleInputChange = (e, id, field) => {
    const value = e.target.value;
    const cursorPosition = e.target.selectionStart;
    
    updateItem(id, field, value);

    // Show autocomplete
    const rect = e.target.getBoundingClientRect();
    
    // Get the text up to cursor position
    const textBeforeCursor = value.substring(0, cursorPosition);
    const lastWord = textBeforeCursor.split(/[\s+\-*/(),[\]{}]/).pop() || '';

    if (lastWord.length >= 1) {
      // Target field = output paths only; expression / condition / iterable = input paths only
      const pathSource = field === 'target' ? outputPaths : inputPaths;
      let suggestions = pathSource.filter(p =>
        p.path.toLowerCase().includes(lastWord.toLowerCase())
      );

      // For iterable: sort array-type paths to the top
      if (field === 'iterable') {
        suggestions = [
          ...suggestions.filter(p => p.type === 'array'),
          ...suggestions.filter(p => p.type !== 'array')
        ];
      }

      suggestions = suggestions.slice(0, 10);

      if (suggestions.length > 0) {
        setAutocompleteState({
          show: true,
          suggestions,
          inputId: id,
          field,
          position: {
            top: rect.bottom + window.scrollY,
            left: rect.left + window.scrollX
          },
          cursorPosition,
          searchTerm: lastWord
        });
        return;
      }
    }

    setAutocompleteState({ ...autocompleteState, show: false });
  };

  // Handle autocomplete selection
  const handleAutocompleteSelect = (path) => {
    const { inputId, field, cursorPosition, searchTerm } = autocompleteState;
    const item = findItemById(mappings, inputId);
    
    if (item) {
      const currentValue = item[field] || '';
      const textBeforeCursor = currentValue.substring(0, cursorPosition);
      const textAfterCursor = currentValue.substring(cursorPosition);
      
      // Replace the last word with the selected path
      const beforeLastWord = textBeforeCursor.substring(0, textBeforeCursor.lastIndexOf(searchTerm));
      const newValue = beforeLastWord + path + textAfterCursor;
      
      updateItem(inputId, field, newValue);
    }

    setAutocompleteState({ ...autocompleteState, show: false });
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
              if (selectedInput?.field === 'iterable') {
                updateItem(selectedInput.id, 'iterable', fullPath);
              }
            } : undefined}
            className={`flex items-center gap-2 p-2 hover:bg-gray-100 rounded ${isInput ? 'cursor-move' : 'cursor-pointer'} ${
              selectedInput?.field === 'iterable' && isInput ? 'bg-green-50 ring-1 ring-green-300' : ''
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
        ((selectedInput.field === 'target' && !isInput) || 
         (selectedInput.field === 'expression' && isInput) ||
         (selectedInput.field === 'condition') ||
         (selectedInput.field === 'iterable' && isInput));
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
    if (type === 'assignment') { newChild.target = ''; newChild.expression = ''; }
    else if (type === 'if') { newChild.lcTarget = ''; newChild.condition = ''; newChild.ifExpr = ''; newChild.elseExpr = ''; }
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

    const handleDragOver = (e) => {
      e.preventDefault();
      e.stopPropagation();
    };

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
      const handleExprDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
          if (dragData && dragData.isInput) {
            updateItem(item.id, 'expression', dragData.path);
          }
        } catch (err) {
          console.error('Error parsing drag data:', err);
        }
      };
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
              <div onDrop={handleExprDrop} onDragOver={handleDragOver} className="relative">
                <input
                  type="text"
                  placeholder="Value (drag from Input or type: number, text, list...)"
                  value={item.expression || ''}
                  onFocus={(e) => handleInputFocus(e, item.id, 'expression')}
                  onChange={(e) => handleInputChange(e, item.id, 'expression')}
                  className={`w-full px-3 py-2 border rounded text-sm font-mono focus:outline-none focus:border-slate-400 ${
                    selectedInput?.id === item.id && selectedInput?.field === 'expression'
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
      const handleTargetDrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        try { const d = JSON.parse(e.dataTransfer.getData('application/json')); if (d && !d.isInput) updateItem(item.id, 'target', d.path); } catch {}
      };
      const handleExpressionDrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        try { const d = JSON.parse(e.dataTransfer.getData('application/json')); if (d && d.isInput) { const cur = item.expression; updateItem(item.id, 'expression', cur ? `${cur} + ${d.path}` : d.path); } } catch {}
      };
      const handleLcIterableDrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        try { const d = JSON.parse(e.dataTransfer.getData('application/json')); if (d && d.isInput) updateItem(item.id, 'lcIterable', d.path); } catch {}
      };

      // Render a compact IF/ELSE ternary block inside the list comp body.
      // Data model: child.lcTarget (output path), child.condition, child.ifExpr, child.elseExpr
      const renderLcIf = (child) => {
        const isExp = expandedBlocks.has(child.id);
        return (
          <div key={child.id} className="my-1 border border-purple-300 rounded-lg overflow-hidden">
            {/* Header: collapse toggle + IF/ELSE label + delete */}
            <div className="flex items-center gap-2 px-2 py-1.5 bg-purple-100">
              <button onClick={() => toggleBlock(child.id)} className="p-0.5 text-purple-600">
                {isExp ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>}
              </button>
              <span className="font-bold text-purple-800 text-xs">IF / ELSE  ternary</span>
              {!isExp && child.lcTarget && (
                <span className="text-xs text-purple-500 font-mono truncate">{child.lcTarget}</span>
              )}
              <button onClick={() => deleteLcChild(item.id, child.id)} className="ml-auto p-1 text-red-400 hover:text-red-600"><Trash2 className="w-3 h-3"/></button>
            </div>
            {isExp && (
              <div className="p-2 space-y-1.5 bg-white">
                {/* Output field path — shared by both branches */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-16 shrink-0">field path</span>
                  <input type="text" placeholder="e.g. field.nested.value"
                    value={child.lcTarget || ''}
                    onChange={e => updateLcChild(item.id, child.id, 'lcTarget', e.target.value)}
                    className="flex-1 px-2 py-1 border border-slate-300 rounded text-xs font-mono bg-yellow-50 focus:outline-none" />
                </div>
                {/* Condition */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-700 w-16 shrink-0">IF</span>
                  <input type="text" placeholder="condition  (e.g. item?.type.upper() == 'X')"
                    value={child.condition || ''}
                    onChange={e => updateLcChild(item.id, child.id, 'condition', e.target.value)}
                    className="flex-1 px-2 py-1 border border-purple-300 rounded text-xs font-mono bg-purple-50 focus:outline-none" />
                </div>
                {/* IF value */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-purple-600 w-16 shrink-0 text-right">→ value</span>
                  <input type="text" placeholder="value when condition is true"
                    value={child.ifExpr || ''}
                    onChange={e => updateLcChild(item.id, child.id, 'ifExpr', e.target.value)}
                    className="flex-1 px-2 py-1 border border-purple-200 rounded text-xs font-mono bg-white focus:outline-none" />
                </div>
                {/* ELSE value */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-pink-700 w-16 shrink-0">ELSE →</span>
                  <input type="text" placeholder="value when condition is false"
                    value={child.elseExpr || ''}
                    onChange={e => updateLcChild(item.id, child.id, 'elseExpr', e.target.value)}
                    className="flex-1 px-2 py-1 border border-pink-200 rounded text-xs font-mono bg-pink-50 focus:outline-none" />
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

        const LC_FUNCS = [
          {name:'now',       label:'now()',                args:false},
          {name:'formatDate',label:'formatDate(date,fmt)', args:true, ph:'now(), "yyyy-MM-dd HH:mm:ss"'},
          {name:'today',     label:'today()',              args:false},
          {name:'uuid',      label:'uuid()',               args:false},
          {name:'upper',     label:'upper(text)',          args:true, ph:'item?.field'},
          {name:'lower',     label:'lower(text)',          args:true, ph:'item?.field'},
          {name:'concat',    label:'concat(a,b)',          args:true, ph:'item?.a, item?.b'},
        ];
        const valTypes = { input:'⬅ Input', static:'"…" Text', number:'# Num', function:'ƒ Fn' };
        const valColors = {
          input:   'border-green-300 bg-green-50 text-green-700',
          static:  'border-slate-300 bg-white text-slate-600',
          number:  'border-blue-300 bg-blue-50 text-blue-700',
          function:'border-orange-300 bg-orange-50 text-orange-700',
        };

        // Shared field row — used in both static elements and dynamic FOR body
        const renderFieldRow = (fid, field, onUpdate, onDelete) => {
          const et = field.exprType || 'input';
          const sync = (type, vals) => {
            const upd = { ...field, ...vals, exprType: type };
            if (type === 'static')   upd.expression = `"${(vals.staticValue||'').replace(/"/g,'\\"')}"`;
            if (type === 'number')   upd.expression = vals.staticValue || '0';
            if (type === 'function') { const a=(vals.funcArgs||'').trim(); upd.expression = a ? `${vals.funcName||'now'}(${a})` : `${vals.funcName||'now'}()`; }
            onUpdate(upd);
          };
          const selFn = LC_FUNCS.find(f => f.name === (field.funcName||'now')) || LC_FUNCS[0];
          return (
            <div key={fid} className="border border-slate-100 rounded-lg bg-white overflow-hidden mb-1.5">
              {/* field path row */}
              <div className="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
                <span className="text-xs text-slate-300 w-10 shrink-0">field</span>
                <input type="text"
                  placeholder="path — e.g.  version   or   createDatetime.datetime"
                  value={field.target || ''}
                  onChange={e => onUpdate({ ...field, target: e.target.value })}
                  className="flex-1 px-2 py-1 border border-yellow-200 rounded text-xs font-mono bg-yellow-50 focus:outline-none" />
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
                {et==='input'    && <input type="text"   placeholder="drag from Input or type path…" value={field.expression||''}  onChange={e=>onUpdate({...field,expression:e.target.value})}                                       className="flex-1 min-w-0 px-2 py-1 border border-green-300 rounded text-xs font-mono bg-green-50 focus:outline-none"/>}
                {et==='static'   && <input type="text"   placeholder="type the value, e.g.  1.0.0"  value={field.staticValue||''} onChange={e=>sync('static',  {staticValue:e.target.value, funcName:field.funcName||'now', funcArgs:field.funcArgs||''})} className="flex-1 min-w-0 px-2 py-1 border border-slate-300 rounded text-xs bg-white focus:outline-none"/>}
                {et==='number'   && <input type="number" placeholder="0"                            value={field.staticValue||''} onChange={e=>sync('number',  {staticValue:e.target.value, funcName:field.funcName||'now', funcArgs:field.funcArgs||''})} className="flex-1 min-w-0 px-2 py-1 border border-blue-300 rounded text-xs font-mono bg-blue-50 focus:outline-none"/>}
                {et==='function' && (
                  <div className="flex gap-1 flex-1 min-w-0">
                    <select value={field.funcName||'now'} onChange={e=>sync('function',{funcName:e.target.value,funcArgs:field.funcArgs||'',staticValue:''})} className="px-1.5 py-1 border border-orange-300 rounded text-xs bg-orange-50 focus:outline-none shrink-0">
                      {LC_FUNCS.map(f=><option key={f.name} value={f.name}>{f.label}</option>)}
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
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border-b border-blue-200">
                <Move className="w-4 h-4 text-blue-300 cursor-move shrink-0" />
                <div onDrop={handleTargetDrop} onDragOver={handleDragOver} className="flex-1">
                  <input type="text" placeholder="OUTPUT key  (e.g.  AboutVersion)"
                    value={item.target}
                    onFocus={e => handleInputFocus(e, item.id, 'target')}
                    onChange={e => handleInputChange(e, item.id, 'target')}
                    className={`w-full px-3 py-1.5 border rounded text-sm font-mono focus:outline-none ${selectedInput?.id===item.id && selectedInput?.field==='target' ? 'border-blue-500 bg-yellow-100' : 'border-blue-300 bg-yellow-50'}`} />
                </div>
                <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-1 rounded shrink-0">= [ … ]</span>
                <button onClick={() => updateItem(item.id,'listComp',false)} className="px-2 py-1 text-xs text-blue-500 border border-blue-300 rounded hover:bg-blue-100 shrink-0">Plain</button>
                <button onClick={() => deleteItem(item.id)} className="p-1.5 text-red-400 hover:text-red-600 rounded shrink-0"><Trash2 className="w-4 h-4"/></button>
              </div>

              {/* Mode switcher */}
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0 mr-1">List type</span>
                <button onClick={() => updateItem(item.id,'lcMode','static')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${lcMode==='static' ? 'bg-amber-100 border-amber-400 text-amber-800' : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'}`}>
                  📋 Static — fixed items I fill in
                </button>
                <button onClick={() => updateItem(item.id,'lcMode','dynamic')}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${lcMode==='dynamic' ? 'bg-green-100 border-green-400 text-green-800' : 'bg-white border-slate-300 text-slate-500 hover:border-slate-400'}`}>
                  🔄 Dynamic — loop over input array
                </button>
              </div>

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
                                () => deleteLcElementField(item.id, el.id, field.id)
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
                    <div className="flex-1" onDrop={handleLcIterableDrop} onDragOver={handleDragOver}>
                      <input type="text" placeholder="Drag array field or type (e.g. input.items)" value={item.lcIterable||''}
                        onFocus={e => handleInputFocus(e, item.id,'lcIterable')} onChange={e => handleInputChange(e, item.id,'lcIterable')}
                        className={`w-full px-3 py-1.5 border rounded text-sm font-mono focus:outline-none ${selectedInput?.id===item.id&&selectedInput?.field==='lcIterable' ? 'border-green-500 bg-green-200' : 'border-green-300 bg-white'}`}/>
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
                          (updated) => { Object.entries(updated).forEach(([k,v]) => { if(k!=='id') updateLcChild(item.id,child.id,k,v); }); },
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

      // Sync derived expression into item.expression based on exprType
      const syncExpr = (type, vals) => {
        const upd = { ...vals, exprType: type };
        if (type === 'static') upd.expression = `"${(vals.staticValue || '').replace(/"/g, '\\"')}"`;
        else if (type === 'number') upd.expression = vals.staticValue || '0';
        else if (type === 'function') {
          const args = (vals.funcArgs || '').trim();
          upd.expression = args ? `${vals.funcName || 'now'}(${args})` : `${vals.funcName || 'now'}()`;
        }
        // for 'input' type, expression is managed by handleInputChange
        Object.entries(upd).forEach(([k, v]) => updateItem(item.id, k, v));
      };

      const BUILTIN_FUNCTIONS = [
        { name: 'now', label: 'now()', desc: 'Current datetime', args: false },
        { name: 'formatDate', label: 'formatDate(date, fmt)', desc: 'Format a date', args: true, argsPlaceholder: 'now(), "yyyy-MM-dd HH:mm:ss"' },
        { name: 'today', label: 'today()', desc: "Today's date", args: false },
        { name: 'uuid', label: 'uuid()', desc: 'Generate a UUID', args: false },
        { name: 'upper', label: 'upper(text)', desc: 'Uppercase string', args: true, argsPlaceholder: 'input.field' },
        { name: 'lower', label: 'lower(text)', desc: 'Lowercase string', args: true, argsPlaceholder: 'input.field' },
        { name: 'concat', label: 'concat(a, b)', desc: 'Concatenate strings', args: true, argsPlaceholder: 'input.a, input.b' },
        { name: 'coalesce', label: 'coalesce(a, b)', desc: 'First non-null value', args: true, argsPlaceholder: 'input.field, "default"' },
      ];

      const typeConfig = {
        input:    { label: '⬅ From Input',   bg: 'bg-green-50',  border: 'border-green-300',  text: 'text-green-700' },
        static:   { label: '"…" Static Text', bg: 'bg-white',     border: 'border-slate-300',  text: 'text-slate-700' },
        number:   { label: '# Number',        bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-700'  },
        function: { label: 'ƒ Function',       bg: 'bg-orange-50', border: 'border-orange-300', text: 'text-orange-700'},
      };

      const renderValueInput = () => {
        if (exprType === 'input') {
          return (
            <div onDrop={handleExpressionDrop} onDragOver={handleDragOver} className="flex-1 relative">
              <input type="text" placeholder="Drag from Input schema or type path…" value={item.expression}
                onFocus={e => handleInputFocus(e, item.id, 'expression')} onChange={e => handleInputChange(e, item.id, 'expression')}
                className={`w-full px-3 py-2 border rounded focus:outline-none text-sm font-mono ${selectedInput?.id === item.id && selectedInput?.field === 'expression' ? 'border-green-500 bg-green-100' : 'border-green-300 bg-green-50'}`} />
            </div>
          );
        }
        if (exprType === 'static') {
          return (
            <div className="flex-1 relative">
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
            <div className="flex-1 relative">
              <input type="number" placeholder="0"
                value={item.staticValue || ''}
                onChange={e => syncExpr('number', { staticValue: e.target.value })}
                className="w-full px-3 py-2 border border-blue-300 rounded focus:outline-none text-sm bg-blue-50 font-mono" />
            </div>
          );
        }
        if (exprType === 'function') {
          const selFn = BUILTIN_FUNCTIONS.find(f => f.name === (item.funcName || 'now')) || BUILTIN_FUNCTIONS[0];
          return (
            <div className="flex-1 flex gap-2">
              <select value={item.funcName || 'now'}
                onChange={e => syncExpr('function', { funcName: e.target.value, funcArgs: item.funcArgs || '', staticValue: item.staticValue || '' })}
                className="px-2 py-2 border border-orange-300 rounded text-sm bg-orange-50 focus:outline-none shrink-0">
                {BUILTIN_FUNCTIONS.map(f => <option key={f.name} value={f.name}>{f.label}</option>)}
              </select>
              {selFn.args && (
                <input type="text" placeholder={selFn.argsPlaceholder || 'arguments…'}
                  value={item.funcArgs || ''}
                  onChange={e => syncExpr('function', { funcName: item.funcName || 'now', funcArgs: e.target.value, staticValue: item.staticValue || '' })}
                  className="flex-1 px-3 py-2 border border-orange-200 rounded text-sm font-mono bg-white focus:outline-none" />
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
              <div onDrop={handleTargetDrop} onDragOver={handleDragOver} className="flex-1">
                <input type="text" placeholder="Output field  (drag from Output schema or type)" value={item.target}
                  onFocus={e => handleInputFocus(e, item.id, 'target')} onChange={e => handleInputChange(e, item.id, 'target')}
                  className={`w-full px-3 py-1.5 border rounded focus:outline-none text-sm ${selectedInput?.id === item.id && selectedInput?.field === 'target' ? 'border-blue-500 bg-yellow-100' : 'border-yellow-300 bg-yellow-50'}`} />
              </div>
              {/* List comp toggle */}
              <button onClick={() => { updateItem(item.id, 'listComp', true); setExpandedBlocks(prev => new Set([...prev, item.id + '_lc'])); }}
                title="Switch to List Comprehension mode (for array outputs)"
                className="px-2 py-1 text-xs text-blue-500 border border-blue-200 rounded hover:bg-blue-50 shrink-0 font-mono">[ … ]</button>
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
                  <button key={t} onClick={() => { updateItem(item.id, 'exprType', t); if (t !== 'input') syncExpr(t, { staticValue: item.staticValue || '', funcName: item.funcName || 'now', funcArgs: item.funcArgs || '' }); }}
                    className={`px-2 py-1 rounded text-xs font-medium border transition-colors ${exprType === t ? `${cfg.bg} ${cfg.border} ${cfg.text} shadow-sm` : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}>
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
          <button onClick={() => addItem(parentId, 'variable')}  className={`px-3 py-1.5 bg-white border ${borderColor} ${textColor} rounded ${hoverColor} text-xs flex items-center gap-1`}><Plus className="w-3 h-3" /> Variable</button>
          <button onClick={() => addItem(parentId, 'assignment')} className={`px-3 py-1.5 bg-white border ${borderColor} ${textColor} rounded ${hoverColor} text-xs flex items-center gap-1`}><Plus className="w-3 h-3" /> Assignment</button>
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
                value={item.condition}
                onFocus={(e) => handleInputFocus(e, item.id, 'condition')}
                onChange={(e) => handleInputChange(e, item.id, 'condition')}
                className={`flex-1 px-3 py-2 border rounded focus:outline-none text-sm font-mono ${
                  selectedInput?.id === item.id && selectedInput?.field === 'condition'
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
                  value={elif.condition}
                  onFocus={(e) => handleInputFocus(e, elif.id, 'condition')}
                  onChange={(e) => {
                    handleInputChange(e, elif.id, 'condition');
                    updateElifCondition(item.id, elifIdx, e.target.value);
                  }}
                  className={`flex-1 px-3 py-2 border rounded focus:outline-none text-sm font-mono ${
                    selectedInput?.id === elif.id && selectedInput?.field === 'condition'
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
              <div
                className="flex-1 relative"
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  try {
                    const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
                    if (dragData && dragData.isInput) {
                      updateItem(item.id, 'iterable', dragData.path);
                    }
                  } catch (err) { /* ignore */ }
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
              <input
                type="text"
                placeholder="Drag array field or type (e.g., input.accounts)"
                value={item.iterable}
                onFocus={(e) => handleInputFocus(e, item.id, 'iterable')}
                onChange={(e) => handleInputChange(e, item.id, 'iterable')}
                className={`w-full px-3 py-2 border rounded focus:outline-none focus:border-gray-400 text-sm font-mono ${
                  selectedInput?.id === item.id && selectedInput?.field === 'iterable'
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
    const cleanExpr = (expr) => {
      if (!expr) return '""';
      return expr.replace(/\binput\./gi, 'INPUT?.');
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
    // _forMeta = { iterator, iterable, children }  where children are assignment items.
    const buildListComp = ({ iterator, iterable, children }) => {
      // Collect inner assignments and render the dict body
      const innerAssignments = collectForChildren(children, iterator, iterable);
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
    const collectForChildren = (children, iterator, iterable) => {
      const results = [];
      (children || []).forEach(item => {
        if (item.type === 'assignment' && item.target) {
          // Plain assignment inside list comp — path has rootKey prefix, needs stripping
          const cleaned = cleanPath(item.target);
          const expr = rewriteForExpr(cleanExpr(item.expression || '""'), iterator, iterable);
          results.push({ cleanedTarget: cleaned, expression: expr, isRelative: false });
        } else if (item.type === 'if' && item.lcTarget) {
          // LC-IF ternary: lcTarget is already a relative path (no rootKey prefix)
          const cleaned = item.lcTarget.trim();  // use as-is, no cleanPath stripping
          const cond = rewriteForExpr(cleanExpr(item.condition || 'False'), iterator, iterable);
          const ifVal = item.ifExpr
            ? rewriteForExpr(cleanExpr(item.ifExpr), iterator, iterable)
            : '""';
          const elseVal = item.elseExpr
            ? rewriteForExpr(cleanExpr(item.elseExpr), iterator, iterable)
            : '""';
          results.push({
            cleanedTarget: cleaned,
            expression: `(\n    ${ifVal}\n    if (${cond})\n    else ${elseVal}\n)`,
            isRelative: true
          });
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
                cur[parts[parts.length - 1]] = f.expression || '""';
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

                    // For-loop → list comprehension hoisted to OUTPUT["key"] = [...]
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

            const innerAssignments = collectForChildren(assignments[0]._forMeta.children, iterator, iterable);
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <FileCode className="w-6 h-6 text-slate-600" />
          <span className="font-bold text-slate-800">Grizzly</span>
        </div>
        <div className="flex gap-2">
          {[1, 2, 3].map(n => (
            <span key={n} className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${step === n ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-500'}`}>{n}</span>
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
              <button
                onClick={() => setOutputSearchTerm('')}
                className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
              >
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
            {/* Compact module strip: one row, no extra column */}
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-200">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Module</span>
              <div className="flex flex-wrap items-center gap-1">
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
                        onClick={() => setActiveModule(idx)}
                        onDoubleClick={() => { if (mod.name !== 'main') { setRenamingModuleIdx(idx); setRenameValue(mod.name); } }}
                        title={mod.name !== 'main' ? 'Double-click to rename' : undefined}
                        className={`px-2.5 py-1 rounded text-xs font-medium ${activeModule === idx ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
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
            </div>

            <div className="flex justify-between items-center mb-4">
              <h1 className="text-xl font-bold text-gray-900">Mapping Builder</h1>
              <button
                onClick={() => setStep(3)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2 text-sm"
              >
                <Layers className="w-4 h-4" /> Review changes
              </button>
            </div>

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
              <button onClick={() => addItem(null, 'assignment')} className="px-4 py-2 bg-gray-100 border-2 border-dashed border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Add Assignment
              </button>
              <button onClick={() => addItem(null, 'variable')} className="px-4 py-2 bg-gray-100 border-2 border-dashed border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm">
                <Code className="w-4 h-4" /> Add Variable
              </button>
              <button onClick={() => addItem(null, 'if')} className="px-4 py-2 bg-gray-100 border-2 border-dashed border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Add If
              </button>
              <button onClick={() => addItem(null, 'for')} className="px-4 py-2 bg-gray-100 border-2 border-dashed border-gray-300 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm">
                <Plus className="w-4 h-4" /> Add For
              </button>
            </div>
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



      {step === 3 && (
        <div className="flex flex-col h-[calc(100vh-4rem)] max-w-4xl mx-auto overflow-hidden">
          <div className="p-6 pb-4 shrink-0">
            <h1 className="text-xl font-bold text-slate-800 mb-4">Step 3: Export</h1>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto px-6 pb-4" style={{ minHeight: 0 }}>
            <div className="rounded-lg border border-slate-200 bg-slate-50">
              <SyntaxHighlighter
                language="python"
                style={oneLight}
                customStyle={{ margin: 0, padding: '1rem', fontSize: '0.75rem', background: '#f8fafc', maxHeight: 'none' }}
                showLineNumbers
                wrapLongLines
              >
                {generateCode()}
              </SyntaxHighlighter>
            </div>
          </div>
          <div className="flex gap-4 p-6 pt-0 shrink-0">
            <button onClick={() => { expandBothTrees(); setStep(2); }} className="px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-2 text-slate-700">
              <ArrowLeft className="w-4 h-4" /> Back to mapping
            </button>
            <button
              onClick={() => {
                const blob = new Blob([generateCode()], { type: 'text/plain' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'transform.py';
                a.click();
                URL.revokeObjectURL(a.href);
              }}
              className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2"
            >
              <Download className="w-4 h-4" /> Download transform.py
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default GrizzlyMappingTool;