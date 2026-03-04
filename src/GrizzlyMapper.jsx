import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown, ChevronRight, Plus, Trash2, Move, Code, Search, File, Folder, Database, X, Upload, FileCode, ArrowRight, ArrowLeft, Download, Layers } from 'lucide-react';

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

const parseTemplate = (pythonCode) => {
  const lines = pythonCode.split('\n');
  const modules = [];
  let currentModule = null;
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (trimmed.match(/^def transform\(INPUT\):/)) {
      currentModule = { id: uid(), name: 'main', mappings: [] };
      modules.push(currentModule);
      return;
    }
    const mapDef = trimmed.match(/^def map_(\w+)\(INPUT, OUTPUT\):/);
    if (mapDef) {
      currentModule = { id: uid(), name: mapDef[1], mappings: [] };
      modules.push(currentModule);
      return;
    }
    if (trimmed.startsWith('def ') && !trimmed.match(/^def (transform|map_\w+)\(/)) {
      currentModule = null;
      return;
    }
    if (!currentModule) return;
    const moduleCallMatch = trimmed.match(/^map_(\w+)\(INPUT, OUTPUT\)/);
    if (moduleCallMatch) {
      currentModule.mappings.push({ id: uid(), type: 'module_call', moduleName: moduleCallMatch[1] });
      return;
    }
    const assignMatch = trimmed.match(/OUTPUT\["([^"]+)"\]\s*=\s*(.+)/);
    if (assignMatch) {
      currentModule.mappings.push({ id: uid(), type: 'assignment', target: assignMatch[1], expression: (assignMatch[2] || '').replace(/^INPUT\./i, 'input.').trim() });
    }
  });
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
  if (item.type === 'module_call') return JSON.stringify({ ...base, moduleName: item.moduleName });
  if (item.type === 'if') return JSON.stringify({ ...base, condition: item.condition });
  if (item.type === 'for') return JSON.stringify({ ...base, iterator: item.iterator, iterable: item.iterable });
  return JSON.stringify(base);
};

// Describe a mapping item in one line for dashboard
const describeItem = (item) => {
  if (!item) return '';
  if (item.type === 'assignment') return `${item.target || '?'} ← ${(item.expression || '').slice(0, 40)}${(item.expression || '').length > 40 ? '…' : ''}`;
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

  // Expand both schema trees (call when entering step 2)
  const expandBothTrees = () => {
    setExpandedNodes(getAllExpandedIds(inputSchema, outputSchema));
  };

  // When step becomes 2, expand trees (ensures expansion after mount)
  useEffect(() => {
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
      const suggestions = pathSource.filter(p =>
        p.path.toLowerCase().includes(lastWord.toLowerCase())
      ).slice(0, 10);

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
    const nodeId = `${isInput ? 'input' : 'output'}-${path}`;
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
            className="flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
            onClick={() => toggleNode(nodeId)}
          >
            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Folder className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-medium">{name}</span>
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
      return (
        <div
          key={nodeId}
          draggable
          onDragStart={handleDragStart}
          onDoubleClick={handleDoubleClick}
          className={`flex items-center gap-2 p-2 hover:bg-gray-100 rounded cursor-move ${
            selectedInput && 
            ((selectedInput.field === 'target' && !isInput) || 
             (selectedInput.field === 'expression' && isInput) ||
             (selectedInput.field === 'condition') ||
             (selectedInput.field === 'iterable' && isInput))
            ? 'bg-blue-50' : ''
          }`}
          title="Double-click to insert into selected field"
        >
          <File className="w-4 h-4 text-slate-600" />
          <span className="text-sm">{name}</span>
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
      if (item.id === parentId) {
        return {
          ...item,
          children: [...(item.children || []), newItem]
        };
      }
      if (item.children) {
        return {
          ...item,
          children: addToParent(item.children, parentId, newItem)
        };
      }
      if (item.elifBlocks) {
        return {
          ...item,
          elifBlocks: item.elifBlocks.map(elif => ({
            ...elif,
            children: addToParent(elif.children, parentId, newItem)
          }))
        };
      }
      if (item.elseBlock) {
        return {
          ...item,
          elseBlock: {
            ...item.elseBlock,
            children: addToParent(item.elseBlock.children || [], parentId, newItem)
          }
        };
      }
      return item;
    });
  };

  const deleteItem = (id) => {
    const deleteFromParent = (items, targetId) => {
      return items.map(item => {
        if (item.children) {
          return {
            ...item,
            children: item.children.filter(child => child.id !== targetId)
              .map(child => deleteFromParent([child], targetId)[0])
          };
        }
        if (item.elifBlocks) {
          return {
            ...item,
            elifBlocks: item.elifBlocks.map(elif => ({
              ...elif,
              children: elif.children.filter(child => child.id !== targetId)
                .map(child => deleteFromParent([child], targetId)[0])
            }))
          };
        }
        if (item.elseBlock) {
          return {
            ...item,
            elseBlock: {
              ...item.elseBlock,
              children: (item.elseBlock.children || []).filter(child => child.id !== targetId)
                .map(child => deleteFromParent([child], targetId)[0])
            }
          };
        }
        return item;
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
    const updateInItems = (items) => {
      return items.map(item => {
        if (item.id === ifBlockId && item.type === 'if') {
          return {
            ...item,
            elseBlock: { id: generateId(), children: [] }
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

    if (item.type === 'assignment') {
      const handleTargetDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
          if (dragData && !dragData.isInput) {
            updateItem(item.id, 'target', dragData.path);
          }
        } catch (err) {
          console.error('Error parsing drag data:', err);
        }
      };

      const handleExpressionDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          const dragData = JSON.parse(e.dataTransfer.getData('application/json'));
          if (dragData && dragData.isInput) {
            const currentValue = item.expression;
            const newValue = currentValue ? `${currentValue} + ${dragData.path}` : dragData.path;
            updateItem(item.id, 'expression', newValue);
          }
        } catch (err) {
          console.error('Error parsing drag data:', err);
        }
      };

      return (
        <div
          key={item.id}
          className="group hover:bg-blue-50 rounded-lg transition-colors"
          style={{ marginLeft: `${indentWidth}px` }}
        >
          <div className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg bg-white">
            <Move className="w-4 h-4 text-gray-400 cursor-move" />
            <div className="flex-1 grid grid-cols-2 gap-3">
              <div
                onDrop={handleTargetDrop}
                onDragOver={handleDragOver}
                className="relative"
              >
                <input
                  type="text"
                  placeholder="Target (Output schema)"
                  value={item.target}
                  onFocus={(e) => handleInputFocus(e, item.id, 'target')}
                  onChange={(e) => handleInputChange(e, item.id, 'target')}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:border-gray-400 text-sm ${
                    selectedInput?.id === item.id && selectedInput?.field === 'target'
                      ? 'border-blue-500 bg-yellow-100'
                      : 'border-gray-300 bg-yellow-50'
                  }`}
                />
              </div>
              <div
                onDrop={handleExpressionDrop}
                onDragOver={handleDragOver}
                className="relative"
              >
                <input
                  type="text"
                  placeholder="Expression (Input schema)"
                  value={item.expression}
                  onFocus={(e) => handleInputFocus(e, item.id, 'expression')}
                  onChange={(e) => handleInputChange(e, item.id, 'expression')}
                  className={`w-full px-3 py-2 border rounded focus:outline-none focus:border-gray-400 text-sm font-mono ${
                    selectedInput?.id === item.id && selectedInput?.field === 'expression'
                      ? 'border-blue-500 bg-green-100'
                      : 'border-gray-300 bg-green-50'
                  }`}
                />
              </div>
            </div>
            <button
              onClick={() => deleteItem(item.id)}
              className="p-2 text-red-600 hover:bg-red-50 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      );
    }

    if (item.type === 'if') {
      return (
        <div
          key={item.id}
          className="my-2"
          style={{ marginLeft: `${indentWidth}px` }}
        >
          <div className="border-l-4 border-purple-400 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 p-3 bg-purple-100 rounded-t-lg">
              <button onClick={() => toggleBlock(item.id)} className="p-1">
                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
              <span className="font-semibold text-purple-900 text-sm">IF</span>
              <input
                type="text"
                placeholder="Condition (e.g., input.age >= 18)"
                value={item.condition}
                onFocus={(e) => handleInputFocus(e, item.id, 'condition')}
                onChange={(e) => handleInputChange(e, item.id, 'condition')}
                className={`flex-1 px-3 py-2 border rounded focus:outline-none focus:border-gray-400 text-sm font-mono ${
                  selectedInput?.id === item.id && selectedInput?.field === 'condition'
                    ? 'border-purple-500 bg-purple-200'
                    : 'border-purple-300 bg-white'
                }`}
              />
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
                  <button
                    onClick={() => addItem(item.id, 'assignment')}
                    className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded hover:bg-purple-50 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Assignment
                  </button>
                  <button
                    onClick={() => addItem(item.id, 'if')}
                    className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded hover:bg-purple-50 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> If
                  </button>
                  <button
                    onClick={() => addItem(item.id, 'for')}
                    className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded hover:bg-purple-50 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> For
                  </button>
                </div>

                {item.elifBlocks?.map((elif, elifIdx) => (
                  <div key={elif.id} className="border-l-4 border-indigo-400 bg-indigo-50 rounded-lg mt-2">
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
                        className={`flex-1 px-3 py-2 border rounded focus:outline-none focus:border-gray-400 text-sm font-mono ${
                          selectedInput?.id === elif.id && selectedInput?.field === 'condition'
                            ? 'border-indigo-500 bg-indigo-200'
                            : 'border-indigo-300 bg-white'
                        }`}
                      />
                    </div>
                    {expandedBlocks.has(elif.id) && (
                      <div className="p-3 space-y-2">
                        {elif.children?.map((child, idx) => renderItem(child, depth + 2, elif.id, idx))}
                        <div className="flex gap-2 mt-2" style={{ marginLeft: `${24}px` }}>
                          <button
                            onClick={() => addItem(elif.id, 'assignment')}
                            className="px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 text-xs flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Assignment
                          </button>
                          <button
                            onClick={() => addItem(elif.id, 'if')}
                            className="px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 text-xs flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> If
                          </button>
                          <button
                            onClick={() => addItem(elif.id, 'for')}
                            className="px-3 py-1.5 bg-white border border-indigo-300 text-indigo-700 rounded hover:bg-indigo-50 text-xs flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> For
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {item.elseBlock && (
                  <div className="border-l-4 border-pink-400 bg-pink-50 rounded-lg mt-2">
                    <div className="flex items-center gap-2 p-3 bg-pink-100 rounded-t-lg">
                      <button onClick={() => toggleBlock(item.elseBlock.id)} className="p-1">
                        {expandedBlocks.has(item.elseBlock.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                      </button>
                      <span className="font-semibold text-pink-900 text-sm">ELSE</span>
                    </div>
                    {expandedBlocks.has(item.elseBlock.id) && (
                      <div className="p-3 space-y-2">
                        {item.elseBlock.children?.map((child, idx) => renderItem(child, depth + 2, item.elseBlock.id, idx))}
                        <div className="flex gap-2 mt-2" style={{ marginLeft: `${24}px` }}>
                          <button
                            onClick={() => addItem(item.elseBlock.id, 'assignment')}
                            className="px-3 py-1.5 bg-white border border-pink-300 text-pink-700 rounded hover:bg-pink-50 text-xs flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Assignment
                          </button>
                          <button
                            onClick={() => addItem(item.elseBlock.id, 'if')}
                            className="px-3 py-1.5 bg-white border border-pink-300 text-pink-700 rounded hover:bg-pink-50 text-xs flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> If
                          </button>
                          <button
                            onClick={() => addItem(item.elseBlock.id, 'for')}
                            className="px-3 py-1.5 bg-white border border-pink-300 text-pink-700 rounded hover:bg-pink-50 text-xs flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> For
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  <button
                    onClick={() => addElif(item.id)}
                    className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-xs"
                  >
                    + Add ELIF
                  </button>
                  {!item.elseBlock && (
                    <button
                      onClick={() => addElse(item.id)}
                      className="px-3 py-1.5 bg-pink-600 text-white rounded hover:bg-pink-700 text-xs"
                    >
                      + Add ELSE
                    </button>
                  )}
                </div>
              </div>
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
              <input
                type="text"
                placeholder="Iterable (e.g., input.items)"
                value={item.iterable}
                onFocus={(e) => handleInputFocus(e, item.id, 'iterable')}
                onChange={(e) => handleInputChange(e, item.id, 'iterable')}
                className={`flex-1 px-3 py-2 border rounded focus:outline-none focus:border-gray-400 text-sm font-mono ${
                  selectedInput?.id === item.id && selectedInput?.field === 'iterable'
                    ? 'border-green-500 bg-green-200'
                    : 'border-green-300 bg-white'
                }`}
              />
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
                  <button
                    onClick={() => addItem(item.id, 'assignment')}
                    className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded hover:bg-green-50 text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> Assignment
                  </button>
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
    const emitLines = (items, indent) => {
      const pre = '    '.repeat(indent);
      (items || []).forEach(m => {
        if (m.type === 'module_call' && m.moduleName) {
          lines.push(`${pre}map_${m.moduleName}(INPUT, OUTPUT)`);
          return;
        }
        if (m.type === 'assignment' && m.target) {
          const expr = m.expression || '';
          lines.push(`${pre}OUTPUT["${m.target}"] = ${expr}`);
          return;
        }
        if (m.type === 'if') {
          lines.push(`${pre}if ${m.condition || 'False'}:`);
          emitLines(m.children, indent + 1);
          (m.elifBlocks || []).forEach(eb => {
            lines.push(`${pre}elif ${eb.condition || 'False'}:`);
            emitLines(eb.children, indent + 1);
          });
          if (m.elseBlock) {
            lines.push(`${pre}else:`);
            emitLines(m.elseBlock.children, indent + 1);
          }
          return;
        }
        if (m.type === 'for') {
          lines.push(`${pre}for ${m.iterator || 'item'} in ${m.iterable || ''}:`);
          emitLines(m.children, indent + 1);
        }
      });
    };
    lines.push('#!/usr/bin/env python3');
    lines.push('# GRIZZLY_TEMPLATE_V1');
    lines.push('"""Generated by Grizzly"""');
    lines.push('');
    modules.filter(m => m.name !== 'main' && m.mappings.length > 0).forEach(mod => {
      lines.push(`def map_${mod.name}(INPUT, OUTPUT):`);
      lines.push(`    """${mod.name}"""`);
      emitLines(mod.mappings, 1);
      lines.push('');
    });
    const main = modules.find(m => m.name === 'main');
    if (main) {
      lines.push('def transform(INPUT):');
      lines.push('    """Main"""');
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
          {[1, 2, 3, 4].map(n => (
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
                    <button
                      type="button"
                      onClick={() => setActiveModule(idx)}
                      className={`px-2.5 py-1 rounded text-xs font-medium ${activeModule === idx ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {mod.name === 'main' ? 'main' : mod.name}
                    </button>
                    {modules.length > 1 && mod.name !== 'main' && (
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
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-xl font-bold text-slate-800 mb-4">Step 3: Review changes</h1>
          <p className="text-sm text-slate-600 mb-6">Summary of mappings added, deleted, or changed since you started editing.</p>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="text-2xl font-bold text-emerald-700">{mappingChanges.added.length}</div>
              <div className="text-sm text-emerald-600">Added</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="text-2xl font-bold text-red-700">{mappingChanges.deleted.length}</div>
              <div className="text-sm text-red-600">Deleted</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="text-2xl font-bold text-amber-700">{mappingChanges.changed.length}</div>
              <div className="text-sm text-amber-600">Changed</div>
            </div>
          </div>

          <div className="space-y-6 mb-6">
            {mappingChanges.added.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Added mappings
                </h2>
                <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {mappingChanges.added.map(({ moduleName, item }) => (
                    <li key={item.id} className="px-4 py-2 text-sm flex items-center gap-2">
                      <span className="text-slate-500 font-medium shrink-0">[{moduleName}]</span>
                      <span className="font-mono text-slate-800">{describeItem(item)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {mappingChanges.deleted.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500" /> Deleted mappings
                </h2>
                <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {mappingChanges.deleted.map(({ moduleName, item }) => (
                    <li key={item.id} className="px-4 py-2 text-sm flex items-center gap-2 text-slate-600">
                      <span className="text-slate-500 font-medium shrink-0">[{moduleName}]</span>
                      <span className="font-mono line-through">{describeItem(item)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {mappingChanges.changed.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Changed mappings
                </h2>
                <ul className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {mappingChanges.changed.map(({ after }) => (
                    <li key={after.item.id} className="px-4 py-2 text-sm">
                      <span className="text-slate-500 font-medium">[{after.moduleName}]</span>
                      <span className="font-mono text-slate-800">{describeItem(after.item)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {mappingChanges.added.length === 0 && mappingChanges.deleted.length === 0 && mappingChanges.changed.length === 0 && (
              <p className="text-slate-500 text-sm py-4">No mapping changes since you started. Add, remove, or edit mappings in Step 2 and return here to see the summary.</p>
            )}
          </div>

          <div className="flex gap-4">
            <button onClick={() => { expandBothTrees(); setStep(2); }} className="px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-2 text-slate-700">
              <ArrowLeft className="w-4 h-4" /> Back to mapping
            </button>
            <button onClick={() => setStep(4)} className="px-4 py-2 bg-slate-700 text-white rounded-lg flex items-center gap-2">
              <Code className="w-4 h-4" /> Continue to generate
            </button>
          </div>
        </div>
      )}

      {step === 4 && (
        <div className="max-w-4xl mx-auto p-6">
          <h1 className="text-xl font-bold text-slate-800 mb-4">Step 4: Export</h1>
          <pre className="bg-slate-100 p-4 rounded-lg text-xs overflow-auto max-h-96 mb-4 font-mono whitespace-pre">{generateCode()}</pre>
          <div className="flex gap-4">
            <button onClick={() => setStep(3)} className="px-4 py-2 border border-slate-300 rounded-lg flex items-center gap-2 text-slate-700">
              <ArrowLeft className="w-4 h-4" /> Back
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