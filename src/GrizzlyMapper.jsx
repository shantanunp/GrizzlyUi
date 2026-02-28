import { useState, useRef, useMemo } from "react";
import { Upload, FileCode, ArrowRight, ArrowLeft, Trash2, Zap, Download, ChevronDown, ChevronRight, CheckCircle2, Copy, X, Search, Database, Type, Layers, Plus, Phone } from "lucide-react";

const uid = () => `m_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const extractFields = (obj, prefix = "") => {
  const fields = [];
  const traverse = (current, path) => {
    if (!current || typeof current !== "object" || Array.isArray(current)) return;
    Object.keys(current).forEach((key) => {
      const newPath = path ? `${path}.${key}` : key;
      const value = current[key];
      if (typeof value === "object" && !Array.isArray(value)) {
        fields.push({ path: newPath, type: "object", depth: newPath.split(".").length - 1 });
        traverse(value, newPath);
      } else {
        fields.push({ path: newPath, type: typeof value === "string" ? value : typeof value, depth: newPath.split(".").length - 1 });
      }
    });
  };
  traverse(obj, prefix);
  return fields;
};

// ─── TEMPLATE PARSER ────────────────────────────────────────────────────────

const parseTemplate = (pythonCode) => {
  const lines = pythonCode.split('\n');
  const modules = [];
  let currentModule = null;
  let totalMappings = 0;
  
  let currentModuleName = null;
  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    // Detect module function definitions
    if (trimmed.match(/^def transform\(INPUT\):/)) {
      currentModule = { id: uid(), name: "main", mappings: [] };
      modules.push(currentModule);
      currentModuleName = "main";
      return;
    }

    const moduleDefMatch = trimmed.match(/^def map_(\w+)\(INPUT, OUTPUT\):/);
    if (moduleDefMatch) {
      currentModule = { id: uid(), name: moduleDefMatch[1], mappings: [] };
      modules.push(currentModule);
      currentModuleName = moduleDefMatch[1];
      return;
    }

    // If a new function definition is encountered, clear currentModule
    if (trimmed.startsWith("def ") && !trimmed.match(/^def (transform|map_\w+)\(INPUT, OUTPUT\):/)) {
      currentModule = null;
      currentModuleName = null;
      return;
    }

    if (!currentModule) return;

    // Parse module calls: map_modulename(INPUT, OUTPUT)
    const moduleCallMatch = trimmed.match(/^map_(\w+)\(INPUT, OUTPUT\)/);
    if (moduleCallMatch) {
      currentModule.mappings.push({
        id: uid(),
        moduleName: moduleCallMatch[1],
        type: "module_call",
        isNew: false
      });
      totalMappings++;
      return;
    }

    // Parse simple assignment: OUTPUT["field"] = INPUT.source.upper()
    const simpleMatch = trimmed.match(/OUTPUT\["([^\"]+)"\]\s*=\s*INPUT\.([^\s.]+)(?:\.(\w+)\(\))?/);
    if (simpleMatch) {
      currentModule.mappings.push({
        id: uid(),
        target: simpleMatch[1],
        source: simpleMatch[2],
        transform: simpleMatch[3] || null,
        transformation: "direct",
        type: "field",
        isNew: false
      });
      totalMappings++;
      return;
    }

    // Parse nested assignment: OUTPUT["a"]["b"]["c"] = INPUT.source.path
    const nestedMatch = trimmed.match(/OUTPUT(\["[^"]+"\])+\s*=\s*INPUT\.([\w.]+?)(?:\.(\w+)\(\))?$/);
    if (nestedMatch) {
      const pathParts = [...trimmed.matchAll(/\["([^"]+)"\]/g)].map(m => m[1]);
      const target = pathParts.join('.');
      const sourceParts = nestedMatch[2].split('.');
      const source = sourceParts.join('.');
      const transform = nestedMatch[3] || null;
      currentModule.mappings.push({
        id: uid(),
        target,
        source,
        transform,
        transformation: "direct",
        type: "field",
        isNew: false
      });
      totalMappings++;
      return;
    }

    // Parse conditionals
    const condMatch = trimmed.match(/OUTPUT\["([^"]+)"\]\s*=\s*(.+) if INPUT\.(\w+) (==|!=|>|<) "([^"]+)" else (.+)/);
    if (condMatch) {
      const cleanVal = (v) => v.replace(/^\["']|["']$/g, '').replace(/INPUT\./g, '').trim();
      currentModule.mappings.push({
        id: uid(),
        target: condMatch[1],
        condField: condMatch[3],
        condOp: condMatch[4],
        condValue: condMatch[5],
        thenValue: cleanVal(condMatch[2]),
        elseValue: cleanVal(condMatch[6]),
        transformation: "conditional",
        type: "field",
        isNew: false
      });
      totalMappings++;
    }
  });
  
  return { modules: modules.length > 0 ? modules : null, totalMappings };
};

// ─── PLUGINS ────────────────────────────────────────────────────────────────

const DirectEditor = ({ mapping, onChange, onOpenSidebar }) => (
  <div className="space-y-2">
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Source Field</label>
    <div className="relative flex-1">
      <Database size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
      <input 
        value={mapping.source || ""} 
        onChange={(e) => onChange({ source: e.target.value })} 
        onClick={() => onOpenSidebar("source")} 
        className="w-full pl-8 pr-2.5 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300 cursor-pointer hover:bg-blue-50" 
        placeholder="Click to select field..."
      />
    </div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-3">Transform</label>
    <select value={mapping.transform || ""} onChange={(e) => onChange({ transform: e.target.value || null })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5 bg-white focus:ring-1 focus:ring-blue-300 outline-none">
      <option value="">None</option>
      <option value="upper">UPPERCASE</option>
      <option value="lower">lowercase</option>
      <option value="capitalize">Capitalize</option>
      <option value="format_ssn">Format SSN</option>
      <option value="format_date">Format Date</option>
      <option value="format_phone">Format Phone</option>
    </select>
  </div>
);

const ConditionalEditor = ({ mapping, onChange, onOpenSidebar }) => (
  <div className="space-y-3">
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Condition</label>
    <div className="grid grid-cols-3 gap-2">
      <div className="relative">
        <Database size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
        <input value={mapping.condField || ""} onChange={(e) => onChange({ condField: e.target.value })} onClick={() => onOpenSidebar("source", "condField")} placeholder="field" className="w-full pl-7 text-xs font-mono border border-slate-200 rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50"/>
      </div>
      <select value={mapping.condOp || "=="} onChange={(e) => onChange({ condOp: e.target.value })} className="text-xs border border-slate-200 rounded px-2 py-1.5">
        <option value="==">equals</option>
        <option value="!=">not equals</option>
        <option value=">">greater than</option>
        <option value="<">less than</option>
      </select>
      <input value={mapping.condValue || ""} onChange={(e) => onChange({ condValue: e.target.value })} placeholder="value" className="text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Then</label>
        <input value={mapping.thenValue || ""} onChange={(e) => onChange({ thenValue: e.target.value })} onClick={() => onOpenSidebar("source", "thenValue")} placeholder="click to select" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50"/>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mb-1">Else</label>
        <input value={mapping.elseValue || ""} onChange={(e) => onChange({ elseValue: e.target.value })} onClick={() => onOpenSidebar("source", "elseValue")} placeholder="click to select" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50"/>
      </div>
    </div>
  </div>
);

// NEW SECTION 4 & DATETIME PLUGINS
const ForLoopEditor = ({ mapping, onChange, onOpenSidebar }) => (
  <div className="space-y-2">
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Loop Variable</label>
    <input value={mapping.loopVar || ""} onChange={(e) => onChange({ loopVar: e.target.value })} placeholder="item" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Iterate Over</label>
    <input value={mapping.iterable || ""} onChange={(e) => onChange({ iterable: e.target.value })} onClick={() => onOpenSidebar("source")} placeholder="INPUT.items or range(10)" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50"/>
    <div className="text-[10px] text-slate-500">Examples: INPUT.transactions, range(5), range(0,10,2)</div>
  </div>
);

const IfBlockEditor = ({ mapping, onChange }) => (
  <div className="space-y-2">
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Type</label>
    <select value={mapping.ifType || "if"} onChange={(e) => onChange({ ifType: e.target.value })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5">
      <option value="if">if</option>
      <option value="elif">elif</option>
      <option value="else">else</option>
    </select>
    {mapping.ifType !== "else" && (
      <>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Condition</label>
        <input value={mapping.condition || ""} onChange={(e) => onChange({ condition: e.target.value })} placeholder="INPUT.balance >= 100000" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
      </>
    )}
  </div>
);

const DateTimeParseEditor = ({ mapping, onChange, onOpenSidebar }) => (
  <div className="space-y-2">
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Variable Name</label>
    <input value={mapping.varName || ""} onChange={(e) => onChange({ varName: e.target.value })} placeholder="birthDate" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Source Field</label>
    <input value={mapping.source || ""} onChange={(e) => onChange({ source: e.target.value })} onClick={() => onOpenSidebar("source")} placeholder="INPUT.dateOfBirth" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50"/>
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Format</label>
    <select value={mapping.format || "yyyyMMdd"} onChange={(e) => onChange({ format: e.target.value })} className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5">
      <option value="yyyyMMdd">yyyyMMdd (20240222)</option>
      <option value="yyyy-MM-dd">yyyy-MM-dd (2024-02-22)</option>
      <option value="dd/MM/yyyy">dd/MM/yyyy (22/02/2024)</option>
      <option value="MM/dd/yyyy">MM/dd/yyyy (02/22/2024)</option>
    </select>
  </div>
);

const DateTimeFormatEditor = ({ mapping, onChange }) => (
  <div className="space-y-2">
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">DateTime Variable</label>
    <input value={mapping.dateVar || ""} onChange={(e) => onChange({ dateVar: e.target.value })} placeholder="birthDate or now()" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Output Format</label>
    <select value={mapping.format || "yyyy-MM-dd"} onChange={(e) => onChange({ format: e.target.value })} className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5">
      <option value="yyyy-MM-dd">yyyy-MM-dd (2024-02-22)</option>
      <option value="dd/MM/yyyy">dd/MM/yyyy (22/02/2024)</option>
      <option value="yyyyMMdd">yyyyMMdd (20240222)</option>
      <option value="MM/dd/yyyy">MM/dd/yyyy (02/22/2024)</option>
    </select>
  </div>
);

const DateTimeAddEditor = ({ mapping, onChange }) => (
  <div className="space-y-2">
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Variable Name</label>
    <input value={mapping.varName || ""} onChange={(e) => onChange({ varName: e.target.value })} placeholder="futureDate" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
    <div className="grid grid-cols-2 gap-2">
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Operation</label>
        <select value={mapping.operation || "addDays"} onChange={(e) => onChange({ operation: e.target.value })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5">
          <option value="addDays">addDays</option>
          <option value="addMonths">addMonths</option>
          <option value="addYears">addYears</option>
          <option value="addHours">addHours</option>
          <option value="addMinutes">addMinutes</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Amount</label>
        <input value={mapping.amount || ""} onChange={(e) => onChange({ amount: e.target.value })} placeholder="5 or -3" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
      </div>
    </div>
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Source DateTime</label>
    <input value={mapping.source || ""} onChange={(e) => onChange({ source: e.target.value })} placeholder="birthDate or now()" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
  </div>
);

const DecimalEditor = ({ mapping, onChange, onOpenSidebar }) => (
  <div className="space-y-2">
    <div className="bg-blue-50 border border-blue-200 rounded px-2 py-1.5 mb-2">
      <div className="text-[10px] font-semibold text-blue-900">💰 Exact Precision Math</div>
      <div className="text-[9px] text-blue-700">Avoid float errors in money calculations</div>
    </div>
    
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Operation Type</label>
    <select value={mapping.decimalOp || "create"} onChange={(e) => onChange({ decimalOp: e.target.value })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5">
      <option value="create">Create Decimal</option>
      <option value="add">Add</option>
      <option value="subtract">Subtract</option>
      <option value="multiply">Multiply</option>
      <option value="divide">Divide</option>
      <option value="round">Round</option>
    </select>
    
    {mapping.decimalOp === "create" && (
      <>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Variable Name</label>
        <input value={mapping.varName || ""} onChange={(e) => onChange({ varName: e.target.value })} placeholder="amount" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
        
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Value Source</label>
        <input value={mapping.source || ""} onChange={(e) => onChange({ source: e.target.value })} onClick={() => onOpenSidebar && onOpenSidebar("source")} placeholder="INPUT.amount or &quot;1234.56&quot;" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50"/>
      </>
    )}
    
    {(mapping.decimalOp === "add" || mapping.decimalOp === "subtract" || mapping.decimalOp === "multiply" || mapping.decimalOp === "divide") && (
      <>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Result Variable</label>
        <input value={mapping.resultVar || ""} onChange={(e) => onChange({ resultVar: e.target.value })} placeholder="total" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
        
        <div className="grid grid-cols-2 gap-2 mt-2">
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">First Value</label>
            <input value={mapping.value1 || ""} onChange={(e) => onChange({ value1: e.target.value })} placeholder="amount1" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">Second Value</label>
            <input value={mapping.value2 || ""} onChange={(e) => onChange({ value2: e.target.value })} placeholder="amount2" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
          </div>
        </div>
      </>
    )}
    
    {mapping.decimalOp === "round" && (
      <>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Decimal Variable</label>
        <input value={mapping.source || ""} onChange={(e) => onChange({ source: e.target.value })} placeholder="amount" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
        
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Decimal Places</label>
        <select value={mapping.decimals || "2"} onChange={(e) => onChange({ decimals: e.target.value })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5">
          <option value="0">0 (whole number)</option>
          <option value="2">2 (cents)</option>
          <option value="4">4 (precise)</option>
        </select>
      </>
    )}
    
    <div className="text-[9px] text-slate-500 mt-2 space-y-0.5">
      <div>• Create: amount = Decimal("1234.56")</div>
      <div>• Calculate: total = amount * Decimal("1.05")</div>
      <div>• Round: round(amount, 2)</div>
    </div>
  </div>
);

const RegexEditor = ({ mapping, onChange, onOpenSidebar }) => (
  <div className="space-y-2">
    <div className="bg-purple-50 border border-purple-200 rounded px-2 py-1.5 mb-2">
      <div className="text-[10px] font-semibold text-purple-900">🔍 Pattern Matching</div>
      <div className="text-[9px] text-purple-700">Validate, extract, or replace text patterns</div>
    </div>
    
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Operation Type</label>
    <select value={mapping.regexOp || "match"} onChange={(e) => onChange({ regexOp: e.target.value })} className="w-full text-xs border border-slate-200 rounded px-2 py-1.5">
      <option value="match">Match (validate)</option>
      <option value="search">Search (find)</option>
      <option value="findall">Find All</option>
      <option value="replace">Replace</option>
      <option value="split">Split</option>
    </select>
    
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Pattern</label>
    <input value={mapping.pattern || ""} onChange={(e) => onChange({ pattern: e.target.value })} placeholder="^\d{3}-\d{2}-\d{4}$" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5 bg-slate-50"/>
    
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Source Text</label>
    <input value={mapping.source || ""} onChange={(e) => onChange({ source: e.target.value })} onClick={() => onOpenSidebar && onOpenSidebar("source")} placeholder="INPUT.ssn" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5 cursor-pointer hover:bg-blue-50"/>
    
    {mapping.regexOp === "replace" && (
      <>
        <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block mt-2">Replace With</label>
        <input value={mapping.replacement || ""} onChange={(e) => onChange({ replacement: e.target.value })} placeholder="" className="w-full text-xs font-mono border border-slate-200 rounded px-2 py-1.5"/>
      </>
    )}
    
    <div className="bg-slate-50 rounded p-2 mt-2">
      <div className="text-[9px] font-semibold text-slate-700 mb-1">Common Patterns:</div>
      <div className="space-y-0.5 text-[9px] text-slate-600 font-mono">
        <div>• SSN: ^\d{"{3}"}-\d{"{2}"}-\d{"{4}"}$</div>
        <div>• Email: ^[\w\.-]+@[\w\.-]+\.\w+$</div>
        <div>• Phone: ^\d{"{3}"}-\d{"{3}"}-\d{"{4}"}$</div>
        <div>• Digits only: \d+</div>
        <div>• Remove non-digits: \D (replace with "")</div>
      </div>
    </div>
    
    <div className="text-[9px] text-slate-500 mt-2">
      Use in if: if re.match(pattern, text)
    </div>
  </div>
);

const TRANSFORMATION_PLUGINS = {
  direct: { 
    id: "direct", 
    label: "Direct", 
    Editor: DirectEditor, 
    generate: (m) => { 
      const src = m.source || "source"; 
      let code = `INPUT.${src}`;
      if (m.transform === "upper") code += ".upper()"; 
      else if (m.transform === "lower") code += ".lower()"; 
      else if (m.transform === "capitalize") code += ".capitalize()"; 
      else if (m.transform) code = `${m.transform}(${code})`; 
      return code; 
    } 
  },
  conditional: { 
    id: "conditional", 
    label: "If/Else", 
    Editor: ConditionalEditor, 
    generate: (m) => { 
      const field = m.condField || "field"; 
      const op = m.condOp || "=="; 
      const val = m.condValue || "value"; 
      const then = m.thenValue || "value1"; 
      const els = m.elseValue || "value2"; 
      const thenCode = then.includes('.') ? `INPUT.${then}` : `"${then}"`; 
      const elseCode = els.includes('.') ? `INPUT.${els}` : `"${els}"`; 
      return `${thenCode} if INPUT.${field} ${op} "${val}" else ${elseCode}`;
    } 
  },
  for_loop: {
    id: "for_loop",
    label: "For Loop",
    Editor: ForLoopEditor,
    generate: (m) => `for ${m.loopVar || 'item'} in ${m.iterable || 'items'}:`
  },
  if_block: {
    id: "if_block",
    label: "If/Elif/Else",
    Editor: IfBlockEditor,
    generate: (m) => {
      if (m.ifType === "else") return "else:";
      if (m.ifType === "elif") return `elif ${m.condition || 'condition'}:`;
      return `if ${m.condition || 'condition'}:`;
    }
  },
  break: {
    id: "break",
    label: "Break",
    Editor: () => <div className="text-xs text-slate-500">Exits the current loop</div>,
    generate: () => "break"
  },
  continue: {
    id: "continue",
    label: "Continue",
    Editor: () => <div className="text-xs text-slate-500">Skips to next iteration</div>,
    generate: () => "continue"
  },
  datetime_parse: {
    id: "datetime_parse",
    label: "Parse Date",
    Editor: DateTimeParseEditor,
    generate: (m) => `${m.varName || 'date'} = parseDate(${m.source || 'INPUT.date'}, "${m.format || 'yyyyMMdd'}")`
  },
  datetime_format: {
    id: "datetime_format",
    label: "Format Date",
    Editor: DateTimeFormatEditor,
    generate: (m) => `formatDate(${m.dateVar || 'date'}, "${m.format || 'yyyy-MM-dd'}")`
  },
  datetime_add: {
    id: "datetime_add",
    label: "Add Time",
    Editor: DateTimeAddEditor,
    generate: (m) => `${m.varName || 'newDate'} = ${m.operation || 'addDays'}(${m.source || 'date'}, ${m.amount || '1'})`
  },
  decimal: {
    id: "decimal",
    label: "Decimal/Money",
    Editor: DecimalEditor,
    generate: (m) => {
      if (m.decimalOp === "create") {
        return `${m.varName || 'amount'} = Decimal(${m.source || '"0"'})`;
      } else if (m.decimalOp === "add") {
        return `${m.resultVar || 'result'} = ${m.value1 || 'val1'} + ${m.value2 || 'val2'}`;
      } else if (m.decimalOp === "subtract") {
        return `${m.resultVar || 'result'} = ${m.value1 || 'val1'} - ${m.value2 || 'val2'}`;
      } else if (m.decimalOp === "multiply") {
        return `${m.resultVar || 'result'} = ${m.value1 || 'val1'} * ${m.value2 || 'val2'}`;
      } else if (m.decimalOp === "divide") {
        return `${m.resultVar || 'result'} = ${m.value1 || 'val1'} / ${m.value2 || 'val2'}`;
      } else if (m.decimalOp === "round") {
        return `round(${m.source || 'amount'}, ${m.decimals || '2'})`;
      }
      return "Decimal(\"0\")";
    }
  },
  regex: {
    id: "regex",
    label: "Regex",
    Editor: RegexEditor,
    generate: (m) => {
      const pattern = m.pattern || "pattern";
      const source = m.source || "INPUT.text";
      
      if (m.regexOp === "match") {
        return `re.match(r"${pattern}", ${source})`;
      } else if (m.regexOp === "search") {
        return `re.search(r"${pattern}", ${source})`;
      } else if (m.regexOp === "findall") {
        return `re.findall(r"${pattern}", ${source})`;
      } else if (m.regexOp === "replace") {
        return `re.sub(r"${pattern}", "${m.replacement || ''}", ${source})`;
      } else if (m.regexOp === "split") {
        return `re.split(r"${pattern}", ${source})`;
      }
      return `re.match(r"${pattern}", ${source})`;
    }
  }
};

// ─── COMPONENTS ─────────────────────────────────────────────────────────────

const UploadZone = ({ label, icon: Icon, loaded, detail, accepted, onFile }) => {
  const ref = useRef(null);
  return (
    <div onClick={() => ref.current?.click()} className={`border-2 border-dashed rounded-xl p-6 cursor-pointer transition-all ${loaded ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-blue-400 hover:bg-blue-50/30"}`}>
      <input ref={ref} type="file" accept={accepted} className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <div className="flex flex-col items-center gap-2 text-center">
        {loaded ? <CheckCircle2 className="text-emerald-500" size={32}/> : <Icon className="text-slate-300" size={32}/>}
        <div>
          <div className="font-bold text-xs text-slate-700">{label}</div>
          {loaded && <div className="text-[10px] text-slate-400 mt-0.5">{detail}</div>}
        </div>
      </div>
    </div>
  );
};

const FieldTree = ({ fields, title, accent }) => {
  const [collapsed, setCollapsed] = useState(new Set());
  const toggle = (path) => { const newSet = new Set(collapsed); newSet.has(path) ? newSet.delete(path) : newSet.add(path); setCollapsed(newSet); };
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4">
      <h3 className={`text-xs font-bold mb-3 text-${accent}-600 uppercase tracking-wide`}>{title}</h3>
      <div className="space-y-0.5 text-xs font-mono max-h-64 overflow-y-auto">
        {fields.map(f => (
          <div key={f.path} style={{paddingLeft: `${f.depth * 12}px`}} className="flex items-center gap-1.5 py-0.5 hover:bg-slate-50 rounded px-1">
            {f.type === "object" && (<button onClick={() => toggle(f.path)} className="text-slate-400 hover:text-slate-600">{collapsed.has(f.path) ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}</button>)}
            <span className={f.type === "object" ? "text-slate-600 font-semibold" : "text-slate-500"}>{f.path.split(".").pop()}</span>
            <span className="text-[9px] text-slate-300 ml-auto">{f.type !== "object" && f.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FieldBrowserSidebar = ({ fields, title, onClose, onSelect, usedFields = [] }) => {
  const [search, setSearch] = useState("");
  const filtered = fields.filter(f => f.path.toLowerCase().includes(search.toLowerCase()));
  const usedSet = new Set(usedFields);

  return (
    <div className="w-80 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col" style={{maxHeight: "600px"}}>
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 className="font-bold text-sm text-slate-700">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
      </div>
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search fields..." className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"/>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.map(f => {
          const isObject = f.type === "object";
          const indent = (f.depth || 0) * 16;
          const fieldName = f.path.split(".").pop();
          const isUsed = usedSet.has(f.path);

          if (isObject) {
            return (
              <div key={f.path} className="w-full text-left px-3 py-1.5 text-xs font-mono text-slate-400" style={{ paddingLeft: `${12 + indent}px` }}>
                {fieldName}
              </div>
            );
          }

          return (
            <button key={f.path} onClick={() => onSelect(f.path)} className={`w-full text-left px-3 py-2 text-xs font-mono rounded-md transition-colors flex items-center justify-between ${isUsed ? "bg-green-50 text-green-700" : "hover:bg-blue-50 text-slate-600 hover:text-blue-600"}`} style={{ paddingLeft: `${12 + indent}px` }}>
              <span className="flex items-center gap-2">
                {fieldName}
                {isUsed && <CheckCircle2 size={12} className="text-green-500"/>}
              </span>
              <span className="text-[9px] text-slate-300">{f.type}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

const ModuleBrowserSidebar = ({ modules, activeModule, onClose, onSelect, usedModules = [] }) => {
  const [search, setSearch] = useState("");
  const availableModules = modules.filter((m, idx) => idx !== activeModule && m.name !== "main");
  const filtered = availableModules.filter(m => m.name.toLowerCase().includes(search.toLowerCase()));
  const usedSet = new Set(usedModules);

  return (
    <div className="w-80 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col" style={{maxHeight: "600px"}}>
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 className="font-bold text-sm text-slate-700">Select Module</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
      </div>
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search modules..." className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"/>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <Layers size={32} className="mx-auto mb-2 opacity-30"/>
            <div className="text-xs">No other modules available</div>
          </div>
        ) : (
          filtered.map(m => {
            const isUsed = usedSet.has(m.name);
            return (
              <button key={m.id} onClick={() => onSelect(m.name)} className={`w-full text-left px-3 py-2 text-xs rounded-md transition-colors flex items-center gap-2 border ${isUsed ? "bg-green-50 text-green-700 border-green-200" : "hover:bg-amber-50 text-slate-700 hover:text-amber-700 border-transparent hover:border-amber-200"}`}>
                <Layers size={14} className={isUsed ? "text-green-600" : "text-amber-600"}/>
                <div className="flex-1">
                  <div className="font-semibold font-mono flex items-center gap-2">
                    {m.name}
                    {isUsed && <CheckCircle2 size={12} className="text-green-500"/>}
                  </div>
                  <div className="text-[10px] text-slate-400">{m.mappings.length} mappings</div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};

// ─── MAIN ───────────────────────────────────────────────────────────────────

export default function GrizzlyMapper() {
  const [step, setStep] = useState(1);
  const [inputSchema, setInputSchema] = useState(null);
  const [outputSchema, setOutputSchema] = useState(null);
  const [inputFields, setInputFields] = useState([]);
  const [outputFields, setOutputFields] = useState([]);
  const [modules, setModules] = useState([{ id: uid(), name: "main", mappings: [] }]);
  const [activeModule, setActiveModule] = useState(0);
  const [expandedRow, setExpandedRow] = useState(null);
  const [sidebarState, setSidebarState] = useState({ isOpen: false, mode: "source", rowIdx: null, field: null });
  const [templateLoaded, setTemplateLoaded] = useState(false);
  const [templateInfo, setTemplateInfo] = useState("");
  const [originalModules, setOriginalModules] = useState(null);

  const mappings = modules[activeModule]?.mappings || [];

  // Display order: fields first, then module calls (grouped at bottom)
  const displayMappings = useMemo(() => {
    const fields = mappings.map((m, i) => ({ m, realIdx: i })).filter((x) => x.m.type === "field");
    const calls = mappings.map((m, i) => ({ m, realIdx: i })).filter((x) => x.m.type === "module_call");
    return [...fields, ...calls];
  }, [mappings]);

  // Calculate changes for dashboard
  const calculateChanges = () => {
    if (!originalModules) return { added: [], removed: [], modified: [], unchanged: [] };
    
    const changes = { added: [], removed: [], modified: [], unchanged: [] };
    const currentFlat = {};
    const originalFlat = {};
    
    modules.forEach(mod => {
      mod.mappings.forEach(m => {
        const key = m.type === 'module_call' ? `${mod.name}:call_${m.moduleName}` : `${mod.name}:${m.target}`;
        currentFlat[key] = { module: mod.name, ...m };
      });
    });
    
    originalModules.forEach(mod => {
      mod.mappings.forEach(m => {
        const key = m.type === 'module_call' ? `${mod.name}:call_${m.moduleName}` : `${mod.name}:${m.target}`;
        originalFlat[key] = { module: mod.name, ...m };
      });
    });
    
    Object.keys(currentFlat).forEach(key => {
      if (!originalFlat[key]) {
        changes.added.push(currentFlat[key]);
      } else {
        const curr = currentFlat[key];
        const orig = originalFlat[key];
        if (curr.source !== orig.source || curr.transformation !== orig.transformation || 
            curr.transform !== orig.transform || curr.moduleName !== orig.moduleName) {
          changes.modified.push({ current: curr, original: orig });
        } else {
          changes.unchanged.push(curr);
        }
      }
    });
    
    Object.keys(originalFlat).forEach(key => {
      if (!currentFlat[key]) {
        changes.removed.push(originalFlat[key]);
      }
    });
    
    return changes;
  };

  const handleFile = (type, file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target.result;
        if (type === "input") {
          const schema = JSON.parse(content);
          setInputSchema(schema);
          setInputFields(extractFields(schema));
        } else if (type === "output") {
          const schema = JSON.parse(content);
          setOutputSchema(schema);
          setOutputFields(extractFields(schema));
        } else if (type === "template") {
          const parsed = parseTemplate(content);
          if (parsed.modules) {
            setModules(parsed.modules);
            setOriginalModules(JSON.parse(JSON.stringify(parsed.modules)));
            setActiveModule(0);
            setTemplateLoaded(true);
            setTemplateInfo(`${parsed.totalMappings} mappings, ${parsed.modules.length} modules`);
          } else {
            console.log("No mappings found in template file");
          }
        }
      } catch (err) {
        console.log(`❌ Error: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const loadSample = () => {
    const sampleInput = { customer: { firstName: "string", lastName: "string", email: "string" }, loan: { amount: "number", type: "string" } };
    const sampleOutput = { CUSTOMER: { FIRST_NAME: "string", LAST_NAME: "string" }, LOAN: { AMOUNT: "number", TYPE: "string" } };
    setInputSchema(sampleInput);
    setOutputSchema(sampleOutput);
    setInputFields(extractFields(sampleInput));
    setOutputFields(extractFields(sampleOutput));
  };

  const addModule = () => {
    const newModule = { id: uid(), name: `module_${modules.length}`, mappings: [] };
    setModules([...modules, newModule]);
    setActiveModule(modules.length);
  };

  const updateModuleName = (idx, name) => {
    // Don't allow renaming main module
    if (modules[idx].name === "main") return;
    const oldName = modules[idx].name;
    if (oldName === name) return;

    // Update this module's name and sync to all module_call mappings (e.g. in main)
    const newModules = modules.map((mod, i) => {
      if (i === idx) return { ...mod, name };
      return {
        ...mod,
        mappings: mod.mappings.map((m) =>
          m.type === "module_call" && m.moduleName === oldName ? { ...m, moduleName: name } : m
        ),
      };
    });
    setModules(newModules);
  };

  const deleteModule = (idx) => {
    if (modules.length === 1) return;
    const newModules = modules.filter((_, i) => i !== idx);
    setModules(newModules);
    if (activeModule >= newModules.length) setActiveModule(newModules.length - 1);
  };

  const updateModuleMappings = (moduleIdx, newMappings) => {
    const newModules = [...modules];
    newModules[moduleIdx] = { ...newModules[moduleIdx], mappings: newMappings };
    setModules(newModules);
  };

  // CHANGE 2: Add field mapping (old way)
  const addMapping = () => {
    const newMapping = { id: uid(), target: "", source: "", transformation: "direct", type: "field", isNew: true };
    const newMappings = [...mappings, newMapping];
    updateModuleMappings(activeModule, newMappings);
    setExpandedRow(newMappings.length - 1);
  };

  // CHANGE 2: Add module call (new way - add empty row)
  const addModuleCall = () => {
    const newModuleCall = { id: uid(), moduleName: "", type: "module_call", isNew: true };
    const newMappings = [...mappings, newModuleCall];
    updateModuleMappings(activeModule, newMappings);
  };

  const updateMapping = (idx, updates) => {
    const newMappings = [...mappings];
    newMappings[idx] = { ...newMappings[idx], ...updates, isNew: false };
    updateModuleMappings(activeModule, newMappings);
  };

  const deleteMapping = (idx) => {
    const newMappings = mappings.filter((_, i) => i !== idx);
    updateModuleMappings(activeModule, newMappings);
  };

  const openSidebar = (mode, rowIdx, field = null) => {
    setSidebarState({ isOpen: true, mode, rowIdx, field });
  };

  const handleSidebarSelect = (path) => {
    if (sidebarState.rowIdx !== null) {
      if (sidebarState.field) {
        updateMapping(sidebarState.rowIdx, { [sidebarState.field]: path });
      } else {
        const key = sidebarState.mode === "target" ? "target" : "source";
        updateMapping(sidebarState.rowIdx, { [key]: path });
      }
    }
    setSidebarState({ ...sidebarState, isOpen: false });
  };

  const autoMap = () => {
    const newMappings = [];
    outputFields.forEach(outField => {
      const similarInput = inputFields.find(inField => 
        inField.path.toLowerCase().replace(/_/g, "") === outField.path.toLowerCase().replace(/_/g, "")
      );
      if (similarInput) {
        newMappings.push({ id: uid(), target: outField.path, source: similarInput.path, transformation: "direct", type: "field", isNew: false });
      }
    });
    updateModuleMappings(activeModule, newMappings);
  };

  const generateCode = () => {
    const lines = [];
    lines.push("#!/usr/bin/env python3");
    lines.push("# GRIZZLY_TEMPLATE_V1");
    lines.push('"""');
    lines.push("Generated by Grizzly");
    lines.push('"""');
    lines.push("");
    
    // Add import re if regex is used
    const hasRegex = modules.some(m => m.mappings.some(map => map.transformation === 'regex'));
    if (hasRegex) {
      lines.push("import re");
      lines.push("");
    }
    
    // STEP 1: Generate helper module functions FIRST (not main)
    modules.forEach((module) => {
      if (module.name === "main" || module.mappings.length === 0) return;
      
      lines.push(`def map_${module.name}(INPUT, OUTPUT):`);
      lines.push(`    """${module.name} mappings"""`);
      
      module.mappings.forEach(m => {
        if (m.type === "module_call") {
          lines.push(`    # Call ${m.moduleName} module`);
          lines.push(`    map_${m.moduleName}(INPUT, OUTPUT)`);
          return;
        }
        
        const Plugin = TRANSFORMATION_PLUGINS[m.transformation];
        if (!Plugin || !m.target) return;
        
        const targetPath = m.target.split(".");
        const code = Plugin.generate(m);
        let assignment = "";
        if (targetPath.length === 1) {
          assignment = `    OUTPUT["${targetPath[0]}"] = ${code}`;
        } else {
          const parts = targetPath.map(p => `["${p}"]`).join("");
          assignment = `    OUTPUT${parts} = ${code}`;
        }
        lines.push(assignment);
      });
      
      lines.push("");
    });
    
    // STEP 2: Generate main transform function LAST
    const mainModule = modules.find(m => m.name === "main");
    if (mainModule) {
      lines.push("def transform(INPUT):");
      lines.push('    """Main transformation"""');
      lines.push("    OUTPUT = {}");
      lines.push("    ");
      
      // Process all mappings in order
      mainModule.mappings.forEach(m => {
        if (m.type === "module_call") {
          // Module calls
          lines.push(`    # Call ${m.moduleName} module`);
          lines.push(`    map_${m.moduleName}(INPUT, OUTPUT)`);
          lines.push("    ");
          return;
        }
        
        // Regular field mappings
        const Plugin = TRANSFORMATION_PLUGINS[m.transformation];
        if (!Plugin || !m.target) return;
        
        const targetPath = m.target.split(".");
        const code = Plugin.generate(m);
        let assignment = "";
        if (targetPath.length === 1) {
          assignment = `    OUTPUT["${targetPath[0]}"] = ${code}`;
        } else {
          const parts = targetPath.map(p => `["${p}"]`).join("");
          assignment = `    OUTPUT${parts} = ${code}`;
        }
        lines.push(assignment);
      });
      
      lines.push("    ");
      lines.push("    return OUTPUT");
    }
    
    return lines.join("\n");
  };

  const downloadCode = () => {
    const code = generateCode();
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transform.py";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-violet-50">
      <header className="bg-white/80 backdrop-blur border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-20 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-blue-600 to-violet-600 p-1.5 rounded-lg text-white"><FileCode size={20} /></div>
          <div><h1 className="font-bold text-sm text-slate-800">Grizzly</h1><p className="text-[10px] text-slate-400">Data Transformation Mapper</p></div>
        </div>
        <div className="flex gap-2">
          {[1,2,3].map(n => (<div key={n} className={`w-6 h-6 rounded-full text-[10px] flex items-center justify-center font-bold transition-all ${step===n ? 'bg-blue-600 text-white scale-110' : 'bg-slate-100 text-slate-400'}`}>{n}</div>))}
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-6 relative">
        {step === 1 && (
          <div className="space-y-6 max-w-5xl mx-auto mt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <UploadZone label="Input Schema" icon={Upload} loaded={!!inputSchema} detail={`${inputFields.length} fields`} accepted=".json" onFile={(f) => handleFile("input", f)} />
              <UploadZone label="Output Schema" icon={Upload} loaded={!!outputSchema} detail={`${outputFields.length} fields`} accepted=".json" onFile={(f) => handleFile("output", f)} />
              <UploadZone label="Template (optional)" icon={FileCode} loaded={templateLoaded} detail={templateInfo} accepted=".py" onFile={(f) => handleFile("template", f)} />
            </div>
            <div className="flex justify-center">
              <button onClick={loadSample} className="text-xs font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1"><Zap size={14}/> Load Sample</button>
            </div>
            {inputSchema && outputSchema && (
              <div className="grid grid-cols-2 gap-6">
                <FieldTree fields={inputFields} title="Input Structure" accent="blue" />
                <FieldTree fields={outputFields} title="Output Structure" accent="emerald" />
              </div>
            )}
            {inputSchema && outputSchema && (
              <div className="flex justify-end pt-4">
                <button onClick={() => setStep(2)} className="bg-blue-600 text-white px-6 py-2 rounded-lg text-sm font-bold shadow hover:bg-blue-700 flex items-center gap-2">Next <ArrowRight size={14}/></button>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="flex gap-6 relative items-start">
            <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col" style={{minHeight: "600px"}}>
              <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h2 className="font-bold text-sm text-slate-700">Mapping Configuration</h2>
                <div className="flex gap-2">
                  <button onClick={autoMap} className="text-xs font-semibold text-violet-600 bg-violet-50 px-3 py-1.5 rounded hover:bg-violet-100 border border-violet-100">Auto-Map</button>
                  <button onClick={addMapping} className="text-xs font-semibold text-white bg-emerald-600 px-3 py-1.5 rounded hover:bg-emerald-700 shadow-sm flex items-center gap-1">
                    <Database size={12}/>
                    Map Element
                  </button>
                  <button onClick={addModuleCall} className="text-xs font-semibold text-white bg-amber-600 px-3 py-1.5 rounded hover:bg-amber-700 shadow-sm flex items-center gap-1">
                    <Phone size={12} className="transform rotate-90"/>
                    Import Module
                  </button>
                </div>
              </div>
              
              <div className="px-4 py-2 border-b border-slate-100 bg-blue-50/30 flex items-center gap-2 overflow-x-auto">
                {modules.map((module, idx) => (
                  <div key={module.id} className="flex items-center gap-1">
                    <button onClick={() => setActiveModule(idx)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeModule === idx ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      <Layers size={14}/>
                      {/* CHANGE 1: Main module name is readonly */}
                      {module.name === "main" ? (
                        <span className="font-mono w-20">main</span>
                      ) : (
                        <input value={module.name} onChange={(e) => updateModuleName(idx, e.target.value)} onClick={(e) => e.stopPropagation()} className="bg-transparent border-none outline-none w-20 font-mono" style={{ color: 'inherit' }}/>
                      )}
                      <span className="text-[10px] opacity-70">({module.mappings.length})</span>
                    </button>
                    {modules.length > 1 && module.name !== "main" && (<button onClick={() => deleteModule(idx)} className="p-1 text-slate-400 hover:text-red-500"><X size={12}/></button>)}
                  </div>
                ))}
                <button onClick={addModule} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md"><Plus size={14}/> Module</button>
              </div>

              <div className="grid grid-cols-[30px_1fr_1fr_110px_40px] gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div></div><div>Target</div><div>Source</div><div>Type</div><div></div>
              </div>
              
              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
                {displayMappings.map(({ m, realIdx }) => {
                  if (m.type === "module_call") {
                    return (
                      <div key={m.id} className="group bg-amber-50/30 hover:bg-amber-50/50 transition-colors">
                        <div className="grid grid-cols-[30px_1fr_1fr_110px_40px] gap-4 px-4 py-3 items-center">
                          <div></div>
                          <div className="text-xs font-mono text-amber-700 flex items-center gap-2">
                            <Phone size={14} className="text-amber-600 transform rotate-90"/>
                            Call module
                          </div>
                          <div className="relative flex-1">
                            <Layers size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-400"/>
                            <input
                              value={m.moduleName ? `map_${m.moduleName}()` : ""}
                              readOnly
                              onClick={() => openSidebar("module", realIdx)}
                              className="w-full pl-8 pr-2.5 py-2 text-xs font-mono font-bold border border-amber-200 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-300 cursor-pointer hover:bg-amber-50 bg-white text-amber-700"
                              placeholder="Click to select module..."
                            />
                          </div>
                          <div className="text-xs text-slate-400">module call</div>
                          <button onClick={() => deleteMapping(realIdx)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    );
                  }
                  const Plugin = TRANSFORMATION_PLUGINS[m.transformation];
                  return (
                    <div key={m.id} className={`group transition-colors ${expandedRow === realIdx ? "bg-slate-50" : "hover:bg-slate-50/40"}`}>
                      <div className="grid grid-cols-[30px_1fr_1fr_110px_40px] gap-4 px-4 py-3 items-center">
                        <button onClick={() => setExpandedRow(expandedRow === realIdx ? null : realIdx)}>
                          {expandedRow === realIdx ? <ChevronDown size={14} className="text-slate-600"/> : <ChevronRight size={14} className="text-slate-300"/>}
                        </button>
                        <input value={m.target} onChange={(e) => updateMapping(realIdx, { target: e.target.value })} onClick={() => openSidebar("target", realIdx)} className="w-full text-xs font-mono border border-transparent hover:border-slate-200 focus:border-blue-400 rounded px-2 py-1 bg-transparent focus:bg-white cursor-pointer transition-all" placeholder="click..."/>
                        <div className="text-[10px] font-mono text-slate-500 truncate px-2 py-1 bg-slate-100/50 rounded border border-slate-100">{Plugin ? Plugin.generate(m) : "Invalid"}</div>
                        <select value={m.transformation} onChange={(e) => updateMapping(realIdx, { transformation: e.target.value })} className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-300 outline-none cursor-pointer">
                          {Object.values(TRANSFORMATION_PLUGINS).map(p => (<option key={p.id} value={p.id}>{p.label}</option>))}
                        </select>
                        <button onClick={() => deleteMapping(realIdx)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
                      </div>
                      {expandedRow === realIdx && Plugin && (
                        <div className="px-12 py-4 bg-slate-50/80 border-t border-slate-100 shadow-inner">
                          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl shadow-sm">
                            <Plugin.Editor mapping={m} onChange={(updates) => updateMapping(realIdx, updates)} onOpenSidebar={(mode, field) => openSidebar(mode, realIdx, field)}/>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {sidebarState.isOpen && (
              sidebarState.mode === "module" ? (
                <ModuleBrowserSidebar
                  modules={modules}
                  activeModule={activeModule}
                  onClose={() => setSidebarState({ ...sidebarState, isOpen: false })}
                  onSelect={(moduleName) => {
                    if (sidebarState.rowIdx !== null) {
                      updateMapping(sidebarState.rowIdx, { moduleName });
                    }
                    setSidebarState({ ...sidebarState, isOpen: false });
                  }}
                  usedModules={modules.flatMap(mod => mod.mappings.filter(m => m.type === "module_call").map(m => m.moduleName)).filter(Boolean)}
                />
              ) : (
                <FieldBrowserSidebar
                  fields={sidebarState.mode === "target" ? outputFields : inputFields}
                  title={sidebarState.mode === "target" ? "Select Target" : "Select Source"}
                  onClose={() => setSidebarState({ ...sidebarState, isOpen: false })}
                  onSelect={handleSidebarSelect}
                  usedFields={modules.flatMap(mod => mod.mappings.filter(m => m.type === "field").map(m => sidebarState.mode === "target" ? m.target : m.source)).filter(Boolean)}
                />
              )
            )}
          </div>
        )}

        {step === 3 && (
          <div className="max-w-6xl mx-auto space-y-6 mt-6">
            
            {/* Change Dashboard */}
            {(() => {
              const changes = originalModules ? calculateChanges() : { added: [], removed: [], modified: [], unchanged: [] };
              const hasChanges = changes.added.length > 0 || changes.removed.length > 0 || changes.modified.length > 0;
              const totalMappings = modules.reduce((sum, mod) => sum + mod.mappings.length, 0);
              
              return (
                <div className="space-y-4">
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-lg font-bold text-slate-800">Mapping Summary</h2>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="text-2xl font-bold text-blue-600">{totalMappings}</div>
                          <div className="text-xs text-slate-500">Total Mappings</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold text-purple-600">{modules.length}</div>
                          <div className="text-xs text-slate-500">Modules</div>
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3">
                      {modules.map(mod => (
                        <div key={mod.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-2 border border-slate-200">
                          <div className="flex items-center gap-2">
                            <Layers size={14} className="text-slate-400"/>
                            <span className="text-sm font-semibold text-slate-700">{mod.name}</span>
                          </div>
                          <span className="text-xs text-slate-500">{mod.mappings.length} mappings</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {hasChanges && (
                    <div>
                      <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                        <ArrowRight size={16} className="text-blue-600"/>
                        Changes from Original Template
                      </h3>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <Plus size={16} className="text-emerald-600"/>
                            <h3 className="font-bold text-sm text-emerald-800">Added ({changes.added.length})</h3>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {changes.added.length === 0 ? (
                              <div className="text-xs text-emerald-600/50 italic">No new mappings</div>
                            ) : (
                              changes.added.map((m, idx) => (
                                <div key={idx} className="text-xs font-mono text-emerald-700 bg-white rounded px-2 py-1.5 border border-emerald-100">
                                  <div className="font-semibold">
                                    {m.type === 'module_call' ? `Call map_${m.moduleName}()` : m.target}
                                  </div>
                                  {m.module !== "main" && <div className="text-[10px] text-emerald-500">Module: {m.module}</div>}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <ArrowRight size={16} className="text-amber-600"/>
                            <h3 className="font-bold text-sm text-amber-800">Modified ({changes.modified.length})</h3>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {changes.modified.length === 0 ? (
                              <div className="text-xs text-amber-600/50 italic">No changes</div>
                            ) : (
                              changes.modified.map((m, idx) => (
                                <div key={idx} className="text-xs bg-white rounded px-2 py-1.5 border border-amber-100">
                                  <div className="font-mono font-semibold text-amber-700">
                                    {m.current.type === 'module_call' ? `Call map_${m.current.moduleName}()` : m.current.target}
                                  </div>
                                  {m.current.module !== "main" && <div className="text-[10px] text-amber-500">Module: {m.current.module}</div>}
                                </div>
                              ))
                            )}
                          </div>
                        </div>

                        <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <X size={16} className="text-rose-600"/>
                            <h3 className="font-bold text-sm text-rose-800">Removed ({changes.removed.length})</h3>
                          </div>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {changes.removed.length === 0 ? (
                              <div className="text-xs text-rose-600/50 italic">Nothing removed</div>
                            ) : (
                              changes.removed.map((m, idx) => (
                                <div key={idx} className="text-xs font-mono text-rose-700 bg-white rounded px-2 py-1.5 border border-rose-100 line-through opacity-75">
                                  <div className="font-semibold">
                                    {m.type === 'module_call' ? `Call map_${m.moduleName}()` : m.target}
                                  </div>
                                  {m.module !== "main" && <div className="text-[10px] text-rose-500">Module: {m.module}</div>}
                                </div>
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {!originalModules && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 size={16} className="text-blue-600"/>
                        <div>
                          <div className="text-sm font-semibold text-blue-900">New Template Created</div>
                          <div className="text-xs text-blue-700 mt-1">
                            You created {totalMappings} mapping{totalMappings !== 1 ? 's' : ''} across {modules.length} module{modules.length !== 1 ? 's' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Code Preview */}
            <div className="bg-slate-900 rounded-xl p-6 relative shadow-2xl">
              <div className="absolute top-4 right-4 flex gap-2">
                <button onClick={() => navigator.clipboard.writeText(generateCode())} className="text-white/50 hover:text-white flex items-center gap-1 text-xs bg-slate-800 px-3 py-1.5 rounded"><Copy size={12}/> Copy</button>
                <button onClick={downloadCode} className="text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1 text-xs px-3 py-1.5 rounded"><Download size={12}/> Download</button>
              </div>
              <pre className="font-mono text-emerald-400 text-xs leading-relaxed overflow-x-auto pt-8">{generateCode()}</pre>
            </div>
            <button onClick={() => setStep(2)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft size={14}/> Back</button>
          </div>
        )}

        {step === 2 && (
          <div className="fixed bottom-6 left-0 right-0 flex justify-center pointer-events-none z-30">
            <div className="bg-white/90 backdrop-blur border border-slate-200 shadow-xl rounded-full px-6 py-2 flex gap-4 pointer-events-auto">
              <button onClick={() => setStep(1)} className="text-xs font-semibold text-slate-500 hover:text-slate-800">Back</button>
              <div className="w-px bg-slate-200"></div>
              <button onClick={() => setStep(3)} className="text-xs font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1">Export <ArrowRight size={12}/></button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
