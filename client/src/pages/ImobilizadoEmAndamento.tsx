import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Search, Sheet, AlertTriangle, Pencil, Check, X, XCircle, Link2, Sigma, ListFilter, FunctionSquare, FilterX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import ReconciliationModal, { ReconciliationResult } from "@/components/ReconciliationModal";

export default function ImobilizadoEmAndamento() {
  const [showFullReport, setShowFullReport] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [powerBIModalOpen, setPowerBIModalOpen] = useState(false);
  const [projects, setProjects] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const [reconciliationFiles, setReconciliationFiles] = useState<File[]>([]);
  const [isReconciliationOpen, setIsReconciliationOpen] = useState(false);
  const [reconciliationResult, setReconciliationResult] = useState<ReconciliationResult | null>(null);
  const [selectedSummaryColumn, setSelectedSummaryColumn] = useState<string>('');
  const [summaryAggregation, setSummaryAggregation] = useState<'sum' | 'avg' | 'max' | 'min'>('sum');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "assets"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssets(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  // Carrega a URL da planilha do localStorage
  useEffect(() => {
    const handleStorageUpdate = () => {
      const baseUrl = localStorage.getItem("sheet_link_imobilizado");
      if (baseUrl) {
        setSheetUrl(baseUrl);
      } else {
        setSheetUrl(null);
      }
    };
    handleStorageUpdate(); // Carga inicial
    window.addEventListener('powerbi-link-updated', handleStorageUpdate); // Ouve o evento do modal
    return () => window.removeEventListener('powerbi-link-updated', handleStorageUpdate);
  }, []);

  // Filtra apenas ativos com status "planejamento" ou "em_desenvolvimento"
  const imobilizadosEmAndamento = useMemo(() => {
    return assets.filter(asset => 
      asset.status === "planejamento" || 
      asset.status === "em_desenvolvimento"
    );
  }, [assets]);

  // Aplica busca
  const filteredAssets = useMemo(() => {
    if (!searchTerm.trim()) return imobilizadosEmAndamento;
    const s = searchTerm.toLowerCase();
    return imobilizadosEmAndamento.filter(asset =>
      String(asset.name || "").toLowerCase().includes(s) ||
      String(asset.assetNumber || "").toLowerCase().includes(s) ||
      String(asset.tagNumber || "").toLowerCase().includes(s) ||
      String(asset.description || "").toLowerCase().includes(s)
    );
  }, [imobilizadosEmAndamento, searchTerm]);

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => String(p.id) === String(projectId));
    return project?.name || "—";
  };

  const handleEdit = (asset: any) => {
    setEditingRowId(asset.id);
    setEditFormData({
      name: asset.name,
      value: asset.value,
      status: asset.status,
    });
  };

  const handleCancelEdit = () => {
    setEditingRowId(null);
    setEditFormData({});
  };

  const handleSaveEdit = async (assetId: string) => {
    if (!assetId) return;
    try {
      const assetRef = doc(db, "assets", assetId);
      await updateDoc(assetRef, { ...editFormData, value: Number(editFormData.value) });
      toast.success("Ativo atualizado com sucesso!");
      handleCancelEdit();
    } catch (error) {
      console.error("Erro ao salvar ativo:", error);
      toast.error("Falha ao salvar as alterações.");
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const formatCostCenter = (costCenter: any) => {
    if (typeof costCenter === 'object' && costCenter?.code) return costCenter.code;
    return costCenter || "—";
  };

  const handleReconciliationFilesSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      setReconciliationFiles(Array.from(files));
      setIsReconciliationOpen(true);
    }
  };

  const handleSaveReconciliation = (result: ReconciliationResult) => {
    setReconciliationResult(result);
    setStatusFilter(null); // Limpa o filtro ao salvar um novo resultado
  };

  const tryParseNumber = (val: any): number | null => {
    if (val === null || val === undefined) return null;
    if (typeof val === 'number') return val;
    if (typeof val !== 'string' || val.trim() === '') return null;

    // Remove R$, espaços, e pontos de milhar. Mantém a vírgula para decimal.
    const cleaned = val.replace(/R\$\s?|\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  };

  const getConsolidatedRows = (result: ReconciliationResult) => {
    if (!result) return [];

    return result.mergedRows.map((row) => {
      let statusLabel: string;
      let statusColor: string;

      if (row._reconciled) {
        statusLabel = '✅ Conciliado';
        statusColor = 'text-green-700 bg-green-100 border-green-200';
      } else if (row._sourceIndex >= 0 && row._targetIndex < 0) {
        statusLabel = `🔴 Só em ${result.sourceName}`;
        statusColor = 'text-red-700 bg-red-100 border-red-200';
      } else {
        statusLabel = `🟡 Só em ${result.targetName}`;
        statusColor = 'text-amber-700 bg-amber-100 border-amber-200';
      }

      return { ...row, _statusLabel: statusLabel, _statusColor: statusColor };
    });
  };

  const savedConsolidatedRows = useMemo(() => reconciliationResult ? getConsolidatedRows(reconciliationResult) : [], [reconciliationResult]);

  const filteredConsolidatedRows = useMemo(() => {
    if (!statusFilter) {
      return savedConsolidatedRows;
    }
    return savedConsolidatedRows.filter(row => row._statusLabel === statusFilter);
  }, [savedConsolidatedRows, statusFilter]);


  const numericColumns = useMemo(() => {
    if (!reconciliationResult || savedConsolidatedRows.length === 0) return [];
    const sampleRow = savedConsolidatedRows.find(r => r) || {};
    return reconciliationResult.allResultColumns.filter(col => tryParseNumber(sampleRow[col]) !== null);
  }, [reconciliationResult, savedConsolidatedRows]);

  useEffect(() => {
    if (numericColumns.length > 0) {
      // Tenta encontrar uma coluna com 'valor' ou 'value' para ser o padrão
      const defaultCol = numericColumns.find(c => c.toLowerCase().includes('valor') || c.toLowerCase().includes('value'));
      setSelectedSummaryColumn(defaultCol || numericColumns[0]);
    } else if (numericColumns.length === 0) {
      setSelectedSummaryColumn('');
    }
  }, [numericColumns]);

  const summaryStats = useMemo(() => {
    if (!reconciliationResult || savedConsolidatedRows.length === 0 || !selectedSummaryColumn) return {};

    const groups: Record<string, { count: number; values: number[] }> = {};

    savedConsolidatedRows.forEach(row => {
      const status = row._statusLabel;
      if (!groups[status]) {
        groups[status] = { count: 0, values: [] };
      }
      groups[status].count++;
      const num = tryParseNumber(row[selectedSummaryColumn]);
      if (num !== null) {
        groups[status].values.push(num);
      }
    });

    const finalStats: Record<string, { count: number; total: number }> = {};
    for (const status in groups) {
      const { count, values } = groups[status];
      let total = 0;
      if (values.length > 0) {
        if (summaryAggregation === 'sum') total = values.reduce((a, b) => a + b, 0);
        else if (summaryAggregation === 'avg') total = values.reduce((a, b) => a + b, 0) / values.length;
        else if (summaryAggregation === 'max') total = Math.max(...values);
        else if (summaryAggregation === 'min') total = Math.min(...values);
      }
      finalStats[status] = { count, total };
    }

    return finalStats;
  }, [savedConsolidatedRows, selectedSummaryColumn, reconciliationResult, summaryAggregation]);

  const totalValue = filteredAssets.reduce((acc, asset) => acc + Number(asset.value || 0), 0);

  const handleExportExcel = () => {
    if (filteredAssets.length === 0) {
      toast.error("Não há ativos para exportar.");
      return;
    }

    const data = filteredAssets.map(asset => ({
      "Nº Ativo": asset.assetNumber || "",
      "Plaqueta": asset.tagNumber || "",
      "Nome": asset.name || "",
      "Descrição": asset.description || "",
      "Valor (R$)": Number(asset.value || 0),
      "Quantidade": Number(asset.quantity || 1),
      "Status": asset.status === "planejamento" ? "Planejamento" : "Em Desenvolvimento",
      "Obra": getProjectName(asset.projectId),
      "Centro de Custo": formatCostCenter(asset.costCenter),
      "Data Início": asset.startDate ? new Date(asset.startDate).toLocaleDateString('pt-BR') : "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wscols = Object.keys(data[0]).map(key => ({ wch: Math.max(key.length, 15) }));
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Imobilizado em Andamento");
    XLSX.writeFile(wb, `imobilizado_andamento_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório exportado com sucesso!");
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Imobilizado em Andamento</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => window.dispatchEvent(new CustomEvent('open-powerbi-modal', { detail: { configKey: 'imobilizado' } }))}
          >
            <Sheet className="mr-2 h-4 w-4" /> Configurar Planilha
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.multiple = true;
              input.accept = ".xlsx, .xls, .csv";
              input.onchange = (e) => handleReconciliationFilesSelect(e as any);
              input.click();
            }}
            className="border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            <Link2 className="mr-2 h-4 w-4" /> Conciliação
          </Button>
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>
      
      {/* Planilha Embed */}
      {sheetUrl && !reconciliationResult && (
        <Card className="animate-in fade-in duration-300">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Planilha de Dados</CardTitle>
              <CardDescription>Visualização da planilha de dados vinculada a esta página.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              <AlertTriangle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <p>
                Se a planilha não carregar, pode ser um bloqueio de segurança. Para corrigir, vá na planilha (Excel Online), clique em <strong>Arquivo &gt; Compartilhar &gt; Incorporar</strong> e use o link gerado.
              </p>
            </div>
            <iframe
              src={sheetUrl}
              width="100%"
              height="600"
              frameBorder="0"
              className="rounded-md border"
              allowFullScreen
              // Adiciona a política de sandbox para aumentar a segurança, mas pode quebrar funcionalidades se a planilha precisar delas
              // sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            ></iframe>
          </CardContent>
        </Card>
      )}

      {/* Tabela de Conciliação Salva */}
      {reconciliationResult && (
        <Card className="animate-in fade-in duration-500">
          <CardHeader>
            <div className="flex flex-col md:flex-row items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <CardTitle>Resultado da Conciliação</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setReconciliationResult(null)} className="text-slate-500 hover:bg-slate-100 h-7 w-7">
                    <XCircle className="h-5 w-5" />
                  </Button>
                </div>
                <CardDescription className="mt-1">
                  Conciliação entre '{reconciliationResult.sourceName}' e '{reconciliationResult.targetName}'.
                </CardDescription>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                {Object.entries(summaryStats).map(([status, data]) => (
                  <button
                    key={status}
                    onClick={() => setStatusFilter(prev => prev === status ? null : status)}
                    className={`flex items-center gap-3 p-2 rounded-lg border text-left transition-all duration-200 ${
                      statusFilter === status ? 'bg-blue-100 border-blue-400 ring-2 ring-blue-300' : 'bg-slate-50/80 hover:bg-slate-100'
                    }`}
                  >
                    <div className={`flex items-center justify-center w-8 h-8 rounded-md transition-colors shrink-0 ${
                        status.includes('Conciliado') ? 'bg-green-100 text-green-600' :
                        status.includes('divergência') ? 'bg-orange-100 text-orange-600' :
                        'bg-red-100 text-red-600'
                      } ${statusFilter === status ? 'ring-2 ring-white' : ''}`}
                    >
                        <Sigma className="w-4 h-4" />
                      </div>
                    <div className="flex flex-col min-w-0">
                      <p className="text-xs font-semibold text-slate-500 whitespace-nowrap">
                        {status.replace(/[✅🔴🟡⚠️]/g, '').trim()}
                      </p>
                      <p className="text-sm font-bold text-slate-700">{data.count} <span className="font-normal text-xs text-slate-500">itens</span></p>
                      {selectedSummaryColumn && <p className="text-xs font-mono text-blue-600">{formatCurrency(data.total)}</p>}
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                {numericColumns.length > 0 && (
                  <div className="w-full md:w-auto md:max-w-[200px]">
                    <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1"><ListFilter size={12}/> Coluna de Valor</label>
                    <Select value={selectedSummaryColumn} onValueChange={setSelectedSummaryColumn}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Selecione..." />
                      </SelectTrigger>
                      <SelectContent>
                        {numericColumns.map(col => (
                          <SelectItem key={col} value={col} className="text-xs">{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {numericColumns.length > 0 && (
                  <div className="w-full md:w-auto md:max-w-[120px]">
                    <label className="text-xs font-medium text-slate-500 flex items-center gap-1 mb-1"><FunctionSquare size={12}/> Cálculo</label>
                    <Select value={summaryAggregation} onValueChange={(v) => setSummaryAggregation(v as any)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sum" className="text-xs">Soma</SelectItem>
                        <SelectItem value="avg" className="text-xs">Média</SelectItem>
                        <SelectItem value="max" className="text-xs">Máximo</SelectItem>
                        <SelectItem value="min" className="text-xs">Mínimo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              {statusFilter && (
                <Button variant="ghost" size="sm" onClick={() => setStatusFilter(null)} className="text-xs text-blue-600 hover:bg-blue-50 hover:text-blue-700 h-8">
                  <FilterX className="mr-1.5 h-3 w-3" /> Limpar Filtro
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-auto max-h-[500px]">
              <Table>
                <TableHeader className="sticky top-0 bg-slate-100">
                  <TableRow>
                    <TableHead className="w-[150px]">Status</TableHead>
                    {reconciliationResult.allResultColumns.map(col => <TableHead key={col}>{col}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredConsolidatedRows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell>
                        <Badge variant="outline" className={`text-xs font-normal ${row._statusColor}`}>
                          {row._statusLabel}
                        </Badge>
                      </TableCell>
                      {reconciliationResult.allResultColumns.map(col => (
                        <TableCell key={col} className="text-xs">
                          {row[col] !== undefined && row[col] !== null
                            ? typeof row[col] === 'number'
                              ? formatCurrency(row[col])
                              : String(row[col])
                            : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <ReconciliationModal
        open={isReconciliationOpen}
        onOpenChange={setIsReconciliationOpen}
        files={reconciliationFiles}
        onSaveResult={handleSaveReconciliation}
        contextData={{
          name: "Imobilizado (Firestore)",
          data: reconciliationResult ? savedConsolidatedRows : imobilizadosEmAndamento,
          columns: reconciliationResult 
            ? reconciliationResult.allResultColumns 
            : ["assetNumber", "tagNumber", "name", "description", "value", "quantity", "status", "projectId", "costCenter", "startDate"],
        }}
      />
    </div>
  );
}