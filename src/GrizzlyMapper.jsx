import { useState, useRef } from "react";
import { Upload, FileCode, ArrowRight, ArrowLeft, Trash2, Zap, Download, ChevronDown, ChevronRight, CheckCircle2, Copy, X, Search, Database, Type, Layers, Plus } from "lucide-react";

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
    const moduleCallMatch = trimmed.match(/map_(\w+)\(INPUT, OUTPUT\)/);
    if (moduleCallMatch) {
      const prevLine = lines[idx - 1]?.trim();
      const targetMatch = prevLine?.match(/# (.+) → use (\w+) module/);
      if (targetMatch) {
        currentModule.mappings.push({
          id: uid(),
          target: targetMatch[1],
          source: moduleCallMatch[1],
          isModule: true,
          transformation: "direct",
          isNew: false
        });
        totalMappings++;
      }
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
        isNew: false
      });
      totalMappings++;
      return;
    }

    // Parse nested assignment: OUTPUT["a"]["b"]["c"] = INPUT.source.path
    const nestedMatch = trimmed.match(/OUTPUT(\["[^"]+"\])+\s*=\s*INPUT\.([\w.]+?)(?:\.(\w+)\(\))?$/);
    if (nestedMatch) {
      // Extract all the path parts from OUTPUT["a"]["b"]["c"]
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
    <label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Source Field or Module</label>
    <div className="relative flex-1">
      <Database size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
      <input 
        value={mapping.source || ""} 
        onChange={(e) => onChange({ source: e.target.value })} 
        onClick={() => onOpenSidebar("source")} 
        className="w-full pl-8 pr-2.5 py-2 text-xs font-mono border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300 cursor-pointer hover:bg-blue-50" 
        placeholder="Click to select field or module..."
      />
    </div>
    {mapping.isModule && (
      <div className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
        📦 Using module: {mapping.source}
      </div>
    )}
    {!mapping.isModule && (
      <>
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
      </>
    )}
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

const TRANSFORMATION_PLUGINS = {
  direct: { 
    id: "direct", 
    label: "Direct", 
    Editor: DirectEditor, 
    generate: (m) => { 
      if (m.isModule) return `→ ${m.source} module`;
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

const FieldBrowserSidebar = ({ fields, modules, activeModule, title, mode, onClose, onSelect, onSelectModule }) => {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("fields");
  const filtered = fields.filter(f => f.path.toLowerCase().includes(search.toLowerCase()));
  const availableModules = modules.filter((m, idx) => idx !== activeModule && m.name !== "main");
  
  return (
    <div className="w-80 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden flex flex-col" style={{maxHeight: "600px"}}>
      <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
        <h3 className="font-bold text-sm text-slate-700">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X size={16}/></button>
      </div>
      {mode === "source" && availableModules.length > 0 && (
        <div className="flex border-b border-slate-200">
          <button onClick={() => setTab("fields")} className={`flex-1 px-4 py-2 text-xs font-semibold ${tab === "fields" ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:bg-slate-50"}`}>Fields</button>
          <button onClick={() => setTab("modules")} className={`flex-1 px-4 py-2 text-xs font-semibold ${tab === "modules" ? "bg-blue-50 text-blue-600 border-b-2 border-blue-600" : "text-slate-500 hover:bg-slate-50"}`}>Modules</button>
        </div>
      )}
      <div className="p-3 border-b border-slate-100">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${tab}...`} className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-300"/>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {tab === "fields" ? (
          filtered.map(f => (
            <button key={f.path} onClick={() => onSelect(f.path)} className="w-full text-left px-3 py-2 text-xs font-mono hover:bg-blue-50 rounded-md text-slate-600 hover:text-blue-600 transition-colors flex items-center gap-2">
              {f.type === "object" ? <Type size={12} className="text-slate-400"/> : <Database size={12} className="text-blue-400"/>}
              <span className="flex-1">{f.path}</span>
              <span className="text-[9px] text-slate-300">{f.type !== "object" && f.type}</span>
            </button>
          ))
        ) : (
          availableModules.filter(m => m.name.toLowerCase().includes(search.toLowerCase())).map(m => (
            <button key={m.id} onClick={() => onSelectModule(m.name)} className="w-full text-left px-3 py-2 text-xs hover:bg-amber-50 rounded-md text-slate-700 hover:text-amber-700 transition-colors flex items-center gap-2 border border-transparent hover:border-amber-200">
              <Layers size={14} className="text-amber-600"/>
              <div className="flex-1">
                <div className="font-semibold">{m.name}</div>
                <div className="text-[10px] text-slate-400">{m.mappings.length} mappings</div>
              </div>
            </button>
          ))
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
  const [originalModules, setOriginalModules] = useState(null); // Track original state for diff

  const mappings = modules[activeModule]?.mappings || [];

  // Calculate changes for dashboard
  const calculateChanges = () => {
    if (!originalModules) return { added: [], removed: [], modified: [], unchanged: [] };
    
    const changes = { added: [], removed: [], modified: [], unchanged: [] };
    const currentFlat = {};
    const originalFlat = {};
    
    // Flatten current modules
    modules.forEach(mod => {
      mod.mappings.forEach(m => {
        const key = `${mod.name}:${m.target}`;
        currentFlat[key] = { module: mod.name, ...m };
      });
    });
    
    // Flatten original modules
    originalModules.forEach(mod => {
      mod.mappings.forEach(m => {
        const key = `${mod.name}:${m.target}`;
        originalFlat[key] = { module: mod.name, ...m };
      });
    });
    
    // Find added and modified
    Object.keys(currentFlat).forEach(key => {
      if (!originalFlat[key]) {
        changes.added.push(currentFlat[key]);
      } else {
        const curr = currentFlat[key];
        const orig = originalFlat[key];
        if (curr.source !== orig.source || curr.transformation !== orig.transformation || 
            curr.transform !== orig.transform || curr.isModule !== orig.isModule) {
          changes.modified.push({ current: curr, original: orig });
        } else {
          changes.unchanged.push(curr);
        }
      }
    });
    
    // Find removed
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
            setOriginalModules(JSON.parse(JSON.stringify(parsed.modules))); // Deep copy
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
    const newModules = [...modules];
    newModules[idx] = { ...newModules[idx], name };
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

  const addMapping = () => {
    const newMapping = { id: uid(), target: "", source: "", transformation: "direct", isNew: true };
    const newMappings = [...mappings, newMapping];
    updateModuleMappings(activeModule, newMappings);
    setExpandedRow(newMappings.length - 1);
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
        updateMapping(sidebarState.rowIdx, { [sidebarState.field]: path, isModule: false });
      } else {
        const key = sidebarState.mode === "target" ? "target" : "source";
        updateMapping(sidebarState.rowIdx, { [key]: path, isModule: false });
      }
    }
    setSidebarState({ ...sidebarState, isOpen: false });
  };

  const handleModuleSelect = (moduleName) => {
    if (sidebarState.rowIdx !== null) {
      if (sidebarState.field) {
        updateMapping(sidebarState.rowIdx, { [sidebarState.field]: moduleName, isModule: true });
      } else {
        const key = sidebarState.mode === "target" ? "target" : "source";
        updateMapping(sidebarState.rowIdx, { [key]: moduleName, isModule: true });
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
        newMappings.push({ id: uid(), target: outField.path, source: similarInput.path, transformation: "direct", isNew: false });
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
    
    modules.forEach((module) => {
      if (module.mappings.length === 0) return;
      
      if (module.name === "main") {
        lines.push("def transform(INPUT):");
        lines.push('    """Main transformation"""');
        lines.push("    OUTPUT = {}");
        lines.push("    ");
      } else {
        lines.push(`def map_${module.name}(INPUT, OUTPUT):`);
        lines.push(`    """${module.name} mappings"""`);
        lines.push("    ");
      }
      
      module.mappings.forEach(m => {
        const Plugin = TRANSFORMATION_PLUGINS[m.transformation];
        if (!Plugin || !m.target) return;
        
        if (m.isModule && m.source) {
          lines.push(`    # ${m.target} → use ${m.source} module`);
          lines.push(`    map_${m.source}(INPUT, OUTPUT)`);
          return;
        }
        
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
      
      if (module.name === "main") {
        lines.push("    ");
        lines.push("    return OUTPUT");
      }
      lines.push("");
    });
    
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
                  <button onClick={addMapping} className="text-xs font-semibold text-white bg-emerald-600 px-3 py-1.5 rounded hover:bg-emerald-700 shadow-sm">+ Add Field</button>
                </div>
              </div>
              
              <div className="px-4 py-2 border-b border-slate-100 bg-blue-50/30 flex items-center gap-2 overflow-x-auto">
                {modules.map((module, idx) => (
                  <div key={module.id} className="flex items-center gap-1">
                    <button onClick={() => setActiveModule(idx)} className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${activeModule === idx ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      <Layers size={14}/>
                      <input value={module.name} onChange={(e) => updateModuleName(idx, e.target.value)} onClick={(e) => e.stopPropagation()} className="bg-transparent border-none outline-none w-20 font-mono" style={{ color: 'inherit' }}/>
                      <span className="text-[10px] opacity-70">({module.mappings.length})</span>
                    </button>
                    {modules.length > 1 && (<button onClick={() => deleteModule(idx)} className="p-1 text-slate-400 hover:text-red-500"><X size={12}/></button>)}
                  </div>
                ))}
                <button onClick={addModule} className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-md"><Plus size={14}/> Module</button>
              </div>

              <div className="grid grid-cols-[30px_1fr_1fr_110px_40px] gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <div></div><div>Target</div><div>Source / Module</div><div>Type</div><div></div>
              </div>
              
              <div className="divide-y divide-slate-100 flex-1 overflow-y-auto">
                {mappings.map((m, idx) => {
                  const Plugin = TRANSFORMATION_PLUGINS[m.transformation];
                  return (
                    <div key={m.id} className={`group transition-colors ${expandedRow === idx ? "bg-slate-50" : "hover:bg-slate-50/40"}`}>
                      <div className="grid grid-cols-[30px_1fr_1fr_110px_40px] gap-4 px-4 py-3 items-center">
                        <button onClick={() => setExpandedRow(expandedRow === idx ? null : idx)}>
                          {expandedRow === idx ? <ChevronDown size={14} className="text-slate-600"/> : <ChevronRight size={14} className="text-slate-300"/>}
                        </button>
                        <input value={m.target} onChange={(e) => updateMapping(idx, { target: e.target.value })} onClick={() => openSidebar("target", idx)} className="w-full text-xs font-mono border border-transparent hover:border-slate-200 focus:border-blue-400 rounded px-2 py-1 bg-transparent focus:bg-white cursor-pointer transition-all" placeholder="click..."/>
                        <div className="text-[10px] font-mono text-slate-500 truncate px-2 py-1 bg-slate-100/50 rounded border border-slate-100">{Plugin ? Plugin.generate(m) : "Invalid"}</div>
                        <select value={m.transformation} onChange={(e) => updateMapping(idx, { transformation: e.target.value })} className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:ring-1 focus:ring-blue-300 outline-none cursor-pointer">
                          {Object.values(TRANSFORMATION_PLUGINS).map(p => (<option key={p.id} value={p.id}>{p.label}</option>))}
                        </select>
                        <button onClick={() => deleteMapping(idx)} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 size={14} /></button>
                      </div>
                      {expandedRow === idx && Plugin && (
                        <div className="px-12 py-4 bg-slate-50/80 border-t border-slate-100 shadow-inner">
                          <div className="bg-white border border-slate-200 rounded-lg p-5 max-w-3xl shadow-sm">
                            <Plugin.Editor mapping={m} onChange={(updates) => updateMapping(idx, updates)} onOpenSidebar={(mode, field) => openSidebar(mode, idx, field)}/>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            
            {sidebarState.isOpen && (
              <FieldBrowserSidebar 
                fields={sidebarState.mode === "target" ? outputFields : inputFields}
                modules={modules}
                activeModule={activeModule}
                title={sidebarState.mode === "target" ? "Select Target" : "Select Source or Module"}
                mode={sidebarState.mode}
                onClose={() => setSidebarState({ ...sidebarState, isOpen: false })}
                onSelect={handleSidebarSelect}
                onSelectModule={handleModuleSelect}
              />
            )}
          </div>
        )}

        {step === 3 && (
          <div className="max-w-6xl mx-auto space-y-6 mt-6">
            
            {/* Change Dashboard */}
            {originalModules && (() => {
              const changes = calculateChanges();
              const hasChanges = changes.added.length > 0 || changes.removed.length > 0 || changes.modified.length > 0;
              
              return hasChanges && (
                <div className="grid grid-cols-3 gap-4 mb-6">
                  {/* Added */}
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <Plus size={16} className="text-emerald-600"/>
                      <h3 className="font-bold text-sm text-emerald-800">Added ({changes.added.length})</h3>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {changes.added.map((m, idx) => (
                        <div key={idx} className="text-xs font-mono text-emerald-700 bg-white rounded px-2 py-1">
                          {m.module !== "main" && <span className="text-emerald-500">[{m.module}]</span>} {m.target}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Modified */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowRight size={16} className="text-amber-600"/>
                      <h3 className="font-bold text-sm text-amber-800">Modified ({changes.modified.length})</h3>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {changes.modified.map((m, idx) => (
                        <div key={idx} className="text-xs bg-white rounded px-2 py-1">
                          <div className="font-mono text-amber-700">
                            {m.current.module !== "main" && <span className="text-amber-500">[{m.current.module}]</span>} {m.current.target}
                          </div>
                          <div className="text-[10px] text-amber-600 flex items-center gap-1 mt-0.5">
                            <span className="line-through">{m.original.source}</span>
                            <ArrowRight size={10}/>
                            <span>{m.current.source}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Removed */}
                  <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <X size={16} className="text-rose-600"/>
                      <h3 className="font-bold text-sm text-rose-800">Removed ({changes.removed.length})</h3>
                    </div>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {changes.removed.map((m, idx) => (
                        <div key={idx} className="text-xs font-mono text-rose-700 bg-white rounded px-2 py-1 line-through">
                          {m.module !== "main" && <span className="text-rose-500">[{m.module}]</span>} {m.target}
                        </div>
                      ))}
                    </div>
                  </div>
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
