import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, doc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Plus, Trash2, Briefcase, User, Calendar, MapPin, Globe, DollarSign, TrendingUp, BarChart3, Info, AlertTriangle, FileText, X, ArrowRightLeft, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Label } from "@/components/ui/label";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

interface ProjectEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectToEdit: any | null;
  defaultTab?: string;
  onSuccess?: () => void;
}

export default function ProjectEditModal({ open, onOpenChange, projectToEdit, defaultTab = "gerais", onSuccess }: ProjectEditModalProps) {
  const { user } = useAuth();
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isClassifier = (user as any)?.role === 'classificacao';
  const editingId = projectToEdit?.id || null;

  const [formData, setFormData] = useState({
    code: "",
    defaultTab: "gerais",
    name: "",
    client: "",
    responsible: "",
    projectType: "construcao",
    description: "",
    startDate: new Date().toISOString().split("T")[0],
    estimatedEndDate: "",
    address: "",
    city: "",
    state: "",
    cep: "",
    mapsLink: "",
    lat: "",
    lng: "",
    costCenter: "",
    plannedCapex: "0",
    plannedOpex: "0",
    monthlyRevenue: "0",
    discountRate: "10",
    monthlyDistribution: Array(12).fill(""),
    attachments: [] as { name: string; type: string; data: string; }[],
    existingAttachments: [] as { name: string; type: string; data: string; }[],
    items: [] as { description: string; quantity: string; value: string; classification?: 'capex' | 'opex' }[],
  });
  const [distributionType, setDistributionType] = useState<'value' | 'percentage'>('value');

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "cost_centers"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCostCenters(data.sort((a: any, b: any) => a.code.localeCompare(b.code, undefined, { numeric: true })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (projectToEdit) {
      let formattedDate = "";
      try {
        formattedDate = projectToEdit.startDate ? new Date(projectToEdit.startDate).toISOString().split("T")[0] : "";
      } catch (e) { console.error("Invalid date:", projectToEdit.startDate); }

      let formattedEndDate = "";
      try {
        formattedEndDate = projectToEdit.estimatedEndDate ? new Date(projectToEdit.estimatedEndDate).toISOString().split("T")[0] : "";
      } catch (e) { console.error("Invalid end date:", projectToEdit.estimatedEndDate); }

      setFormData({
        code: projectToEdit.code || "",
        defaultTab: defaultTab,
        name: projectToEdit.name,
        client: projectToEdit.client || "",
        responsible: projectToEdit.responsible || "",
        projectType: projectToEdit.projectType || "construcao",
        description: projectToEdit.description || "",
        startDate: formattedDate,
        estimatedEndDate: formattedEndDate,
        address: projectToEdit.address || "",
        city: projectToEdit.city || "",
        state: projectToEdit.state || "",
        cep: projectToEdit.cep || "",
        mapsLink: projectToEdit.mapsLink || "",
        lat: projectToEdit.lat || "",
        lng: projectToEdit.lng || "",
        costCenter: projectToEdit.costCenter || "",
        plannedCapex: projectToEdit.plannedCapex !== undefined ? String(projectToEdit.plannedCapex) : (projectToEdit.plannedValue ? String(projectToEdit.plannedValue) : ""),
        plannedOpex: projectToEdit.plannedOpex !== undefined ? String(projectToEdit.plannedOpex) : "",
        monthlyRevenue: projectToEdit.monthlyRevenue || "0",
        discountRate: projectToEdit.discountRate || "10",
        monthlyDistribution: projectToEdit.monthlyDistribution ? projectToEdit.monthlyDistribution.map(String) : Array(12).fill(""),
        attachments: [],
        existingAttachments: projectToEdit.attachments || [],
        items: projectToEdit.items?.map((item: any) => ({ ...item, quantity: String(item.quantity || '1'), value: String(item.value || '') })) || [],
      });
    } else {
      // Reset form for new project
      setFormData({
        code: "", defaultTab: defaultTab, name: "", client: "", responsible: "", projectType: "construcao",
        description: "", startDate: new Date().toISOString().split("T")[0], estimatedEndDate: "", address: "",
        city: "", state: "", cep: "", mapsLink: "", lat: "", lng: "", costCenter: "",
        plannedCapex: "0", plannedOpex: "0", monthlyRevenue: "0", discountRate: "10",
        monthlyDistribution: Array(12).fill(""), attachments: [], existingAttachments: [], items: [],
      });
    }
  }, [projectToEdit, open, defaultTab]);

  const handleClose = () => {
    onOpenChange(false);
    setFormData({
      code: "", defaultTab: defaultTab, name: "", client: "", responsible: "", projectType: "construcao",
      description: "", startDate: new Date().toISOString().split("T")[0], estimatedEndDate: "", address: "",
      city: "", state: "", cep: "", mapsLink: "", lat: "", lng: "", costCenter: "",
      plannedCapex: "0", plannedOpex: "0", monthlyRevenue: "0", discountRate: "10",
      monthlyDistribution: Array(12).fill(""), attachments: [], existingAttachments: [], items: [],
    });
    setDistributionType('value');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    // Lógica específica para o classificador
    if (isClassifier && editingId) {
      try {
        const itemsToUpdate = formData.items.map(item => ({
          description: item.description,
          quantity: Number(item.quantity),
          value: Number(item.value),
          classification: item.classification || null
        }));

        // Recalcula os totais de CAPEX e OPEX com base nos itens classificados
        const { totalCapex, totalOpex } = itemsToUpdate.reduce((acc, item) => {
          const value = (Number(item.quantity) || 1) * (Number(item.value) || 0);
          if (item.classification === 'opex') {
            acc.totalOpex += value;
          } else { // Itens sem classificação ou classificados como CAPEX
            acc.totalCapex += value;
          }
          return acc;
        }, { totalCapex: 0, totalOpex: 0 });

        await updateDoc(doc(db, "projects", editingId), {
          items: itemsToUpdate,
          plannedCapex: totalCapex,
          plannedOpex: totalOpex,
          updatedAt: new Date().toISOString()
        });
        
        toast.success("Classificação dos itens salva com sucesso!");
        if (onSuccess) onSuccess();
        handleClose();
      } catch (error) {
        toast.error("Erro ao salvar a classificação dos itens.");
      } finally {
        setIsLoading(false);
      }
      return; // Finaliza a execução para o classificador
    }

    const plannedValue = (Number(formData.plannedCapex) || 0);
    try {
      const allAttachments = [...formData.existingAttachments, ...formData.attachments];
      const { attachments, existingAttachments, ...restFormData } = formData;

      const payload = {
        ...restFormData,
        attachments: allAttachments,
        plannedCapex: Number(formData.plannedCapex),
        plannedOpex: Number(formData.plannedOpex),
        monthlyRevenue: Number(formData.monthlyRevenue),
        discountRate: Number(formData.discountRate),
        plannedValue: formData.items.length > 0
          ? formData.items.reduce((acc, item) => acc + (Number(item.quantity) * Number(item.value)), 0)
          : plannedValue,
        items: formData.items.map(item => ({ ...item, quantity: Number(item.quantity), value: Number(item.value) })),
        monthlyDistribution: formData.monthlyDistribution.map(v => Number(v) || 0),
        updatedAt: new Date().toISOString()
      };

      if (editingId) {
        const originalItems = projectToEdit?.items?.map((item: any) => ({ ...item, quantity: Number(item.quantity), value: Number(item.value) })) || [];
        const hasItemsChanged = JSON.stringify(originalItems) !== JSON.stringify(payload.items);

        // Se os itens mudaram, verifica se o projeto precisa voltar para classificação
        if (hasItemsChanged) {
          const approvedStatuses = ['aprovado', 'em_andamento', 'concluido'];
          const isApproved = approvedStatuses.includes(projectToEdit.status);
          const newTotalValue = payload.items.reduce((acc, item) => acc + (item.quantity * item.value), 0);
          const originalPlannedValue = projectToEdit.plannedValue || 0;

          // Se o projeto já está aprovado e o novo valor ultrapassa o planejado, ele volta para classificação.
          if (isApproved && newTotalValue > originalPlannedValue) {
            payload.status = 'aguardando_classificacao';
            toast.warning("Orçamento excedido! O projeto retornou para o fluxo de aprovação.", { duration: 5000 });
          } else if (!isApproved) { // Se não estava aprovado, qualquer mudança nos itens manda para classificação.
            payload.status = 'aguardando_classificacao';
            toast.info("O projeto foi enviado para classificação devido a alterações nos itens.");
          }
          // Se estiver aprovado e dentro do orçamento, o status não é alterado.
        }

        await updateDoc(doc(db, "projects", editingId), payload as any);
        toast.success("Obra atualizada com sucesso!");
      } else {
        await addDoc(collection(db, "projects"), {
          ...payload,
          status: 'aguardando_classificacao',
          createdAt: new Date().toISOString()
        });
        toast.success("Obra criada com sucesso!");
      }
      if (onSuccess) onSuccess();
      handleClose();
    } catch (error) {
      toast.error(editingId ? "Erro ao atualizar obra" : "Erro ao criar obra");
    } finally {
      setIsLoading(false);
    }
  };

  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];

  const handleMonthChange = (index: number, inputVal: string) => {
    const val = Number(inputVal) || 0;
    const newDist = [...formData.monthlyDistribution];
    const capex = Number(formData.plannedCapex) || 0;

    if (distributionType === 'percentage') {
      newDist[index] = String(((val / 100) * capex).toFixed(2));
    } else {
      newDist[index] = inputVal;
    }
    setFormData({ ...formData, monthlyDistribution: newDist });
  };

  const autoDistribute = () => {
    const capex = Number(formData.plannedCapex) || 0;
    if (capex <= 0) {
      toast.error("Insira um valor de CAPEX primeiro.");
      return;
    }
    const linearValue = (capex / 12).toFixed(2);
    setFormData({ ...formData, monthlyDistribution: new Array(12).fill(linearValue) });
    setDistributionType('value');
  };

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setFormData(prev => ({
          ...prev,
          attachments: [...prev.attachments, { name: file.name, type: file.type, data: base64 }]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const financialAnalysis = useMemo(() => {
    const capex = Number(formData.plannedCapex) || 0;
    const opex = Number(formData.plannedOpex) || 0;
    const monthlyRev = Number(formData.monthlyRevenue) || 0;
    const rate = (Number(formData.discountRate) || 0) / 100 / 12;
    
    const monthlyProfit = monthlyRev - opex;
    const annualProfit = monthlyProfit * 12;
    const paybackSimples = monthlyProfit > 0 ? capex / monthlyProfit : 0;
    const roi = capex > 0 ? (annualProfit / capex) * 100 : 0;
    
    let vpl = -capex;
    const chartData = [{ month: 0, balance: -capex }];
    for (let t = 1; t <= 24; t++) {
      const discountedCashFlow = monthlyProfit / Math.pow(1 + rate, t);
      vpl += discountedCashFlow;
      chartData.push({ month: t, balance: chartData[t-1].balance + monthlyProfit });
    }

    const margin = monthlyRev > 0 ? (monthlyProfit / monthlyRev) * 100 : 0;
    let health: 'viable' | 'warning' | 'unviable' = 'warning';
    if (roi > 20 && vpl > 0) health = 'viable';
    else if (roi < 5 || vpl < 0) health = 'unviable';

    return { monthlyProfit, annualProfit, paybackSimples, roi, vpl, margin, health, chartData };
  }, [formData.plannedCapex, formData.plannedOpex, formData.monthlyRevenue, formData.discountRate]);

  const totalDistributed = formData.monthlyDistribution.reduce((acc, val) => acc + (Number(val) || 0), 0);

  // Calcula CAPEX e OPEX a partir dos itens
  useEffect(() => {
    if (formData.items.length > 0) {
      const { totalCapex, totalOpex } = formData.items.reduce((acc, item) => {
        const value = (Number(item.quantity) || 1) * (Number(item.value) || 0);
        // Se a classificação for 'opex', soma em OPEX.
        // Caso contrário (seja 'capex' ou indefinido/null), soma em CAPEX por padrão.
        if (item.classification === 'opex') {
          acc.totalOpex += value;
        } else {
          acc.totalCapex += value;
        }
        return acc;
      }, { totalCapex: 0, totalOpex: 0 });

      setFormData(prev => ({ ...prev, plannedCapex: String(totalCapex), plannedOpex: String(totalOpex) }));
    }
  }, [formData.items]);
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Briefcase size={24} className="text-blue-600" />
            {editingId ? "Editar Projeto" : "Novo Projeto Estratégico"}
          </DialogTitle>
          <DialogDescription className="text-sm">Cadastre as informações operacionais e analise a viabilidade financeira do investimento.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex-1 overflow-hidden flex flex-col" key={editingId}>
          <Tabs defaultValue={formData.defaultTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="px-6 bg-slate-100/50 justify-start h-12 rounded-none border-b gap-4">
              <TabsTrigger value="gerais" className="gap-2 text-sm"><Briefcase size={14}/> Dados Gerais</TabsTrigger>
              <TabsTrigger value="localizacao" className="gap-2 text-sm"><MapPin size={14}/> Localização</TabsTrigger>
              <TabsTrigger value="financeiro" className="gap-2 text-sm"><DollarSign size={14}/> Financeiro</TabsTrigger>
              <TabsTrigger value="viabilidade" className="gap-2 text-sm"><TrendingUp size={14}/> Viabilidade</TabsTrigger>
              <TabsTrigger value="itens" className="gap-2 text-sm"><FileText size={14}/> Itens</TabsTrigger>
              <TabsTrigger value="arquivos" className="gap-2 text-sm"><FileText size={14}/> Arquivos</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="gerais" className="m-0 space-y-4">
                {/* ... Conteúdo da aba Dados Gerais ... */}
                 <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5"><Briefcase size={14} className="text-slate-400"/> Nome da Obra *</label>
                        <Input readOnly={isClassifier} className="text-sm h-10" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Ex: Galpão Logístico Alpha" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5"><Info size={14} className="text-slate-400"/> Código da Obra *</label>
                        <Input readOnly={isClassifier} className="text-sm h-10" required value={formData.code} onChange={e => setFormData({...formData, code: e.target.value})} placeholder="Ex: OB-2026-001" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5"><User size={14} className="text-slate-400"/> Cliente *</label>
                        <Input readOnly={isClassifier} className="text-sm h-10" required value={formData.client} onChange={e => setFormData({...formData, client: e.target.value})} placeholder="Nome do contratante" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5"><User size={14} className="text-slate-400"/> Responsável</label>
                        <Input readOnly={isClassifier} className="text-sm h-10" value={formData.responsible} onChange={e => setFormData({...formData, responsible: e.target.value})} placeholder="Gerente de projeto" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Tipo de Projeto</label>
                        <Select disabled={isClassifier} value={formData.projectType} onValueChange={v => setFormData({...formData, projectType: v})}>
                          <SelectTrigger className="text-sm h-10"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="construcao">Construção</SelectItem>
                            <SelectItem value="reforma">Reforma</SelectItem>
                            <SelectItem value="expansao">Expansão</SelectItem>
                            <SelectItem value="manutencao">Manutenção Corretiva</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Centro de Custo</label>
                        <Select disabled={isClassifier} value={formData.costCenter} onValueChange={v => setFormData({...formData, costCenter: v})}>
                          <SelectTrigger className="text-sm h-10"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                          <SelectContent>
                            {costCenters.map(cc => <SelectItem key={cc.id} value={cc.code}>{cc.code} - {cc.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5"><Calendar size={14} className="text-slate-400"/> Início *</label>
                        <Input readOnly={isClassifier} className="text-sm h-10" type="date" required value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium flex items-center gap-1.5"><Calendar size={14} className="text-slate-400"/> Término Previsto</label>
                        <Input readOnly={isClassifier} className="text-sm h-10" type="date" value={formData.estimatedEndDate} onChange={e => setFormData({...formData, estimatedEndDate: e.target.value})} />
                      </div>
                    </div>
                    <div className="space-y-2 mt-4">
                      <label className="text-sm font-medium">Descrição Detalhada</label>
                      <Textarea readOnly={isClassifier} className="text-sm p-3" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Objetivos, escopo e observações..." rows={3} />
                    </div>
              </TabsContent>

              <TabsContent value="localizacao" className="m-0 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Endereço Completo</label>
                  <div className="relative">
                    <MapPin size={16} className="absolute left-3 top-3 text-slate-400" />
                    <Input readOnly={isClassifier} className="pl-10 text-sm h-10" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} placeholder="Rua, número, bairro..." />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Cidade</label>
                    <Input readOnly={isClassifier} className="text-sm h-10" value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Estado</label>
                    <Input readOnly={isClassifier} className="text-sm h-10" value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} placeholder="UF" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">CEP</label>
                    <Input readOnly={isClassifier} className="text-sm h-10" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} placeholder="00000-000" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5"><Globe size={16} className="text-slate-400"/> Link Google Maps</label>
                  <Input readOnly={isClassifier} className="text-sm h-10" value={formData.mapsLink} onChange={e => setFormData({...formData, mapsLink: e.target.value})} placeholder="https://maps.google.com/..." />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Latitude</label>
                    <Input readOnly={isClassifier} className="text-sm h-10" value={formData.lat} onChange={e => setFormData({...formData, lat: e.target.value})} placeholder="-23.5505" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Longitude</label>
                    <Input readOnly={isClassifier} className="text-sm h-10" value={formData.lng} onChange={e => setFormData({...formData, lng: e.target.value})} placeholder="-46.6333" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="financeiro" className="m-0 space-y-6">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">Investimento Inicial (CAPEX) *</label>
                      <TooltipProvider><Tooltip><TooltipTrigger><Info size={14} className="text-slate-400"/></TooltipTrigger><TooltipContent>Total gasto na aquisição/construção do ativo.</TooltipContent></Tooltip></TooltipProvider>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                      <Input 
                        type="number" readOnly={isClassifier}
                        step="0.01" 
                        className="pl-10 text-sm h-10" 
                        value={formData.plannedCapex} onChange={e => setFormData({...formData, plannedCapex: e.target.value})}
                        readOnly={formData.items.length > 0} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">Custos Mensais (OPEX)</label>
                      <TooltipProvider><Tooltip><TooltipTrigger><Info size={14} className="text-slate-400"/></TooltipTrigger><TooltipContent>Despesas recorrentes para manter a operação.</TooltipContent></Tooltip></TooltipProvider>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                      <Input 
                        type="number" readOnly={isClassifier}
                        step="0.01" 
                        className="pl-10 text-sm h-10" 
                        value={formData.plannedOpex} onChange={e => setFormData({...formData, plannedOpex: e.target.value})}
                        readOnly={formData.items.length > 0} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium">Receita Mensal Estimada *</label>
                      <TooltipProvider><Tooltip><TooltipTrigger><Info size={14} className="text-slate-400"/></TooltipTrigger><TooltipContent>Expectativa de faturamento gerado pela obra por mês.</TooltipContent></Tooltip></TooltipProvider>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 text-sm">R$</span>
                      <Input readOnly={isClassifier} type="number" step="0.01" className="pl-10 text-sm h-10" value={formData.monthlyRevenue} onChange={e => setFormData({...formData, monthlyRevenue: e.target.value})} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Receita Anual Estimada</label>
                    <div className="h-10 px-3 py-2 rounded-md border bg-slate-100 text-sm flex items-center font-bold text-blue-700">
                      {formatCurrency(Number(formData.monthlyRevenue) * 12)}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Taxa de Desconto / TMA (%)</label>
                    <div className="relative">
                      <Input readOnly={isClassifier} className="text-sm h-10" type="number" step="0.1" value={formData.discountRate} onChange={e => setFormData({...formData, discountRate: e.target.value})} />
                      <span className="absolute right-3 top-2.5 text-slate-400 text-sm">%</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Margem de Lucro Projetada</label>
                    <div className="h-10 px-3 py-2 rounded-md border bg-slate-100 text-sm flex items-center font-medium">
                      {financialAnalysis.margin.toFixed(1)}%
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="viabilidade" className="m-0 space-y-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="p-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">ROI Anual</p>
                    <p className={`text-2xl font-black ${financialAnalysis.roi > 15 ? 'text-green-600' : 'text-orange-600'}`}>
                      {financialAnalysis.roi.toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">Rentabilidade em 12m.</p>
                  </Card>
                  <Card className="p-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Payback</p>
                    <p className="text-2xl font-black text-slate-700">
                      {financialAnalysis.paybackSimples.toFixed(1)} <span className="text-xs font-normal">meses</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">Tempo para break-even.</p>
                  </Card>
                  <Card className="p-4 bg-slate-50">
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">VPL (24m)</p>
                    <p className={`text-xl font-black ${financialAnalysis.vpl > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(financialAnalysis.vpl)}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">VPL (TMA {formData.discountRate}%).</p>
                  </Card>
                  <Card className={`p-4 border-2 ${financialAnalysis.health === 'viable' ? 'bg-green-50 border-green-500' : financialAnalysis.health === 'unviable' ? 'bg-red-50 border-red-500' : 'bg-yellow-50 border-yellow-500'}`}>
                    <p className="text-xs font-semibold text-slate-500 uppercase">Viabilidade</p>
                    <div className="flex items-center gap-2 mt-1">
                      {financialAnalysis.health === 'viable' ? <CheckCircle2 size={24} className="text-green-600" /> : financialAnalysis.health === 'unviable' ? <XCircle size={24} className="text-red-600" /> : <AlertTriangle size={24} className="text-yellow-600" />}
                      <span className="font-bold text-sm uppercase">
                        {financialAnalysis.health === 'viable' ? 'Viável' : financialAnalysis.health === 'unviable' ? 'Inviável' : 'Atenção'}
                      </span>
                    </div>
                  </Card>
                </div>

                <div className="space-y-2 mt-6">
                  <h5 className="text-sm font-bold text-slate-700 flex items-center gap-2"><BarChart3 size={16}/> Projeção de Retorno (Cash Flow)</h5>
                  <div className="h-48 w-full bg-white border rounded-lg p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={financialAnalysis.chartData}>
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
              </TabsContent>

              <TabsContent value="itens" className="m-0 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium flex items-center gap-1.5"><FileText size={14} className="text-slate-400"/> Itens do Projeto</label>
                  {!isClassifier && (
                    <Button type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={() => setFormData(prev => ({ ...prev, items: [...prev.items, { description: "", quantity: "1", value: "" }] }))}>
                      <Plus size={14} className="mr-1" /> Adicionar Item
                    </Button>
                  )}
                </div>
                <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                  {formData.items.map((item, index) => (
                    <div key={index} className="grid grid-cols-12 gap-3 items-center pr-1">
                      <Input // Descrição
                        className="h-9 text-sm col-span-5"
                        placeholder={`Item ${index + 1}`}
                        value={item.description}
                        readOnly={isClassifier}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].description = e.target.value;
                          setFormData(prev => ({ ...prev, items: newItems }));
                        }}
                      />
                      <Input // Quantidade
                        type="number"
                        className="h-9 text-sm col-span-1"
                        placeholder="Qtd"
                        value={item.quantity}
                        readOnly={isClassifier}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].quantity = e.target.value;
                          setFormData(prev => ({ ...prev, items: newItems }));
                        }}
                      />
                      <Input // Valor
                        type="number"
                        className="h-9 text-sm col-span-2"
                        placeholder="Valor (R$)"
                        value={item.value}
                        readOnly={isClassifier}
                        onChange={e => {
                          const newItems = [...formData.items];
                          newItems[index].value = e.target.value;
                          setFormData(prev => ({ ...prev, items: newItems }));
                        }}
                      />
                      {(user as any)?.role === 'classificacao' && (
                        <Select 
                          value={item.classification || ''}
                          onValueChange={(value) => {
                            const newItems = [...formData.items];
                            newItems[index].classification = value as 'capex' | 'opex';
                            setFormData(prev => ({ ...prev, items: newItems }));
                          }}
                        >
                          <SelectTrigger className="h-9 text-xs col-span-3"><SelectValue placeholder="Classificar..." /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="capex">CAPEX</SelectItem>
                            <SelectItem value="opex">OPEX</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      {!isClassifier && (
                        <Button type="button" size="icon" variant="ghost" className="h-9 w-9 text-red-500 justify-self-end col-span-1" onClick={() => setFormData(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))}><Trash2 size={14} /></Button>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="arquivos" className="m-0 space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1.5"><FileText size={14} className="text-slate-400"/> Selecionar Documentos</label>
                  <Input disabled={isClassifier}
                    type="file" className="text-sm h-10 pt-2 cursor-pointer"
                    multiple 
                    onChange={handleAttachmentChange}
                    accept=".pdf,.jpg,.jpeg,.png,.xml,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                  />
                  <p className="text-[10px] text-muted-foreground italic font-medium">PDFs, Imagens, Planilhas e PowerPoint.</p>
                </div>

                {(formData.attachments.length > 0 || formData.existingAttachments.length > 0) && (
                  <div className="space-y-3 mt-4">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Documentação do Projeto</label>
                    <div className="grid grid-cols-1 gap-2">
                      {/* Arquivos já existentes no banco */}
                      {formData.existingAttachments.map((file: any, idx: number) => (
                        <div key={`existing-${idx}`} className="flex items-center justify-between p-2 bg-blue-50/50 border border-blue-100 rounded-md">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <FileText size={16} className="text-blue-600 shrink-0" />
                            <a href={file.data} target="_blank" rel="noopener noreferrer" className="text-sm truncate hover:underline text-blue-700 font-medium" download={file.name}>
                              {file.name}
                            </a>
                          </div>
                          {!isClassifier && (
                            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setFormData(prev => ({ ...prev, existingAttachments: prev.existingAttachments.filter((_, i) => i !== idx) }))}><Trash2 size={14} /></Button>
                          )}
                        </div>
                      ))}
                      {/* Novos arquivos selecionados */}
                      {formData.attachments.map((file: any, idx: number) => (
                        <div key={`new-${idx}`} className="flex items-center justify-between p-2 bg-slate-50 border border-dashed rounded-md">
                          <div className="flex items-center gap-2 overflow-hidden text-slate-600">
                            <Plus size={16} className="text-green-600 shrink-0" />
                            <span className="text-sm truncate italic">{file.name} (Aguardando...)</span>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => setFormData(prev => ({ ...prev, attachments: prev.attachments.filter((_, i) => i !== idx) }))}><X size={14} /></Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

            </div>
          </Tabs>
          
          <DialogFooter className="p-6 border-t bg-slate-50 gap-2">
            <Button type="button" variant="outline" onClick={handleClose}>Cancelar</Button>
            <Button type="submit" className="bg-blue-600 hover:bg-blue-700 min-w-[140px]" disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {editingId ? "Salvar Alterações" : "Criar Obra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}