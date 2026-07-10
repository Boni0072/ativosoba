import { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowRight, Link2, Download, Plus, Trash2, Upload, Columns3, FileSpreadsheet, Database, CheckCircle2, XCircle, AlertTriangle, RotateCcw, Settings2, Sigma, Search, Save } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ───────────────────────────────────────────────────────────────────

type AggType = 'real' | 'sum' | 'max' | 'min' | 'avg' | 'count' | 'unit' | 'text' | 'date';

interface DataSource {
  id: string;
  name: string;
  data: any[];
  columns: string[];
}

interface ColumnMapping {
  col: string;
  agg: AggType;
}

interface Relationship {
  id: string;
  sourceTableId: string;
  sourceColumn: string;
  targetTableId: string;
  targetColumn: string;
  type: 'inner' | 'left' | 'right' | 'outer';
  /** Which source columns to carry forward, with aggregation */
  sourceColumns: ColumnMapping[];
  /** Which target columns to carry forward, with aggregation */
  targetColumns: ColumnMapping[];
}

export interface ReconciliationResult {
  mergedRows: any[];
  discrepancies: {
    rowIndex: number;
    sourceColumn: string;
    sourceValue: any;
    targetColumn: string;
    targetValue: any;
    difference: number;
  }[];
  sourceColumns: string[];
  targetColumns: string[];
  matchedCount: number;
  unmatchedSource: number;
  unmatchedTarget: number;
  sourceName: string;
  targetName: string;
  allResultColumns: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const generateId = () => Math.random().toString(36).substring(2, 10);
const generateRelId = () => `rel_${Math.random().toString(36).substring(2, 10)}`;

const normalizeValue = (val: any): string => String(val ?? '').trim().toLowerCase();

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const tryParseNumber = (val: any): number | null => {
  if (val === null || val === undefined || val === '') return null;
  const cleaned = String(val).replace(/[R$\s.]/g, '').replace(',', '.');
  const num = Number(cleaned);
  return isNaN(num) ? null : num;
};

const aggLabels: Record<AggType, string> = {
  real: 'Valor Real',
  sum: 'Soma',
  max: 'Máximo',
  min: 'Mínimo',
  avg: 'Média',
  count: 'Contagem',
  unit: 'Valor Unitário',
  text: 'Texto',
  date: 'Data',
};

const aggIcons: Record<AggType, string> = {
  real: '📋',
  sum: '∑',
  max: '⬆',
  min: '⬇',
  avg: '∅',
  count: '#',
  unit: '🔹',
  text: '📝',
  date: '📅',
};

function applyAggregation(values: any[], agg: AggType): any {
  if (agg === 'text') {
    return String(values[0] ?? '');
  }
  if (agg === 'date') {
    const d = new Date(values[0]);
    if (isNaN(d.getTime())) {
      return values[0] ?? '';
    }
    return d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  }

  const nums = values.map(v => tryParseNumber(v)).filter(v => v !== null) as number[];
  if (nums.length === 0 && agg !== 'real') {
    if (agg === 'count') return 0;
    return values[0] ?? '';
  }

  switch (agg) {
    case 'real': return values[0];
    case 'sum': return nums.reduce((a, b) => a + b, 0);
    case 'max': return Math.max(...nums);
    case 'min': return Math.min(...nums);
    case 'avg': return nums.reduce((a, b) => a + b, 0) / nums.length;
    case 'count': return nums.length;
    case 'unit': return nums.length > 0 ? nums[0] / nums.length : nums[0];
    default: return values[0];
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ReconciliationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveResult: (result: ReconciliationResult) => void;
  contextData?: { name: string; data: any[]; columns: string[] };
}

export default function ReconciliationModal({ open, onOpenChange, contextData, onSaveResult }: ReconciliationModalProps) {
  const [step, setStep] = useState<'upload' | 'relationships' | 'results'>('upload');
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);

  // Current editing relationship
  const [selectedSourceId, setSelectedSourceId] = useState<string>('');
  const [selectedTargetId, setSelectedTargetId] = useState<string>('');
  const [selectedSourceCol, setSelectedSourceCol] = useState<string>('');
  const [selectedTargetCol, setSelectedTargetCol] = useState<string>('');
  const [selectedRelationType, setSelectedRelationType] = useState<Relationship['type']>('outer');

  // Column mappings for current relationship
  const [sourceMappings, setSourceMappings] = useState<ColumnMapping[]>([]);
  const [targetMappings, setTargetMappings] = useState<ColumnMapping[]>([]);

  const [results, setResults] = useState<ReconciliationResult | null>(null);
  const [activeResultTab, setActiveResultTab] = useState<string>('reconciled');

  // Initialize with context data only when the modal opens
  useEffect(() => {
    if (open) {
      // Check if context data is already loaded to avoid re-adding on re-renders
      const contextDataExists = dataSources.some(ds => ds.name === contextData?.name);
      if (contextData && !contextDataExists) {
        setDataSources([{ id: generateId(), ...contextData }]);
      }
    } else {
      // Reset all state when the modal is closed to ensure a clean slate for the next use
      setStep('upload');
      setDataSources([]);
      setRelationships([]);
      setSelectedSourceId('');
      setSelectedTargetId('');
      setSelectedSourceCol('');
      setSelectedTargetCol('');
      setSourceMappings([]);
      setTargetMappings([]);
      setResults(null);
    }
  }, [contextData, open]);

  // Auto-populate column mappings when source/target changes
  useEffect(() => {
    const src = dataSources.find(ds => ds.id === selectedSourceId);
    if (src) {
      setSourceMappings(src.columns.map(col => ({ col, agg: 'real' as AggType })));
    } else {
      setSourceMappings([]);
    }
  }, [selectedSourceId, dataSources]);

  useEffect(() => {
    const tgt = dataSources.find(ds => ds.id === selectedTargetId);
    if (tgt) {
      setTargetMappings(tgt.columns.map(col => ({ col, agg: 'real' as AggType })));
    } else {
      setTargetMappings([]);
    }
  }, [selectedTargetId, dataSources]);

  // ── File upload ──

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const promises = Array.from(files).map(file => new Promise<DataSource | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target?.result, { type: 'array' });
          const ws = wb.Sheets[wb.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(ws) as any[];
          if (jsonData.length === 0) throw new Error('Planilha vazia');
          const columns = Object.keys(jsonData[0]);
          resolve({ id: generateId(), name: file.name.replace(/\.(xlsx|xls|csv)$/i, ''), data: jsonData, columns });
        } catch (error) {
          toast.error(`Erro ao ler o arquivo ${file.name}.`);
          resolve(null);
        }
      };
      reader.readAsArrayBuffer(file);
    }));

    const newSources = (await Promise.all(promises)).filter((s): s is DataSource => s !== null);
    if (newSources.length > 0) {
      setDataSources(prev => [...prev, ...newSources]);
      toast.success(`${newSources.length} base(s) carregada(s) com sucesso!`);
    }
    event.target.value = ''; // Limpa o input para permitir carregar o mesmo arquivo novamente
  }, []);

  const removeDataSource = (id: string) => {
    setDataSources(prev => prev.filter(ds => ds.id !== id));
    setRelationships(prev => prev.filter(r => r.sourceTableId !== id && r.targetTableId !== id));
  };

  // ── Relationships ──

  const updateMappingAgg = (
    mappings: ColumnMapping[],
    setMappings: React.Dispatch<React.SetStateAction<ColumnMapping[]>>,
    col: string,
    agg: AggType
  ) => {
    setMappings((prev: ColumnMapping[]) => prev.map(m => m.col === col ? { ...m, agg } : m));
  };

  const toggleMapping = (
    mappings: ColumnMapping[],
    setMappings: React.Dispatch<React.SetStateAction<ColumnMapping[]>>,
    col: string
  ) => {
    setMappings((prev: ColumnMapping[]) => {
      const exists = prev.find(m => m.col === col);
      if (exists) return prev.filter(m => m.col !== col);
      return [...prev, { col, agg: 'real' as AggType }];
    });
  };

  const addRelationship = () => {
    if (!selectedSourceId || !selectedTargetId || !selectedSourceCol || !selectedTargetCol) {
      toast.warning('Selecione todos os campos para criar o relacionamento.');
      return;
    }
    if (selectedSourceId === selectedTargetId) {
      toast.warning('Não é possível relacionar uma base com ela mesma.');
      return;
    }
    if (sourceMappings.length === 0 && targetMappings.length === 0) {
      toast.warning('Selecione ao menos uma coluna para levar no resultado.');
      return;
    }
    setRelationships(prev => [
      ...prev,
      {
        id: generateRelId(),
        sourceTableId: selectedSourceId,
        sourceColumn: selectedSourceCol,
        targetTableId: selectedTargetId,
        targetColumn: selectedTargetCol,
        type: selectedRelationType,
        sourceColumns: [...sourceMappings],
        targetColumns: [...targetMappings],
      },
    ]);
  };

  const removeRelationship = (id: string) => {
    setRelationships(prev => prev.filter(r => r.id !== id));
  };

  // ── Reconciliation Engine ──

  const runReconciliation = () => {
    if (relationships.length === 0) {
      toast.warning('Defina pelo menos um relacionamento entre as bases.');
      return;
    }

    const mainRel = relationships[0];
    const srcDS = dataSources.find(ds => ds.id === mainRel.sourceTableId);
    const tgtDS = dataSources.find(ds => ds.id === mainRel.targetTableId);

    if (!srcDS || !tgtDS) {
      toast.error('Base de dados não encontrada para o relacionamento.');
      return;
    }

    // Build target lookup map
    const targetMap = new Map<string, any[]>();
    tgtDS.data.forEach((row, idx) => {
      const key = normalizeValue(row[mainRel.targetColumn]);
      if (!targetMap.has(key)) targetMap.set(key, []);
      targetMap.get(key)!.push({ ...row, _originalIndex: idx });
    });

    const reconciled: any[] = [];
    const discrepancies: ReconciliationResult['discrepancies'] = [];
    let matchedCount = 0;
    let unmatchedSource = 0;
    let unmatchedTarget = 0;

    const processedTargetKeys = new Set<string>();

    srcDS.data.forEach((sourceRow, idx) => {
      const key = normalizeValue(sourceRow[mainRel.sourceColumn]);
      const targetMatches = targetMap.get(key);

      if (targetMatches && targetMatches.length > 0) {
        targetMatches.forEach((targetRow) => {
          processedTargetKeys.add(key);
          matchedCount++;

          const merged: any = { _reconciled: true, _sourceIndex: idx, _targetIndex: targetRow._originalIndex };

          // Apply source column mappings with aggregation
          mainRel.sourceColumns.forEach(({ col, agg }) => {
            const vals = [sourceRow[col]];
            merged[`${srcDS.name}::${agg}_${col}`] = applyAggregation(vals, agg);
          });

          // Apply target column mappings with aggregation
          mainRel.targetColumns.forEach(({ col, agg }) => {
            const vals = [targetRow[col]];
            merged[`${tgtDS.name}::${agg}_${col}`] = applyAggregation(vals, agg);

            // Check discrepancies for numeric same-named columns
            if (agg === 'real' || agg === 'sum') {
              const sourceVal = tryParseNumber(sourceRow[col]);
              const targetVal = tryParseNumber(targetRow[col]);
              if (
                sourceVal !== null &&
                targetVal !== null &&
                sourceVal !== targetVal &&
                col !== mainRel.sourceColumn &&
                col !== mainRel.targetColumn
              ) {
                discrepancies.push({
                  rowIndex: idx,
                  sourceColumn: col,
                  sourceValue: sourceVal,
                  targetColumn: col,
                  targetValue: targetVal,
                  difference: Math.abs(sourceVal - targetVal),
                });
              }
            }
          });

          reconciled.push(merged);
        });
      } else {
        unmatchedSource++;
        const merged: any = { _reconciled: false, _sourceIndex: idx, _targetIndex: -1 };
        mainRel.sourceColumns.forEach(({ col, agg }) => {
          const vals = [sourceRow[col]];
          merged[`${srcDS.name}::${agg}_${col}`] = applyAggregation(vals, agg);
        });
        mainRel.targetColumns.forEach(({ col }) => {
          merged[`${tgtDS.name}::real_${col}`] = '';
        });
        reconciled.push(merged);
      }
    });

    // Unmatched target rows
    tgtDS.data.forEach((targetRow, idx) => {
      const key = normalizeValue(targetRow[mainRel.targetColumn]);
      if (!processedTargetKeys.has(key)) {
        unmatchedTarget++;
        const merged: any = { _reconciled: false, _sourceIndex: -1, _targetIndex: idx };
        mainRel.sourceColumns.forEach(({ col, agg }) => {
          merged[`${srcDS.name}::${agg}_${col}`] = '';
        });
        mainRel.targetColumns.forEach(({ col, agg }) => {
          const vals = [targetRow[col]];
          merged[`${tgtDS.name}::${agg}_${col}`] = applyAggregation(vals, agg);
        });
        reconciled.push(merged);
      }
    });

    const finalResultColumns = Array.from(reconciled.reduce((acc, row) => {
      Object.keys(row).forEach(key => {
        if (!key.startsWith('_')) acc.add(key);
      });
      return acc;
    }, new Set<string>()));

    setResults({
      mergedRows: reconciled,
      discrepancies,
      sourceColumns: mainRel.sourceColumns.map(m => m.col),
      targetColumns: mainRel.targetColumns.map(m => m.col),
      matchedCount,
      unmatchedSource,
      unmatchedTarget,
      sourceName: srcDS.name,
      targetName: tgtDS.name,
      allResultColumns: finalResultColumns,
    });

    setStep('results');
    toast.success(`Conciliação concluída: ${matchedCount} correspondências encontradas.`);
  };

  // ── Export ──

  const handleSaveResult = (filterType: 'all' | 'reconciled' | 'discrepancy' | 'unmatched_source' | 'unmatched_target') => {
    if (!results) return;

    let filteredRows = results.mergedRows;
    let toastMessage = 'Resultado completo salvo na página.';

    if (filterType === 'reconciled') {
      filteredRows = consolidatedRows.filter(row => row._reconciled && !row._statusLabel.includes('divergência'));
      toastMessage = 'Apenas itens conciliados foram salvos.';
    } else if (filterType === 'discrepancy') {
      filteredRows = consolidatedRows.filter(row => row._statusLabel.includes('divergência'));
      toastMessage = 'Apenas itens com divergência foram salvos.';
    } else if (filterType === 'unmatched_source') {
      filteredRows = consolidatedRows.filter(row => row._sourceIndex >= 0 && row._targetIndex < 0);
      toastMessage = `Itens que existem apenas em '${sourceName}' foram salvos.`;
    } else if (filterType === 'unmatched_target') {
      filteredRows = consolidatedRows.filter(row => row._sourceIndex < 0 && row._targetIndex >= 0);
      toastMessage = `Itens que existem apenas em '${targetName}' foram salvos.`;
    }

    const newResult: ReconciliationResult = {
      ...results,
      mergedRows: filteredRows,
    };

    if (filteredRows.length === 0) {
      toast.warning("Nenhum item corresponde ao filtro selecionado.", { description: "Nenhum resultado foi salvo." });
      return;
    }

    onSaveResult(newResult);
    toast.success(toastMessage);
    onOpenChange(false);
  };

  const handleExportExcel = () => {
    if (!results || consolidatedRows.length === 0) return;

    const exportData = consolidatedRows.map((row: any) => {
      const flat: any = { 'Status': row._statusLabel };
      allResultColumns.forEach((col) => {
        const val = row[col];
        if (typeof val === 'number') {
          flat[col] = val;
        } else {
          flat[col] = val !== undefined && val !== null ? String(val) : '';
        }
      });
      return flat;
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Conciliação');

    if (results.discrepancies.length > 0) {
      const discData = results.discrepancies.map((d, i) => ({
        'Linha': d.rowIndex + 1,
        'Coluna': d.sourceColumn,
        'Valor Base 1': formatCurrency(d.sourceValue),
        'Valor Base 2': formatCurrency(d.targetValue),
        'Diferença': formatCurrency(d.difference),
      }));
      const discWs = XLSX.utils.json_to_sheet(discData);
      XLSX.utils.book_append_sheet(wb, discWs, 'Divergências');
    }

    XLSX.writeFile(wb, `conciliacao_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success('Relatório de conciliação exportado com sucesso!');
  };

  const resetAll = () => {
    setDataSources([]);
    setRelationships([]);
    setResults(null);
    setStep('upload');
  };

  // ── Derived columns for results ──

  const sourceDS = useMemo(() => {
    if (!results) return null;
    const rel = relationships[0];
    return dataSources.find(ds => ds.id === rel?.sourceTableId) || null;
  }, [results, relationships, dataSources]);

  const targetDS = useMemo(() => {
    if (!results) return null;
    const rel = relationships[0];
    return dataSources.find(ds => ds.id === rel?.targetTableId) || null;
  }, [results, relationships, dataSources]);

  const allResultColumns = useMemo(() => {
    if (!results) return [];
    const cols = new Set<string>();
    results.mergedRows.forEach((row) => {
      Object.keys(row).forEach((key) => {
        if (key.startsWith('_')) return;
        cols.add(key);
      });
    });
    return Array.from(cols);
  }, [results]);

  const sourceName = useMemo(() => sourceDS?.name || 'Base 1', [sourceDS]);
  const targetName = useMemo(() => targetDS?.name || 'Base 2', [targetDS]);

  const consolidatedRows = useMemo(() => {
    if (!results) return [];

    return results.mergedRows.map((row) => {
      let statusLabel: string;
      let statusColor: string;

      if (row._reconciled) {
        statusLabel = '✅ Conciliado';
        statusColor = 'text-green-700 bg-green-50';
      } else if (row._sourceIndex >= 0 && row._targetIndex < 0) {
        statusLabel = `🔴 Só em ${sourceName}`;
        statusColor = 'text-red-700 bg-red-50';
      } else {
        statusLabel = `🟡 Só em ${targetName}`;
        statusColor = 'text-amber-700 bg-amber-50';
      }

      const hasDisc = results.discrepancies.some(d => d.rowIndex === row._sourceIndex);
      if (hasDisc && row._reconciled) {
        statusLabel = '⚠️ Com divergência';
        statusColor = 'text-orange-700 bg-orange-50';
      }

      return { ...row, _statusLabel: statusLabel, _statusColor: statusColor };
    });
  }, [results, sourceName, targetName]);

  const consolidatedColumns = useMemo(() => {
    if (!results || consolidatedRows.length === 0) return [];
    return ['_statusLabel', ...allResultColumns];
  }, [results, allResultColumns, consolidatedRows.length]);

  // Available columns for the current source/target
  const srcColumns = useMemo(
    () => dataSources.find(ds => ds.id === selectedSourceId)?.columns || [],
    [selectedSourceId, dataSources]
  );

  const tgtColumns = useMemo(
    () => dataSources.find(ds => ds.id === selectedTargetId)?.columns || [],
    [selectedTargetId, dataSources]
  );

  // Value preview for selected columns
  const [showKeyPreview, setShowKeyPreview] = useState(false);

  const srcKeyValues = useMemo(() => {
    if (!selectedSourceId || !selectedSourceCol) return [];
    
    const isFirstJoin = relationships.length === 0;
    const ds = isFirstJoin 
      ? dataSources.find(d => d.id === selectedSourceId)
      : { data: results?.mergedRows || [] }; // Use previous results as data source

    if (!ds || !ds.data) return [];
    const values = new Set<string>();
    ds.data.forEach(row => {
      const v = normalizeValue(row[selectedSourceCol]);
      if (v) values.add(String(row[selectedSourceCol]));
    });
    return Array.from(values).slice(0, 50);
  }, [selectedSourceId, selectedSourceCol, dataSources]);

  const tgtKeyValues = useMemo(() => {
    if (!selectedTargetId || !selectedTargetCol) return [];
    
    const isFirstJoin = relationships.length === 0;
    const ds = isFirstJoin 
      ? dataSources.find(d => d.id === selectedSourceId)
      : { data: results?.mergedRows || [] }; // Use previous results as data source

    if (!ds || !ds.data) return [];
    const values = new Set<string>();
    ds.data.forEach(row => {
      const v = normalizeValue(row[selectedTargetCol]);
      if (v) values.add(String(row[selectedTargetCol]));
    });
    return Array.from(values).slice(0, 50);
  }, [selectedTargetId, selectedTargetCol, dataSources]);

  const commonKeys = useMemo(() => {
    const srcSet = new Set(srcKeyValues.map(normalizeValue));
    return tgtKeyValues.filter(v => srcSet.has(normalizeValue(v)));
  }, [srcKeyValues, tgtKeyValues]);

  // ── Render ──

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-7xl h-[90vh] flex flex-col p-0 gap-0">
        {/* ── Fixed Header ── */}
        <div className="flex-shrink-0 px-6 pt-5 pb-3 border-b">
          <DialogHeader className="p-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-100">
                  <Link2 className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <DialogTitle className="text-lg">Conciliação de Dados</DialogTitle>
                  <DialogDescription className="text-xs">
                    Carregue bases, relacione colunas e reconcilie informações
                  </DialogDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {results && (
                  <Button variant="outline" size="sm" onClick={handleExportExcel}>
                    <Download className="mr-1 h-4 w-4" /> Exportar
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={resetAll}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Reiniciar
                </Button>
              </div>
            </div>
          </DialogHeader>

          <div className="flex items-center gap-2 mt-3">
            {(['upload', 'relationships', 'results'] as const).map((s, i) => (
              <div key={s} className="flex items-center gap-1.5">
                <div
                  className={`flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold transition-colors ${
                    step === s
                      ? 'bg-blue-600 text-white'
                      : step === 'results' && s === 'upload'
                      ? 'bg-green-500 text-white'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  {step === 'results' && s === 'upload' ? '✓' : i + 1}
                </div>
                <span
                  className={`text-[11px] font-medium transition-colors ${
                    step === s ? 'text-blue-700' : 'text-slate-400'
                  }`}
                >
                  {s === 'upload' ? 'Bases' : s === 'relationships' ? 'Mapeamento' : 'Resultados'}
                </span>
                {i < 2 && <ArrowRight className="w-3 h-3 text-slate-300" />}
              </div>
            ))}
          </div>
        </div>

        {/* ── Scrollable Body ── */}
        <div className="flex-1 overflow-auto p-5">
          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                  <Button size="lg" onClick={() => document.getElementById('recon-file-upload')?.click()}>
                      <Upload className="mr-2 h-5 w-5" /> Adicionar Planilhas
                  </Button>
                  <input
                      id="recon-file-upload"
                      type="file"
                      className="hidden"
                      accept=".xlsx, .xls, .csv"
                      multiple
                      onChange={handleFileUpload}
                  />
                  <p className="text-sm text-slate-500">Você pode selecionar múltiplos arquivos de uma vez.</p>
              </div>

              {dataSources.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {dataSources.map((ds) => (
                    <div key={ds.id} className="flex items-start gap-3 p-3 rounded-lg border bg-slate-50/50 group">
                      <div className="flex-shrink-0 w-8 h-8 rounded-md bg-blue-100 flex items-center justify-center">
                        <FileSpreadsheet className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{ds.name}</span>
                          <button
                            onClick={() => removeDataSource(ds.id)}
                            className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-red-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                          <span className="flex items-center gap-1">
                            <Database className="w-3 h-3" /> {ds.data.length} reg.
                          </span>
                          <span className="flex items-center gap-1">
                            <Columns3 className="w-3 h-3" /> {ds.columns.length} col.
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {ds.columns.slice(0, 4).map((col) => (
                            <Badge key={col} variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              {col}
                            </Badge>
                          ))}
                          {ds.columns.length > 4 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                              +{ds.columns.length - 4}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Button onClick={() => setStep('relationships')} disabled={dataSources.length < 2} size="sm">
                  Configurar Mapeamento <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 2: Mapeamento (Relationships + Column Mapping + Aggregation) ── */}
          {step === 'relationships' && (
            <div className="space-y-4">
              {/* Join definition */}
              <div className="p-3 rounded-lg border bg-slate-50">
                <div className="flex items-center gap-1.5 mb-2">
                  <Link2 className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-semibold text-slate-700">Relacionamento (Join)</span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-slate-500">Base Origem</Label>
                    <Select value={selectedSourceId} onValueChange={setSelectedSourceId} disabled={relationships.length > 0}>
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dataSources.map((ds) => (
                          <SelectItem key={ds.id} value={ds.id} className="text-xs">{ds.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-slate-500">Coluna</Label>
                    <Select value={selectedSourceCol} onValueChange={setSelectedSourceCol}>
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue placeholder="Coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(srcColumns).map((col) => (
                          <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center pb-2">
                    <ArrowRight className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-slate-500">Base Destino</Label>
                    <Select value={selectedTargetId} onValueChange={setSelectedTargetId}>
                      <SelectTrigger className="h-7 text-xs w-36">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {dataSources.map((ds) => (
                          <SelectItem key={ds.id} value={ds.id} className="text-xs">{ds.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-slate-500">Coluna</Label>
                    <Select value={selectedTargetCol} onValueChange={setSelectedTargetCol}>
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue placeholder="Coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        {(tgtColumns).map((col) => (
                          <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[10px] font-medium text-slate-500">Tipo</Label>
                    <Select value={selectedRelationType} onValueChange={(v) => setSelectedRelationType(v as Relationship['type'])}>
                      <SelectTrigger className="h-7 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="inner" className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]">⭕</span>
                            <span>Inner — Só em ambas</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="left" className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]">◀️</span>
                            <span>Left — Tudo da Base 1</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="right" className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]">▶️</span>
                            <span>Right — Tudo da Base 2</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="outer" className="text-xs">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px]">🔵</span>
                            <span>Full Outer — Tudo de ambas</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center pb-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-[10px]"
                      onClick={() => setShowKeyPreview(!showKeyPreview)}
                      disabled={!selectedSourceCol || !selectedTargetCol}
                    >
                      <Search className="mr-1 h-3 w-3" />
                      {showKeyPreview ? 'Ocultar chaves' : 'Visualizar chaves'}
                    </Button>
                  </div>
                </div>
              </div>

              {/* Preview de chaves */}
              {showKeyPreview && (
                <div className="p-3 rounded-lg border bg-blue-50/30">
                  <div className="flex items-center gap-1.5 mb-2">
                    <Search className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700">Pré-visualização de chaves</span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-[10px] font-medium text-slate-500 mb-1 block">
                        {dataSources.find(d => d.id === selectedSourceId)?.name || 'Origem'}.{selectedSourceCol}
                      </Label>
                      <div className="max-h-32 overflow-y-auto border rounded bg-white p-1.5">
                        {srcKeyValues.length === 0 ? (
                          <span className="text-[10px] text-slate-400">Nenhum valor</span>
                        ) : (
                          srcKeyValues.map((v, i) => (
                            <div key={i} className="text-[10px] font-mono px-1 py-0.5 rounded hover:bg-slate-100 truncate">{v}</div>
                          ))
                        )}
                        {srcKeyValues.length >= 50 && (
                          <div className="text-[9px] text-slate-400 italic mt-1">... até 50 valores</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium text-slate-500 mb-1 block">Correspondências</Label>
                      <div className="max-h-32 overflow-y-auto border rounded bg-white p-1.5">
                        <div className="flex items-center gap-2 text-xs text-green-700 mb-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>{commonKeys.length} chaves em comum</span>
                        </div>
                        {commonKeys.length === 0 ? (
                          <span className="text-[10px] text-slate-400">Nenhuma correspondência</span>
                        ) : (
                          commonKeys.slice(0, 10).map((v, i) => (
                            <div key={i} className="text-[10px] font-mono px-1 py-0.5 bg-green-50 rounded truncate">{v}</div>
                          ))
                        )}
                        {commonKeys.length > 10 && (
                          <div className="text-[9px] text-slate-400 italic mt-1">... +{commonKeys.length - 10} valores</div>
                        )}
                      </div>
                    </div>
                    <div>
                      <Label className="text-[10px] font-medium text-slate-500 mb-1 block">
                        {dataSources.find(d => d.id === selectedTargetId)?.name || 'Destino'}.{selectedTargetCol}
                      </Label>
                      <div className="max-h-32 overflow-y-auto border rounded bg-white p-1.5">
                        {tgtKeyValues.length === 0 ? (
                          <span className="text-[10px] text-slate-400">Nenhum valor</span>
                        ) : (
                          tgtKeyValues.map((v, i) => (
                            <div key={i} className="text-[10px] font-mono px-1 py-0.5 rounded hover:bg-slate-100 truncate">{v}</div>
                          ))
                        )}
                        {tgtKeyValues.length >= 50 && (
                          <div className="text-[9px] text-slate-400 italic mt-1">... até 50 valores</div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Column Mapping: Source */}
              <div className="p-3 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Settings2 className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700">
                      Colunas para levar — {dataSources.find(ds => ds.id === selectedSourceId)?.name || 'Origem'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSourceMappings(srcColumns.map(col => ({ col, agg: 'real' as AggType })))}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors disabled:opacity-50" disabled={srcColumns.length === 0}
                    >
                      Selecionar todos
                    </button>
                    <span className="text-[10px] text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSourceMappings([])}
                      className="text-[10px] text-red-500 hover:text-red-700 font-medium px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50" disabled={srcColumns.length === 0}
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {srcColumns.map((col) => {
                    const mapping = sourceMappings.find(m => m.col === col);
                    const checked = !!mapping;
                    return (
                      <div key={col} className="flex items-center gap-1.5 p-1.5 rounded bg-slate-50 border text-xs">
                        <Checkbox
                          id={`src_${col}`}
                          checked={checked}
                          onCheckedChange={() => toggleMapping(sourceMappings, setSourceMappings, col)}
                          className="h-3.5 w-3.5"
                        />
                        <Label htmlFor={`src_${col}`} className="text-[11px] cursor-pointer truncate flex-1">{col}</Label>
                        {checked && (
                          <Select
                            value={mapping!.agg}
                            onValueChange={(v) => updateMappingAgg(sourceMappings, setSourceMappings, col, v as AggType)}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[90px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['real', 'text', 'date', 'sum', 'max', 'min', 'avg', 'count', 'unit'] as AggType[]).map(a => (
                                <SelectItem key={a} value={a} className="text-[11px]">
                                  <span>{aggIcons[a]} {aggLabels[a]}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                  {srcColumns.length === 0 && (
                    <span className="text-xs text-slate-400 col-span-full">Selecione uma base origem primeiro</span>
                  )}
                </div>
              </div>

              {/* Column Mapping: Target */}
              <div className="p-3 rounded-lg border">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <Settings2 className="w-4 h-4 text-blue-600" />
                    <span className="text-xs font-semibold text-slate-700">
                      Colunas para levar — {dataSources.find(ds => ds.id === selectedTargetId)?.name || 'Destino'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setTargetMappings(tgtColumns.map(col => ({ col, agg: 'real' as AggType })))}
                      className="text-[10px] text-blue-600 hover:text-blue-800 font-medium px-1.5 py-0.5 rounded hover:bg-blue-50 transition-colors disabled:opacity-50" disabled={tgtColumns.length === 0}
                    >
                      Selecionar todos
                    </button>
                    <span className="text-[10px] text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setTargetMappings([])}
                      className="text-[10px] text-red-500 hover:text-red-700 font-medium px-1.5 py-0.5 rounded hover:bg-red-50 transition-colors disabled:opacity-50" disabled={tgtColumns.length === 0}
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                  {tgtColumns.map((col) => {
                    const mapping = targetMappings.find(m => m.col === col);
                    const checked = !!mapping;
                    return (
                      <div key={col} className="flex items-center gap-1.5 p-1.5 rounded bg-slate-50 border text-xs">
                        <Checkbox
                          id={`tgt_${col}`}
                          checked={checked}
                          onCheckedChange={() => toggleMapping(targetMappings, setTargetMappings, col)}
                          className="h-3.5 w-3.5"
                        />
                        <Label htmlFor={`tgt_${col}`} className="text-[11px] cursor-pointer truncate flex-1">{col}</Label>
                        {checked && (
                          <Select
                            value={mapping!.agg}
                            onValueChange={(v) => updateMappingAgg(targetMappings, setTargetMappings, col, v as AggType)}
                          >
                            <SelectTrigger className="h-6 text-[10px] w-[90px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(['real', 'text', 'date', 'sum', 'max', 'min', 'avg', 'count', 'unit'] as AggType[]).map(a => (
                                <SelectItem key={a} value={a} className="text-[11px]">
                                  <span>{aggIcons[a]} {aggLabels[a]}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                  {tgtColumns.length === 0 && (
                    <span className="text-xs text-slate-400 col-span-full">Selecione uma base destino primeiro</span>
                  )}
                </div>
              </div>

              {/* Add relationship button + existing relationships */}
              <div className="flex justify-center">
                <Button variant="outline" size="sm" onClick={addRelationship}>
                  <Sigma className="mr-1 h-3.5 w-3.5" /> Aplicar Mapeamento
                </Button>
              </div>

              {relationships.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-slate-500">Relacionamentos Definidos</Label>
                  {relationships.map((rel) => {
                    const srcName = dataSources.find(ds => ds.id === rel.sourceTableId)?.name || '';
                    const tgtName = dataSources.find(ds => ds.id === rel.targetTableId)?.name || '';
                    return (
                      <div key={rel.id} className="flex items-center justify-between p-2 rounded-md bg-blue-50 border border-blue-200">
                        <div className="flex items-center gap-2 text-sm">
                          <Link2 className="w-3.5 h-3.5 text-blue-600" />
                          <span className="font-medium text-xs">{srcName}</span>
                          <span className="text-[10px] text-slate-500">.{rel.sourceColumn}</span>
                          <ArrowRight className="w-3 h-3 text-blue-400" />
                          <span className="font-medium text-xs">{tgtName}</span>
                          <span className="text-[10px] text-slate-500">.{rel.targetColumn}</span>
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4">{rel.type}</Badge>
                          <span className="text-[9px] text-slate-400 ml-1">
                            ({rel.sourceColumns.length} cols → {rel.targetColumns.length} cols)
                          </span>
                        </div>
                        <button onClick={() => removeRelationship(rel.id)} className="text-red-400 hover:text-red-600">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex justify-between items-center pt-2">
                <Button variant="outline" size="sm" onClick={() => setStep('upload')}>Voltar</Button>
                <Button size="sm" onClick={runReconciliation} disabled={relationships.length === 0}>
                  Executar Conciliação <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: Results ── */}
          {step === 'results' && results && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-green-50 border border-green-200">
                  <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0" />
                  <div>
                    <div className="text-xl font-bold text-green-700 leading-tight">{results.matchedCount}</div>
                    <div className="text-[10px] text-green-600 leading-tight">Correspondências</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200">
                  <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                  <div>
                    <div className="text-xl font-bold text-amber-700 leading-tight">{results.discrepancies.length}</div>
                    <div className="text-[10px] text-amber-600 leading-tight">Divergências</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                  <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                  <div>
                    <div className="text-xl font-bold text-red-700 leading-tight">{results.unmatchedSource}</div>
                    <div className="text-[10px] text-red-600 leading-tight">Só em {sourceName}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-red-50 border border-red-200">
                  <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
                  <div>
                    <div className="text-xl font-bold text-red-700 leading-tight">{results.unmatchedTarget}</div>
                    <div className="text-[10px] text-red-600 leading-tight">Só em {targetName}</div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto border rounded-md" style={{ maxHeight: 'calc(90vh - 320px)' }}>
                <Table>
                  <TableHeader className="sticky top-0 bg-slate-100 z-10">
                    <TableRow>
                      <TableHead className="text-[10px] whitespace-nowrap py-2 w-[130px]">Status</TableHead>
                      {allResultColumns.map((col) => (
                        <TableHead key={col} className="text-[10px] whitespace-nowrap py-2">{col}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {consolidatedRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={consolidatedColumns.length} className="text-center py-8 text-slate-500 text-xs">
                          Nenhum resultado encontrado.
                        </TableCell>
                      </TableRow>
                    ) : (
                      consolidatedRows.map((row: any, idx: number) => (
                        <TableRow
                          key={idx}
                          className={
                            row._statusLabel?.includes('Só em') && row._statusLabel?.includes(sourceName)
                              ? 'bg-red-50/30'
                              : row._statusLabel?.includes('Só em') && row._statusLabel?.includes(targetName)
                              ? 'bg-amber-50/30'
                              : row._statusLabel?.includes('divergência')
                              ? 'bg-orange-50/30'
                              : ''
                          }
                        >
                          <TableCell className="text-[11px] py-1.5">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${row._statusColor}`}>
                              {row._statusLabel}
                            </span>
                          </TableCell>
                          {allResultColumns.map((col: string) => (
                            <TableCell key={col} className="text-[11px] whitespace-nowrap py-1.5">
                              {row[col] !== undefined && row[col] !== null
                                ? typeof row[col] === 'number'
                                  ? formatCurrency(row[col])
                                  : String(row[col])
                                : '-'}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {step === 'results' && (
          <div className="flex-shrink-0 flex justify-between items-center px-5 py-3 border-t bg-slate-50">
            <Button variant="outline" size="sm" onClick={() => setStep('relationships')}>
              Voltar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default" className="bg-blue-600 hover:bg-blue-700">
                  <Save className="mr-1.5 h-4 w-4" /> Salvar Resultado
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleSaveResult('all')}>Salvar Tudo</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSaveResult('reconciled')}>Salvar Apenas Conciliados</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSaveResult('discrepancy')}>Salvar com Divergência</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSaveResult('unmatched_source')}>Salvar Não Conciliados ({sourceName})</DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleSaveResult('unmatched_target')}>Salvar Não Conciliados ({targetName})</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}