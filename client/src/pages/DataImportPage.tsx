import React, { useState, useRef, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, Download, Loader2, FileText, Package, HardHat, AlertTriangle, ArrowRight, Sheet, CheckCircle2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";

type ImportStatus = 'idle' | 'importing' | 'success' | 'error';

interface ImportProgress {
  status: ImportStatus;
  processed: number;
  total: number;
  successCount: number;
  errorCount: number;
  errors: string[];
}

type ImportType = 'assets' | 'projects' | 'expenses';

const IMPORT_CONFIG = {
  projects: {
    title: "Obras",
    fields: [
      { key: 'name', label: 'Nome da Obra', required: true },
      { key: 'code', label: 'Código', required: false },
      { key: 'description', label: 'Descrição', required: false },
    ],
  },
  assets: {
    title: "Ativos",
    fields: [
      { key: 'name', label: 'Nome', required: true },
      { key: 'assetNumber', label: 'Número do Ativo', required: false },
      { key: 'tagNumber', label: 'Plaqueta', required: false },
      { key: 'description', label: 'Descrição', required: false },
      { key: 'value', label: 'Valor (R$)', required: false },
      { key: 'projectName', label: 'Nome da Obra', required: true, info: 'Usado para vincular o ativo à obra.' },
    ],
  },
  // expenses config can be added here if needed
};

const ImportCard = ({ title, description, icon: Icon, onDownloadTemplate, onFileUpload }: {
  title: string;
  description: string;
  icon: React.ElementType;
  onDownloadTemplate: () => void;
  onFileUpload: (file: File) => void;
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start gap-4">
        <div className="p-3 bg-slate-100 rounded-full">
          <Icon className="w-8 h-8 text-slate-600" />
        </div>
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1">{description}</CardDescription>
        </div>
      </CardHeader>
      <CardFooter className="flex gap-4">
        <Button variant="outline" onClick={onDownloadTemplate}>
          <Download className="mr-2 h-4 w-4" /> Baixar Template
        </Button>
        <Button onClick={() => fileInputRef.current?.click()}>
          <Upload className="mr-2 h-4 w-4" /> Importar Planilha
        </Button>
      </CardFooter>
      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept=".xlsx, .xls" />
    </Card>
  );
};

export default function DataImportPage() {
  const [importProgress, setImportProgress] = useState<ImportProgress>({ status: 'idle', processed: 0, total: 0, successCount: 0, errorCount: 0, errors: [] });
  const [projects, setProjects] = useState<any[]>([]);
  const [importWizardState, setImportWizardState] = useState<{
    open: boolean;
    step: 'select_sheet' | 'map_columns';
    importType: ImportType | null;
    file: File | null;
    workbook: XLSX.WorkBook | null;
    sheetNames: string[];
    selectedSheet: string;
    headers: string[];
    mappings: Record<string, string>;
  }>({
    open: false,
    step: 'select_sheet',
    importType: null,
    file: null,
    workbook: null,
    sheetNames: [],
    selectedSheet: '',
    headers: [],
    mappings: {},
  });

  useEffect(() => {
    const fetchProjects = async () => {
      const q = query(collection(db, "projects"));
      const snapshot = await getDocs(q);
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    };
    fetchProjects();
  }, []);

  const currentImportConfig = importWizardState.importType ? IMPORT_CONFIG[importWizardState.importType] : null;

  const startImportWizard = (file: File, type: ImportType) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        setImportWizardState({
          open: true,
          step: 'select_sheet',
          importType: type,
          file,
          workbook,
          sheetNames: workbook.SheetNames,
          selectedSheet: workbook.SheetNames[0] || '',
          headers: [],
          mappings: {},
        });
      } catch (error) {
        toast.error("Erro ao ler o arquivo da planilha.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSheetSelect = (sheetName: string) => {
    setImportWizardState(prev => ({ ...prev, selectedSheet: sheetName }));
  };

  const goToMapColumns = () => {
    const { workbook, selectedSheet } = importWizardState;
    if (!workbook || !selectedSheet) return;
    const worksheet = workbook.Sheets[selectedSheet];
    const sheetHeaders = (XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[]) || [];
    setImportWizardState(prev => ({ ...prev, headers: sheetHeaders, step: 'map_columns' }));
  };

  const handleMappingChange = (systemField: string, sheetHeader: string) => {
    setImportWizardState(prev => ({
      ...prev,
      mappings: { ...prev.mappings, [systemField]: sheetHeader }
    }));
  };

  const isMappingValid = useMemo(() => {
    return currentImportConfig?.fields.every(field => !field.required || !!importWizardState.mappings[field.key]);
  }, [importWizardState.mappings, currentImportConfig]);

  const closeWizard = () => {
    setImportWizardState({
      open: false,
      step: 'select_sheet',
      importType: null,
      file: null,
      workbook: null,
      sheetNames: [],
      selectedSheet: '',
      headers: [],
      mappings: {},
    });
  };

  const resetProgress = () => {
    setImportProgress({ status: 'idle', processed: 0, total: 0, successCount: 0, errorCount: 0, errors: [] });
  };

  const processFile = async (workbook: XLSX.WorkBook, sheetName: string, processor: (row: any) => Promise<void>) => {
    resetProgress();
    setImportProgress(prev => ({ ...prev, status: 'importing' }));

      try {
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (json.length === 0) {
          toast.error("Arquivo vazio.");
          setImportProgress(prev => ({ ...prev, status: 'error' }));
          return;
        }

        setImportProgress(prev => ({ ...prev, total: json.length }));
        let localSuccessCount = 0;
        let localErrorCount = 0;

        for (const [index, row] of json.entries()) {
          try {
            await processor(row);
            localSuccessCount++;
          } catch (rowError: any) {
            localErrorCount++;
            setImportProgress(prev => ({ ...prev, errors: [...prev.errors, `Linha ${index + 2}: ${rowError.message}`] }));
          } finally {
            setImportProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
          }
        }

        setImportProgress(prev => ({ ...prev, successCount: localSuccessCount, errorCount: localErrorCount, status: 'success' }));
        toast.success("Importação concluída!", {
          description: `${json.length} linhas processadas. Sucesso: ${localSuccessCount}, Falhas: ${localErrorCount}.`
        });
      } catch (error) {
        toast.error("Erro ao processar o arquivo.");
        setImportProgress(prev => ({ ...prev, status: 'error' }));
      }
  };

  // --- Processadores ---
  const processImport = () => {
    const { workbook, selectedSheet, importType, mappings } = importWizardState;
    if (!workbook || !selectedSheet || !importType) return;

    const processor = async (rawRow: any) => {
      // Mapeia o rawRow para um objeto com as chaves do sistema
      const row: Record<string, any> = {};
      for (const key in mappings) {
        if (mappings[key]) {
          row[key] = rawRow[mappings[key]];
        }
      }

      if (importType === 'projects') {
        if (!row.name) throw new Error("Coluna para 'Nome da Obra' é obrigatória.");
        await addDoc(collection(db, "projects"), {
          code: row.code || "",
          name: row.name,
          description: row.description || "",
          startDate: new Date().toISOString(),
          status: 'planejamento',
          createdAt: new Date().toISOString()
        });
      } else if (importType === 'assets') {
        if (!row.name) throw new Error("Coluna para 'Nome' do ativo é obrigatória.");
        if (!row.projectName) throw new Error("Coluna para 'Nome da Obra' é obrigatória para vincular o ativo.");
        
        const projectName = String(row.projectName).trim();
        const project = projects.find(p => p.name?.trim().toLowerCase() === projectName.toLowerCase());
        if (!project) throw new Error(`Obra '${projectName}' não encontrada.`);

        await addDoc(collection(db, "assets"), {
          projectId: project.id,
          assetNumber: row.assetNumber || "",
          tagNumber: row.tagNumber || "",
          name: row.name,
          description: row.description || "",
          value: Number(row.value || 0),
          status: 'concluido',
          createdAt: new Date().toISOString()
        });
      }
    };

    processFile(workbook, selectedSheet, processor);
    closeWizard();
  };

  const handleProjectUpload = (file: File) => {
    startImportWizard(file, 'projects');
  };

  const handleAssetUpload = (file: File) => {
    startImportWizard(file, 'assets');
  };

  const handleExpenseUpload = (file: File) => {
    // Mantém o comportamento antigo para despesas por enquanto
    const originalProcessor = async (row: any) => {
      if (!row["Descrição"] || !row["Valor"]) throw new Error("Colunas 'Descrição' e 'Valor' são obrigatórias.");
      const projectName = row["Nome da Obra"] ? String(row["Nome da Obra"]).trim() : "";
      const project = projects.find(p => p.name?.trim().toLowerCase() === projectName.toLowerCase());
      if (!project) throw new Error(`Obra '${projectName}' não encontrada.`);

      await addDoc(collection(db, "projects"), {
        projectId: project.id,
        description: row["Descrição"],
        amount: Number(row["Valor"]),
        type: (row["Tipo (Capex/Opex)"] || "opex").toLowerCase(),
        date: new Date(),
        createdAt: new Date().toISOString()
      });
    };

    const reader = new FileReader();
    reader.onload = async (e) => {
      const data = e.target?.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      await processFile(workbook, sheetName, originalProcessor);
    };
    reader.readAsArrayBuffer(file);
  };

  // --- Downloads de Template ---
  const downloadTemplate = (headers: string[], example: string[], filename: string) => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length, 15) }));
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, filename);
  };

  const downloadProjectTemplate = () => downloadTemplate(
    ["Código", "Nome da Obra", "Descrição"],
    ["OB-001", "Residencial Alpha", "Construção de torre residencial"],
    "template_obras.xlsx"
  );

  const downloadAssetTemplate = () => downloadTemplate(
    ["Número do Ativo", "Plaqueta", "Nome", "Descrição", "Valor (R$)", "Nome da Obra"],
    ["ATV-001", "PLQ-1001", "Betoneira 400L", "Betoneira para obra", "2500.00", "Residencial Alpha"],
    "template_ativos.xlsx"
  );

  const downloadExpenseTemplate = () => downloadTemplate(
    ["Descrição", "Valor", "Tipo (Capex/Opex)", "Nome da Obra"],
    ["Compra de Cimento", "500.00", "opex", "Residencial Alpha"],
    "template_despesas.xlsx"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Importação de Dados</h1>
      </div>

      <Card className="bg-amber-50 border-amber-200">
        <CardHeader className="flex flex-row items-center gap-4">
          <AlertTriangle className="w-6 h-6 text-amber-600" />
          <div>
            <CardTitle className="text-amber-800 text-lg">Como Funciona a Importação</CardTitle>
            <CardDescription className="text-amber-700 mt-1">Para usar uma planilha como banco de dados, primeiro exporte-a como um arquivo Excel (.xlsx). Em seguida, utilize as abas abaixo para baixar o template correto, preencher seus dados e importá-los para o sistema. Isso garante que seus dados fiquem sincronizados e disponíveis em todas as telas.</CardDescription>
          </div>
        </CardHeader>
      </Card>

      {importProgress.status !== 'idle' && (
        <Card>
          <CardHeader>
            <CardTitle>Progresso da Importação</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={(importProgress.processed / importProgress.total) * 100} />
            <div className="flex justify-between text-sm">
              <span>{importProgress.processed} / {importProgress.total} linhas processadas</span>
              <div className="flex gap-4">
                <span className="text-green-600 font-medium">Sucesso: {importProgress.successCount}</span>
                <span className="text-red-600 font-medium">Falhas: {importProgress.errorCount}</span>
              </div>
            </div>
            {importProgress.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto bg-red-50 p-3 rounded-md border border-red-200 text-red-800 text-xs space-y-1">
                <h4 className="font-bold">Detalhes dos Erros:</h4>
                {importProgress.errors.slice(0, 10).map((err, i) => <p key={i}>{err}</p>)}
                {importProgress.errors.length > 10 && <p>... e mais {importProgress.errors.length - 10} erros.</p>}
              </div>
            )}
            {importProgress.status === 'success' && (
              <Button onClick={resetProgress}>Nova Importação</Button>
            )}
          </CardContent>
        </Card>
      )}

      {importProgress.status === 'idle' && (
        <Tabs defaultValue="projects" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="assets">Ativos</TabsTrigger>
            <TabsTrigger value="projects">Obras</TabsTrigger>
            <TabsTrigger value="expenses">Despesas</TabsTrigger>
          </TabsList>
          <TabsContent value="assets">
            <ImportCard
              title="Importar Ativos"
              description="Carregue uma lista de ativos para o sistema. Associe-os a uma obra existente através da coluna 'Nome da Obra'."
              icon={Package}
              onDownloadTemplate={downloadAssetTemplate}
              onFileUpload={handleAssetUpload}
            />
          </TabsContent>
          <TabsContent value="projects">
            <ImportCard
              title="Importar Obras"
              description="Cadastre novas obras em lote a partir de uma planilha."
              icon={HardHat}
              onDownloadTemplate={downloadProjectTemplate}
              onFileUpload={handleProjectUpload}
            />
          </TabsContent>
          <TabsContent value="expenses">
            <ImportCard
              title="Importar Despesas"
              description="Importe despesas e vincule-as a obras existentes. A coluna 'Nome da Obra' é obrigatória."
              icon={FileText}
              onDownloadTemplate={downloadExpenseTemplate}
              onFileUpload={handleExpenseUpload}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* Import Wizard Dialog */}
      <Dialog open={importWizardState.open} onOpenChange={closeWizard}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Assistente de Importação: {currentImportConfig?.title}</DialogTitle>
            <DialogDescription>
              Siga os passos para importar os dados da sua planilha.
            </DialogDescription>
          </DialogHeader>

          {importWizardState.step === 'select_sheet' && (
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <Sheet className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold">Passo 1: Selecione a Aba</h3>
              </div>
              <Select value={importWizardState.selectedSheet} onValueChange={handleSheetSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a aba da planilha..." />
                </SelectTrigger>
                <SelectContent>
                  {importWizardState.sheetNames.map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <DialogFooter>
                <Button onClick={goToMapColumns}>
                  Próximo <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </DialogFooter>
            </div>
          )}

          {importWizardState.step === 'map_columns' && currentImportConfig && (
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-5 h-5 text-green-600" />
                <h3 className="font-semibold">Passo 2: Mapeie as Colunas</h3>
              </div>
              <p className="text-xs text-slate-500">Vincule as colunas da sua planilha aos campos do sistema. Campos com * são obrigatórios.</p>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
                {currentImportConfig.fields.map(field => (
                  <div key={field.key} className="grid grid-cols-2 gap-4 items-center">
                    <Label>
                      {field.label} {field.required && <span className="text-red-500">*</span>}
                    </Label>
                    <Select value={importWizardState.mappings[field.key] || ''} onValueChange={(val) => handleMappingChange(field.key, val)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a coluna..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">-- Ignorar --</SelectItem>
                        {importWizardState.headers.map(header => (
                          <SelectItem key={header} value={header}>{header}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportWizardState(prev => ({...prev, step: 'select_sheet'}))}>Voltar</Button>
                <Button onClick={processImport} disabled={!isMappingValid}>
                  Confirmar e Importar
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}