import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, doc, updateDoc, addDoc, query, where, getDocs, deleteDoc, getDoc } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import { Loader2, ChevronDown, ChevronUp, ChevronRight, Plus, CheckCircle2, ArrowRight, AlertTriangle, Check, XCircle, Download, Upload, QrCode, X, FileText, List, Eye, ShoppingCart, Pencil, Trash2, MapPin, User, Phone, CreditCard, Wallet, Pizza, Hash, Truck, UserCheck, Utensils, Minus, Navigation, Globe, Clock, Package, Building2, HardHat, Box, Search, Info, TrendingUp } from "lucide-react";
import ProjectEditModal from "./ProjectEditModal";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

// Helper para processar datas do Firestore (Timestamp), Strings ISO ou objetos Date
const parseDate = (value: any): Date => {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  return new Date(value);
};

const ProjectWorkflow = ({ project, onUpdateStatus, compact }: { project: any, onUpdateStatus: (id: string, status: string, notes?: string) => Promise<void>, compact?: boolean }) => {
  const { user } = useAuth();
  const [isUpdating, setIsUpdating] = useState(false);
  const [rejectionOpen, setRejectionOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', requiredRole: 'classificacao', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', requiredRole: 'engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', requiredRole: 'diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', requiredRole: null, color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  const isRejected = project.status === 'rejeitado';
  const currentStepIndex = steps.findIndex(s => s.id === project.status);
  const isCompleted = project.status === 'aprovado';
  const isUnknown = currentStepIndex === -1 && !isCompleted;
  const effectiveIndex = isCompleted ? steps.length - 1 : (currentStepIndex === -1 ? -1 : currentStepIndex);
  
  const userRole = (user as any)?.role;
  const currentStep = steps[currentStepIndex];
  const requiredRoleForCurrentStep = isUnknown ? steps[0].requiredRole : (currentStep ? currentStep.requiredRole : null);
  
  // A 'diretoria' pode aprovar qualquer etapa.
  const canApprove = userRole === 'diretoria' || userRole === requiredRoleForCurrentStep;
  
  const handleAdvance = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      if (isUnknown) {
        await onUpdateStatus(project.id, steps[0].id, undefined);
      } else if (currentStepIndex < steps.length - 1) {
        await onUpdateStatus(project.id, steps[currentStepIndex + 1].id, undefined);
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason) {
      toast.error("Por favor, forneça uma justificativa para a rejeição.");
      return;
    }
    if (isUpdating) return;
    setIsUpdating(true);
    try {
      await onUpdateStatus(project.id, 'rejeitado', rejectionReason);
      setRejectionOpen(false);
    } finally {
      setIsUpdating(false);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-2 min-w-[140px]">
        <div className="relative flex items-center justify-between px-1 py-1">
          <div className="absolute left-0 top-1/2 transform -translate-y-1/2 w-full h-0.5 bg-slate-200 -z-10 rounded-full" />
          <div className={`absolute left-0 top-1/2 transform -translate-y-1/2 h-0.5 -z-10 transition-all duration-500 rounded-full ${effectiveIndex >= 0 ? steps[effectiveIndex].color : 'bg-blue-600'}`} style={{ width: effectiveIndex === -1 ? '0%' : `${(effectiveIndex / (steps.length - 1)) * 100}%` }} />
          {steps.map((step, index) => {
            const isCompletedStep = index <= effectiveIndex;
            const isCurrent = index === currentStepIndex;
            return (
              <div 
                key={step.id} 
                className={`
                  w-2.5 h-2.5 rounded-full border-2 z-10 transition-all duration-300
                  ${isCompletedStep 
                    ? `${step.color} ${step.border} scale-100` 
                    : 'bg-white border-slate-300 scale-90'
                  }
                  ${isCurrent && !isCompleted ? `ring-2 ${step.ring} ring-offset-1` : ''}
                `} 
                title={step.label} 
              />
            );
          })}
        </div>
        
        {!isCompleted && !isRejected && (
          <div className="flex gap-1">
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="w-full">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isUpdating || !canApprove}
                      className="w-full h-6 text-[10px] font-medium bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 hover:text-blue-800 hover:border-blue-300 transition-colors rounded-full flex items-center justify-center gap-1 disabled:cursor-not-allowed"
                      onClick={(e) => { e.stopPropagation(); handleAdvance(); }}
                    >
                      {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : (
                        <>
                          {isUnknown ? "Iniciar" : "Aprovar"} <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canApprove && <TooltipContent><p>Permissão: {requiredRoleForCurrentStep}</p></TooltipContent>}
              </Tooltip>
            </TooltipProvider>
            <Button
              variant="ghost"
              size="icon"
              disabled={isUpdating || !canApprove}
              className="h-6 w-6 text-red-500 hover:bg-red-100 disabled:cursor-not-allowed"
              onClick={(e) => { e.stopPropagation(); setRejectionOpen(true); }}
            >
              <XCircle size={14} />
            </Button>
          </div>
        )}
        {currentStepIndex === steps.length - 1 && !isCompleted && (
           <div className="text-center text-[10px] text-green-600 font-bold flex items-center justify-center gap-1 bg-green-50 py-0.5 rounded-full border border-green-100">
              <CheckCircle2 className="w-3 h-3" />
              Aprovado
           </div>
        )}
        {isRejected && (
          <div className="text-center text-[10px] text-red-600 font-bold flex items-center justify-center gap-1 bg-red-50 py-0.5 rounded-full border border-red-100">
            <XCircle className="w-3 h-3" />
            Rejeitado
          </div>
        )}
      </div>
    );
  }

  return (
    <>
    <Dialog open={rejectionOpen} onOpenChange={setRejectionOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar Projeto</DialogTitle>
          <DialogDescription>
            Por favor, forneça uma justificativa para a rejeição. Esta ação não poderá ser desfeita.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            placeholder="Digite a justificativa aqui..."
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setRejectionOpen(false)}>Cancelar</Button>
          <Button variant="destructive" onClick={handleReject} disabled={isUpdating}>Confirmar Rejeição</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    <div className="mt-6 border-t pt-6">
      <div className="flex items-center justify-between mb-8">
        <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
          Fluxo de Aprovação
          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border">
            Etapa {currentStepIndex + 1} de {steps.length}
          </span>
        </h4>
      </div>
      
      <div className="relative flex items-center justify-between mb-36 px-4">
        <div className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full" />
        <div className={`absolute left-0 top-4 transform -translate-y-1/2 h-1 -z-10 transition-all duration-500 rounded-full ${effectiveIndex >= 0 ? steps[effectiveIndex].color : 'bg-blue-600'}`} style={{ width: effectiveIndex === -1 ? '0%' : `${(effectiveIndex / (steps.length - 1)) * 100}%` }} />
        {steps.map((step, index) => { 
          const isCompletedStep = index <= effectiveIndex;
          const isCurrent = index === effectiveIndex;
          
          // Busca a aprovação que levou à PRÓXIMA etapa (quem aprovou esta etapa)
          const nextStep = steps[index + 1];
          const approvalInfo = nextStep 
            ? project.approvalHistory?.slice().reverse().find((h: any) => h.status === nextStep.id)
            : null;

          return (
            <div key={step.id} className="flex flex-col items-center group relative">
              <div 
                className={`
                  w-8 h-8 rounded-full border-2 z-10 transition-all duration-300 flex items-center justify-center
                  ${isCompletedStep 
                    ? `${step.color} ${step.border} shadow-md text-white scale-110` 
                    : 'bg-white border-slate-300 text-slate-400'
                  }
                  ${isCurrent && !isCompleted ? `ring-4 ${step.ring} ${step.border} ${step.text}` : ''}
                `}
              >
                {isCompletedStep ? <Check className="w-5 h-5" /> : (
                    isCurrent && !isCompleted ? <div className={`w-2.5 h-2.5 ${step.color} rounded-full animate-pulse`} /> : <span className="text-xs font-semibold">{index + 1}</span>
                )}
              </div>
              <span 
                className={`
                  absolute -bottom-8 text-xs font-medium whitespace-nowrap transition-colors
                  ${isCurrent ? `${step.text} font-bold` : isCompletedStep ? 'text-slate-700' : 'text-slate-400'}
                `}
              >
                {step.label}
              </span>
              {approvalInfo && (
                <div className="absolute top-24 flex flex-col items-center w-32 text-center">
                  <span className="text-[10px] font-bold text-slate-700 leading-tight">{approvalInfo.user}</span>
                  <span className="text-[9px] text-slate-500 leading-tight">{new Date(approvalInfo.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="flex justify-end pt-4 border-t border-dashed">
        {!isCompleted && !isRejected && (
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="destructive"
              disabled={isUpdating || !canApprove}
              onClick={(e) => { e.stopPropagation(); setRejectionOpen(true); }}
            >
              <XCircle className="mr-2 w-4 h-4" /> Rejeitar
            </Button>
            <TooltipProvider delayDuration={100}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="inline-block">
                    <Button 
                      size="sm" 
                      disabled={isUpdating || !canApprove}
                      className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm transition-all disabled:cursor-not-allowed" 
                      onClick={(e) => { e.stopPropagation(); handleAdvance(); }}
                    >
                      {isUpdating ? (
                          <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Processando...
                          </>
                      ) : (
                          <>
                              {isUnknown ? "Iniciar Processo" : `Aprovar ${steps[currentStepIndex + 1]?.label}`} <ArrowRight className="ml-2 w-4 h-4" />
                          </>
                      )}
                    </Button>
                  </div>
                </TooltipTrigger>
                {!canApprove && <TooltipContent><p>Permissão necessária: {requiredRoleForCurrentStep}</p></TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </div>
        )}
        {isCompleted && (
           <div className="flex items-center text-sm text-green-600 font-medium bg-green-50 px-4 py-2 rounded-md border border-green-200 shadow-sm">
              <CheckCircle2 className="w-5 h-5 mr-2" />
              Projeto Totalmente Aprovado
           </div>
        )}
        {isRejected && (
          <div className="flex items-center text-sm text-red-600 font-medium bg-red-50 px-4 py-2 rounded-md border border-red-200 shadow-sm">
            <XCircle className="w-5 h-5 mr-2" />
            <span>Projeto Rejeitado. Motivo: <em>{project.notes || "Não especificado."}</em></span>
          </div>
        )}
      </div>
    </div>
    </>
  );
};

type ProjectType = any;

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

function CreateAssetDialog({
  open,
  onOpenChange,
  projectId,
  initialData,
  onSuccess
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | number;
  initialData: { description: string; amount: string; date?: any };
  onSuccess: (assetId: string | number) => void;
}) {
  const [assetClasses, setAssetClasses] = useState<any[]>([]);
  const [nextAssetNumber, setNextAssetNumber] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [projectData, setProjectData] = useState<any>(null);

  const [formData, setFormData] = useState({
    assetNumber: "",
    tagNumber: "",
    name: "",
    description: "",
    value: "",
    startDate: new Date().toISOString().split("T")[0],
    assetClass: "",
    usefulLife: "",
    corporateUsefulLife: "",
    accountingAccount: "",
    depreciationAccountCode: "",
    amortizationAccountCode: "",
    resultAccountCode: "",
  });

  useEffect(() => {
    // Fetch asset classes
    const unsubClasses = onSnapshot(collection(db, "asset_classes"), (snapshot) => {
      setAssetClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Calculate next asset number
    if (open) {
      getDocs(collection(db, "assets")).then(snapshot => {
        const numbers = snapshot.docs
          .map(d => d.data().assetNumber)
          .filter(n => typeof n === 'string' && n.startsWith("ATV-"))
          .map(n => parseInt(n.replace("ATV-", ""), 10))
          .filter(n => !isNaN(n));
        const max = numbers.length > 0 ? Math.max(...numbers) : 0;
        setNextAssetNumber(`ATV-${String(max + 1).padStart(6, '0')}`);
      });
    }

    return () => unsubClasses();
  }, [open]);

  useEffect(() => {
    if (open && projectId) {
      // Busca os dados do projeto para obter o centro de custo automaticamente
      const projectRef = doc(db, "projects", String(projectId));
      getDoc(projectRef).then((snap) => {
        if (snap.exists()) {
          setProjectData(snap.data());
        }
      });
    }
  }, [open, projectId]);

  useEffect(() => {
    if (open) {
      setFormData(prev => ({
        ...prev,
        name: initialData.description || "",
        description: initialData.description || "",
        value: initialData.amount ? String(initialData.amount) : "",
        startDate: (() => {
          const d = parseDate(initialData.date);
          const safeDate = isNaN(d.getTime()) ? new Date() : d;
          return safeDate.toISOString().split("T")[0];
        })(),
        assetNumber: nextAssetNumber || ""
      }));
    }
  }, [open, initialData, nextAssetNumber]); // Dependência adicionada

  useEffect(() => {
    if (open && nextAssetNumber && !formData.assetNumber) {
      setFormData(prev => ({ ...prev, assetNumber: nextAssetNumber }));
    }
  }, [open, nextAssetNumber]);

  const handleAssetClassChange = (className: string) => {
    const selectedClass = assetClasses?.find(c => c.name === className);
    setFormData(prev => ({
      ...prev,
      assetClass: className,
      usefulLife: selectedClass ? String(selectedClass.usefulLife) : "",
      corporateUsefulLife: selectedClass ? String(selectedClass.corporateUsefulLife) : "",
      accountingAccount: selectedClass ? selectedClass.assetAccountCode || "" : "",
      depreciationAccountCode: selectedClass ? selectedClass.depreciationAccountCode || "" : "",
      amortizationAccountCode: selectedClass ? selectedClass.amortizationAccountCode || "" : "",
      resultAccountCode: selectedClass ? selectedClass.resultAccountCode || "" : "",
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.assetNumber) {
      toast.error("O Número do Ativo é obrigatório.");
      return;
    }
    try {
      setIsCreating(true);
      const docRef = await addDoc(collection(db, "assets"), {
        projectId: String(projectId),
        costCenter: projectData?.costCenter || "",
        assetNumber: formData.assetNumber,
        tagNumber: formData.tagNumber || undefined,
        name: formData.name,
        description: formData.description,
        value: Number(formData.value) || 0,
        startDate: new Date(formData.startDate),
        assetClass: formData.assetClass,
        usefulLife: Number(formData.usefulLife),
        corporateUsefulLife: Number(formData.corporateUsefulLife),
        accountingAccount: formData.accountingAccount,
        depreciationAccountCode: formData.depreciationAccountCode,
        amortizationAccountCode: formData.amortizationAccountCode,
        resultAccountCode: formData.resultAccountCode,
        createdAt: new Date().toISOString(),
        status: "concluido"
      });
      
      toast.success("Ativo criado com sucesso!");
      onSuccess(docRef.id);
      onOpenChange(false);
    } catch (error) {
      toast.error("Erro ao criar ativo");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar Novo Ativo (via Despesa)</DialogTitle>
          <DialogDescription>
            Preencha os dados abaixo para criar um novo ativo vinculado a esta despesa.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Número do Ativo</label>
              <Input value={formData.assetNumber} readOnly className="bg-slate-100 font-mono" />
            </div>
            <div>
              <label className="text-sm font-medium">Nº Plaqueta</label>
              <Input value={formData.tagNumber} onChange={e => setFormData({...formData, tagNumber: e.target.value})} placeholder="Ex: PAT-001" />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Nome do Ativo</label>
            <Input value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
          </div>
          <div>
            <label className="text-sm font-medium">Classe do Imobilizado</label>
            <Select value={formData.assetClass} onValueChange={handleAssetClassChange}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {assetClasses?.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Valor (R$)</label>
              <Input type="number" step="0.01" value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} />
            </div>
            <div>
              <label className="text-sm font-medium">Data Início</label>
              <Input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} required />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={isCreating}>
            {isCreating ? "Criando..." : "Criar Ativo"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExpenseRow({ expense, accountingAccounts, assets, onSave, onOpenCreateAsset }: { 
  expense: any, 
  accountingAccounts: any[], 
  assets: any[], 
  onSave: (data: any) => Promise<void>,
  onOpenCreateAsset: (expense: any, cb: (id: string | number) => void) => void,
}) {
  const [type, setType] = useState<"capex" | "opex">(expense.type || "opex");
  const [accountingAccount, setAccountingAccount] = useState(expense.accountingAccount || "");
  const [assetId, setAssetId] = useState(() => {
    const val = (expense.assetId !== null && expense.assetId !== undefined) ? String(expense.assetId) : "";
    // Previne que "NaN" vindo do banco ou estado anterior quebre a edição
    return (val === "NaN" || val === "nan") ? "" : val;
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [viewItemsOpen, setViewItemsOpen] = useState(false);
  const [attachmentBase64, setAttachmentBase64] = useState<string | null>(expense.attachmentBase64 || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const val = (expense.assetId !== null && expense.assetId !== undefined) ? String(expense.assetId) : "";
    const cleanVal = (val === "NaN" || val === "nan") ? "" : val;
    setAssetId(cleanVal);
  }, [expense.assetId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== "application/pdf") {
        toast.error("Apenas arquivos PDF são permitidos.");
        return;
      }
      
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachmentBase64(base64);
        setIsDirty(true);
        toast.success("PDF anexado. Clique em Gravar para salvar.");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      
      let finalAssetId: string | number | null = null;
      if (type === 'capex') {
        if (!assetId) {
          toast.error("Selecione um ativo válido para despesas Capex.");
          setIsSaving(false);
          return;
        }
        finalAssetId = assetId;
      }

      const updatePayload: any = {
        id: expense.id,
        type,
        assetId: finalAssetId,
        description: expense.description,
        amount: String(expense.amount),
        date: expense.date, // Mantém o formato original (Timestamp ou string) para o updateDoc processar ou converter se necessário
        category: expense.category || "",
        notes: expense.notes || "",
        attachmentBase64: attachmentBase64,
      };

      if (type === 'opex' && accountingAccount) {
        updatePayload.accountingAccount = accountingAccount;
      }

      await onSave(updatePayload);
      setIsDirty(false);
    } catch (error) {
      console.error("Erro ao salvar:", error);
      toast.error("Erro ao salvar as alterações.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
    <tr key={`expense-${expense.id}`}>
      <td className="border border-slate-300 px-3 py-2">{expense.description}</td>
      <td className="border border-slate-300 px-3 py-2 font-mono text-xs text-muted-foreground">
        {expense.invoiceNumber || expense.notes?.match(/NF-e:\s*(\d{44})/)?.[1] || "-"}
      </td>
      <td className="border border-slate-300 px-3 py-2 text-center">
        {(expense.items && expense.items.length > 0) ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => setViewItemsOpen(true)}
          >
            <Eye size={14} className="text-blue-600" />
          </Button>
        ) : "-"}
      </td>
      <td className="border border-slate-300 px-3 py-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <input 
            type="file" 
            accept="application/pdf" 
            className="hidden" 
            ref={fileInputRef} 
            onChange={handleFileChange}
          />
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={() => fileInputRef.current?.click()}
            title={attachmentBase64 ? "Substituir PDF" : "Anexar PDF"}
          >
            <Upload size={14} className="text-slate-600" />
          </Button>
          {attachmentBase64 ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                onClick={() => {
                  const win = window.open();
                  if (win) {
                    win.document.write(`<iframe src="${attachmentBase64}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
                    win.document.title = "Visualizar Anexo";
                  }
                }}
                title="Visualizar Anexo"
              >
                <Eye size={14} />
              </Button>
            <a 
              href={attachmentBase64} 
              download={`anexo-${expense.description || 'despesa'}.pdf`}
              className="flex items-center justify-center h-6 w-6 text-red-600 hover:text-red-800"
              title="Baixar Anexo"
            >
              <FileText size={14} />
            </a>
            </>
          ) : (
            <span className="text-xs text-slate-400">-</span>
          )}
        </div>
      </td>
      <td className="border border-slate-300 px-3 py-2">
        {type === 'opex' ? (
          <Select
            value={accountingAccount}
            onValueChange={(val) => {
              setAccountingAccount(val);
              setIsDirty(true);
            }}
          >
            <SelectTrigger className="h-7 text-xs">
              <SelectValue placeholder="Selecione" />
            </SelectTrigger>
            <SelectContent>
              {accountingAccounts?.map((acc) => (
                <SelectItem key={acc.id} value={acc.code}>
                  {acc.code} - {acc.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="text-center text-slate-400">—</div>
        )}
      </td>
      <td className="border border-slate-300 px-3 py-2">
        {type === 'capex' ? (
          <div className="flex gap-1">
            <Select
              value={assetId}
              onValueChange={(val) => {
                setAssetId(val);
                setIsDirty(true);
              }}
            >
              <SelectTrigger className="h-7 text-xs flex-1">
                <SelectValue placeholder="Selecione o Ativo" />
              </SelectTrigger>
              <SelectContent>
                {assets?.map((asset) => (
                  <SelectItem key={asset.id} value={String(asset.id)}>
                    {asset.tagNumber ? `${asset.tagNumber} - ${asset.name}` : asset.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button 
              size="icon" 
              variant="outline" 
              className="h-7 w-7 shrink-0" 
              title="Novo Ativo"
              onClick={() => onOpenCreateAsset(expense, (newId) => {
                setAssetId(String(newId));
                setIsDirty(true);
              })}
            >
              <Plus size={14} />
            </Button>
          </div>
        ) : (
          <div className="text-center text-slate-400">—</div>
        )}
      </td>
      <td className="border border-slate-300 px-3 py-2">
        <Select
          value={type}
          onValueChange={(val) => {
            setType(val as "capex" | "opex");
            if (val === 'capex') {
              setAccountingAccount('');
            } else {
              setAssetId('');
            }
            setIsDirty(true);
          }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue placeholder="Selecione" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="capex">Capex</SelectItem>
            <SelectItem value="opex">Opex</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="border border-slate-300 px-3 py-2 text-right font-mono">{formatCurrency(Number(expense.amount))}</td>
      <td className="border border-slate-300 px-3 py-2 text-center">
        {isDirty && (
          <Button
            size="sm"
            className="h-7 text-xs bg-green-600 hover:bg-green-700"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Gravar"}
          </Button>
        )}
      </td>
    </tr>

    <Dialog open={viewItemsOpen} onOpenChange={setViewItemsOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Itens da Despesa: {expense.description}</DialogTitle>
          {expense.invoiceNumber && (
            <DialogDescription>
              Nota Fiscal: <span className="font-mono font-medium text-slate-700">{expense.invoiceNumber}</span>
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="mt-4 max-h-[60vh] overflow-y-auto">
          {expense.items && expense.items.length > 0 ? (
            <div className="border rounded-md overflow-x-auto bg-white">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 font-medium text-slate-600 border-b">
                  <tr>
                    <th className="px-2 py-1 whitespace-nowrap">CÓDIGO PRODUTO</th>
                    <th className="px-2 py-1">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
                    <th className="px-2 py-1 whitespace-nowrap">NCM/SH</th>
                    <th className="px-2 py-1 whitespace-nowrap">O/CST</th>
                    <th className="px-2 py-1 whitespace-nowrap">CFOP</th>
                    <th className="px-2 py-1 whitespace-nowrap">UN</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">QUANT</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">VALOR UNIT</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">VALOR TOTAL</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">VALOR DESC</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">B.CÁLC ICMS</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">VALOR ICMS</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">VALOR IPI</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">ALÍQ. ICMS</th>
                    <th className="px-2 py-1 text-right whitespace-nowrap">ALÍQ. IPI</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {expense.items.map((prod: any, idx: number) => (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="px-2 py-1 font-mono">{prod.code}</td>
                      <td className="px-2 py-1">{prod.description}</td>
                      <td className="px-2 py-1">{prod.ncm}</td>
                      <td className="px-2 py-1">{prod.orig}/{prod.cst}</td>
                      <td className="px-2 py-1">{prod.cfop}</td>
                      <td className="px-2 py-1">{prod.unit}</td>
                      <td className="px-2 py-1 text-right">{prod.quantity}</td>
                      <td className="px-2 py-1 text-right">{Number(prod.unitPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 text-right font-medium">{Number(prod.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 text-right">{Number(prod.discount || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 text-right">{Number(prod.icmsBase || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 text-right">{Number(prod.icmsValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 text-right">{Number(prod.ipiValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-2 py-1 text-right">{Number(prod.icmsRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</td>
                      <td className="px-2 py-1 text-right">{Number(prod.ipiRate || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-gray-500 py-4">Nenhum item detalhado encontrado.</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}

// This component fetches data for a single project row.
// NOTE: This approach causes a "N+1" query problem, where each row triggers its own data fetching.
// For production, it's recommended to create a dedicated tRPC endpoint that aggregates this data on the server.
function ProjectBudgetRow({ project, onDataLoaded, projectBudgets, projectExpenses, projectOrders, accountingAccounts, assets }: { 
  project: ProjectType, 
  onDataLoaded?: (id: string, planned: number, realized: number, committed: number) => void,
  projectBudgets: any[],
  handleEdit: (project: any) => void,
  projectExpenses: any[],
  projectOrders: any[],
  accountingAccounts: any[],
  assets: any[]
}) {
  const [isOpen, setIsOpen] = useState(false);
  const { user } = useAuth();
  const [isEvolutionOpen, setIsEvolutionOpen] = useState(true);
  const [location, setLocation] = useLocation();
  const [isClassificationOpen, setIsClassificationOpen] = useState(true);
  
  const budgets = projectBudgets;
  const expenses = projectExpenses;

  const monthlyEvolution = useMemo(() => {
    if (!expenses) return [];
    const evolution: Record<string, number> = {};
    
    expenses.forEach((expense) => {
      if (!expense.date) return;
      
      const date = parseDate(expense.date);
      if (isNaN(date.getTime())) return;
      
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      evolution[key] = (evolution[key] || 0) + Number(expense.amount);
    });

    return Object.entries(evolution)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, amount]) => {
        const [year, month] = key.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        const monthName = date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
        return { key, label: monthName.charAt(0).toUpperCase() + monthName.slice(1), amount };
      });
  }, [expenses]);

  const realizedFromExpenses = expenses?.reduce((acc, expense) => acc + Number(expense.amount), 0) || 0;
  const budgetRealizado = realizedFromExpenses;

  // Calcula o consumo dos pedidos baseado nas despesas vinculadas (Consumo Granular)
  const expensesByOrder = expenses?.reduce((acc, exp) => {
    if (exp.orderId) {
      acc[exp.orderId] = (acc[exp.orderId] || 0) + Number(exp.amount || 0);
    }
    return acc;
  }, {} as Record<string, number>) || {};

  const budgetCompromissado = projectOrders?.reduce((acc, order) => {
    const consumedAmount = expensesByOrder[order.id] || 0;
    // O compromissado é o que sobra do pedido após as notas fiscais (despesas)
    const remaining = Math.max(0, Number(order.amount || 0) - consumedAmount);
    return acc + remaining;
  }, 0) || 0;

  const budgetPlanejado = project.plannedValue ? Number(project.plannedValue) : (budgets?.reduce((acc, budget) => acc + Number(budget.plannedAmount), 0) || 0);
  const budgetVariacao = budgetPlanejado - (budgetRealizado + budgetCompromissado);
  const budgetProgresso = budgetPlanejado > 0 ? ((budgetRealizado + budgetCompromissado) / budgetPlanejado) * 100 : 0;
  const status = budgetRealizado <= budgetPlanejado ? "Dentro do Orçamento" : "Acima do Orçamento";
  const statusColor = budgetRealizado <= budgetPlanejado ? "text-green-600" : "text-red-600";
  
  let progressColor = "bg-blue-600";
  if (budgetProgresso >= 90 && budgetProgresso <= 95) {
    progressColor = "bg-yellow-500 animate-pulse";
  } else if (budgetProgresso > 95) {
    progressColor = "bg-green-500";
  }

  const [createAssetOpen, setCreateAssetOpen] = useState(false);
  const [assetCreationCallback, setAssetCreationCallback] = useState<((id: string | number) => void) | null>(null);
  const [selectedExpenseForAsset, setSelectedExpenseForAsset] = useState<any>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  const handleOpenCreateAsset = (expense: any, callback: (id: string | number) => void) => {
    setSelectedExpenseForAsset(expense);
    setAssetCreationCallback(() => callback);
    setCreateAssetOpen(true);
  };

  const handleUpdateStatus = async (id: string, newStatus: string, notes?: string) => {
    try {
      const historyEntry = {
        status: newStatus,
        date: new Date().toISOString(),
        user: user?.name || "Usuário",
        role: (user as any)?.role || "",
        notes: notes
      };
      const newHistory = [...(project.approvalHistory || []), historyEntry];

      await updateDoc(doc(db, "projects", id), {
        status: newStatus,
        notes: notes || null,
        approvalHistory: newHistory,
        updatedAt: new Date().toISOString()
      });
      const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
      audio.play().catch(e => {
        // Falha silenciosa para NotAllowedError (política de autoplay do navegador)
        // Isso evita erros no console quando a interação do usuário ainda não ocorreu
        if (e.name !== 'NotAllowedError') console.error("Audio play failed", e);
      });
      toast.success("Status do projeto atualizado!");
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      if (error.message?.includes("Não autorizado") || error.data?.code === "FORBIDDEN" || error.message?.includes("Forbidden")) {
        toast.error("Permissão Negada", {
          description: "Você não possui permissão para aprovar esta etapa do projeto."
        });
      } else {
        toast.error("Erro ao atualizar status", {
          description: "Ocorreu um erro inesperado. Tente novamente."
        });
      }
    }
  };

  useEffect(() => {
    if (onDataLoaded) {
      onDataLoaded(String(project.id), budgetPlanejado, budgetRealizado, budgetCompromissado);
    }
  }, [project.id, budgetPlanejado, budgetRealizado, budgetCompromissado, onDataLoaded]);

  return (
    <>
      <tr className="hover:bg-slate-50 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <td className="px-4 py-3 font-medium text-slate-700">
          <div className="flex items-center gap-2">
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            <span 
              className="hover:text-blue-600 hover:underline"              
              onClick={(e) => { e.stopPropagation(); handleEdit(project); }}
            >
              {project.name}
            </span>
          </div>
        </td>
        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <ProjectWorkflow project={project} onUpdateStatus={handleUpdateStatus} compact />
        </td>
        <td className="px-4 py-3">
          <span className={`px-2 py-1 rounded-full text-xs font-medium w-fit ${statusColors[project.status] || 'bg-gray-100 text-gray-800'}`}>
            {project.status.replace(/_/g, ' ')}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-600">{project.estimatedEndDate ? new Date(project.estimatedEndDate).toLocaleDateString("pt-BR") : "-"}</td>
        <td className={`px-4 py-3 font-semibold ${statusColor}`}>{status}</td>
        <td className="px-4 py-3 text-right font-mono">{formatCurrency(budgetPlanejado)}</td>
        <td className="px-4 py-3 text-right font-mono">{formatCurrency(budgetRealizado)}</td>
        <td className="px-4 py-3 text-right font-mono">{formatCurrency(budgetCompromissado)}</td>
        <td className="px-4 py-3 text-right font-mono">{formatCurrency(budgetVariacao)}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <span>{budgetProgresso.toFixed(1)}%</span>
            <div className="w-24 bg-gray-200 rounded-full h-2.5">
              <div className={`${progressColor} h-2.5 rounded-full`} style={{ width: `${budgetProgresso > 100 ? 100 : budgetProgresso}%` }}></div>
            </div>
          </div>
        </td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={10} className="p-4 bg-slate-50 border-t">
            <div className="w-full">
              <h4 className="text-md font-semibold text-slate-700 mb-4">Detalhamento do Realizado</h4>
              
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-4">
                <h5 className="text-sm font-medium text-gray-600 mb-2">Lista de Despesas</h5>
                {(expenses && expenses.length > 0) ? (
                  <div className="overflow-hidden rounded-lg border">
                    <table className="w-full text-sm border-collapse bg-white">
                      <caption className="caption-bottom text-sm text-muted-foreground p-2 bg-white">
                        Ativos e despesas que compõem o valor realizado.
                      </caption>
                      <thead className="bg-gray-100">
                        <tr>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Descrição</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Nota Fiscal</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-center">Itens</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Anexo</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Conta Contábil</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Ativo</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-left">Classificação</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-right">Valor</th>
                          <th className="border border-slate-300 px-3 py-2 font-medium text-gray-600 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {expenses?.map((expense) => (
                          <ExpenseRow 
                            key={expense.id} 
                            expense={expense} 
                            accountingAccounts={accountingAccounts || []} 
                            assets={assets || []} 
                            onSave={async (data) => {
                              const { id, ...updateData } = data;
                              // Garante que a data seja salva corretamente se foi alterada
                              if (updateData.date instanceof Date) {
                                updateData.date = updateData.date.toISOString();
                              }
                              await updateDoc(doc(db, "expenses", id), updateData);
                              toast.success("Despesa atualizada");
                            }}
                            onOpenCreateAsset={handleOpenCreateAsset}
                          />
                        ))}
                      </tbody>
                      <tfoot className="bg-gray-50 font-bold">
                        <tr>
                          <td colSpan={6} className="border border-slate-300 px-3 py-2 text-right">Total Acumulado</td>
                          <td className="border border-slate-300 px-3 py-2 text-right font-mono">{formatCurrency(budgetRealizado)}</td>
                          <td className="border border-slate-300 px-3 py-2"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : <p className="text-sm text-gray-500 mt-4 text-center">Nenhum custo realizado encontrado.</p>}
                </div>

                <div className="space-y-6">
                  <div>
                    <h5 className="text-sm font-medium text-gray-600 mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4" /> Evolução do Projeto
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsEvolutionOpen(!isEvolutionOpen)}>
                        {isEvolutionOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>
                    </h5>
                    {isEvolutionOpen && (
                      <div className="overflow-hidden rounded-lg border bg-white shadow-sm animate-in fade-in duration-300">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Mês</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {monthlyEvolution.length > 0 ? (
                              monthlyEvolution.map((item) => (
                                <tr key={item.key}>
                                  <td className="px-3 py-2 text-gray-700">{item.label}</td>
                                  <td className="px-3 py-2 text-right font-mono text-gray-700">{formatCurrency(item.amount)}</td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={2} className="px-3 py-4 text-center text-gray-500 text-xs">Sem dados de evolução.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-gray-600 mb-2 flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <List className="w-4 h-4" /> Resumo por Classificação
                      </span>
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsClassificationOpen(!isClassificationOpen)}>
                        {isClassificationOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </Button>
                    </h5>
                    {isClassificationOpen && (
                      <div className="overflow-hidden rounded-lg border bg-white shadow-sm animate-in fade-in duration-300">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-100">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-600">Classificação</th>
                              <th className="px-3 py-2 text-right font-medium text-gray-600">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            <tr>
                              <td className="px-3 py-2 text-gray-700 font-medium">CAPEX (Investimento)</td>
                              <td className="px-3 py-2 text-right font-mono text-blue-600 font-bold">{formatCurrency(expenses.filter(e => e.type === 'capex').reduce((acc, exp) => acc + Number(exp.amount || 0), 0))}</td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 text-gray-700 font-medium">OPEX (Operacional)</td>
                              <td className="px-3 py-2 text-right font-mono text-orange-600 font-bold">{formatCurrency(expenses.filter(e => e.type === 'opex').reduce((acc, exp) => acc + Number(exp.amount || 0), 0))}</td>
                            </tr>
                            <tr>
                              <td className="px-3 py-2 text-gray-700 font-medium">Compromissado (Pedidos)</td>
                              <td className="px-3 py-2 text-right font-mono text-cyan-600 font-bold">{formatCurrency(budgetCompromissado)}</td>
                            </tr>
                          </tbody>
                          <tfoot className="bg-gray-50 font-bold border-t">
                            <tr>
                              <td className="px-3 py-2">Total Planejado</td>
                              <td className="px-3 py-2 text-right font-mono text-blue-700">{formatCurrency(budgetPlanejado)}</td>
                            </tr>
                            <tr className="border-t">
                              <td className="px-3 py-2">Total Realizado</td>
                              <td className="px-3 py-2 text-right font-mono">{formatCurrency(budgetRealizado)}</td>
                            </tr>
                            <tr className="border-t">
                              <td className="px-3 py-2">Total (Realizado + Pedidos)</td>
                              <td className="px-3 py-2 text-right font-mono text-indigo-600">{formatCurrency(budgetRealizado + budgetCompromissado)}</td>
                            </tr>
                            <tr className="border-t">
                              <td className="px-3 py-2">Total Disponível</td>
                              <td className={`px-3 py-2 text-right font-mono font-bold ${budgetVariacao >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(budgetVariacao)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
      
      {createAssetOpen && (
        <CreateAssetDialog 
          open={createAssetOpen} 
          onOpenChange={setCreateAssetOpen}
          projectId={project.id}
          initialData={selectedExpenseForAsset || {}}
          onSuccess={(newId) => {
            if (assetCreationCallback) assetCreationCallback(newId);
          }}
        />
      )}

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Projeto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="py-4 mb-20">
              <h4 className="text-sm font-semibold text-slate-700 mb-6">Fluxo de Aprovação</h4>
              <div className="relative flex items-center justify-between px-4">
                <div className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full" />
                <div 
                  className={`absolute left-0 top-4 transform -translate-y-1/2 h-1 -z-10 transition-all duration-500 rounded-full ${
                    steps.findIndex(s => s.id === project.status) >= 0 ? steps[steps.findIndex(s => s.id === project.status)].color : 'bg-blue-600'
                  }`} 
                  style={{ width: `${(Math.max(0, steps.findIndex(s => s.id === project.status)) / (steps.length - 1)) * 100}%` }} 
                />
                {steps.map((step, index) => {
                  const currentStepIndex = steps.findIndex(s => s.id === project.status);
                  const isCompletedStep = index <= currentStepIndex;
                  const isCurrent = index === currentStepIndex;
                  
                  const nextStep = steps[index + 1];
                  const approvalInfo = nextStep 
                    ? project.approvalHistory?.slice().reverse().find((h: any) => h.status === nextStep.id)
                    : null;

                  return (
                    <div key={step.id} className="flex flex-col items-center group relative">
                      <div 
                        className={`
                          w-8 h-8 rounded-full border-2 z-10 transition-all duration-300 flex items-center justify-center
                          ${isCompletedStep 
                            ? `${step.color} ${step.border} shadow-md text-white scale-110` 
                            : 'bg-white border-slate-300 text-slate-400'
                          }
                        `}
                      >
                        {isCompletedStep ? <Check className="w-5 h-5" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                      </div>
                      <span className={`absolute -bottom-10 text-base font-medium whitespace-nowrap ${isCurrent ? step.text : 'text-slate-500'}`}>
                        {step.label}
                      </span>
                      {approvalInfo && (
                        <div className="absolute top-16 flex flex-col items-center w-40 text-center z-20">
                          <span className="text-sm font-bold text-slate-700 leading-tight">{approvalInfo.user}</span>
                          <span className="text-xs text-slate-500 leading-tight">{new Date(approvalInfo.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <h4 className="font-semibold text-sm text-gray-500">Descrição</h4>
              <p className="text-slate-700">{project.description || "Sem descrição"}</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-semibold text-sm text-gray-500">Centro de Custo</h4>
                <p className="text-slate-700">{project.costCenter || "-"}</p>
              </div>
              <div>
                <h4 className="font-semibold text-sm text-gray-500">Data de Início</h4>
                <p className="text-slate-700">{new Date(project.startDate).toLocaleDateString("pt-BR")}</p>
              </div>
            </div>
             <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Capex</h4>
                  <p className="text-slate-700 font-mono">{formatCurrency(Number(project.plannedCapex || 0))}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Opex</h4>
                  <p className="text-slate-700 font-mono">{formatCurrency(Number(project.plannedOpex || 0))}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Valor Planejado</h4>
                  <p className="text-slate-700 font-mono">{formatCurrency(Number(project.plannedValue || 0))}</p>
                </div>
              </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}




export default function BudgetsPage() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewProject, setViewProject] = useState<any | null>(null);

  const [allBudgets, setAllBudgets] = useState<any[]>([]);
  const [allExpenses, setAllExpenses] = useState<any[]>([]);
  const [allAssets, setAllAssets] = useState<any[]>([]);
  const [accountingAccounts, setAccountingAccounts] = useState<any[]>([]);
  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [orderSearch, setOrderSearch] = useState("");
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [openOrderDialog, setOpenOrderDialog] = useState(false);
  
  const initialOrderFormData = {
    orderNumber: "",
    customerName: "",
    customerPhone: "",
    customerCpf: "",
    isRecurring: false,
    description: "",
    projectId: "",
    subtotal: 0,
    deliveryFee: "0",
    discount: "0",
    amount: 0,
    deliveryType: "delivery", // delivery ou pickup
    address: "",
    addressNumber: "",
    complement: "",
    neighborhood: "",
    city: "São Paulo",
    zipCode: "",
    reference: "",
    mapsLink: "",
    coordinates: { lat: "", lng: "" },
    courierId: "",
    deliveryNotes: "",
    paymentMethod: "pix",
    paymentStatus: "pendente",
    amountReceived: "",
    orderItems: [{ product: "", quantity: 1, price: "", obs: "" }],
  };

  const [orderFormData, setOrderFormData] = useState(initialOrderFormData);

  // Simulação de base de clientes para Autocomplete
  const mockCustomers = [
    { name: "João Silva", phone: "11999999999", address: "Rua das Pizzas, 123 - Bairro Italiano", cpf: "123.456.789-00" },
    { name: "Maria Oliveira", phone: "11888888888", address: "Av. Mozzarella, 456 - Apt 22", cpf: "987.654.321-11" },
    { name: "Carlos Massa", phone: "11777777777", address: "Travessa do Forno, 78", cpf: "456.789.123-22" },
  ];

  const mockCouriers = [
    { id: "1", name: "Ricardo Silva", status: "disponivel" },
    { id: "2", name: "Felipe Moto", status: "entrega" },
    { id: "3", name: "João Express", status: "disponivel" },
  ];

  const handlePhoneChange = (val: string) => {
    setOrderFormData(prev => ({ ...prev, customerPhone: val }));
    
    const cleanPhone = val.replace(/\D/g, '');
    if (cleanPhone.length === 11) {
      const found = mockCustomers.find(c => c.phone === cleanPhone);
      if (found) {
        setOrderFormData(prev => ({
          ...prev,
          customerName: found.name,
          customerCpf: found.cpf,
          isRecurring: true,
          address: found.address
        }));
        toast.success("Cliente recorrente identificado!", {
          description: `Nome: ${found.name} | Endereço carregado.`,
          icon: <UserCheck className="w-4 h-4 text-green-500" />
        });
      }
    }
  };

  // Lógica de cálculo do Pedido
  const subtotal = useMemo(() => {
    return orderFormData.orderItems.reduce((acc, item) => {
      return acc + (Number(item.quantity) * Number(item.price || 0));
    }, 0);
  }, [orderFormData.orderItems]);

  const totalOrder = useMemo(() => {
    const fee = Number(orderFormData.deliveryFee) || 0;
    const disc = Number(orderFormData.discount) || 0;
    return subtotal + fee - disc;
  }, [subtotal, orderFormData.deliveryFee, orderFormData.discount]);

  const changeAmount = useMemo(() => {
    if (orderFormData.paymentMethod !== 'dinheiro') return 0;
    const received = Number(orderFormData.amountReceived) || 0;
    const change = received - totalOrder;
    return change > 0 ? change : 0;
  }, [orderFormData.paymentMethod, orderFormData.amountReceived, totalOrder]);

  const addOrderItem = () => {
    setOrderFormData(prev => ({
      ...prev,
      orderItems: [...prev.orderItems, { product: "", quantity: 1, price: "", obs: "" }]
    }));
  };

  const removeOrderItem = (index: number) => {
    if (orderFormData.orderItems.length === 1) return;
    const newItems = [...orderFormData.orderItems];
    newItems.splice(index, 1);
    setOrderFormData(prev => ({ ...prev, orderItems: newItems }));
  };

  const updateOrderItem = (index: number, field: string, value: any) => {
    const newItems = [...orderFormData.orderItems];
    newItems[index] = { ...newItems[index], [field]: value };
    setOrderFormData(prev => ({ ...prev, orderItems: newItems }));
  };

  useEffect(() => {
    if (openOrderDialog && !editingOrderId && !orderFormData.orderNumber) {
      setOrderFormData(prev => ({ ...prev, orderNumber: `PED-${Math.floor(1000 + Math.random() * 9000)}` }));
    }
  }, [openOrderDialog, editingOrderId]);

  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: NodeJS.Timeout;

    if (isScanning) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(s => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.error);
          }

          if (!('BarcodeDetector' in window)) {
            toast.error("API de leitura de barras indisponível. Verifique se está usando HTTPS.");
            setIsScanning(false);
            return;
          }

          if ('BarcodeDetector' in window) {
             try {
                 // @ts-ignore
                 const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'code_39', 'code_93', 'codabar', 'ean_13', 'ean_8', 'itf', 'pdf417', 'upc_a', 'upc_e', 'data_matrix', 'aztec'] });
                 interval = setInterval(async () => {
                    if (videoRef.current && videoRef.current.readyState === 4) {
                        try {
                            const barcodes = await detector.detect(videoRef.current);
                            if (barcodes.length > 0) {
                                const rawValue = barcodes[0].rawValue;
                                const match = rawValue.match(/[0-9]{44}/);
                                if (match) {
                                    setNfeKey(match[0]);
                                    setIsScanning(false);
                                    new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3").play().catch(() => {});
                                    toast.success("Chave da NF-e lida com sucesso!");
                                } else {
                                    setNfeKey(rawValue);
                                    setIsScanning(false);
                                    new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3").play().catch(() => {});
                                    toast.success("Código de barras lido!");
                                }
                            }
                        } catch (e) {}
                    }
                 }, 500);
             } catch (e) { console.warn("BarcodeDetector error", e); }
          }
        })
        .catch(err => {
          console.error("Erro câmera", err);
          toast.error("Erro ao acessar câmera.");
          setIsScanning(false);
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (interval) clearInterval(interval);
    };
  }, [isScanning]);

  const steps = [
    { id: 'aguardando_classificacao', label: 'Classificação', color: 'bg-blue-500', border: 'border-blue-500', text: 'text-blue-600', ring: 'ring-blue-200' },
    { id: 'aguardando_engenharia', label: 'Engenharia', color: 'bg-yellow-500', border: 'border-yellow-500', text: 'text-yellow-600', ring: 'ring-yellow-200' },
    { id: 'aguardando_diretoria', label: 'Diretoria', color: 'bg-orange-500', border: 'border-orange-500', text: 'text-orange-600', ring: 'ring-orange-200' },
    { id: 'aprovado', label: 'Aprovado', color: 'bg-green-500', border: 'border-green-500', text: 'text-green-600', ring: 'ring-green-200' }
  ];

  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
      setIsLoading(false);
    });

    const unsubBudgets = onSnapshot(collection(db, "budgets"), (snapshot) => {
      setAllBudgets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubExpenses = onSnapshot(collection(db, "expenses"), (snapshot) => {
      setAllExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubAssets = onSnapshot(collection(db, "assets"), (snapshot) => {
      setAllAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubAccounts = onSnapshot(collection(db, "accounting_accounts"), (snapshot) => {
      setAccountingAccounts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubOrders = onSnapshot(collection(db, "orders"), (snapshot) => {
      setAllOrders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubProjects();
      unsubBudgets();
      unsubExpenses();
      unsubAssets();
      unsubAccounts();
      unsubOrders();
    };
  }, []);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("all");
  const [totals, setTotals] = useState<Record<string, { planned: number; realized: number; committed: number }>>({});

  const filteredProjects = projects?.filter(p => selectedProjectId === "all" || String(p.id) === selectedProjectId);

  const handleDataLoaded = useCallback((id: string, planned: number, realized: number, committed: number) => {
    setTotals(prev => {
      if (prev[id]?.planned === planned && prev[id]?.realized === realized && prev[id]?.committed === committed) return prev;
      return { ...prev, [id]: { planned, realized, committed } };
    });
  }, []);

  const totalPlanned = filteredProjects?.reduce((acc, p) => acc + (totals[String(p.id)]?.planned || 0), 0) || 0;
  const totalRealized = filteredProjects?.reduce((acc, p) => acc + (totals[String(p.id)]?.realized || 0), 0) || 0;
  const totalCommitted = filteredProjects?.reduce((acc, p) => acc + (totals[String(p.id)]?.committed || 0), 0) || 0;
  const totalAvailable = totalPlanned - (totalRealized + totalCommitted);

  // --- Nova Despesa Logic ---
  const [openExpenseDialog, setOpenExpenseDialog] = useState(false);
  const [nfeKey, setNfeKey] = useState("");
  const [isFetchingNfe, setIsFetchingNfe] = useState(false);
  const [expenseFormData, setExpenseFormData] = useState({
    description: "",
    amount: "",
    quantity: "1",
    type: "capex" as "capex" | "opex",
    category: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    orderId: "",
    assetId: null as string | null,
    projectId: "",
    invoiceNumber: "",
    attachment: null as File | null,
    ncm: "",
    cfop: "",
    unit: "",
  });
  const [nfeProducts, setNfeProducts] = useState<any[]>([]);

  const filteredAssetsForExpense = useMemo(() => {
    if (!expenseFormData.projectId) return [];
    return allAssets.filter(asset => 
      String(asset.projectId) === String(expenseFormData.projectId)
    );
  }, [allAssets, expenseFormData.projectId]);

  const handleOpenExpenseDialog = (open: boolean) => {
    setOpenExpenseDialog(open);
    if (open) {
      setOrderSearch("");
      setExpenseFormData({
        description: "",
        amount: "",
        quantity: "1",
        type: "capex",
        category: "",
        date: new Date().toISOString().split("T")[0],
        notes: "",
        orderId: "",
        assetId: null,
        projectId: selectedProjectId === "all" ? "" : selectedProjectId,
        invoiceNumber: "",
        attachment: null,
        ncm: "",
        cfop: "",
        unit: "",
      });
      setNfeProducts([]);
      setNfeKey("");
    }
  };

  // Simulação de consulta NF-e
  const isNfeLoading = false;

  const handleFetchNfe = async () => {
    toast.info("Consulta automática via backend desativada. Use o upload de XML.");
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExpenseFormData(prev => ({ ...prev, attachment: file }));

    if (file.name.toLowerCase().endsWith('.xml')) {
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const get = (tag: string, parent: Element | Document = xmlDoc) => {
          const el = parent.getElementsByTagName(tag)[0];
          return el ? el.textContent?.trim() || "" : "";
        };

        const emitente = get("xNome", xmlDoc.getElementsByTagName("emit")[0]);
        const nNF = get("nNF");
        const dhEmi = get("dhEmi") || get("dEmi");
        const vNF = get("vNF");
        const infCpl = get("infCpl");

        const products: any[] = [];
        const dets = xmlDoc.getElementsByTagName("det");
        
        for (let i = 0; i < dets.length; i++) {
            const prod = dets[i].getElementsByTagName("prod")[0];
            const imposto = dets[i].getElementsByTagName("imposto")[0];
            const icmsWrapper = imposto?.getElementsByTagName("ICMS")[0];
            const icmsNode = icmsWrapper ? icmsWrapper.firstElementChild : null;
            const ipiWrapper = imposto?.getElementsByTagName("IPI")[0];
            const ipiTrib = ipiWrapper?.getElementsByTagName("IPITrib")[0];

            if (prod) {
                products.push({
                    code: get("cProd", prod),
                    description: get("xProd", prod),
                    ncm: get("NCM", prod),
                    cest: get("CEST", prod),
                    cfop: get("CFOP", prod),
                    unit: get("uCom", prod),
                    quantity: parseFloat(get("qCom", prod) || "0"),
                    unitPrice: parseFloat(get("vUnCom", prod) || "0"),
                    totalPrice: parseFloat(get("vProd", prod) || "0"),
                    discount: parseFloat(get("vDesc", prod) || "0"),
                    cst: icmsNode ? (get("CST", icmsNode) || get("CSOSN", icmsNode)) : "",
                    orig: icmsNode ? get("orig", icmsNode) : "",
                    icmsBase: icmsNode ? parseFloat(get("vBC", icmsNode) || "0") : 0,
                    icmsValue: icmsNode ? parseFloat(get("vICMS", icmsNode) || "0") : 0,
                    icmsRate: icmsNode ? parseFloat(get("pICMS", icmsNode) || "0") : 0,
                    ipiValue: ipiTrib ? parseFloat(get("vIPI", ipiTrib) || "0") : 0,
                    ipiRate: ipiTrib ? parseFloat(get("pIPI", ipiTrib) || "0") : 0,
                });
            }
        }

        setNfeProducts(products);
        
        setExpenseFormData(prev => ({
            ...prev,
            description: emitente || prev.description,
            amount: vNF || prev.amount,
            date: dhEmi ? new Date(dhEmi).toISOString().split("T")[0] : prev.date,
            invoiceNumber: nNF || prev.invoiceNumber,
            notes: `${prev.notes} ${infCpl}`.trim(),
            ncm: products[0]?.ncm || prev.ncm,
            cfop: products[0]?.cfop || prev.cfop,
            unit: products[0]?.unit || prev.unit,
        }));

        toast.success("Dados extraídos do XML com sucesso!");
      } catch (error) {
        console.error("Erro ao processar XML", error);
        toast.error("Falha ao processar o arquivo XML.");
      }
    } else {
      toast.info("Arquivo anexado.", {
        description: "Para preenchimento automático dos campos e itens, utilize o arquivo XML da nota fiscal. O PDF serve apenas como anexo."
      });
    }
  };

  const handleAddProductRow = () => {
    setNfeProducts([...nfeProducts, {
      code: "", description: "", ncm: "", cest: "", cst: "", orig: "", cfop: "", unit: "", quantity: 0, unitPrice: 0, totalPrice: 0, discount: 0, icmsBase: 0, icmsValue: 0, icmsRate: 0, ipiValue: 0, ipiRate: 0
    }]);
  };

  const handleRemoveProductRow = (index: number) => {
    const newProducts = [...nfeProducts];
    newProducts.splice(index, 1);
    setNfeProducts(newProducts);
  };

  const handleProductChange = (index: number, field: string, value: any) => {
    const newProducts = [...nfeProducts];
    newProducts[index] = { ...newProducts[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
        newProducts[index].totalPrice = Number(newProducts[index].quantity) * Number(newProducts[index].unitPrice);
    }
    setNfeProducts(newProducts);
  };

  const handleEditOrder = (order: any) => {
    setOrderFormData({
      ...initialOrderFormData,
      ...order,
      // Garante que campos numéricos ou nulos sejam tratados para os inputs
      deliveryFee: String(order.deliveryFee || "0"),
      discount: String(order.discount || "0"),
      amountReceived: String(order.amountReceived || ""),
    });
    setEditingOrderId(order.id);
    setOpenOrderDialog(true);
  };

  const handleDeleteOrder = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir este pedido?")) return;
    try {
      await deleteDoc(doc(db, "orders", id));
      toast.success("Pedido excluído!");
    } catch (error) {
      toast.error("Erro ao excluir pedido");
    }
  };

  const handleOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderFormData.projectId) {
      toast.error("Selecione uma obra");
      return;
    }
    try {
      const { id, ...dataToSave } = orderFormData as any;

      if (editingOrderId) {
        await updateDoc(doc(db, "orders", editingOrderId), {
          ...dataToSave,
          amount: totalOrder, // Salva o total calculado automaticamente
          updatedAt: new Date().toISOString(),
        });
        toast.success("Pedido atualizado com sucesso!");
      } else {
        const ordersSnapshot = await getDocs(collection(db, "orders"));
        const numbers = ordersSnapshot.docs
          .map(d => d.data().orderNumber)
          .filter(n => typeof n === 'string' && n.startsWith("PED-"))
          .map(n => parseInt(n.replace("PED-", ""), 10))
          .filter(n => !isNaN(n));
        const max = numbers.length > 0 ? Math.max(...numbers) : 0;
        const newOrderNumber = `PED-${String(max + 1).padStart(6, '0')}`;

        await addDoc(collection(db, "orders"), {
          ...dataToSave,
          orderNumber: newOrderNumber,
          amount: totalOrder, // Salva o total calculado automaticamente
          status: "pendente",
          createdAt: new Date().toISOString(),
        });
        toast.success("Pedido criado com sucesso!");
      }
      setOpenOrderDialog(false);
      setEditingOrderId(null);
      setOrderFormData(initialOrderFormData);
    } catch (error) {
      toast.error("Erro ao salvar pedido");
    }
  };

  const handleExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseFormData.projectId) {
      toast.error("Selecione uma obra");
      return;
    }

    const selectedProjectForExpense = projects.find(p => String(p.id) === String(expenseFormData.projectId));
    // Bloqueia se o projeto não estiver em um estado de execução (aprovado, em_andamento ou concluido)
    const isExpenseBlocked = selectedProjectForExpense && !['aprovado', 'em_andamento', 'concluido'].includes(selectedProjectForExpense.status);

    if (isExpenseBlocked) {
      toast.error("Esta obra ainda não foi aprovada. O lançamento de despesas está bloqueado.");
      return;
    }

    if (expenseFormData.type === 'capex' && !expenseFormData.assetId) {
      toast.error("Selecione um ativo válido para despesas Capex.");
      return;
    }

    try {
      let finalAssetId: string | number | undefined;
      if (expenseFormData.type === 'capex' && expenseFormData.assetId !== null) {
        finalAssetId = expenseFormData.assetId;
      }

      await addDoc(collection(db, "expenses"), {
        projectId: expenseFormData.projectId,
        orderId: expenseFormData.orderId,
        description: expenseFormData.description,
        amount: expenseFormData.amount,
        quantity: Number(expenseFormData.quantity) || 1,
        type: expenseFormData.type,
        category: expenseFormData.category || "",
        date: new Date(expenseFormData.date),
        notes: expenseFormData.notes || "",
        assetId: finalAssetId,
        invoiceNumber: expenseFormData.invoiceNumber,
        attachmentUrl: null, // Não estamos salvando o arquivo, então attachmentUrl é null
        ncm: expenseFormData.ncm,
        cfop: expenseFormData.cfop,
        unit: expenseFormData.unit,
        items: nfeProducts,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      toast.success("Despesa criada com sucesso!");
      setOpenExpenseDialog(false);
    } catch (error: any) {
      toast.error(error.message || "Erro ao criar despesa");
    }
  };

  const selectedProjectForExpense = projects.find(p => String(p.id) === String(expenseFormData.projectId));
  const isExpenseBlocked = selectedProjectForExpense && !['aprovado', 'em_andamento', 'concluido'].includes(selectedProjectForExpense.status);
  // ---------------------------

  const selectedOrderBalance = useMemo(() => {
    if (!expenseFormData.orderId) return 0;
    const order = allOrders.find(o => o.id === expenseFormData.orderId);
    if (!order) return 0;
    const consumed = allExpenses
      .filter(e => e.orderId === order.id)
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
    return Number(order.amount || 0) - consumed;
  }, [expenseFormData.orderId, allOrders, allExpenses]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [totalToImport, setTotalToImport] = useState(0);
  
  const [editingProject, setEditingProject] = useState<any | null>(null);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);


  const handleEdit = useCallback((project: any) => {
    setEditingProject(project);
    setIsProjectModalOpen(true);
  }, []);

  const handleDownloadTemplate = () => {
    const headers = [
      "Descrição",
      "Valor",
      "Quantidade",
      "Tipo (Capex/Opex)",
      "Categoria",
      "Data (AAAA-MM-DD)",
      "Notas",
      "Número do Ativo (Se Capex)"
    ];
    const example = [
      "Compra de Cimento",
      "500.00",
      "10",
      "opex",
      "Materiais",
      new Date().toISOString().split('T')[0],
      "Obra 01",
      ""
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 }, { wch: 25 }, { wch: 20 }];
    
    XLSX.utils.book_append_sheet(wb, ws, "Template Despesas");
    XLSX.writeFile(wb, "template_importacao_despesas.xlsx");
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    let processedCount = 0;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(worksheet);

        if (json.length === 0) {
          toast.error("O arquivo está vazio.");
          setIsImporting(false);
          return;
        }
        setTotalToImport(json.length);

        let assetsMap: Record<string, string> = {};
        try {
            const assetsSnapshot = await getDocs(collection(db, "assets"));
            assetsSnapshot.forEach((doc) => {
                const a = doc.data();
                if (a.assetNumber) assetsMap[String(a.assetNumber)] = String(a.id);
            });
        } catch (err) {
            console.error("Failed to fetch assets for import resolution", err);
        }

        let successCount = 0;
        let errorCount = 0;
        
        const promises = json.map(async (row: any, index: number) => {
            try {
                let projectId = "";
                
                // Se o campo "Nome da Obra" não for fornecido, usa o filtro selecionado na tela
                if (selectedProjectId !== "all") { 
                    projectId = selectedProjectId;
                } else {
                    throw new Error("Selecione uma obra no filtro ou forneça 'Nome da Obra' na planilha.");
                }

                if (!projectId) throw new Error(`Obra não identificada para: ${row["Descrição"]}`);

                const description = row["Descrição"];
                if (!description) throw new Error("Descrição obrigatória");

                const amount = row["Valor"];
                const quantity = row["Quantidade"] || 1;
                const type = (row["Tipo (Capex/Opex)"] || "opex").toLowerCase();
                const category = row["Categoria"] || "";
                const dateStr = row["Data (AAAA-MM-DD)"];
                const notes = row["Notas"] || "";
                const assetNumber = row["Número do Ativo (Se Capex)"];

                let date = new Date();
                if (dateStr) {
                    const d = new Date(dateStr);
                    if (!isNaN(d.getTime())) date = d;
                }

                let assetId: string | undefined = undefined;
                if (type === 'capex' && assetNumber && assetsMap[String(assetNumber)]) {
                    assetId = assetsMap[String(assetNumber)];
                }

                await addDoc(collection(db, "expenses"), {
                    projectId: String(projectId),
                    description: String(description),
                    amount: String(amount),
                    quantity: Number(quantity),
                    type: type as "capex" | "opex",
                    category: String(category),
                    date: date,
                    notes: String(notes),
                    assetId: assetId ? String(assetId) : undefined,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                processedCount++;
                setImportProgress(Math.round((processedCount / json.length) * 100));
                successCount++;
            } catch (err) {
                console.error(err);
                errorCount++;
            }
        });

        await Promise.all(promises);
        if (successCount > 0) toast.success(`${successCount} despesas importadas!`);
        if (errorCount > 0) toast.error(`${errorCount} falhas na importação.`);
        
      } catch (error) {
        console.error("Erro na importação:", error);
        toast.error("Erro ao processar o arquivo.");
      } finally {
        setIsImporting(false);
        setImportProgress(0);
        setTotalToImport(0);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExportProjects = () => {
    if (!filteredProjects || filteredProjects.length === 0) {
      toast.error("Não há obras para exportar.");
      return;
    }

    const projectsData = filteredProjects.map(project => {
      const budgets = allBudgets.filter(b => String(b.projectId) === String(project.id));
      const expenses = allExpenses.filter(e => String(e.projectId) === String(project.id));
      const orders = allOrders.filter(o => String(o.projectId) === String(project.id));

      const realized = expenses.reduce((acc, expense) => acc + Number(expense.amount), 0);
      const expensesByOrder = expenses.reduce((acc, exp) => {
        if (exp.orderId) acc[exp.orderId] = (acc[exp.orderId] || 0) + Number(exp.amount || 0);
        return acc;
      }, {} as Record<string, number>);

      const committed = orders.reduce((acc, order) => {
        const consumed = expensesByOrder[order.id] || 0;
        return acc + Math.max(0, Number(order.amount || 0) - consumed);
      }, 0);

      const planned = project.plannedValue ? Number(project.plannedValue) : budgets.reduce((acc, b) => acc + Number(b.plannedAmount), 0);
      const available = planned - (realized + committed);
      const progress = planned > 0 ? ((realized + committed) / planned) * 100 : 0;

      return {
        "Obra": project.name,
        "Código": project.code || "-",
        "Status": project.status?.replace('_', ' '),
        "Previsão Conclusão": project.estimatedEndDate ? new Date(project.estimatedEndDate).toLocaleDateString("pt-BR") : "-",
        "Planejado (R$)": planned,
        "Realizado (R$)": realized,
        "Compromissado (R$)": committed,
        "Disponível (R$)": available,
        "Progresso (%)": progress.toFixed(2)
      };
    });

    // Detalhamento do Realizado (Lista de Despesas)
    const expensesData: any[] = [];
    filteredProjects.forEach(project => {
      const projectExpenses = allExpenses.filter(e => String(e.projectId) === String(project.id));
      projectExpenses.forEach(expense => {
        const date = expense.date?.toDate ? expense.date.toDate() : new Date(expense.date);
        
        const baseRow = {
          "Obra": project.name,
          "Código Obra": project.code || "-",
          "Data": isNaN(date.getTime()) ? "-" : date.toLocaleDateString("pt-BR"),
          "Categoria": expense.category || "-",
          "Tipo": (expense.type || "opex").toUpperCase(),
          "Nota Fiscal": expense.invoiceNumber || expense.notes?.match(/NF-e:\s*(\d{44})/)?.[1] || "-",
          "Pedido Vinculado": allOrders.find(o => o.id === expense.orderId)?.orderNumber || "-",
        };

        // Se a despesa tiver itens detalhados (ex: vindo de um XML), exporta cada um
        if (expense.items && expense.items.length > 0) {
          expense.items.forEach((item: any) => {
            expensesData.push({
              ...baseRow,
              "Descrição Despesa": expense.description || "-",
              "Item / Produto": item.description || "-",
              "Cód. Produto": item.code || "-",
              "Qtd": Number(item.quantity || 0),
              "Valor Unit. (R$)": Number(item.unitPrice || 0),
              "Valor Total Item (R$)": Number(item.totalPrice || 0),
              "Observações": item.obs || expense.notes || "-"
            });
          });
        } else {
          // Se não tiver itens, exporta a despesa como linha única
          expensesData.push({
            ...baseRow,
            "Descrição Despesa": expense.description || "-",
            "Item / Produto": "Geral",
            "Cód. Produto": "-",
            "Qtd": Number(expense.quantity || 1),
            "Valor Unit. (R$)": Number(expense.amount || 0),
            "Valor Total Item (R$)": Number(expense.amount || 0),
            "Observações": expense.notes || "-"
          });
        }
      });
    });

    const wb = XLSX.utils.book_new();
    const wsProjects = XLSX.utils.json_to_sheet(projectsData);
    XLSX.utils.book_append_sheet(wb, wsProjects, "Resumo Obras");

    if (expensesData.length > 0) {
      const wsExpenses = XLSX.utils.json_to_sheet(expensesData);
      XLSX.utils.book_append_sheet(wb, wsExpenses, "Detalhamento Despesas");
    }

    XLSX.writeFile(wb, `relatorio_obras_detalhado_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório de obras detalhado exportado!");
  };

  const handleExportOrders = () => {
    const filteredOrders = allOrders.filter(o => selectedProjectId === "all" || String(o.projectId) === selectedProjectId);
    if (filteredOrders.length === 0) {
      toast.error("Não há pedidos para exportar.");
      return;
    }

    const data = filteredOrders.map(order => {
      const project = projects.find(p => String(p.id) === String(order.projectId));
      const consumedAmount = allExpenses
        .filter(e => e.orderId === order.id)
        .reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const orderAmount = Number(order.amount || 0);
      const progress = orderAmount > 0 ? (consumedAmount / orderAmount) * 100 : 0;

      return {
        "Cód Pedido": order.orderNumber || "-",
        "Obra": project?.name || "N/A",
        "Descrição": order.description || "-",
        "Valor Estimado (R$)": orderAmount,
        "Consumido (R$)": consumedAmount,
        "Controle (%)": progress.toFixed(2),
        "Status": order.status || "-"
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pedidos");
    XLSX.writeFile(wb, `relatorio_pedidos_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório de pedidos exportado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Budgets</h1>
        <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => {
          setEditingOrderId(null);
          setOrderFormData({ ...initialOrderFormData, orderNumber: `PED-${Math.floor(1000 + Math.random() * 9000)}` });
          setOpenOrderDialog(true);
        }}>
          <ShoppingCart className="mr-2 h-4 w-4" />
          Novo Pedido
        </Button>
        <Button variant="outline" onClick={handleDownloadTemplate}>
          <Download className="mr-2 h-4 w-4" />
          Template
        </Button>
        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isImporting}>
            {isImporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Importar
        </Button>
        <Button variant="outline" onClick={handleExportProjects} className="border-blue-200 text-blue-700 hover:bg-blue-50">
          <Download className="mr-2 h-4 w-4" /> Exportar Obras
        </Button>
        <Button variant="outline" onClick={handleExportOrders} className="border-orange-200 text-orange-700 hover:bg-orange-50">
          <Download className="mr-2 h-4 w-4" /> Exportar Pedidos
        </Button>
        <Input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
        />
        <ProjectEditModal open={isProjectModalOpen} onOpenChange={setIsProjectModalOpen} projectToEdit={editingProject} />
        <Input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
            accept=".xlsx, .xls"
        />
        {isImporting && (
          <div className="w-full mt-4">
            <div className="flex justify-between text-sm text-muted-foreground mb-1">
              <span>Importando... ({importProgress}%)</span>
              <span>{importProgress > 0 ? Math.round(totalToImport * (importProgress / 100)) : 0}/{totalToImport}</span>
            </div>
            <Progress value={importProgress} className="h-2" />
          </div>
        )}
        <Dialog open={openOrderDialog} onOpenChange={(val) => {
          setOpenOrderDialog(val);
          if (!val) {
            setEditingOrderId(null);
            setOrderFormData(initialOrderFormData);
          }
        }}>
          <DialogContent className="max-w-[900px] h-[90vh] flex flex-col p-0">
            <DialogHeader className="p-6 bg-slate-50 border-b">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <Package className="w-6 h-6 text-orange-600" />
                </div>
                <div>
                  <DialogTitle className="text-2xl font-bold text-slate-800">
                    {editingOrderId ? "Editar Pedido de Ativos" : "Novo Pedido de Aquisição"} <span className="text-orange-500 ml-2">#{orderFormData.orderNumber}</span>
                  </DialogTitle>
                  <DialogDescription>
                    Registre os detalhes da aquisição de ativos, equipamentos e materiais.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <Tabs defaultValue="pedido" className="flex-1 flex flex-col overflow-hidden">
              <TabsList className="px-6 bg-white justify-start h-14 rounded-none border-b gap-6">
                <TabsTrigger value="cliente" className="gap-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none h-full">
                  <User size={16} /> 1. Solicitante / Fornecedor
                </TabsTrigger>
                <TabsTrigger value="pedido" className="gap-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none h-full">
                  <ShoppingCart size={16} /> 2. Itens do Ativo
                </TabsTrigger>
                <TabsTrigger value="entrega" className="gap-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none h-full">
                  <Truck size={16} /> 3. Logística / Local
                </TabsTrigger>
                <TabsTrigger value="pagamento" className="gap-2 text-sm data-[state=active]:border-b-2 data-[state=active]:border-orange-500 rounded-none h-full">
                  <Wallet size={16} /> 4. Pagamento
                </TabsTrigger>
              </TabsList>

              <div className="flex-1 overflow-y-auto p-8">
                <form id="order-pizza-form" onSubmit={handleOrderSubmit}>
                  <TabsContent value="cliente" className="m-0 space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                          <Phone className="w-4 h-4 text-orange-500" />
                          Telefone (WhatsApp) *
                        </Label>
                        <Input 
                          autoFocus
                          required
                          value={orderFormData.customerPhone}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          placeholder="(00) 00000-0000"
                          className="h-11 border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                        />
                        <p className="text-[10px] text-muted-foreground italic">Busca automática de histórico do contato.</p>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                          <User className="w-4 h-4 text-orange-500" />
                          Nome do Contato / Fornecedor *
                        </Label>
                        <Input 
                          required
                          value={orderFormData.customerName}
                          onChange={(e) => setOrderFormData({ ...orderFormData, customerName: e.target.value })}
                          placeholder="Nome completo do cliente"
                          className="h-11 border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                          <Hash className="w-4 h-4 text-orange-500" />
                          CNPJ Fornecedor (opcional)
                        </Label>
                        <Input 
                          value={orderFormData.customerCpf}
                          onChange={(e) => setOrderFormData({ ...orderFormData, customerCpf: e.target.value })}
                          placeholder="000.000.000-00"
                          className="h-11 border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>

                      <div className="col-span-2 space-y-2">
                        <Label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                          <FileText className="w-4 h-4 text-orange-500" />
                          Descrição do Pedido
                        </Label>
                        <Textarea 
                          value={orderFormData.description}
                          onChange={(e) => setOrderFormData({ ...orderFormData, description: e.target.value })}
                          placeholder="Descreva a finalidade ou detalhes desta aquisição..."
                          className="min-h-[80px] border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                        />
                      </div>

                      <div className="flex items-end pb-1">
                        <div className={`flex items-center space-x-3 p-3 rounded-xl border transition-all w-full ${orderFormData.isRecurring ? 'bg-orange-50 border-orange-200' : 'bg-slate-50 border-slate-100'}`}>
                          <Checkbox 
                            id="isRecurring" 
                            checked={orderFormData.isRecurring}
                            onCheckedChange={(checked) => setOrderFormData({ ...orderFormData, isRecurring: !!checked })}
                            className="w-5 h-5 data-[state=checked]:bg-orange-600 border-slate-300"
                          />
                          <div className="grid gap-1.5 leading-none">
                            <label htmlFor="isRecurring" className="text-sm font-bold text-slate-700 cursor-pointer">
                              Fornecedor Homologado
                            </label>
                            <p className="text-xs text-slate-500">
                              Utilizar dados contratuais padrão.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="pedido" className="m-0 space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">SEÇÃO 2: ITENS DA AQUISIÇÃO</h3>
                      <div className="flex items-center gap-2 bg-orange-50 px-3 py-1 rounded-full border border-orange-100">
                        <span className="text-xs font-semibold text-orange-700 uppercase">Nº Pedido:</span>
                        <span className="text-sm font-mono font-bold text-orange-600">{orderFormData.orderNumber}</span>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-semibold mb-2 block">Vincular à Obra *</Label>
                        <Select value={orderFormData.projectId} onValueChange={(v) => setOrderFormData({ ...orderFormData, projectId: v })}>
                          <SelectTrigger className="h-11 bg-white border-slate-200">
                            <SelectValue placeholder="Selecione a obra de origem do custo" />
                          </SelectTrigger>
                          <SelectContent>
                            {projects?.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        <Label className="text-base font-semibold text-slate-700">Descrição dos Ativos *</Label>
                        <Button 
                          type="button" 
                          variant="outline" 
                          size="sm" 
                          onClick={addOrderItem} 
                          className="h-8 text-xs border-orange-200 text-orange-700 hover:bg-orange-50"
                        >
                          <Plus className="w-3 h-3 mr-1" /> Adicionar Ativo
                        </Button>
                      </div>

                      <div className="border rounded-xl overflow-hidden bg-white shadow-sm">
                        <Table>
                          <TableHeader className="bg-slate-50">
                            <TableRow>
                              <TableHead className="w-[40%] text-xs font-bold uppercase">Ativo / Material</TableHead>
                              <TableHead className="w-[15%] text-xs font-bold uppercase text-center">Qtd</TableHead>
                              <TableHead className="w-[20%] text-xs font-bold uppercase text-right">Unitário</TableHead>
                              <TableHead className="w-[25%] text-xs font-bold uppercase">Observação</TableHead>
                              <TableHead className="w-[50px]"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {orderFormData.orderItems.map((item, index) => (
                              <TableRow key={index} className="group">
                                <TableCell className="p-2">
                                  <Input 
                                    value={item.product} 
                                    onChange={(e) => updateOrderItem(index, 'product', e.target.value)}
                                    placeholder="Ex: Betoneira 400L / Notebook i7"
                                    className="h-9 text-sm border-transparent focus:border-orange-500 bg-transparent"
                                  />
                                </TableCell>
                                <TableCell className="p-2">
                                  <div className="flex items-center justify-center gap-1">
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7 rounded-full text-slate-400 hover:text-orange-600"
                                      onClick={() => updateOrderItem(index, 'quantity', Math.max(1, item.quantity - 1))}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-8 text-center font-bold text-sm">{item.quantity}</span>
                                    <Button 
                                      type="button" 
                                      variant="ghost" 
                                      size="icon" 
                                      className="h-7 w-7 rounded-full text-slate-400 hover:text-orange-600"
                                      onClick={() => updateOrderItem(index, 'quantity', item.quantity + 1)}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </TableCell>
                                <TableCell className="p-2 text-right">
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">R$</span>
                                    <Input 
                                      type="number"
                                      value={item.price}
                                      onChange={(e) => updateOrderItem(index, 'price', e.target.value)}
                                      placeholder="0,00"
                                      className="h-9 text-sm pl-7 text-right font-mono border-transparent focus:border-orange-500 bg-transparent"
                                    />
                                  </div>
                                </TableCell>
                                <TableCell className="p-2">
                                  <Input 
                                    value={item.obs} 
                                    onChange={(e) => updateOrderItem(index, 'obs', e.target.value)}
                                    placeholder="Ex: Voltagem 220v / Garantia 2 anos"
                                    className="h-9 text-sm italic border-transparent focus:border-orange-500 bg-transparent"
                                  />
                                </TableCell>
                                <TableCell className="p-2 text-center">
                                  <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => removeOrderItem(index)}
                                    disabled={orderFormData.orderItems.length === 1}
                                    className="text-slate-300 hover:text-red-600 transition-colors"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-dashed">
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700">Taxa de Entrega</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">R$</span>
                              <Input 
                                type="number"
                                value={orderFormData.deliveryFee}
                                onChange={(e) => setOrderFormData({...orderFormData, deliveryFee: e.target.value})}
                                className="pl-9 h-11 font-mono border-slate-200 focus:ring-orange-500"
                              />
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-sm font-semibold text-slate-700">Desconto</Label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 --translate-y-1/2 text-slate-400 text-sm">R$</span>
                              <Input 
                                type="number"
                                value={orderFormData.discount}
                                onChange={(e) => setOrderFormData({...orderFormData, discount: e.target.value})}
                                className="pl-9 h-11 font-mono text-red-600 border-slate-200 focus:ring-orange-500"
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-3">
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="text-sm font-medium">Subtotal</span>
                          <span className="font-mono font-semibold">{formatCurrency(subtotal)}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="text-sm font-medium">Taxa de entrega</span>
                          <span className="font-mono text-blue-600">+ {formatCurrency(Number(orderFormData.deliveryFee || 0))}</span>
                        </div>
                        <div className="flex justify-between items-center text-slate-600">
                          <span className="text-sm font-medium">Desconto</span>
                          <span className="font-mono text-red-600">- {formatCurrency(Number(orderFormData.discount || 0))}</span>
                        </div>
                        <div className="pt-3 border-t border-slate-200 flex justify-between items-center">
                          <span className="text-lg font-black text-slate-800 uppercase tracking-tight">Total da Aquisição</span>
                          <span className="text-2xl font-black text-orange-600 font-mono">{formatCurrency(totalOrder)}</span>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="entrega" className="m-0 space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">SEÇÃO 3: LOGÍSTICA</h3>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <Label className="text-sm font-semibold mb-3 block text-slate-700">Tipo de Retirada/Entrega</Label>
                        <div className="grid grid-cols-2 gap-4">
                          <div
                            onClick={() => setOrderFormData({ ...orderFormData, deliveryType: 'delivery' })}
                            className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              orderFormData.deliveryType === 'delivery' ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md' : 'border-slate-100 bg-white text-slate-500'
                            }`}
                          >
                            <Truck size={20} />
                            <span className="font-bold">Delivery</span>
                          </div>
                          <div
                            onClick={() => setOrderFormData({ ...orderFormData, deliveryType: 'pickup' })}
                            className={`flex items-center justify-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                              orderFormData.deliveryType === 'pickup' ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-md' : 'border-slate-100 bg-white text-slate-500'
                            }`}
                          >
                            <Building2 size={20} />
                            <span className="font-bold">Retirada no Fornecedor</span>
                          </div>
                        </div>
                      </div>

                      {orderFormData.deliveryType === 'delivery' && (
                        <div className="space-y-6 animate-in slide-in-from-top-2 duration-300">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2 space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Endereço *</Label>
                              <Input
                                required
                                value={orderFormData.address}
                                onChange={(e) => setOrderFormData({ ...orderFormData, address: e.target.value })}
                                placeholder="Rua, Av, Travessa..."
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Número *</Label>
                              <Input
                                required
                                value={orderFormData.addressNumber}
                                onChange={(e) => setOrderFormData({ ...orderFormData, addressNumber: e.target.value })}
                                placeholder="123"
                                className="h-11"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Complemento</Label>
                              <Input
                                value={orderFormData.complement}
                                onChange={(e) => setOrderFormData({ ...orderFormData, complement: e.target.value })}
                                placeholder="Apto, Bloco, Fundos"
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Bairro *</Label>
                              <Input
                                required
                                value={orderFormData.neighborhood}
                                onChange={(e) => setOrderFormData({ ...orderFormData, neighborhood: e.target.value })}
                                placeholder="Ex: Centro"
                                className="h-11"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="md:col-span-2 space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Cidade *</Label>
                              <Input
                                required
                                value={orderFormData.city}
                                onChange={(e) => setOrderFormData({ ...orderFormData, city: e.target.value })}
                                className="h-11"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">CEP</Label>
                              <Input
                                value={orderFormData.zipCode}
                                onChange={(e) => setOrderFormData({ ...orderFormData, zipCode: e.target.value })}
                                placeholder="00000-000"
                                className="h-11"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-xs font-bold uppercase text-slate-500">Referência</Label>
                            <Input
                              value={orderFormData.reference}
                              onChange={(e) => setOrderFormData({ ...orderFormData, reference: e.target.value })}
                              placeholder="Próximo ao mercado, portão azul..."
                              className="h-11"
                            />
                          </div>

                          <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-300 space-y-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Navigation size={16} className="text-orange-500" />
                              <span className="text-sm font-bold text-slate-700">Localização no Mapa</span>
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Link Google Maps</Label>
                              <div className="flex gap-2">
                                <Input
                                  value={orderFormData.mapsLink}
                                  onChange={(e) => setOrderFormData({ ...orderFormData, mapsLink: e.target.value })}
                                  placeholder="https://maps.google.com/..."
                                  className="h-10 text-xs"
                                />
                                <Button type="button" variant="outline" size="icon" className="h-10 w-10 text-blue-600">
                                  <MapPin size={16} />
                                </Button>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase text-slate-400 font-bold">Latitude</Label>
                                <Input readOnly value={orderFormData.coordinates.lat} className="h-8 text-xs bg-white font-mono" placeholder="Automático" />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-[10px] uppercase text-slate-400 font-bold">Longitude</Label>
                                <Input readOnly value={orderFormData.coordinates.lng} className="h-8 text-xs bg-white font-mono" placeholder="Automático" />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-semibold flex items-center gap-2 text-slate-700">
                              <UserCheck className="w-4 h-4 text-orange-500" />
                              Selecionar Entregador
                            </Label>
                            <Select value={orderFormData.courierId} onValueChange={(v) => setOrderFormData({ ...orderFormData, courierId: v })}>
                              <SelectTrigger className="h-11">
                                <SelectValue placeholder="Escolha um entregador disponível" />
                              </SelectTrigger>
                              <SelectContent>
                                {mockCouriers.map((courier) => (
                                  <SelectItem key={courier.id} value={courier.id}>
                                    <div className="flex items-center justify-between w-full min-w-[250px]">
                                      <span className="font-medium">{courier.name}</span>
                                      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold border ${
                                        courier.status === 'disponivel' 
                                          ? 'bg-green-50 text-green-700 border-green-200' 
                                          : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                      }`}>
                                        {courier.status === 'disponivel' ? 'Disponível' : 'Em entrega'}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      )}

                      {orderFormData.deliveryType === 'pickup' && (
                        <div className="p-12 text-center border-2 border-dashed rounded-xl border-orange-200 bg-orange-50/30 animate-in zoom-in-95 duration-300">
                          <Building2 className="w-12 h-12 text-orange-300 mx-auto mb-4" />
                          <h4 className="font-bold text-orange-800">Retirada Direta</h4>
                          <p className="text-orange-600 text-sm max-w-xs mx-auto mt-2">
                            O ativo será retirado diretamente nas dependências do fornecedor. Nenhuma taxa de frete será aplicada.
                          </p>
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="pagamento" className="m-0 space-y-8 animate-in fade-in slide-in-from-left-2 duration-300">
                    <div className="flex items-center justify-between border-b pb-2">
                      <h3 className="text-lg font-bold text-slate-800 uppercase tracking-tight">SEÇÃO 4: FATURAMENTO</h3>
                      <div className="flex items-center gap-2 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                        <span className="text-xs font-semibold text-green-700 uppercase">Valor a Faturar:</span>
                        <span className="text-sm font-mono font-bold text-green-600">{formatCurrency(totalOrder)}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700">Forma de Pagamento *</Label>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { id: 'dinheiro', label: 'Dinheiro', icon: Wallet },
                              { id: 'pix', label: 'PIX', icon: CreditCard },
                              { id: 'cartao', label: 'Cartão', icon: CreditCard },
                              { id: 'online', label: 'Boleto / Faturamento', icon: FileText },
                            ].map((method) => (
                              <div
                                key={method.id}
                                onClick={() => setOrderFormData({ ...orderFormData, paymentMethod: method.id })}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                  orderFormData.paymentMethod === method.id 
                                    ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' 
                                    : 'border-slate-100 bg-white text-slate-500 hover:border-slate-200'
                                }`}
                              >
                                <method.icon size={18} />
                                <span className="font-bold text-sm">{method.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-sm font-semibold text-slate-700">Status do Pagamento</Label>
                          <Select 
                            value={orderFormData.paymentStatus} 
                            onValueChange={(v) => setOrderFormData({ ...orderFormData, paymentStatus: v })}
                          >
                            <SelectTrigger className="h-11">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pendente">
                                <div className="flex items-center gap-2 text-orange-600 font-medium">
                                  <Clock size={14} /> Aguardando Faturamento
                                </div>
                              </SelectItem>
                              <SelectItem value="pago">
                                <div className="flex items-center gap-2 text-green-600 font-medium">
                                  <CheckCircle2 size={14} /> Pago
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="space-y-6">
                        {orderFormData.paymentMethod === 'dinheiro' && (
                          <div className="p-6 bg-slate-50 rounded-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-200">
                            <div className="space-y-2">
                              <Label className="text-xs font-bold uppercase text-slate-500">Valor Recebido</Label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono">R$</span>
                                <Input 
                                  type="number"
                                  value={orderFormData.amountReceived}
                                  onChange={(e) => setOrderFormData({ ...orderFormData, amountReceived: e.target.value })}
                                  placeholder="0,00"
                                  className="h-12 pl-10 text-lg font-mono border-slate-200 focus:ring-orange-500"
                                />
                              </div>
                            </div>

                            <div className="pt-4 border-t border-slate-200">
                              <div className="flex justify-between items-center">
                                <span className="text-sm font-bold text-slate-500 uppercase">Troco</span>
                                <span className={`text-2xl font-black font-mono ${changeAmount > 0 ? 'text-orange-600' : 'text-slate-300'}`}>
                                  {formatCurrency(changeAmount)}
                                </span>
                              </div>
                              {Number(orderFormData.amountReceived) < totalOrder && Number(orderFormData.amountReceived) > 0 && (
                                <p className="text-[10px] text-red-500 mt-1 font-medium flex items-center gap-1">
                                  <AlertTriangle size={10} /> Valor insuficiente para cobrir o total.
                                </p>
                              )}
                            </div>
                          </div>
                        )}

                        {orderFormData.paymentMethod !== 'dinheiro' && (
                          <div className="h-full flex flex-col items-center justify-center p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                              {orderFormData.paymentMethod === 'pix' ? <QrCode size={32} className="text-blue-600" /> : <CreditCard size={32} className="text-slate-400" />}
                            </div>
                            <h4 className="font-bold text-slate-700 capitalize">{orderFormData.paymentMethod} Selecionado</h4>
                            <p className="text-xs text-slate-500 mt-2">Certifique-se de que o pagamento seja processado corretamente no ato da {orderFormData.deliveryType === 'delivery' ? 'entrega' : 'retirada'}.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </TabsContent>
                </form>
              </div>

              <DialogFooter className="p-6 bg-slate-50 border-t gap-3 sm:justify-end">
                <Button variant="outline" onClick={() => setOpenOrderDialog(false)} className="px-8 h-11 border-slate-300 text-slate-600 hover:bg-slate-100">
                  Cancelar
                </Button>
                <Button type="submit" form="order-pizza-form" className="bg-orange-600 hover:bg-orange-700 text-white font-bold px-10 h-11 shadow-lg shadow-orange-200 transition-all active:scale-95">
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                  Finalizar e Registrar Pedido
                </Button>
              </DialogFooter>
            </Tabs>
          </DialogContent>
        </Dialog>
        <Dialog open={openExpenseDialog} onOpenChange={handleOpenExpenseDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-10 px-6">
              <Plus size={20} />
              Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] flex flex-col max-h-[90vh]">
            <DialogHeader className="flex flex-row items-start justify-between border-b pb-4 space-y-0 gap-4">
              <div className="flex flex-col gap-1">
                <DialogTitle>Registrar Nova Despesa</DialogTitle>
                <DialogDescription>Insira os detalhes da nova despesa.</DialogDescription>
              </div>
              <Button type="submit" form="budget-expense-form" className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-md shrink-0" disabled={isExpenseBlocked}>
                <Check className="mr-2 h-4 w-4" />
                Registrar
              </Button>
            </DialogHeader>
            <form id="budget-expense-form" onSubmit={handleExpenseSubmit} className="flex flex-col flex-1 overflow-hidden">
              <div className="overflow-y-auto p-4 -mx-4 space-y-4 flex-1">
                <div>
                  <Label className="text-sm font-medium">Vincular Pedido (Nº do Pedido)</Label>
                  <div className="flex gap-2 mt-1">
                    <div className="relative flex-1">
                      <Input
                        placeholder="Digite o Nº (Ex: PED-000001)"
                        value={orderSearch}
                        onChange={(e) => {
                          const val = e.target.value.toUpperCase();
                          setOrderSearch(val);
                          
                          // Só vincula se o número estiver completo e correto
                          const match = allOrders.find(o => o.orderNumber === val);
                          if (match) {
                            setExpenseFormData(prev => ({ 
                              ...prev, 
                              orderId: match.id, 
              projectId: match.projectId ? String(match.projectId) : "",
                              assetId: null 
                            }));
                            toast.success(`Pedido ${val} vinculado!`);
                          } else {
                            // Limpa o vínculo se o usuário apagar ou digitar errado
                            setExpenseFormData(prev => ({ ...prev, orderId: "", projectId: "" }));
                          }
                        }}
                        className={expenseFormData.orderId ? "border-green-500 bg-green-50 pr-10" : ""}
                      />
                      {expenseFormData.orderId && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-600" />
                      )}
                    </div>
                  </div>
                  {expenseFormData.projectId && (
                    <p className="text-[11px] text-blue-600 mt-1 font-medium flex items-center gap-1">
                      <Info size={12} /> Vinculado à obra: {projects.find(p => String(p.id) === String(expenseFormData.projectId))?.name} | Saldo disponível no pedido: {formatCurrency(selectedOrderBalance)}
                    </p>
                  )}
                </div>

                {expenseFormData.projectId && isExpenseBlocked && (
                  <div className="flex items-center gap-2 p-3 text-sm text-red-800 bg-red-50 border border-red-200 rounded-md">
                    <AlertTriangle size={16} />
                    <span>Atenção: Esta obra ainda não foi aprovada. O lançamento de despesas e consumo de pedidos está bloqueado.</span>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <Select value={expenseFormData.type} onValueChange={(v) => setExpenseFormData({ ...expenseFormData, type: v as "capex" | "opex" })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="capex">Capex (Capital)</SelectItem>
                      <SelectItem value="opex">Opex (Operacional)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {expenseFormData.type === "capex" && (
                  <div>
                    <label className="text-sm font-medium">Vincular ao Ativo</label>
                    <Select 
                    key={`${expenseFormData.projectId || "no-project"}-${filteredAssetsForExpense.length}`}
                      disabled={!expenseFormData.projectId}
                      value={expenseFormData.assetId === null ? "none" : String(expenseFormData.assetId)} 
                      onValueChange={(v) => setExpenseFormData(prev => ({ ...prev, assetId: v === "none" ? null : v }))}
                    >
                      <SelectTrigger>
                      <SelectValue placeholder={!expenseFormData.projectId ? "Selecione um pedido ou obra primeiro" : filteredAssetsForExpense.length === 0 ? "Nenhum ativo encontrado nesta obra" : "Selecione um ativo (Opcional)"} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Nenhum</SelectItem>
                      {filteredAssetsForExpense.map((asset) => (
                        <SelectItem key={asset.id} value={String(asset.id)}>
                          {asset.tagNumber ? `${asset.tagNumber} - ${asset.name}` : asset.name}
                        </SelectItem>
                      ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">Categoria</label>
                  <Input
                    value={expenseFormData.category}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, category: e.target.value })}
                    placeholder="Ex: Materiais"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Data</label>
                  <Input
                    type="date"
                    required
                    value={expenseFormData.date}
                    onChange={(e) => setExpenseFormData({ ...expenseFormData, date: e.target.value })}
                  
                  />
                </div>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewProject} onOpenChange={(open) => !open && setViewProject(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Detalhes do Projeto</DialogTitle>
              <DialogDescription>Status e fluxo de aprovação da obra selecionada.</DialogDescription>
            </DialogHeader>
            {viewProject && (
              <div className="space-y-4">
                <div className="py-4 mb-36">
                  <h4 className="text-sm font-semibold text-slate-700 mb-6">Fluxo de Aprovação</h4>
                  <div className="relative flex items-center justify-between px-4">
                    <div className="absolute left-0 top-4 transform -translate-y-1/2 w-full h-1 bg-slate-100 -z-10 rounded-full" />
                    <div 
                      className={`absolute left-0 top-4 transform -translate-y-1/2 h-1 -z-10 transition-all duration-500 rounded-full ${
                        steps.findIndex(s => s.id === viewProject.status) >= 0 ? steps[steps.findIndex(s => s.id === viewProject.status)].color : 'bg-blue-600'
                      }`} 
                      style={{ width: `${(Math.max(0, steps.findIndex(s => s.id === viewProject.status)) / (steps.length - 1)) * 100}%` }} 
                    />
                    {steps.map((step, index) => {
                      const currentStepIndex = steps.findIndex(s => s.id === viewProject.status);
                      const isCompletedStep = index <= currentStepIndex;
                      const isCurrent = index === currentStepIndex;
                      
                      const nextStep = steps[index + 1];
                      const approvalInfo = nextStep 
                        ? viewProject.approvalHistory?.slice().reverse().find((h: any) => h.status === nextStep.id)
                        : null;

                      return (
                        <div key={step.id} className="flex flex-col items-center group relative">
                          <div 
                            className={`
                              w-8 h-8 rounded-full border-2 z-10 transition-all duration-300 flex items-center justify-center
                              ${isCompletedStep 
                                ? `${step.color} ${step.border} shadow-md text-white scale-110` 
                                : 'bg-white border-slate-300 text-slate-400'
                              }
                            `}
                          >
                            {isCompletedStep ? <Check className="w-5 h-5" /> : <span className="text-xs font-semibold">{index + 1}</span>}
                          </div>
                          <span className={`absolute -bottom-8 text-xs font-medium whitespace-nowrap ${isCurrent ? step.text : 'text-slate-500'}`}>
                            {step.label}
                          </span>
                          {approvalInfo && (
                        <div className="absolute top-24 flex flex-col items-center w-40 text-center z-20">
                            <span className="text-[10px] font-bold text-slate-700 leading-tight">{approvalInfo.user}</span>
                            <span className="text-[9px] text-slate-500 leading-tight">{new Date(approvalInfo.date).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="border-b border-slate-200 my-6" />

                <div>
                  <h4 className="font-semibold text-sm text-gray-500">Descrição</h4>
                  <p className="text-slate-700">{viewProject.description || "Sem descrição"}</p>
                </div>
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Localização</h4>
                    <p className="text-slate-700">{viewProject.location || "-"}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Centro de Custo</h4>
                    <p className="text-slate-700">{viewProject.costCenter || "-"}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Data de Início</h4>
                    <p className="text-slate-700">{new Date(viewProject.startDate).toLocaleDateString("pt-BR")}</p>
                  </div>
                  <div>
                    <h4 className="font-semibold text-sm text-gray-500">Previsão de Conclusão</h4>
                    <p className="text-slate-700">{viewProject.estimatedEndDate ? new Date(viewProject.estimatedEndDate).toLocaleDateString("pt-BR") : "-"}</p>
                  </div>
                </div>
                 <div className="grid grid-cols-3 gap-4">
                    <div>
                      <h4 className="font-semibold text-sm text-gray-500">Capex</h4>
                      <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedCapex || 0))}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-gray-500">Opex</h4>
                      <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedOpex || 0))}</p>
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-gray-500">Valor Planejado</h4>
                      <p className="text-slate-700 font-mono">{formatCurrency(Number(viewProject.plannedValue || 0))}</p>
                    </div>
                  </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
        </div>

      {isScanning && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            <div className="relative flex-1 bg-black flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <div className="absolute inset-0 border-2 border-white/50 m-12 rounded-lg pointer-events-none"></div>
                <div className="absolute top-4 right-4 z-[101]">
                    <Button variant="ghost" size="icon" className="text-white bg-black/50 hover:bg-black/70 rounded-full" onClick={() => setIsScanning(false)}>
                        <X className="h-8 w-8" />
                    </Button>
                </div>
                <div className="absolute bottom-20 left-0 right-0 flex justify-center">
                    <p className="text-white bg-black/50 px-4 py-2 rounded">Aponte para o código de barras da NF-e</p>
                </div>
            </div>
        </div>
      )}
      </div>

      <Tabs defaultValue="projects" className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
            <TabsList className="bg-slate-100 p-1 shrink-0">
              <TabsTrigger value="projects" className="text-xs h-8">Obras</TabsTrigger>
              <TabsTrigger value="orders" className="text-xs h-8">Pedidos</TabsTrigger>
            </TabsList>
            <div className="w-full md:w-64">
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="bg-white">
                <SelectValue placeholder="Filtrar por Obra" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as Obras</SelectItem>
                {projects?.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex gap-6 bg-white p-3 rounded-lg border shadow-sm">
           <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Total Planejado</p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(totalPlanned)}</p>
           </div>
           <div className="w-px bg-gray-200"></div>
           <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Total Realizado</p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(totalRealized)}</p>
           </div>
           <div className="w-px bg-gray-200"></div>
           <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Total Compromissado</p>
              <p className="text-lg font-bold text-slate-700">{formatCurrency(totalCommitted)}</p>
           </div>
           <div className="w-px bg-gray-200"></div>
           <div>
              <p className="text-xs text-gray-500 font-medium uppercase">Disponível</p>
              <p className={`text-lg font-bold ${totalAvailable >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(totalAvailable)}</p>
           </div>
        </div>
      </div>

        <TabsContent value="projects" className="space-y-6">

          <Card>
        {isLoading ? (
          <div className="flex items-center justify-center h-96">
            <Loader2 className="animate-spin" />
          </div>
        ) : filteredProjects && filteredProjects.length > 0 ? (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium text-gray-600">Obra</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Fluxo de Aprovação</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Status Aprovação</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Previsão de Conclusão</th>
                  <th className="px-4 py-2 font-medium text-gray-600">Status</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Planejado</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Realizado</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Compromissado</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Disponível</th>
                  <th className="px-4 py-2 font-medium text-gray-600 text-right">Progresso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredProjects.map((project) => {
                  const projectBudgets = allBudgets.filter(b => String(b.projectId) === String(project.id));
                  const projectExpenses = allExpenses.filter(e => String(e.projectId) === String(project.id));
                  const projectOrders = allOrders.filter(o => String(o.projectId) === String(project.id));
                  const projectAssets = allAssets.filter(a =>
                    String(a.projectId) === String(project.id) &&
                    (a.status === 'concluido' || a.status === 'em_desenvolvimento')
                  );
                  return (
                    <ProjectBudgetRow 
                      key={project.id} 
                      project={project} 
                      onDataLoaded={handleDataLoaded}
                      projectBudgets={projectBudgets}
                      projectExpenses={projectExpenses}
                      projectOrders={projectOrders}
                      accountingAccounts={accountingAccounts || []}
                      handleEdit={handleEdit}
                      assets={projectAssets}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-500">Nenhum projeto encontrado.</p>
          </div>
        )}
      </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <div className="border rounded-lg overflow-hidden bg-white">
              <Table className="text-base">
                <TableHeader className="bg-gray-50">
                  <TableRow>
                    <TableHead className="px-4 py-2 font-bold">Cód Pedido</TableHead>
                    <TableHead className="px-4 py-2 font-bold">Obra</TableHead>
                    <TableHead className="px-4 py-2 font-bold">Descrição</TableHead>
                    <TableHead className="px-4 py-2 font-bold text-right">Valor Estimado</TableHead>
                    <TableHead className="px-4 py-2 font-bold text-right">Consumido</TableHead>
                    <TableHead className="px-4 py-2 font-bold text-right">Controle</TableHead>
                    <TableHead className="px-4 py-2 font-bold">Status</TableHead>
                    <TableHead className="px-4 py-2 font-bold text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {allOrders.filter(o => selectedProjectId === "all" || String(o.projectId) === selectedProjectId).length > 0 ? (
                    allOrders
                      .filter(o => selectedProjectId === "all" || String(o.projectId) === selectedProjectId)
                      .map((order) => {
                        const consumedAmount = allExpenses
                          .filter(e => e.orderId === order.id)
                          .reduce((sum, e) => sum + Number(e.amount || 0), 0);
                        const orderAmount = Number(order.amount || 0);
                        const progress = orderAmount > 0 ? (consumedAmount / orderAmount) * 100 : 0;
                        const isExpanded = expandedOrderId === order.id;

                        return (
                          <React.Fragment key={order.id}>
                            <TableRow 
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                              onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                            >
                              <TableCell className="px-4 py-3 font-mono">
                                <div className="flex items-center gap-2">
                                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                  {order.orderNumber || "-"}
                                </div>
                              </TableCell>
                              <TableCell className="px-4 py-3 font-medium">
                                {projects.find(p => String(p.id) === String(order.projectId))?.name || "N/A"}
                              </TableCell>
                              <TableCell className="px-4 py-3 text-slate-600">{order.description}</TableCell>
                              <TableCell className="px-4 py-3 text-right font-mono">{formatCurrency(orderAmount)}</TableCell>
                              <TableCell className="px-4 py-3 text-right font-mono text-blue-600">{formatCurrency(consumedAmount)}</TableCell>
                              <TableCell className="px-4 py-3">
                                <div className="flex items-center justify-end gap-2">
                                  <span className="text-xs font-medium">{progress.toFixed(1)}%</span>
                                  <div className="w-24 bg-slate-100 rounded-full h-2 overflow-hidden border">
                                    <div 
                                      className={`h-full transition-all ${progress > 100 ? 'bg-red-500' : progress >= 90 ? 'bg-yellow-500' : 'bg-blue-600'}`} 
                                      style={{ width: `${Math.min(progress, 100)}%` }} 
                                    />
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell className="px-4 py-3">
                                <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border ${order.status === 'pago' ? 'bg-green-50 text-green-700 border-green-200' : 'bg-yellow-50 text-yellow-700 border-yellow-200'}`}>
                                  {order.status}
                                </span>
                              </TableCell>
                              <TableCell className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                                <div className="flex justify-end gap-2">
                                  <Button variant="ghost" size="icon" onClick={() => handleEditOrder(order)} className="h-8 w-8">
                                    <Pencil size={14} className="text-blue-600" />
                                  </Button>
                                  <Button variant="ghost" size="icon" onClick={() => handleDeleteOrder(order.id)} className="h-8 w-8">
                                    <Trash2 size={14} className="text-red-600" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                            {isExpanded && (
                              <TableRow className="bg-slate-50/50 animate-in fade-in slide-in-from-top-1 duration-200">
                                <TableCell colSpan={8} className="p-4 border-t border-slate-200">
                                  <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                                    <Table>
                                      <TableHeader className="bg-slate-50">
                                        <TableRow>
                                          <TableHead className="text-[10px] font-black uppercase text-slate-500">Item / Ativo</TableHead>
                                          <TableHead className="text-[10px] font-black uppercase text-slate-500 text-center">Qtd</TableHead>
                                          <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">V. Unitário</TableHead>
                                          <TableHead className="text-[10px] font-black uppercase text-slate-500 text-right">Subtotal</TableHead>
                                          <TableHead className="text-[10px] font-black uppercase text-slate-500">Observação</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {order.orderItems?.map((item: any, idx: number) => (
                                          <TableRow key={idx}>
                                            <TableCell className="py-2 text-sm font-medium text-slate-700">{item.product}</TableCell>
                                            <TableCell className="py-2 text-sm text-center font-bold text-slate-600">{item.quantity}</TableCell>
                                            <TableCell className="py-2 text-sm text-right font-mono">{formatCurrency(Number(item.price || 0))}</TableCell>
                                            <TableCell className="py-2 text-sm text-right font-mono font-bold text-slate-800">{formatCurrency(Number(item.quantity) * Number(item.price || 0))}</TableCell>
                                            <TableCell className="py-2 text-xs italic text-slate-400">{item.obs || "-"}</TableCell>
                                          </TableRow>
                                        ))}
                                      </TableBody>
                                    </Table>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )}
                          </React.Fragment>
                        );
                      })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={8} className="p-12 text-center text-gray-500 text-lg">
                        Nenhum pedido encontrado.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}