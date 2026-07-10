import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Pencil, Trash2, Download, Upload, Plus, Briefcase, MapPin, DollarSign, TrendingUp, FileText, Check, Globe, Info, CheckCircle2, XCircle, AlertTriangle, BarChart3 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import ProjectEditModal from "./ProjectEditModal";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatDate = (value: any) => {
  if (!value) return "-";
  const date = new Date(value);
  return isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
};

export default function ProjectsPage() {
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [location, setLocation] = useLocation();

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data.sort((a: any, b: any) => {
        const codeA = a.code || "";
        const codeB = b.code || "";
        return codeA.localeCompare(codeB, undefined, { numeric: true });
      }));
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const [open, setOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewProject, setViewProject] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const handleEdit = useCallback((project: any) => {
    setEditingProject(project);
    setOpen(true);
  }, []);

  // Efeito para abrir modal de visualização ou edição a partir da URL
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const viewProjectId = params.get('viewProject');
    const editProjectId = params.get('editProject');

    if (projects.length > 0 && (viewProjectId || editProjectId)) {
      const project = projects.find(p => p.id === (viewProjectId || editProjectId));
      if (project) {
        if (viewProjectId) {
          setViewProject(project);
        } else if (editProjectId) {
          handleEdit(project);
        }
        // Limpa o parâmetro da URL para evitar reabrir ao atualizar
        setLocation(location.pathname, { replace: true });
      }
    }
  }, [projects, location.search, setLocation, handleEdit]);

  const statusColors: { [key: string]: string } = {
    aguardando_classificacao: 'bg-blue-100 text-blue-800',
    aguardando_engenharia: 'bg-yellow-100 text-yellow-800',
    aguardando_diretoria: 'bg-orange-100 text-orange-800',
    aprovado: 'bg-green-100 text-green-800',
    rejeitado: 'bg-red-100 text-red-800',
    planejamento: 'bg-gray-100 text-gray-800',
    em_andamento: 'bg-purple-100 text-purple-800',
    concluido: 'bg-teal-100 text-teal-800',
    pausado: 'bg-pink-100 text-pink-800',
  };

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta obra?")) return;
    try {
      await deleteDoc(doc(db, "projects", id));
      toast.success("Obra excluída com sucesso!");
    } catch (error) {
      toast.error("Erro ao excluir obra");
    }
  };

  const handleDownloadTemplate = () => {
    const headers = ["Código", "Nome da Obra", "Descrição", "Data de Início (DD/MM/AAAA)", "Data de Previsão de Conclusão (DD/MM/AAAA)", "Localização", "Centro de Custo", "Capex Planejado", "Opex Planejado", "Valor Planejado"];
    const example = ["OBRA-001", "Residencial Horizonte", "Construção de torre residencial", "01/03/2024", "31/12/2025", "Curitiba, PR", "CC-OBRA-01", "3000000", "2000000", "5000000"];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    
    // Ajuste de largura das colunas
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 25 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }];
    ws['!cols'] = [{ wch: 15 }, { wch: 30 }, { wch: 40 }, { wch: 25 }, { wch: 35 }, { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Template Obras");
    XLSX.writeFile(wb, "template_importacao_obras.xlsx");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
          toast.error("O arquivo está vazio.");
          setIsImporting(false);
          return;
        }

        let successCount = 0;
        
        const promises = json.map(async (row: any, index: number) => {
            const name = row["Nome da Obra"];
            if (!name) return; // Pula linhas sem nome

            // Gera um código automático se não estiver na planilha
            const code = row["Código"] ? String(row["Código"]) : `OBRA-${Date.now().toString().slice(-6)}-${index + 1}`;

            const description = row["Descrição"] || "";
            let startDate = new Date().toISOString();

            const parseDate = (val: any) => {
                if (!val) return null;
                if (val instanceof Date) return val.toISOString();
                if (typeof val === 'string') {
                    if (val.includes('/')) {
                        const [day, month, year] = val.split('/');
                        const d = new Date(`${year}-${month}-${day}`);
                        if (!isNaN(d.getTime())) return d.toISOString();
                    }
                    const d = new Date(val);
                    if (!isNaN(d.getTime())) return d.toISOString();
                }
                return null;
            };
            
            const dStart = parseDate(row["Data de Início (DD/MM/AAAA)"] || row["Data de Início (AAAA-MM-DD)"]);
            if (dStart) startDate = dStart;

            const estimatedEndDate = parseDate(row["Data de Previsão de Conclusão (DD/MM/AAAA)"] || row["Data de Previsão de Conclusão (AAAA-MM-DD)"]);

            const location = row["Localização"] || "";
            const costCenter = row["Centro de Custo"] || "";
            
            const plannedCapex = row["Capex Planejado"] ? Number(row["Capex Planejado"]) : 0;
            const plannedOpex = row["Opex Planejado"] ? Number(row["Opex Planejado"]) : 0;
            const plannedValue = row["Valor Planejado"] ? Number(row["Valor Planejado"]) : (plannedCapex + plannedOpex);

            await addDoc(collection(db, "projects"), {
                code,
                name,
                description,
                startDate,
                estimatedEndDate,
                location,
                costCenter,
                plannedCapex,
                plannedOpex,
                plannedValue,
                status: 'aguardando_classificacao',
                createdAt: new Date().toISOString()
            });
            successCount++;
        });

        await Promise.all(promises);
        toast.success(`${successCount} obras importadas com sucesso!`);
      } catch (error) {
        console.error("Erro na importação:", error);
        toast.error("Erro ao processar o arquivo de importação.");
      } finally {
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Obras</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleDownloadTemplate}>
            <Download className="mr-2 h-4 w-4" />
            Template
          </Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importar
          </Button>
          <Input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
          />
        <Button className="gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => { setEditingProject(null); setOpen(true); }}>
          <Plus size={20} />
          Nova Obra
        </Button>
        <ProjectEditModal
          open={open}
          onOpenChange={setOpen}
          projectToEdit={editingProject}
        />
        </div>

        <Dialog open={!!viewProject} onOpenChange={(open) => !open && setViewProject(null)}>
          <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                <Briefcase size={24} className="text-blue-600" />
                Projeto: {viewProject?.name}
              </DialogTitle>
              <DialogDescription className="text-sm">Visão completa dos indicadores operacionais e financeiros.</DialogDescription>
            </DialogHeader>
            {viewProject && (
              <div className="flex-1 overflow-hidden flex flex-col">
                <Tabs defaultValue="gerais" className="flex-1 flex flex-col overflow-hidden">
                  <TabsList className="px-6 bg-slate-100/50 justify-start h-12 rounded-none border-b gap-4">
                    <TabsTrigger value="gerais" className="gap-2 text-sm"><Briefcase size={14}/> Dados Gerais</TabsTrigger>
                    <TabsTrigger value="localizacao" className="gap-2 text-sm"><MapPin size={14}/> Localização</TabsTrigger>
                    <TabsTrigger value="financeiro" className="gap-2 text-sm"><DollarSign size={14}/> Financeiro</TabsTrigger>
                    <TabsTrigger value="viabilidade" className="gap-2 text-sm"><TrendingUp size={14}/> Viabilidade</TabsTrigger>
                    <TabsTrigger value="itens" className="gap-2 text-sm"><FileText size={14}/> Itens</TabsTrigger>
                    <TabsTrigger value="arquivos" className="gap-2 text-sm"><FileText size={14}/> Arquivos</TabsTrigger>
                  </TabsList>

                  <div className="flex-1 overflow-y-auto p-6">
                    <TabsContent value="gerais" className="m-0 space-y-6">
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Nome da Obra</label>
                          <p className="text-lg font-bold text-slate-800">{viewProject.name}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Código</label>
                          <p className="text-lg font-mono text-blue-600">{viewProject.code || "-"}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Cliente</label>
                          <p className="text-lg font-medium">{viewProject.client || "-"}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Responsável</label>
                          <p className="text-lg font-medium">{viewProject.responsible || "-"}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Centro de Custo</label>
                          <p className="text-lg font-medium">{viewProject.costCenter || "-"}</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-semibold text-slate-500 uppercase">Início</label>
                          <p className="text-lg font-medium">{formatDate(viewProject.startDate)}</p>
                        </div>
                      </div>

                      <div className="pt-6 border-t">
                        <h4 className="text-sm font-bold text-slate-700 mb-8">Fluxo de Aprovação</h4>
                        <div className="relative flex items-center justify-between px-10">
                          <div className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-2 bg-slate-100 -z-10 rounded-full" />
                          <div 
                            className={`absolute left-0 top-4 transform -translate-y-1/2 h-2 -z-10 transition-all duration-500 rounded-full ${
                              steps.findIndex(s => s.id === viewProject.status) >= 0 ? steps[steps.findIndex(s => s.id === viewProject.status)].color : 'bg-blue-600'
                            }`} 
                            style={{ width: `${(Math.max(0, steps.findIndex(s => s.id === viewProject.status)) / (steps.length - 1)) * 100}%` }} 
                          />
                          {steps.map((step, index) => {
                            const currentStepIndex = steps.findIndex(s => s.id === viewProject.status);
                            const isCompletedStep = index <= currentStepIndex;
                            const isCurrent = index === currentStepIndex;
                            const approvalInfo = viewProject.approvalHistory?.slice().reverse().find((h: any) => h.status === step.id);

                            return (
                              <div key={step.id} className="flex flex-col items-center group relative">
                                <div className={`w-8 h-8 rounded-full border-2 z-10 transition-all duration-300 flex items-center justify-center ${isCompletedStep ? `${step.color} ${step.border} shadow-md text-white scale-110` : 'bg-white border-slate-300 text-slate-400'}`}>
                                  {isCompletedStep ? <Check size={16} /> : <span className="text-xs font-bold">{index + 1}</span>}
                                </div>
                                <span className={`absolute -bottom-8 text-xs font-bold whitespace-nowrap ${isCurrent ? step.text : 'text-slate-500'}`}>
                                  {step.label}
                                </span>
                                {approvalInfo && (
                                  <div className="absolute top-16 flex flex-col items-center w-32 text-center z-20">
                                    <span className="text-xs font-black text-slate-700 leading-tight">{approvalInfo.user}</span>
                                    <span className="text-sm text-slate-500 font-medium">{new Date(approvalInfo.date).toLocaleString('pt-BR')}</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="itens" className="m-0 space-y-4">
                      <h4 className="text-sm font-bold text-slate-700">Itens do Projeto</h4>
                      {viewProject.items && viewProject.items.length > 0 ? (
                        <div className="space-y-2 max-h-96 overflow-y-auto pr-2 border rounded-md p-2 bg-slate-50/50">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead className="text-xs font-bold uppercase">Descrição</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-center">Qtd</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-right">Valor Unit.</TableHead>
                                <TableHead className="text-xs font-bold uppercase text-right">Total</TableHead>
                                {(user as any)?.role === 'classificacao' && viewProject.status === 'aguardando_classificacao' && (
                                  <TableHead className="text-xs font-bold uppercase text-center w-[150px]">Classificação</TableHead>
                                )}
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {viewProject.items.map((item: any, index: number) => (
                                <TableRow key={index}>
                                  <TableCell className="text-sm">{item.description}</TableCell>
                                  <TableCell className="text-sm text-center">{item.quantity}</TableCell>
                                  <TableCell className="text-sm text-right">{formatCurrency(Number(item.value))}</TableCell>
                                  <TableCell className="text-sm text-right font-bold">{formatCurrency(Number(item.quantity) * Number(item.value))}</TableCell>
                                  {(user as any)?.role === 'classificacao' && viewProject.status === 'aguardando_classificacao' && (
                                    <TableCell>
                                      <Select
                                        defaultValue={item.classification}
                                        onValueChange={async (value) => {
                                          const newItems = [...viewProject.items];
                                          newItems[index].classification = value;
                                          await updateDoc(doc(db, "projects", viewProject.id), { items: newItems });
                                          toast.success(`Item '${item.description}' classificado como ${value.toUpperCase()}.`);
                                        }}
                                      >
                                        <SelectTrigger className="h-8 text-xs bg-white"><SelectValue placeholder="Classificar..." /></SelectTrigger>
                                        <SelectContent><SelectItem value="capex">CAPEX</SelectItem><SelectItem value="opex">OPEX</SelectItem></SelectContent>
                                      </Select>
                                    </TableCell>
                                  )}
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      ) : <p className="text-sm text-slate-500 italic">Nenhum item cadastrado para este projeto.</p>}
                    </TabsContent>

                    <TabsContent value="localizacao" className="m-0 space-y-6">
                      <div className="space-y-2">
                        <label className="text-sm font-bold text-slate-700">Endereço Registrado</label>
                        <div className="p-4 bg-slate-50 border rounded-xl flex items-start gap-4">
                          <MapPin size={24} className="text-blue-600 shrink-0 mt-1" />
                          <div className="space-y-2">
                            <p className="text-base font-bold text-slate-800">{viewProject.address || "Não informado"}</p>
                            <p className="text-sm text-slate-500 font-medium">{viewProject.city} - {viewProject.state} | {viewProject.cep}</p>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-6">
                        <div className="p-4 bg-slate-50 border rounded-xl space-y-2">
                          <h5 className="text-sm font-bold text-slate-600 flex items-center gap-2"><Globe size={16}/> Coordenadas</h5>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Lat</p>
                              <p className="text-sm font-mono">{viewProject.lat || "-"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase">Lng</p>
                              <p className="text-sm font-mono">{viewProject.lng || "-"}</p>
                            </div>
                          </div>
                        </div>
                        {viewProject.mapsLink && (
                          <div className="flex items-center justify-center">
                            <Button variant="outline" className="h-12 px-6 gap-2" onClick={() => window.open(viewProject.mapsLink, '_blank')}>
                              <MapPin size={18} /> Google Maps
                            </Button>
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="financeiro" className="m-0 space-y-6">
                      <div className="grid grid-cols-3 gap-4">
                        <Card className="p-4 bg-blue-50 border-blue-200">
                          <label className="text-xs font-bold text-blue-600 uppercase mb-2 block tracking-wider">CAPEX</label>
                          <p className="text-2xl font-black text-blue-900">{formatCurrency(viewProject.plannedCapex || 0)}</p>
                        </Card>
                        <Card className="p-4 bg-slate-50 border-slate-200">
                          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block tracking-wider">OPEX (Mês)</label>
                          <p className="text-2xl font-black text-slate-800">{formatCurrency(viewProject.plannedOpex || 0)}</p>
                        </Card>
                        <Card className="p-4 bg-green-50 border-green-200">
                          <label className="text-xs font-bold text-green-600 uppercase mb-2 block tracking-wider">Receita (Mês)</label>
                          <p className="text-2xl font-black text-green-900">{formatCurrency(viewProject.monthlyRevenue || 0)}</p>
                        </Card>
                      </div>

                      <div className="mt-6 p-6 bg-slate-900 text-white rounded-xl space-y-4">
                        <h4 className="text-base font-bold flex items-center gap-2">
                          <Info size={18} className="text-blue-400" /> Resumo de Regras
                        </h4>
                        <div className="grid grid-cols-2 gap-x-10 gap-y-2 text-sm">
                          <div className="flex justify-between border-b border-slate-700 pb-1">
                            <span className="text-slate-400">TMA:</span>
                            <span className="font-bold text-blue-400">{viewProject.discountRate}% a.a.</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-700 pb-1">
                            <span className="text-slate-400">Margem:</span>
                            <span className="font-bold text-green-400">{viewAnalysis?.margin.toFixed(1)}%</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-700 pb-1">
                            <span className="text-slate-400">Lucro Mensal:</span>
                            <span className="font-bold">{formatCurrency(viewAnalysis?.monthlyProfit || 0)}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-700 pb-1">
                            <span className="text-slate-400">Lucro Anual:</span>
                            <span className="font-bold">{formatCurrency(viewAnalysis?.annualProfit || 0)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-blue-300 italic font-medium">* TMA utilizada como taxa de desconto no VPL.</p>
                      </div>
                    </TabsContent>

                    <TabsContent value="viabilidade" className="m-0 space-y-6">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card className="p-8 bg-slate-50 shadow-sm">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">ROI Anual</p>
                            <TooltipProvider><Tooltip><TooltipTrigger><Info size={12} className="text-slate-400"/></TooltipTrigger><TooltipContent>Fórmula: ( (Lucro Mensal × 12) / CAPEX ) × 100</TooltipContent></Tooltip></TooltipProvider>
                          </div>
                          <p className={`text-2xl font-black mt-2 ${viewAnalysis && viewAnalysis.roi > 15 ? 'text-green-600' : 'text-orange-600'}`}>
                            {viewAnalysis?.roi.toFixed(1)}%
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium">Rentabilidade em 12m.</p>
                        </Card>
                        <Card className="p-8 bg-slate-50 shadow-sm">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Payback</p>
                            <TooltipProvider><Tooltip><TooltipTrigger><Info size={12} className="text-slate-400"/></TooltipTrigger><TooltipContent>Fórmula: CAPEX / Lucro Mensal</TooltipContent></Tooltip></TooltipProvider>
                          </div>
                          <p className="text-2xl font-black text-slate-700 mt-2">
                            {viewAnalysis?.paybackSimples.toFixed(1)} <span className="text-sm font-normal">meses</span>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium">Tempo para break-even.</p>
                        </Card>
                        <Card className="p-8 bg-slate-50 shadow-sm">
                          <div className="flex items-center gap-2">
                            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">VPL (24m)</p>
                            <TooltipProvider><Tooltip><TooltipTrigger><Info size={12} className="text-slate-400"/></TooltipTrigger><TooltipContent>Soma do lucro descontado pela TMA ao longo de 24 meses.</TooltipContent></Tooltip></TooltipProvider>
                          </div>
                          <p className={`text-xl font-black mt-2 ${viewAnalysis && viewAnalysis.vpl > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(viewAnalysis?.vpl || 0)}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-1 font-medium">VPL (TMA {viewProject.discountRate}%).</p>
                        </Card>
                        <Card className={`p-8 border-2 shadow-md ${viewAnalysis?.health === 'viable' ? 'bg-green-50 border-green-500' : viewAnalysis?.health === 'unviable' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-500'}`}>
                          <p className="text-xs font-black text-slate-500 uppercase">Viabilidade</p>
                          <div className="flex items-center gap-2 mt-2">
                            {viewAnalysis?.health === 'viable' ? <CheckCircle2 size={24} className="text-green-600" /> : viewAnalysis?.health === 'unviable' ? <XCircle size={24} className="text-red-600" /> : <AlertTriangle size={24} className="text-yellow-600" />}
                            <span className="font-black text-sm uppercase">
                              {viewAnalysis?.health === 'viable' ? 'Viável' : viewAnalysis?.health === 'unviable' ? 'Inviável' : 'Atenção'}
                            </span>
                          </div>
                        </Card>
                      </div>

                      <div className="space-y-2 mt-6">
                        <h5 className="text-sm font-bold text-slate-700 flex items-center gap-2"><BarChart3 size={16}/> Projeção de Retorno (Cash Flow)</h5>
                        <div className="h-48 w-full bg-white border rounded-xl p-4 shadow-inner">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={viewAnalysis?.chartData}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                              <XAxis dataKey="month" tick={{fontSize: 10}} />
                              <YAxis tick={{fontSize: 10}} tickFormatter={(v) => formatCurrency(v)} />
                              <RechartsTooltip formatter={(v: number) => formatCurrency(v)} />
                              <Area type="monotone" dataKey="balance" stroke="#3b82f6" fill="#dbeafe" strokeWidth={2} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                        <p className="text-[10px] text-muted-foreground italic text-right font-medium">* Simulação linear de 24 meses.</p>
                      </div>

                      <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg space-y-3">
                        <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                          <Info size={16} /> Memória de Cálculo e Fórmulas
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 text-xs text-blue-700">
                          <div className="flex justify-between border-b border-blue-200 pb-1">
                            <span className="font-semibold">ROI Anual (Return on Investment):</span>
                            <span>( (Receita Mensal - OPEX) × 12 / CAPEX ) × 100</span>
                          </div>
                          <div className="flex justify-between border-b border-blue-200 pb-1">
                            <span className="font-semibold">Payback Simples (Retorno):</span>
                            <span>CAPEX / (Receita Mensal - OPEX)</span>
                          </div>
                          <div className="flex justify-between border-b border-blue-200 pb-1">
                            <span className="font-semibold">VPL (Valor Presente Líquido):</span>
                            <span>Σ [Lucro / (1 + i)^t] - CAPEX</span>
                          </div>
                        </div>
                        <p className="text-[10px] text-blue-600 font-medium">* i = Taxa de TMA ({viewProject.discountRate}%) | t = Período (24 meses).</p>
                      </div>
                    </TabsContent>

                    <TabsContent value="arquivos" className="m-0 space-y-4">
                      <h4 className="text-sm font-bold text-slate-700">Documentação Centralizada</h4>
                      <div className="grid grid-cols-1 gap-3">
                        {viewProject && viewProject.attachments && viewProject.attachments.length > 0 ? (
                          viewProject.attachments.map((file: any, idx: number) => (
                            <div key={idx} className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition-colors">
                              <div className="flex items-center gap-4 overflow-hidden">
                                <FileText size={24} className="text-blue-600 shrink-0" />
                                <div className="space-y-1">
                                  <p className="text-sm font-bold text-blue-900 truncate">{file.name}</p>
                                  <p className="text-[10px] text-blue-600 font-medium uppercase">{file.type?.split('/')[1] || "Documento"}</p>
                                </div>
                              </div>
                              <Button variant="outline" size="sm" className="h-9 px-4 gap-2" onClick={() => {
                                const link = document.createElement('a');
                                link.href = file.data;
                                link.download = file.name;
                                link.click();
                              }}>
                                <Download size={24} /> Baixar
                              </Button>
                            </div>
                          ))
                        ) : (
                          <div className="p-10 text-center border-2 border-dashed rounded-xl">
                            <FileText size={32} className="mx-auto text-slate-200 mb-2" />
                            <p className="text-sm text-slate-400 font-medium">Nenhum arquivo anexado.</p>
                          </div>
                        )}
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
                
                <DialogFooter className="p-6 border-t bg-slate-50 gap-2">
                  <Button variant="outline" onClick={() => setViewProject(null)}>Fechar</Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {/* Projects Grid */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <Table className="text-base min-w-full">
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="font-bold">Código</TableHead>
              <TableHead className="font-bold">Nome</TableHead>
              <TableHead className="font-bold">Descrição</TableHead>
              <TableHead className="font-bold">Localização</TableHead>
              <TableHead className="font-bold">Data Início</TableHead>
              <TableHead className="font-bold">Conclusão</TableHead>
              <TableHead className="font-bold">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects && projects.length > 0 ? (
              projects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-mono text-sm">{(project as any).code || "-"}</TableCell>
                  <TableCell className="font-medium">
                    <span className="cursor-pointer hover:text-blue-600 hover:underline" onClick={() => setViewProject(project)}>
                      {project.name}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate" title={project.description || ""}>{project.description || "-"}</TableCell>
                  <TableCell>{project.location || "-"}</TableCell>
                  <TableCell>{formatDate(project.startDate)}</TableCell>
                  <TableCell>{formatDate(project.estimatedEndDate)}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium w-fit ${statusColors[project.status]}`}>
                      {project.status.replace('_', ' ')}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleEdit(project)} className="h-8 w-8 text-blue-600"><Pencil size={18} /></Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(project.id)} className="h-8 w-8 text-red-600"><Trash2 size={18} /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-gray-500">
                  Nenhuma obra cadastrada. Crie uma nova obra para começar!
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
    