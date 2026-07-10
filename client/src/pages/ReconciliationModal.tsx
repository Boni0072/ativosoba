import { useState, useEffect, useMemo, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { File, X, Check, AlertTriangle, ArrowRight, Upload, FileSpreadsheet, Database, Columns3, Trash2, Link2, RotateCcw, Download, Sigma } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DataSource {
  name: string;
  data: any[];
  columns: string[];
  keyColumn?: string;
}

interface ReconciliationResult {
  [key: string]: any; // Permite propriedades dinâmicas
  _key: string;
  _statusLabel: string;
  _statusColor: string;
}

interface ReconciliationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contextData: Omit<DataSource, 'columns'> & { columns: string[] };
  files: File[];
}
const generateId = () => `ds_${Math.random().toString(36).substring(2, 10)}`;

const parseFile = (file: File): Promise<DataSource> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];
        const columns = json.length > 0 ? Object.keys(json[0]) : [];
        resolve({ name: file.name, data: json, columns });
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};

export default function ReconciliationModal({ open, onOpenChange, contextData, files }: ReconciliationModalProps) {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [keyMappings, setKeyMappings] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && files.length > 0) {
      setIsLoading(true);
      const processFiles = async () => {
        const parsedFiles = await Promise.all(files.map(parseFile));
        const initialContextData = {
          id: 'context',
          ...contextData,
        };
        const initialKeyMappings: Record<string, string> = {};
        initialKeyMappings['context'] = contextData.columns.find(c => c.toLowerCase().includes('number') || c.toLowerCase().includes('plaq')) || contextData.columns[0];
        parsedFiles.forEach(pf => {
          initialKeyMappings[pf.id] = pf.columns.find(c => c.toLowerCase().includes('number') || c.toLowerCase().includes('plaq')) || pf.columns[0];
        });
        setKeyMappings(initialKeyMappings);
        setDataSources([{...initialContextData, id: 'context'}, ...parsedFiles.map(p => ({...p, id: generateId()}))]);
        setIsLoading(false);
      };
      processFiles().catch(err => {
        toast.error("Erro ao processar arquivos.");
        console.error(err);
        setIsLoading(false);
      });
    } else if (!open) {
      setDataSources([]);
      setKeyMappings({});
    }
  }, [open, files, contextData]);

  const handleKeyColumnChange = (index: number, newKey: string) => {
    setDataSources(prev => {
      const newSources = [...prev];
      newSources[index].keyColumn = newKey;
      return newSources;
    });
  };

  const handleKeyColumnChangeNew = (sourceId: string, newKey: string) => {
    setKeyMappings(prev => ({ ...prev, [sourceId]: newKey }));
  };

  const reconciliationResult = useMemo(() => {
    if (dataSources.length < 2 || dataSources.some(ds => !ds.keyColumn)) {
      return null;
    }

    const [baseSource, ...compareSources] = dataSources;
    const baseMap = new Map<string, any>();
    baseSource.data.forEach(row => {
      const key = row[baseSource.keyColumn!];
      if (key !== null && key !== undefined) {
        baseMap.set(String(key), row);
      }
    });

    const allKeys = new Set(baseMap.keys());
    const compareMaps = compareSources.map(source => {
      const map = new Map<string, any>();
      source.data.forEach(row => {
        const key = row[source.keyColumn!];
        if (key !== null && key !== undefined) {
          const stringKey = String(key);
          map.set(stringKey, row);
          allKeys.add(stringKey);
        }
      });
      return map;
    });

    const results: any[] = [];
    allKeys.forEach(key => {
      const presence = dataSources.map((source, i) => {
        if (i === 0) return baseMap.has(key);
        return compareMaps[i - 1].has(key);
      });

      const isPresentInAll = presence.every(p => p);
      const isMissingInSome = !isPresentInAll;

      results.push({
        key,
        presence,
        isMissingInSome,
        baseData: baseMap.get(key),
      });
    });

    return results.sort((a, b) => (a.isMissingInSome === b.isMissingInSome) ? 0 : a.isMissingInSome ? -1 : 1);
  }, [dataSources]);

  const resultColumns = useMemo(() => {
    if (!reconciliationResult || reconciliationResult.length === 0) return [];
    return Object.keys(reconciliationResult[0]).filter(k => !k.startsWith('_'));
  }, [reconciliationResult]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-full h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Conciliação de Dados</DialogTitle>
          <DialogDescription>
            Compare os dados do sistema com múltiplos arquivos para encontrar divergências.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dataSources.map((source, index) => (
            <div key={index} className="p-4 border rounded-lg bg-slate-50 space-y-2">
              <div className="flex items-center gap-2" >
                <File className="w-4 h-4 text-slate-500" />
                <h4 className="font-semibold truncate text-slate-700">{source.name}</h4>
              </div>
              <Select
                value={source.keyColumn}
                onValueChange={(value) => handleKeyColumnChange(index, value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a chave de união..." />
                </SelectTrigger>
                <SelectContent>
                  {source.columns.map(col => (
                    <SelectItem key={col} value={col}>{col}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>

        {reconciliationResult ? (
          <div className="flex-1 overflow-auto border rounded-lg">
            <Table>
              <TableHeader className="sticky top-0 bg-slate-100">
                <TableRow>
                  <TableHead>Chave</TableHead>
                  <TableHead>Nome (Sistema)</TableHead>
                  {dataSources.map((ds, i) => (
                    <TableHead key={i} className="text-center">{ds.name}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {reconciliationResult.map((item, index) => (
                  <TableRow key={index} className={item.isMissingInSome ? 'bg-red-50/50' : 'bg-green-50/50'}>
                    <TableCell className="font-mono font-semibold">{item.key}</TableCell>
                    <TableCell>{item.baseData?.name || '-'}</TableCell>
                    {item.presence.map((present: boolean, i: number) => (
                      <TableCell key={i} className="text-center">
                        {present ? (
                          <Check className="w-5 h-5 text-green-600 mx-auto" />
                        ) : (
                          <X className="w-5 h-5 text-red-600 mx-auto" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center bg-slate-50 rounded-lg border-2 border-dashed">
            {isLoading ? (
              <>
                <File className="w-12 h-12 text-slate-400 animate-pulse mb-4" />
                <p className="font-semibold text-slate-600">Processando arquivos...</p>
                <p className="text-sm text-slate-500">Aguarde enquanto os dados são carregados.</p>
              </>
            ) : (
              <>
                <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
                <p className="font-semibold text-slate-600">Aguardando Configuração</p>
                <p className="text-sm text-slate-500">Selecione a coluna chave para cada fonte de dados para iniciar a conciliação.</p>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

```

### 3. Atualização do Arquivo `DataAnalyzerModal.tsx` (Opcional, mas recomendado)

Para manter a consistência, podemos remover a lógica de análise de dados da página `ImobilizadoEmAndamento.tsx` e movê-la para um componente reutilizável. Como o `DataAnalyzerModal` não foi fornecido, aqui está uma possível implementação para ele.

```diff