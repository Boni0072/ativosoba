import React, { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { collection, addDoc, updateDoc, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Search, Download, QrCode, ClipboardList, Calendar as CalendarIcon, Users, CheckCircle2, AlertCircle, PlayCircle, Check, XCircle, ChevronDown, ChevronUp, Camera, X, Plus, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { useLocation } from "wouter";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { deleteDoc } from "firebase/firestore";

interface InventoryResult {
  assetId: string;
  newCostCenter: string;
  verified: boolean;
  observations?: string;
}

interface InventorySchedule {
  id: string;
  requesterId?: string;
  assetIds: string[];
  costCenterCodes?: string[];
  userIds: string[];
  date: string;
  notes: string;
  status: 'pending' | 'waiting_approval' | 'completed';
  results?: InventoryResult[];
  approvedBy?: string;
  approvedAt?: string;
  completedAt?: string; // Data em que o responsável finalizou a contagem
  createdAt?: string;
}

const getBase64ImageFromURL = (url: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.setAttribute("crossOrigin", "anonymous");
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const dataURL = canvas.toDataURL("image/png");
        resolve(dataURL);
      } else {
        reject(new Error("Canvas context is null"));
      }
    };
    img.onerror = (error) => reject(error);
    img.src = url;
  });
};

function NewAssetFromInventoryDialog({
  open,
  onOpenChange,
  initialCode,
  costCenters,
  assetClasses,
  defaultCostCenter,
  onSuccess,
  onStartScan,
  scannedInvoiceKey,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCode: string;
  costCenters: any[];
  assetClasses: any[];
  defaultCostCenter?: string;
  onSuccess: (newAsset: any) => void;
  onStartScan: () => void;
  scannedInvoiceKey: string;
}) {
  const [nextAssetNumber, setNextAssetNumber] = useState("");
  const [formData, setFormData] = useState({
    name: "",
    assetClass: "",
    costCenter: "",
    value: "",
    startDate: new Date().toISOString().split("T")[0],
    invoiceNumber: "",
  });

  useEffect(() => {
    if (open) {
      if (defaultCostCenter) {
        setFormData(prev => ({ ...prev, costCenter: defaultCostCenter }));
      }

      // Fetch next asset number when dialog opens
      const q = collection(db, "assets");
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const assets = snapshot.docs.map(doc => doc.data());
        const numbers = assets
          .map(a => a.assetNumber)
          .filter(n => typeof n === 'string' && n.startsWith("ATV-"))
          .map(n => parseInt(n.replace("ATV-", ""), 10))
          .filter(n => !isNaN(n));
        const max = numbers.length > 0 ? Math.max(...numbers) : 0;
        setNextAssetNumber(`ATV-${String(max + 1).padStart(6, '0')}`);
      });
      return () => unsubscribe();
    }
  }, [open, defaultCostCenter]);

  useEffect(() => {
    if (scannedInvoiceKey) {
      setFormData(prev => ({ ...prev, invoiceNumber: scannedInvoiceKey }));
    }
  }, [scannedInvoiceKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.assetClass || !formData.costCenter) {
      toast.error("Preencha Nome, Classe e Centro de Custo.");
      return;
    }

    const payload = {
      assetNumber: nextAssetNumber,
      tagNumber: initialCode,
      name: formData.name,
      assetClass: formData.assetClass,
      costCenter: formData.costCenter,
      value: Number(formData.value) || 0,
      startDate: new Date(formData.startDate).toISOString(),
      invoiceNumber: formData.invoiceNumber || "",
      status: 'concluido', // It's being inventoried, so it's considered 'concluido' (available for use)
      createdAt: new Date().toISOString(),
    };

    try {
      const docRef = await addDoc(collection(db, "assets"), payload);
      onSuccess({ id: docRef.id, ...payload });
    } catch (error) {
      console.error("Erro ao criar ativo:", error);
      toast.error("Falha ao criar novo ativo.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Ativo não encontrado na base</DialogTitle>
          <DialogDescription>
            O código "{initialCode}" não foi localizado. Cadastre-o como um novo ativo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>Nome do Ativo</Label>
              <Input value={formData.name} onChange={e => setFormData(prev => ({...prev, name: e.target.value}))} required placeholder="Ex: Notebook Dell" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={formData.value} onChange={e => setFormData(prev => ({...prev, value: e.target.value}))} placeholder="0,00" />
            </div>
            <div>
              <Label>Data de Início/Aquisição</Label>
              <Input type="date" value={formData.startDate} onChange={e => setFormData(prev => ({...prev, startDate: e.target.value}))} />
            </div>
            <div>
              <Label>Classe do Ativo</Label>
              <Select value={formData.assetClass} onValueChange={v => setFormData(prev => ({...prev, assetClass: v}))} required>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {assetClasses.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nota Fiscal</Label>
              <div className="flex items-center gap-2">
                <Input value={formData.invoiceNumber} onChange={e => setFormData(prev => ({...prev, invoiceNumber: e.target.value}))} placeholder="Chave de acesso" />
                <Button type="button" variant="outline" size="icon" onClick={onStartScan}>
                  <QrCode className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div>
              <Label>Centro de Custo</Label>
              <Select value={formData.costCenter} onValueChange={v => setFormData(prev => ({...prev, costCenter: v}))} required disabled={!!defaultCostCenter}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {costCenters.map(c => <SelectItem key={c.id} value={c.code}>{c.code} - {c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit">
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar Novo Ativo
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AssetInventoryPage() {
  const { user: authUser } = useAuth();
  const [user, setUser] = useState<any>(authUser);
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (authUser) {
      setUser(authUser);
    } else {
      const storedUser = localStorage.getItem("obras_user");
      if (storedUser) {
        try {
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error("Erro ao recuperar usuário do storage", e);
        }
      }
    }
  }, [authUser]);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [performingSchedule, setPerformingSchedule] = useState<InventorySchedule | null>(null);
  const [reviewingSchedule, setReviewingSchedule] = useState<InventorySchedule | null>(null);
  const [executionData, setExecutionData] = useState<Record<string, { verified: boolean; costCenter: string; observations: string }>>({});
  const [isNewAssetDialogOpen, setIsNewAssetDialogOpen] = useState(false);
  const [newAssetInitialCode, setNewAssetInitialCode] = useState("");
  const [isInvoiceScanning, setIsInvoiceScanning] = useState(false);
  const [scannedInvoiceKey, setScannedInvoiceKey] = useState("");
  const [selectedForApproval, setSelectedForApproval] = useState<string[]>([]);
  const [selectedCostCentersForSchedule, setSelectedCostCentersForSchedule] = useState<string[]>([]);

  useEffect(() => {
    if (reviewingSchedule?.results) {
      setSelectedForApproval(reviewingSchedule.results.map(r => r.assetId));
    } else {
      setSelectedForApproval([]);
    }
  }, [reviewingSchedule]);

  const toggleApproval = (assetId: string) => {
    setSelectedForApproval(prev => 
      prev.includes(assetId) ? prev.filter(id => id !== assetId) : [...prev, assetId]
    );
  };

  const [schedules, setSchedules] = useState<InventorySchedule[]>([]);
  const [dbSchedules, setDbSchedules] = useState<InventorySchedule[]>([]); // Estado separado para dados reais
  const [projects, setProjects] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [assetClasses, setAssetClasses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  // Estado para forçar atualização quando os mocks mudam (Sincronia Global)
  const [mockUpdateTrigger, setMockUpdateTrigger] = useState(0);

  useEffect(() => {
    // 1. Escuta apenas o Banco de Dados Real
    const unsubscribe = onSnapshot(collection(db, "inventory_schedules"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventorySchedule[];
      setDbSchedules(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    // 2. Escuta eventos de atualização dos Mocks (disparados por aprovações/rejeições)
    const handler = () => setMockUpdateTrigger(prev => prev + 1);
    window.addEventListener("local-mock-update", handler);
    return () => window.removeEventListener("local-mock-update", handler);
  }, []);

  useEffect(() => {
      // 3. Combina DB + Mocks e recalcula sempre que algo mudar
      // Garante que o usuário veja notificações mesmo sem dados no banco (Modo Demo/Frontend-Only)
      const currentUserId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;
      
      // LÊ O ESTADO DOS MOCKS DO LOCALSTORAGE PARA PERSISTIR MUDANÇAS
      const processedMocks = JSON.parse(localStorage.getItem("mock_processed_schedules") || "[]");
      const statusOverrides = JSON.parse(localStorage.getItem("mock_status_overrides") || "{}");

      const mockSchedulesRaw = currentUserId ? [
        {
          id: "mock-schedule-pending",
          requesterId: currentUserId,
          assetIds: ["mock-asset-1", "mock-asset-2"],
          userIds: [currentUserId],
          date: new Date().toISOString(),
          notes: "Inventário Mensal (Simulação)",
          status: 'pending',
          createdAt: new Date().toISOString()
        },
        {
          id: "mock-schedule-approval",
          requesterId: currentUserId,
          assetIds: ["mock-asset-3"],
          userIds: ["user-other"],
          date: new Date().toISOString(),
          notes: "Aguardando Aprovação do Gestor (Simulação)",
          status: 'waiting_approval',
          results: [{ assetId: "mock-asset-3", verified: true, newCostCenter: "CC-TEST" }],
          createdAt: new Date(Date.now() - 86400000).toISOString(), // Criado ontem (exemplo)
          completedAt: new Date().toISOString() // Finalizado hoje
        }
      ] : [];

      // APLICA OVERRIDES DE STATUS E FILTRA MOCKS PROCESSADOS/REMOVIDOS
      const mockSchedules = mockSchedulesRaw.map(s => {
          if (statusOverrides[s.id]) {
              const newStatus = statusOverrides[s.id];
              // Se foi concluído via override, adiciona dados de aprovação para exibir no histórico corretamente
              if (newStatus === 'completed') {
                  return { 
                      ...s, 
                      status: newStatus,
                      approvedAt: s.approvedAt || new Date().toISOString(),
                      approvedBy: s.approvedBy || "Aprovador (Simulação)"
                  };
              }
              return { ...s, status: newStatus };
          }
          return s;
      }).filter((s: any) => !processedMocks.includes(s.id));

      setSchedules([...dbSchedules, ...((mockSchedules as unknown) as InventorySchedule[])]);
  }, [dbSchedules, user, mockUpdateTrigger]); // Recalcula quando DB, Usuário ou Trigger mudar

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "assets"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Injeta ativos simulados para que o modal de inventário não mostre linhas vazias
      const mockAssets = [
        { id: "mock-asset-1", name: "Notebook Dell Latitude", assetNumber: "ATV-MOCK-01", tagNumber: "NTB-001", costCenter: { code: "CC-001", name: "TI" }, description: "Notebook para desenvolvimento", value: 5000, status: "em_uso" },
        { id: "mock-asset-2", name: "Cadeira Ergonomica", assetNumber: "ATV-MOCK-02", tagNumber: "CAD-002", costCenter: { code: "CC-001", name: "TI" }, description: "Cadeira Herman Miller", value: 1200, status: "em_uso" },
        { id: "mock-asset-3", name: "Projetor Epson", assetNumber: "ATV-MOCK-03", tagNumber: "PRJ-003", costCenter: { code: "CC-002", name: "RH" }, description: "Projetor para sala de reuniões", value: 3000, status: "em_uso" }
      ];
      
      // Combina e remove duplicatas (se houver)
      const combined = [...data, ...mockAssets];
      setAssets(combined);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "users"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUsers(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "cost_centers"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCostCenters(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "asset_classes"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssetClasses(data);
    });
    return () => unsubscribe();
  }, []);
  
  // Schedule Form State
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().split("T")[0]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedApproverId, setSelectedApproverId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(false);
  const [selectedCostCenter, setSelectedCostCenter] = useState("all");
  const [selectedAssetClass, setSelectedAssetClass] = useState("all");
  const [scanInput, setScanInput] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [showOnlyWithObs, setShowOnlyWithObs] = useState(false);

  const getDate = (d: any) => d?.toDate ? d.toDate() : new Date(d);

  const getLastInventory = (assetId: string) => {
    return schedules
      .filter(s => s.status === 'completed' && s.results?.some(r => r.assetId === assetId))
      .sort((a, b) => {
        const dateA = a.approvedAt ? getDate(a.approvedAt).getTime() : getDate(a.date).getTime();
        const dateB = b.approvedAt ? getDate(b.approvedAt).getTime() : getDate(b.date).getTime();
        return dateB - dateA;
      })[0];
  };

  const filteredAssets = assets?.filter(asset => {
    const matchesSearch = (asset.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (asset.tagNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (asset.assetNumber || "").toLowerCase().includes(searchTerm.toLowerCase());
    const assetCC = typeof asset.costCenter === 'object' && asset.costCenter ? (asset.costCenter as any).code : asset.costCenter;
    const matchesCostCenter = selectedCostCenter === "all" || assetCC === selectedCostCenter;
    const matchesAssetClass = selectedAssetClass === "all" || asset.assetClass === selectedAssetClass;
    const isInventoriable = asset.status !== 'baixado';
    
    const lastInventory = getLastInventory(asset.id);
    const hasObs = lastInventory?.results?.find(r => r.assetId === asset.id)?.observations;
    const matchesObs = !showOnlyWithObs || (showOnlyWithObs && !!hasObs);

    return matchesSearch && matchesCostCenter && matchesAssetClass && isInventoriable && matchesObs;
  });

  // Reset pagination when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedCostCenter, selectedAssetClass, showOnlyWithObs]);

  const isFiltering = searchTerm !== "" || selectedCostCenter !== "all" || selectedAssetClass !== "all" || showOnlyWithObs;
  const totalPages = Math.ceil((filteredAssets?.length || 0) / itemsPerPage);
  const paginatedAssets = isFiltering ? filteredAssets : filteredAssets?.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Efeito para abrir o modal diretamente via URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const scheduleId = params.get('schedule');

    if (scheduleId && schedules.length > 0) {
      const scheduleToOpen = schedules.find(s => s.id === scheduleId);
      if (scheduleToOpen) {
        if (scheduleToOpen.status === 'pending') {
          setPerformingSchedule(scheduleToOpen);
        } else if (scheduleToOpen.status === 'waiting_approval') {
          setReviewingSchedule(scheduleToOpen);
        }
        
        // Limpa o parâmetro da URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [schedules]); // Adicionado dependência para evitar loops ou execução incorreta
  // Garante a leitura do ID independente do formato do objeto user (id, uid, openId, sub)
  const currentUserId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;
  const userRole = (user as any)?.role;

  useEffect(() => {
    if (isScheduleOpen) {
      let approverId = "";
      let performerIds: string[] = [];
      
      if (selectedCostCentersForSchedule.length > 0) {
        // Scheduling by Cost Center: find responsible(s) to be performers
        selectedCostCentersForSchedule.forEach(ccCode => {
          const costCenter = costCenters.find(c => c.code === ccCode);
          if (costCenter?.responsible) {
            const userFound = users.find(u => u.name?.trim().toLowerCase() === costCenter.responsible?.trim().toLowerCase());
            if (userFound && !performerIds.includes(userFound.id)) {
              performerIds.push(userFound.id);
            }
          }
        });
        setSelectedUserIds(performerIds);
        // Set approver to the first responsible, or current user if none found
        approverId = performerIds[0] || currentUserId || "";
      } else if (selectedAssetIds.length > 0) {
        // Fallback for by-asset scheduling: set approver based on first asset's CC
        const asset = assets.find(a => a.id === selectedAssetIds[0]);
        if (asset) {
          const ccCode = typeof asset.costCenter === 'object' && asset.costCenter ? (asset.costCenter as any).code : asset.costCenter;
          const costCenter = costCenters.find(c => c.code === ccCode);
          if (costCenter?.responsible) {
            const userFound = users.find(u => u.name?.trim().toLowerCase() === costCenter.responsible?.trim().toLowerCase());
            if (userFound) approverId = userFound.id;
          }
        }
      }
      
      setSelectedApproverId(approverId || currentUserId || "");
    } else {
      // Reset performers when dialog closes
      setSelectedUserIds([]);
    }
  }, [isScheduleOpen, currentUserId, selectedAssetIds, selectedCostCentersForSchedule, assets, costCenters, users]);

  const handleNewAssetCreated = (newAsset: any) => {
    // Add it to the current inventory execution
    const currentCC = typeof newAsset.costCenter === 'object' && newAsset.costCenter ? (newAsset.costCenter as any).code : newAsset.costCenter;
    setExecutionData(prev => ({
        ...prev,
        [newAsset.id]: { verified: true, costCenter: currentCC || "", observations: "Criado e adicionado durante a contagem" }
    }));

    // Also add to the schedule's assetIds locally so it appears in the list
    setPerformingSchedule(prev => prev ? ({ ...prev, assetIds: [...prev.assetIds, newAsset.id] }) : null);

    toast.success(`Novo ativo "${newAsset.name}" criado e adicionado à contagem.`);
    setIsNewAssetDialogOpen(false);
    setScanInput("");
  };

  const getLastScheduleForCC = (ccCode: string) => {
    const relevantSchedules = schedules
        .filter(s => s.costCenterCodes && s.costCenterCodes.includes(ccCode))
        .sort((a, b) => {
            const dateA = a.createdAt ? getDate(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? getDate(b.createdAt).getTime() : 0;
            return dateB - dateA;
        });
    return relevantSchedules[0] || null;
  };

  const handleScheduleByCostCenter = () => {
    if (selectedCostCentersForSchedule.length === 0) {
        toast.error("Selecione pelo menos um centro de custo.");
        return;
    }
    const assetsToSchedule = assets.filter(asset => {
        const assetCC = typeof asset.costCenter === 'object' && asset.costCenter ? (asset.costCenter as any).code : asset.costCenter;
        // Exclui apenas ativos que já possuem agendamento ATIVO (em andamento)
        const isActive = getActiveSchedule(asset.id);
        return selectedCostCentersForSchedule.includes(assetCC) && !isActive;
    }).map(asset => asset.id);

    if (assetsToSchedule.length === 0) {
        toast.warning("Nenhum ativo encontrado. Um inventário em branco será criado para o(s) centro(s) de custo selecionado(s).");
    }

    setSelectedAssetIds(assetsToSchedule);
    setIsScheduleOpen(true);
  };

  const toggleCostCenterSelection = (ccCode: string) => {
      setSelectedCostCentersForSchedule(prev =>
          prev.includes(ccCode) ? prev.filter(code => code !== ccCode) : [...prev, ccCode]
      );
  };

  const isAllCostCentersSelected = costCenters.length > 0 && selectedCostCentersForSchedule.length === costCenters.length;

  const toggleAllCostCenters = () => {
      if (isAllCostCentersSelected) {
          setSelectedCostCentersForSchedule([]);
      } else {
          setSelectedCostCentersForSchedule(costCenters.map(cc => cc.code));
      }
  };

  const myPendingSchedules = schedules.filter(s => 
    s.status === 'pending' && currentUserId && s.userIds.some(uid => String(uid) === String(currentUserId))
  );

  const pendingApprovalSchedules = schedules.filter(s => 
    s.status === 'waiting_approval' && (
      userRole === 'admin' || 
      userRole === 'diretoria' ||
      (s.requesterId && String(s.requesterId) === String(currentUserId))
    )
  );

  const completedSchedules = schedules
    .filter(s => s.status === 'completed')
    .sort((a, b) => {
        const dateA = a.approvedAt ? getDate(a.approvedAt).getTime() : getDate(a.date).getTime();
        const dateB = b.approvedAt ? getDate(b.approvedAt).getTime() : getDate(b.date).getTime();
        return dateB - dateA;
    });

  const handleApproveInventory = async (schedule: InventorySchedule) => {
    try {
      // Simulação para itens Mock (Frontend-Only)
      if (schedule.id.startsWith("mock-")) {
        // Salva a mudança de status para 'completed' no localStorage
        const overrides = JSON.parse(localStorage.getItem("mock_status_overrides") || "{}");
        overrides[schedule.id] = 'completed';
        localStorage.setItem("mock_status_overrides", JSON.stringify(overrides));
        // Adiciona o ID do mock à lista de processados para que ele não seja mais renderizado
        const processedMocks = JSON.parse(localStorage.getItem("mock_processed_schedules") || "[]");
        processedMocks.push(schedule.id);
        localStorage.setItem("mock_processed_schedules", JSON.stringify(processedMocks));

        // Atualiza estado local imediatamente para refletir a conclusão e mover para o histórico
        setSchedules(prev => prev.map(s => 
          s.id === schedule.id ? { 
              ...s, 
              status: 'completed' as const,
              approvedAt: new Date().toISOString(),
              approvedBy: user?.name || "Usuário" 
          } : s
        ));

        // Avisa o restante do sistema (Sino/Notificações) para atualizar
        setTimeout(() => window.dispatchEvent(new Event("local-mock-update")), 50);

        toast.success("Inventário aprovado e processado com sucesso! (Simulação)");
        setReviewingSchedule(null);
        return;
      }

      const batch = writeBatch(db);
      
      // Atualiza os ativos com as novas informações (se houver mudança de centro de custo)
      if (schedule.results) {
        schedule.results.forEach(result => {
          if (result.newCostCenter && selectedForApproval.includes(result.assetId)) {
            const assetRef = doc(db, "assets", result.assetId);
            batch.update(assetRef, { 
              costCenter: result.newCostCenter,
              updatedAt: new Date().toISOString()
            });
            const asset = assets.find(a => a.id === result.assetId);
            const currentCC = typeof asset?.costCenter === 'object' ? (asset.costCenter as any).code : asset?.costCenter;

            if (asset && result.newCostCenter !== currentCC) {
              const assetRef = doc(db, "assets", result.assetId);
              batch.update(assetRef, { 
                costCenter: result.newCostCenter,
                updatedAt: new Date().toISOString()
              });

              const movementRef = doc(collection(db, "asset_movements"));
              batch.set(movementRef, {
                assetId: result.assetId,
                assetName: asset.name || "Desconhecido",
                assetNumber: asset.assetNumber || "",
                type: "transfer_cost_center",
                movementCategory: "transfer",
                date: new Date().toISOString(),
                originCostCenter: currentCC || null,
                destinationCostCenter: result.newCostCenter,
                originProjectId: asset.projectId || null,
                reason: `Ajuste via Inventário (${new Date(schedule.date).toLocaleDateString('pt-BR')})`,
                createdAt: new Date().toISOString()
              });
            }
          }
        });
      }

      // Atualiza o status do agendamento para concluído
      const scheduleRef = doc(db, "inventory_schedules", schedule.id);
      batch.update(scheduleRef, { 
        status: 'completed',
        approvedBy: user?.name || "Administrador",
        approvedAt: new Date().toISOString()
      });

      await batch.commit();
      toast.success("Inventário aprovado e processado com sucesso!");
    } catch (error) {
      console.error("Erro ao aprovar inventário:", error);
      toast.error("Erro ao processar aprovação.");
    }
  };

  const handleRejectInventory = async (schedule: InventorySchedule) => {
    try {
      // Simulação para itens Mock (Frontend-Only)
      if (schedule.id.startsWith("mock-")) {
        // Reverter status para pending no localStorage
        const overrides = JSON.parse(localStorage.getItem("mock_status_overrides") || "{}");
        overrides[schedule.id] = 'pending';
        localStorage.setItem("mock_status_overrides", JSON.stringify(overrides));
        setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, status: 'pending' } : s));
        
        // Avisa o sistema
        setTimeout(() => window.dispatchEvent(new Event("local-mock-update")), 50);

        toast.success("Inventário rejeitado e retornado para pendente. (Simulação)");
        setReviewingSchedule(null);
        return;
      }

      const scheduleRef = doc(db, "inventory_schedules", schedule.id);
      await updateDoc(scheduleRef, { status: 'pending' });
      toast.success("Inventário rejeitado e retornado para pendente.");
      setReviewingSchedule(null);
    } catch (error) {
      toast.error("Erro ao rejeitar inventário.");
    }
  };

  const handleRemoveFromSchedule = async (scheduleId: string, assetId: string) => {
    if (!confirm("Tem certeza que deseja remover este ativo do agendamento pendente? Isso o liberará para novas contagens.")) return;
    
    try {
      // Simulação para itens Mock
      if (scheduleId.startsWith("mock-")) {
         setSchedules(prev => prev.map(s => {
             if (s.id === scheduleId) {
                 return { ...s, assetIds: s.assetIds.filter(id => id !== assetId) };
             }
             return s;
         }).filter(s => s.assetIds.length > 0)); // Remove agendamento se ficar vazio
         
         // Avisa o sistema
         setTimeout(() => window.dispatchEvent(new Event("local-mock-update")), 50);
         toast.success("Ativo removido do agendamento (Simulação).");
         return;
      }

      const schedule = schedules.find(s => s.id === scheduleId);
      if (!schedule) return;
      
      const newAssetIds = schedule.assetIds.filter(id => id !== assetId);
      
      if (newAssetIds.length === 0) {
          await deleteDoc(doc(db, "inventory_schedules", scheduleId));
      } else {
          await updateDoc(doc(db, "inventory_schedules", scheduleId), {
              assetIds: newAssetIds
          });
      }
      toast.success("Ativo removido e liberado com sucesso.");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao remover ativo do agendamento.");
    }
  };

  // Inicializa os dados de execução quando o diálogo abre
  useEffect(() => {
    if (performingSchedule && assets) {
      const initialData: Record<string, { verified: boolean; costCenter: string; observations: string }> = {};
      performingSchedule.assetIds.forEach(id => {
        const asset = assets.find(a => a.id === id);
        const currentCC = typeof asset?.costCenter === 'object' && asset.costCenter ? (asset.costCenter as any).code : asset?.costCenter;
        initialData[id] = {
          verified: false, // Inicia como não verificado para forçar a contagem
          costCenter: currentCC || "",
          observations: ""
        };
      });
      setExecutionData(initialData);
      setScanInput("");
    }
  }, [performingSchedule, assets]);

  const handleScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!performingSchedule || !scanInput) return;

    const term = scanInput.trim().toLowerCase();

    // 1. Check if asset is in the current schedule
    const scheduledAssetId = performingSchedule.assetIds.find(id => {
      const asset = assets.find(a => a.id === id);
      return asset && (
        (asset.tagNumber && asset.tagNumber.toLowerCase() === term) ||
        (asset.assetNumber && asset.assetNumber.toLowerCase() === term)
      );
    });
    if (scheduledAssetId) {
      if (executionData[scheduledAssetId]?.verified) {
         toast.info(`Ativo já conferido: ${scanInput}`);
      } else {
         setExecutionData(prev => ({
            ...prev,
            [scheduledAssetId]: { ...prev[scheduledAssetId], verified: true }
         }));
         toast.success(`Ativo conferido: ${scanInput}`);
         // Feedback sonoro simples
         const audio = new Audio("https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3");
         audio.play().catch(() => {});
      }
      setScanInput("");
      return;
    }

    // 2. If not in schedule, check if it exists in the main database
    const existingAsset = assets.find(asset => 
        (asset.tagNumber && asset.tagNumber.toLowerCase() === term) ||
        (asset.assetNumber && asset.assetNumber.toLowerCase() === term)
    );

    if (existingAsset) {
        // Asset exists but wasn't part of the schedule. Add it to the current execution.
        if (executionData[existingAsset.id]) {
            toast.info(`Ativo já adicionado a esta contagem: ${scanInput}`);
        } else {
            const currentCC = typeof existingAsset.costCenter === 'object' && existingAsset.costCenter ? (existingAsset.costCenter as any).code : existingAsset.costCenter;
            setExecutionData(prev => ({
                ...prev,
                [existingAsset.id]: { verified: true, costCenter: currentCC || "", observations: "Adicionado durante a contagem" }
            }));
            // Also add to the schedule's assetIds locally so it appears in the list
            setPerformingSchedule(prev => prev ? ({ ...prev, assetIds: [...prev.assetIds, existingAsset.id] }) : null);
            toast.success(`Ativo existente adicionado à contagem: ${scanInput}`);
        }
        setScanInput("");
        return;
    }

    // 3. Asset does not exist anywhere. Open the creation dialog.
    setNewAssetInitialCode(scanInput);
    setIsNewAssetDialogOpen(true);
    // Clear input after attempting to create
    setScanInput("");
  };

  useEffect(() => {
    let stream: MediaStream | null = null;
    let interval: NodeJS.Timeout;

    const isAnyScanning = isScanning || isInvoiceScanning;

    if (isAnyScanning) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })
        .then(s => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play().catch(console.error);
          }

          if ('BarcodeDetector' in window) {
             try {
                 const detector = new (window as any).BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'data_matrix'] });
                 interval = setInterval(async () => {
                    if (videoRef.current && videoRef.current.readyState === 4) {
                        try {
                            const barcodes = await detector.detect(videoRef.current);
                            if (barcodes.length > 0) {
                                const rawValue = barcodes[0].rawValue;
                                if (isScanning) {
                                    setScanInput(rawValue);
                                    setIsScanning(false);
                                    toast.success("Código do ativo lido!");
                                } else if (isInvoiceScanning) {
                                    const match = rawValue.match(/\d{44}/);
                                    if (match) {
                                        setScannedInvoiceKey(match[0]);
                                        toast.success("Chave da NF-e lida com sucesso!");
                                    } else {
                                        setScannedInvoiceKey(rawValue);
                                        toast.success("Código de barras lido!");
                                    }
                                    setIsInvoiceScanning(false);
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
          toast.error("Erro ao acessar câmera. Verifique as permissões do navegador.");
          setIsScanning(false);
          setIsInvoiceScanning(false);
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach(t => t.stop());
      }
      if (interval) clearInterval(interval);
    };
  }, [isScanning, isInvoiceScanning]);

  const startScanning = () => {
    setIsScanning(true);
  };

  const handleCompleteInventory = async (scheduleId: string) => {
    // Transforma os dados de execução em resultados para salvar
    const results: InventoryResult[] = Object.entries(executionData).map(([assetId, data]) => ({
      assetId,
      newCostCenter: data.costCenter,
      verified: data.verified,
      observations: data.observations
    }));

    // Simulação para itens Mock (Frontend-Only)
    if (scheduleId.startsWith("mock-")) {
      // Salva a mudança de status para 'waiting_approval' no localStorage
      const overrides = JSON.parse(localStorage.getItem("mock_status_overrides") || "{}");
      overrides[scheduleId] = 'waiting_approval';
      localStorage.setItem("mock_status_overrides", JSON.stringify(overrides));
      setSchedules(prev => prev.map(s => s.id === scheduleId ? { ...s, status: 'waiting_approval', completedAt: new Date().toISOString() } : s));

      // Avisa o sistema
      setTimeout(() => window.dispatchEvent(new Event("local-mock-update")), 50);

      setPerformingSchedule(null);
      toast.success("Contagem enviada para aprovação do solicitante! (Simulação)");
      
      // Redirecionar para dashboard (simulando navegação normal)
      const navItems = [
          { id: 'dashboard', path: '/dashboard' },
          { id: 'projects', path: '/projects' },
          { id: 'budgets', path: '/budgets' },
          { id: 'assets', path: '/assets' },
      ];
      const role = (user as any)?.role;
      const allowedPages = (user as any)?.allowedPages || [];
      const firstAllowed = navItems.find(item => {
          if (role === 'admin') return true;
          return allowedPages.includes(item.id) || item.id === 'dashboard';
      });
      
      if (firstAllowed) setLocation(firstAllowed.path);
      else setLocation('/dashboard');
      return;
    }

    const scheduleRef = doc(db, "inventory_schedules", scheduleId);
    await updateDoc(scheduleRef, { status: 'waiting_approval', results, completedAt: new Date().toISOString() });

    setPerformingSchedule(null);
    toast.success("Contagem enviada para aprovação do solicitante!");

    // Redirecionar para a primeira página permitida (exceto inventário)
    const navItems = [
        { id: 'dashboard', path: '/dashboard' },
        { id: 'projects', path: '/projects' },
        { id: 'budgets', path: '/budgets' },
        { id: 'assets', path: '/assets' },
        { id: 'asset-movements', path: '/asset-movements' },
        { id: 'asset-depreciation', path: '/asset-depreciation' },
        { id: 'reports', path: '/reports' },
        { id: 'accounting', path: '/accounting' },
        { id: 'users', path: '/users' },
    ];

    const role = (user as any)?.role;
    const allowedPages = (user as any)?.allowedPages || [];

    const firstAllowed = navItems.find(item => {
        if (role === 'admin') return true;
        return allowedPages.includes(item.id) || item.id === 'dashboard';
    });

    setLocation(firstAllowed ? firstAllowed.path : '/dashboard');
  };

  const getActiveSchedule = (assetId: string) => {
    return schedules.find(s => (s.status === 'pending' || s.status === 'waiting_approval') && s.assetIds.includes(assetId));
  };

  const toggleAssetSelection = (id: string) => {
    if (getActiveSchedule(id)) return;
    setSelectedAssetIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // Filtra apenas ativos que NÃO têm agendamento ativo (permite recontagem de concluídos)
  const availableAssets = filteredAssets?.filter(a => !getActiveSchedule(a.id)) || [];
  const isAllSelected = availableAssets.length > 0 && availableAssets.every(a => selectedAssetIds.includes(a.id));

  const toggleAllAssets = () => {
    if (!availableAssets.length) return;
    
    if (isAllSelected) {
      setSelectedAssetIds([]);
    } else {
      // Only select assets that are not already scheduled
      setSelectedAssetIds(availableAssets.map(a => a.id));
    }
  };

  const toggleUserSelection = (id: string) => {
    setSelectedUserIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleScheduleSubmit = async () => {
    if (selectedAssetIds.length === 0 && selectedCostCentersForSchedule.length === 0) {
      toast.error("Selecione pelo menos um ativo ou centro de custo.");
      return;
    }
    if (selectedUserIds.length === 0) {
      toast.error("Selecione pelo menos um responsável.");
      return;
    }
    if (!scheduleDate) {
      toast.error("Selecione uma data.");
      return;
    }

    // O ID será gerado automaticamente pelo Firestore
    const newScheduleData = {
      requesterId: selectedApproverId || currentUserId,
      assetIds: selectedAssetIds,
      costCenterCodes: selectedCostCentersForSchedule, // Adiciona o contexto do centro de custo
      userIds: selectedUserIds,
      date: scheduleDate,
      notes,
      status: 'pending',
      createdAt: new Date().toISOString()
    };
    
    await addDoc(collection(db, "inventory_schedules"), newScheduleData);

    toast.success("Inventário agendado com sucesso!", {
      description: `${selectedAssetIds.length} ativos atribuídos a ${selectedUserIds.length} responsáveis para ${new Date(scheduleDate).toLocaleDateString()}.`
    });

    // Reset
    setIsScheduleOpen(false);
    setSelectedAssetIds([]);
    setSelectedCostCentersForSchedule([]);
    setSelectedUserIds([]);
    setSelectedApproverId("");
    setNotes("");
  };

  const handleExport = async () => {
    if (!filteredAssets) return;
    
    try {
      const doc = new jsPDF();
      let logoData: string | null = null;
      try {
        logoData = await getBase64ImageFromURL("/oba.svg");
      } catch (error) {
        console.warn("Logo não carregado:", error);
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const addHeaderAndWatermark = (data: any) => {
        // Watermark
        if (logoData) {
          doc.saveGraphicsState();
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          const wmWidth = 80;
          const wmHeight = 40;
          const wmX = (pageWidth - wmWidth) / 2;
          const wmY = (pageHeight - wmHeight) / 2;
          doc.addImage(logoData, 'PNG', wmX, wmY, wmWidth, wmHeight);
          doc.restoreGraphicsState();

          // Header
          doc.addImage(logoData, 'PNG', 14, 10, 25, 15);
        }

        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("Relatório Geral de Ativos", pageWidth - 14, 18, { align: 'right' });
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, pageWidth - 14, 24, { align: 'right' });
        
        doc.setDrawColor(200);
        doc.line(14, 30, pageWidth - 14, 30);
      };

      const tableData = filteredAssets.map(asset => {
        const project = projects?.find(p => p.id === asset.projectId);
        return [
          asset.assetNumber || "-",
          asset.tagNumber || "-",
          asset.name || "-",
          asset.status?.replace('_', ' ') || "-",
          project?.name || "N/A",
          asset.value ? Number(asset.value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : "-"
        ];
      });

      autoTable(doc, {
        head: [["Nº Ativo", "Plaqueta", "Nome", "Status", "Obra/Local", "Valor"]],
        body: tableData,
        startY: 35,
        didDrawPage: addHeaderAndWatermark,
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [22, 163, 74], textColor: 255, fontStyle: 'bold' }, // Green-600 like
        alternateRowStyles: { fillColor: [240, 253, 244] },
        margin: { top: 35 }
      });

      doc.save("inventario_ativos.pdf");
      toast.success("Relatório PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF.");
    }
  };

  const handleExportScheduleResult = async (schedule: InventorySchedule) => {
    if (!schedule.results) return;
    
    try {
      const doc = new jsPDF();
      let logoData: string | null = null;
      try {
        logoData = await getBase64ImageFromURL("/oba.svg");
      } catch (error) {
        console.warn("Logo não carregado:", error);
      }

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();

      const addHeaderAndWatermark = (data: any) => {
        // Watermark
        if (logoData) {
          doc.saveGraphicsState();
          doc.setGState(new (doc as any).GState({ opacity: 0.1 }));
          const wmWidth = 80;
          const wmHeight = 40;
          const wmX = (pageWidth - wmWidth) / 2;
          const wmY = (pageHeight - wmHeight) / 2;
          doc.addImage(logoData, 'PNG', wmX, wmY, wmWidth, wmHeight);
          doc.restoreGraphicsState();

          // Header
          doc.addImage(logoData, 'PNG', 14, 10, 25, 15);
        }

        doc.setFontSize(16);
        doc.setTextColor(40);
        doc.text("Relatório de Inventário Concluído", pageWidth - 14, 18, { align: 'right' });
        
        doc.setFontSize(10);
        doc.setTextColor(80);
        const dateObj = (schedule.date as any)?.toDate ? (schedule.date as any).toDate() : new Date(schedule.date);
        doc.text(`Data do Inventário: ${dateObj.toLocaleDateString('pt-BR')}`, pageWidth - 14, 24, { align: 'right' });
        doc.text(`Aprovado Por: ${schedule.approvedBy || "-"}`, pageWidth - 14, 29, { align: 'right' });
        const approvedAtObj = (schedule.approvedAt as any)?.toDate ? (schedule.approvedAt as any).toDate() : (schedule.approvedAt ? new Date(schedule.approvedAt) : null);
        doc.text(`Data Aprovação: ${approvedAtObj ? approvedAtObj.toLocaleString('pt-BR') : "-"}`, pageWidth - 14, 34, { align: 'right' });

        doc.setDrawColor(200);
        doc.line(14, 38, pageWidth - 14, 38);
      };

      const tableData = schedule.results.map(result => {
        const asset = assets.find(a => a.id === result.assetId);
        return [
          asset?.name || "Ativo Removido",
          asset?.tagNumber || "-",
          result.verified ? "Sim" : "Não",
          result.newCostCenter || "Mantido"
        ];
      });

      autoTable(doc, {
        head: [["Ativo", "Plaqueta", "Verificado", "Novo Centro de Custo"]],
        body: tableData,
        startY: 45,
        didDrawPage: addHeaderAndWatermark,
        styles: { fontSize: 9, cellPadding: 3 },
        headStyles: { fillColor: [37, 99, 235], textColor: 255, fontStyle: 'bold' }, // Blue-600
        alternateRowStyles: { fillColor: [239, 246, 255] },
        margin: { top: 45 }
      });

      // Signatures
      const finalY = (doc as any).lastAutoTable.finalY + 40;
      
      doc.setDrawColor(0);
      // Linhas de assinatura (3 colunas)
      doc.line(15, finalY, 65, finalY);   // Solicitante
      doc.line(80, finalY, 130, finalY);  // Responsável
      doc.line(145, finalY, 195, finalY); // Aprovador

      // Assinatura do Solicitante
      // O solicitante no PDF será sempre o usuário logado que está gerando o relatório
      const requester = users.find(u => String(u.id) === String(currentUserId)) || user;

      if (requester?.signature && requester.signature.startsWith('data:image')) {
        try {
          doc.addImage(requester.signature, 'PNG', 20, finalY - 25, 40, 20);
        } catch (e) { console.warn("Erro ao adicionar assinatura do solicitante", e); }
      }

      // Assinatura do Responsável (pega o primeiro se houver múltiplos)
      const responsibleId = schedule.userIds[0];
      const responsible = users.find(u => String(u.id) === String(responsibleId));
      if (responsible?.signature && responsible.signature.startsWith('data:image')) {
        try {
          doc.addImage(responsible.signature, 'PNG', 85, finalY - 25, 40, 20);
        } catch (e) { console.warn("Erro ao adicionar assinatura do responsável", e); }
      }
      
      // Assinatura do Aprovador
      const approver = users.find(u => u.name === schedule.approvedBy);
      if (approver?.signature && approver.signature.startsWith('data:image')) {
        try {
          doc.addImage(approver.signature, 'PNG', 150, finalY - 25, 40, 20);
        } catch (e) { console.warn("Erro ao adicionar assinatura do aprovador", e); }
      }
      
      doc.setFontSize(9);
      doc.setTextColor(0);
      doc.text("Solicitante", 40, finalY + 5, { align: 'center' });
      doc.text("Responsável", 105, finalY + 5, { align: 'center' });
      doc.text("Aprovador", 170, finalY + 5, { align: 'center' });
      doc.text(requester?.name || "N/A", 40, finalY + 10, { align: 'center' });
      doc.text(responsible?.name || "N/A", 105, finalY + 10, { align: 'center' });
      doc.text(schedule.approvedBy || "N/A", 170, finalY + 10, { align: 'center' });

      doc.setFontSize(7);
      doc.setTextColor(100);
      
      const formatDate = (d: any) => {
        if (!d) return "-";
        const dateObj = d?.toDate ? d.toDate() : new Date(d);
        return dateObj.toLocaleString('pt-BR');
      };

      doc.text(formatDate(schedule.createdAt || schedule.date), 40, finalY + 15, { align: 'center' });
      doc.text(formatDate(schedule.approvedAt), 105, finalY + 15, { align: 'center' }); // Responsável usa data de aprovação como conclusão
      doc.text(formatDate(schedule.approvedAt), 170, finalY + 15, { align: 'center' });

      doc.save(`inventario_concluido_${dateObj.toISOString().split('T')[0]}.pdf`);
      toast.success("Relatório PDF gerado com sucesso!");
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      toast.error("Erro ao gerar PDF.");
    }
  };

  const handleExportHistoryToExcel = () => {
    if (completedSchedules.length === 0) {
      toast.error("Não há histórico para exportar.");
      return;
    }

    const data = completedSchedules.map(schedule => {
        const requestDate = schedule.createdAt ? getDate(schedule.createdAt).toLocaleString('pt-BR') : "-";
        const scheduledDate = getDate(schedule.date).toLocaleDateString('pt-BR');
        const executionDate = schedule.completedAt ? getDate(schedule.completedAt).toLocaleString('pt-BR') : "-";
        const approvalDate = schedule.approvedAt ? getDate(schedule.approvedAt).toLocaleString('pt-BR') : "-";
        
        const responsibles = schedule.userIds.map(uid => {
            const u = users.find(user => String(user.id) === String(uid));
            return u?.name || "Usuário";
        }).join(", ");

        let ccs = "";
        if (schedule.costCenterCodes && schedule.costCenterCodes.length > 0) {
            ccs = schedule.costCenterCodes.join(", ");
        } else {
            ccs = Array.from(new Set(schedule.assetIds.map(id => {
                const a = assets.find(asset => asset.id === id);
                return typeof a?.costCenter === 'object' ? (a.costCenter as any).code : a?.costCenter;
            }).filter(Boolean))).join(", ");
        }

        const assetsList = schedule.assetIds.map(assetId => {
            const asset = assets.find(a => a.id === assetId);
            return `${asset?.tagNumber || "S/P"} - ${asset?.name || "Desconhecido"}`;
        }).join("; ");

        return {
            "Data Solicitação": requestDate,
            "Data Agendada": scheduledDate,
            "Data Execução": executionDate,
            "Responsáveis": responsibles,
            "Data Aprovação": approvalDate,
            "Aprovado Por": schedule.approvedBy || "-",
            "Centro de Custo": ccs,
            "Ativos": assetsList
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Histórico");
    
    // Largura automática para colunas
    const wscols = [
        { wch: 20 }, // Solicitação
        { wch: 15 }, // Agendada
        { wch: 20 }, // Execução
        { wch: 30 }, // Responsáveis
        { wch: 20 }, // Aprovação
        { wch: 20 }, // Aprovador
        { wch: 20 }, // CC
        { wch: 50 }  // Ativos
    ];
    ws['!cols'] = wscols;

    XLSX.writeFile(wb, `historico_inventarios_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Histórico exportado para Excel com sucesso!");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-slate-700 flex items-center gap-2">
          <ClipboardList className="h-8 w-8" />
          Inventário de Ativos
        </h1>
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="outline">
            <Download className="mr-2 h-4 w-4" /> Exportar Lista
          </Button>
          
          <Dialog open={isScheduleOpen} onOpenChange={setIsScheduleOpen}>
            <DialogTrigger asChild>
              <Button disabled={selectedAssetIds.length === 0} className="bg-blue-600 hover:bg-blue-700">
                <CalendarIcon className="mr-2 h-4 w-4" /> 
                Agendar Inventário ({selectedAssetIds.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Novo Agendamento de Inventário</DialogTitle>
                <DialogDescription>
                  Defina a data e os responsáveis pela conferência dos {selectedAssetIds.length} ativos selecionados.
                </DialogDescription>
              </DialogHeader>
              
              <div className="grid gap-6 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Data do Inventário</Label>
                    <Input 
                      type="date" 
                      value={scheduleDate}
                      onChange={(e) => setScheduleDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Aprovador</Label>
                    <Select value={selectedApproverId} onValueChange={setSelectedApproverId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o aprovador" />
                      </SelectTrigger>
                      <SelectContent>
                        {users.map((u: any) => (
                          <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-2">
                    <Label>Observações</Label>
                    <Input 
                      placeholder="Ex: Conferência anual..." 
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Selecionar Responsáveis
                  </Label>
                  <div className="border rounded-md p-4 bg-slate-50 max-h-[200px] overflow-y-auto">
                    {users ? (
                      <div className="grid grid-cols-2 gap-2">
                        {users.map((user: any) => (
                          <div key={user.id} className="flex items-center space-x-2 bg-white p-2 rounded border">
                            <Checkbox 
                              id={`user-${user.id}`} 
                              checked={selectedUserIds.includes(user.id)}
                              onCheckedChange={() => toggleUserSelection(user.id)}
                            />
                            <label 
                              htmlFor={`user-${user.id}`} 
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                            >
                              {user.name}
                              <span className="block text-xs text-muted-foreground">{user.email}</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground text-right">
                    {selectedUserIds.length} responsáveis selecionados
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Resumo dos Ativos</Label>
                  <div className="bg-slate-100 p-3 rounded-md text-sm text-slate-600">
                    Você está agendando a conferência de <strong>{selectedAssetIds.length}</strong> ativos. 
                    Os responsáveis receberão uma notificação para realizar a contagem física na data estipulada.
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsScheduleOpen(false)}>Cancelar</Button>
                <Button onClick={handleScheduleSubmit}>Confirmar Agendamento</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {pendingApprovalSchedules.length > 0 && (
        <Card className="bg-blue-50 border-blue-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-blue-800">
              <CheckCircle2 className="h-5 w-5" />
              <h3 className="font-semibold">Aprovações de Inventário Pendentes ({pendingApprovalSchedules.length})</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendingApprovalSchedules.map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between bg-white p-3 rounded-md border border-blue-100 shadow-sm">
                  <div>
                    <p className="text-base font-medium text-slate-700">Realizado em: {new Date(schedule.date).toLocaleDateString('pt-BR')}</p>
                    <p className="text-sm text-slate-500">{schedule.results?.length || 0} ativos verificados</p>
                    {schedule.notes && <p className="text-sm text-slate-500 italic mt-1">"{schedule.notes}"</p>}
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={() => setReviewingSchedule(schedule)}
                  >
                    <Check className="w-4 h-4 mr-2" />
                    Verificar
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {myPendingSchedules.length > 0 && (
        <Card className="bg-orange-50 border-orange-200">
          <CardHeader className="pb-2">
            <div className="flex items-center gap-2 text-orange-800">
              <AlertCircle className="h-5 w-5" />
              <h3 className="font-semibold">Inventários Pendentes ({myPendingSchedules.length})</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {myPendingSchedules.map(schedule => (
                <div key={schedule.id} className="flex items-center justify-between bg-white p-3 rounded-md border border-orange-100 shadow-sm">
                  <div>
                    <p className="text-base font-medium text-slate-700">Agendado para: {(() => {
                        const d = (schedule.date as any)?.toDate ? (schedule.date as any).toDate() : new Date(schedule.date);
                        return d.toLocaleDateString('pt-BR');
                    })()}</p>
                    <p className="text-sm text-slate-500">{schedule.assetIds.length} ativos para conferir</p>
                    {schedule.notes && <p className="text-sm text-slate-500 italic mt-1">"{schedule.notes}"</p>}
                  </div>
                  <Button 
                    size="sm" 
                    className="bg-orange-600 hover:bg-orange-700 text-white"
                    onClick={() => setPerformingSchedule(schedule)}
                  >
                    <PlayCircle className="w-4 h-4 mr-2" />
                    Iniciar Contagem
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="by-asset" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="by-asset">Agendamento por Ativo</TabsTrigger>
          <TabsTrigger value="by-cost-center">Agendamento por Centro de Custo</TabsTrigger>
        </TabsList>
        <TabsContent value="by-asset">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por nome, plaqueta ou número do ativo..."
                    className="pl-8"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="w-[240px]">
                  <Select value={selectedAssetClass} onValueChange={setSelectedAssetClass}>
                    <SelectTrigger className="bg-blue-50 border-blue-200 text-blue-700">
                      <SelectValue placeholder="Filtrar por Classe" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as Classes</SelectItem>
                      {assetClasses.map((cls: any) => (
                        <SelectItem key={cls.id} value={cls.name}>{cls.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-[240px]">
                  <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                    <SelectTrigger className="bg-green-50 border-green-200 text-green-700">
                      <SelectValue placeholder="Filtrar por Centro de Custo" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os Centros de Custo</SelectItem>
                      {costCenters.map((cc: any) => (
                        <SelectItem key={cc.id} value={cc.code}>
                          {cc.code} - {cc.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 bg-orange-50 px-3 py-2 rounded-md border border-orange-200 text-orange-800">
                  <Checkbox 
                    id="show-obs" 
                    checked={showOnlyWithObs}
                    onCheckedChange={(checked) => setShowOnlyWithObs(!!checked)}
                    className="border-orange-400 data-[state=checked]:bg-orange-600 data-[state=checked]:text-white"
                  />
                  <label 
                    htmlFor="show-obs" 
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer whitespace-nowrap"
                  >
                    Com Obs.
                  </label>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="h-8 w-8 animate-spin" />
                </div>
              ) : (
                <>
                <Table className="text-base">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox 
                          checked={isAllSelected}
                          onCheckedChange={toggleAllAssets}
                        />
                      </TableHead>
                      <TableHead className="text-base w-[90px]">Plaqueta</TableHead>
                      <TableHead className="text-base">Nome</TableHead>
                      <TableHead className="text-base w-[120px]">Centro de Custo</TableHead>
                      <TableHead className="text-base">Inventariado</TableHead>
                      <TableHead className="text-base">Aprovador</TableHead>
                      <TableHead className="text-base">Responsável</TableHead>
                      <TableHead className="text-base">Obs</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedAssets?.map((asset) => {
                      const activeSchedule = getActiveSchedule(asset.id);
                      const lastInventory = getLastInventory(asset.id);
                      const isAssignedToMe = activeSchedule && activeSchedule.status === 'pending' && currentUserId && activeSchedule.userIds.some(uid => String(uid) === String(currentUserId));
                      const isAlreadyInventoried = !!lastInventory; // Verifica se já está concluído
                      const isWaitingMyApproval = activeSchedule && activeSchedule.status === 'waiting_approval' && (
                          userRole === 'admin' || userRole === 'diretoria' || (activeSchedule.requesterId && String(activeSchedule.requesterId) === String(currentUserId))
                      );

                      // Monta título explicativo para o bloqueio
                      let rowTitle = "";
                      if (activeSchedule) {
                          const dateStr = (activeSchedule.date as any)?.toDate ? (activeSchedule.date as any).toDate().toLocaleDateString('pt-BR') : new Date(activeSchedule.date).toLocaleDateString('pt-BR');
                          rowTitle = `Bloqueado: Agendado para ${dateStr} (ID: ${activeSchedule.id})`;
                      } else if (isAlreadyInventoried) {
                          rowTitle = "Já inventariado (Disponível para recontagem)";
                      }
                      
                      return (
                      <TableRow 
                        key={asset.id} 
                        className={
                          selectedAssetIds.includes(asset.id) 
                            ? "bg-blue-50" 
                            : (activeSchedule 
                                ? (isAssignedToMe ? "bg-orange-50 border-l-4 border-l-orange-500 hover:bg-orange-100" : "opacity-50 bg-gray-100 pointer-events-none") 
                                : ""
                              )
                        }
                        title={rowTitle}
                      >
                        <TableCell>
                          <Checkbox 
                            checked={selectedAssetIds.includes(asset.id)}
                            onCheckedChange={() => toggleAssetSelection(asset.id)}
                            disabled={!!activeSchedule}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="text-base">{asset.tagNumber || "-"}</span>
                            <span className="text-xs font-mono text-muted-foreground">{asset.assetNumber || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-base">{asset.name}</div>
                          <div className="text-sm text-muted-foreground truncate max-w-[300px]">{asset.description}</div>
                        </TableCell>
                        <TableCell className="text-base">
                          {(() => {
                             const ccCode = typeof asset.costCenter === 'object' && asset.costCenter ? (asset.costCenter as any).code : asset.costCenter;
                             const cc = costCenters.find(c => c.code === ccCode);
                             return (
                               <div className="flex flex-col">
                                 <span>{cc ? `${cc.code} - ${cc.name}` : (ccCode || "-")}</span>
                                 {cc?.responsible && (
                                   <span className="text-sm text-muted-foreground">{cc.responsible}</span>
                                 )}
                               </div>
                             );
                          })()}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            if (lastInventory) {
                              return (
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Sim
                                  </span>
                                  {!lastInventory.approvedAt && (
                                    <span className="text-xs text-muted-foreground">
                                      {getDate(lastInventory.date).toLocaleDateString('pt-BR')}
                                    </span>
                                  )}
                                </div>
                              );
                            }
                            return <span className="text-sm text-muted-foreground">-</span>;
                          })()}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {activeSchedule ? (
                             (() => {
                               const requester = users.find(u => String(u.id) === String(activeSchedule.requesterId));
                               return (
                                 <div className="flex flex-col gap-1">
                                   {isWaitingMyApproval && (
                                     <Button size="sm" variant="default" className="h-6 text-[10px] bg-indigo-600 hover:bg-indigo-700 w-full" onClick={(e) => {
                                       e.stopPropagation();
                                       setReviewingSchedule(activeSchedule);
                                     }}>
                                       Validar
                                     </Button>
                                   )}
                                   <span className="font-medium text-slate-700">{requester?.name || "-"}</span>
                                   <span className="text-[10px] text-blue-500 font-medium">Solicitante (Pendente)</span>
                                 </div>
                               );
                             })()
                          ) : (
                            <div className="flex flex-col">
                              <span className="font-medium text-slate-700">{lastInventory?.approvedBy || "-"}</span>
                              <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
                                <span className="text-green-600" title="Data da Contagem">
                                  {lastInventory?.completedAt ? getDate(lastInventory.completedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                                </span>
                                <span className="text-slate-300">/</span>
                                <span className="text-blue-600" title="Data da Aprovação">
                                  {lastInventory?.approvedAt ? getDate(lastInventory.approvedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                                </span>
                              </div>
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {activeSchedule ? (
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex flex-col gap-1">
                                {activeSchedule.userIds.map(uid => {
                                    const responsibleUser = users.find(u => String(u.id) === String(uid));
                                    return (
                                    <span key={uid} className="text-sm text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 w-fit whitespace-nowrap">
                                        {responsibleUser?.name || "Usuário..."}
                                    </span>
                                    );
                                })}
                                <div className="flex flex-col mt-0.5 gap-0.5">
                                    <span className="text-[10px] text-muted-foreground">
                                        {(() => {
                                            const d = activeSchedule.createdAt ? getDate(activeSchedule.createdAt) : getDate(activeSchedule.date);
                                            return `Solicitado: ${d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
                                        })()}
                                    </span>
                                    {activeSchedule.completedAt && (
                                        <span className="text-[10px] text-green-600 font-medium">
                                            Contado: {getDate(activeSchedule.completedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    )}
                                </div>
                                </div>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 text-red-400 hover:text-red-600 hover:bg-red-50 pointer-events-auto"
                                    title="Cancelar este agendamento para liberar o ativo"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveFromSchedule(activeSchedule.id, asset.id);
                                    }}
                                >
                                    <Trash2 className="w-3 h-3" />
                                </Button>
                            </div>
                          ) : (
                            lastInventory ? (
                              <div className="flex flex-col gap-1">
                                {lastInventory.userIds.map(uid => {
                                  const responsibleUser = users.find(u => String(u.id) === String(uid));
                                  return (
                                    <span key={uid} className="text-sm text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 w-fit whitespace-nowrap">
                                      {responsibleUser?.name || "Usuário..."}
                                    </span>
                                  );
                                })}
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-0.5">
                                  <span title="Data da Solicitação">
                                    {lastInventory.createdAt 
                                      ? getDate(lastInventory.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
                                      : getDate(lastInventory.date).toLocaleDateString('pt-BR') + " (Agend.)"}
                                  </span>
                                  <span className="text-slate-300">/</span>
                                  <span className="text-green-600" title="Data da Contagem">
                                    {lastInventory.completedAt ? getDate(lastInventory.completedAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : "-"}
                                  </span>
                                </div>
                              </div>
                            ) : <span className="text-sm text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[150px] truncate" title={lastInventory?.results?.find(r => r.assetId === asset.id)?.observations || ""}>
                          {lastInventory?.results?.find(r => r.assetId === asset.id)?.observations || "-"}
                        </TableCell>
                      </TableRow>
                    )})}
                    {(!filteredAssets || filteredAssets.length === 0) && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Nenhum ativo encontrado.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                
                {filteredAssets && filteredAssets.length > 0 && !isFiltering && (
                  <div className="mt-4">
                    <Pagination>
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((p) => Math.max(1, p - 1));
                            }}
                            className={currentPage === 1 ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                        <PaginationItem>
                          <span className="text-sm text-muted-foreground mx-4">
                            Página {currentPage} de {totalPages}
                          </span>
                        </PaginationItem>
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((p) => Math.min(totalPages, p + 1));
                            }}
                            className={currentPage === totalPages ? "pointer-events-none opacity-50" : ""}
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
                  </div>
                )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="by-cost-center">
          <Card>
            <CardHeader>
              <CardTitle>Agendar Inventário por Centro de Custo</CardTitle>
              <CardDescription>
                Selecione um ou mais centros de custo para incluir todos os seus ativos em um agendamento de inventário.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-end mb-4">
                  <Button 
                      onClick={handleScheduleByCostCenter} 
                      disabled={selectedCostCentersForSchedule.length === 0}
                      className="bg-blue-600 hover:bg-blue-700"
                  >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      Agendar por Centro de Custo ({selectedCostCentersForSchedule.length})
                  </Button>
              </div>
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead className="w-[50px]">
                              <Checkbox 
                                  checked={isAllCostCentersSelected}
                                  onCheckedChange={toggleAllCostCenters}
                              />
                          </TableHead>
                          <TableHead>Código</TableHead>
                          <TableHead>Nome</TableHead>
                          <TableHead>Departamento</TableHead>
                          <TableHead>Responsável</TableHead>
                          <TableHead>Última Solicitação</TableHead>
                          <TableHead>Última Realização</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {costCenters.map(cc => {
                          const lastSchedule = getLastScheduleForCC(cc.code);
                          const requestDate = lastSchedule?.createdAt ? getDate(lastSchedule.createdAt).toLocaleDateString('pt-BR') : "-";
                          const executionDate = lastSchedule?.status === 'completed' && lastSchedule.approvedAt 
                              ? getDate(lastSchedule.approvedAt).toLocaleDateString('pt-BR') 
                              : (lastSchedule ? `Agendado: ${getDate(lastSchedule.date).toLocaleDateString('pt-BR')}` : "-");

                          return (
                          <TableRow 
                              key={cc.id}
                              className={selectedCostCentersForSchedule.includes(cc.code) ? "bg-blue-50" : ""}
                          >
                              <TableCell>
                                  <Checkbox 
                                      checked={selectedCostCentersForSchedule.includes(cc.code)}
                                      onCheckedChange={() => toggleCostCenterSelection(cc.code)}
                                  />
                              </TableCell>
                              <TableCell>{cc.code}</TableCell>
                              <TableCell>{cc.name}</TableCell>
                              <TableCell>{cc.department}</TableCell>
                              <TableCell>{cc.responsible || "-"}</TableCell>
                              <TableCell>{requestDate}</TableCell>
                              <TableCell>{executionDate}</TableCell>
                          </TableRow>
                      )})}
                  </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Histórico de Inventários Concluídos */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-2xl">
              <ClipboardList className="h-5 w-5" />
              Histórico de Inventários Concluídos
            </CardTitle>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExportHistoryToExcel}>
                <Download className="mr-2 h-4 w-4" />
                Exportar Excel
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}>
                {isHistoryExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        {isHistoryExpanded && (
        <CardContent>
          <Table className="text-lg">
            <TableHeader>
              <TableRow>
                <TableHead className="text-lg">Solicitado</TableHead>
                <TableHead className="text-lg">Agendado</TableHead>
                <TableHead className="text-lg">Executado</TableHead>
                <TableHead className="text-lg">Aprovado</TableHead>
                <TableHead className="text-lg">Centro de Custo</TableHead>
                <TableHead className="text-lg">Ativos</TableHead>
                <TableHead className="text-lg">Responsáveis</TableHead>
                <TableHead className="text-lg">Aprovado Por</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {completedSchedules.map(schedule => (
                <TableRow key={schedule.id}>
                  <TableCell className="text-lg">
                    {schedule.createdAt ? getDate(schedule.createdAt).toLocaleString('pt-BR') : "-"}
                  </TableCell>
                  <TableCell className="text-lg">
                    {getDate(schedule.date).toLocaleDateString('pt-BR')}
                  </TableCell>
                  <TableCell className="text-lg">
                    {schedule.completedAt ? getDate(schedule.completedAt).toLocaleString('pt-BR') : "-"}
                  </TableCell>
                  <TableCell className="text-lg">
                    {schedule.approvedAt ? getDate(schedule.approvedAt).toLocaleString('pt-BR') : "-"}
                  </TableCell>
                  <TableCell className="text-lg">
                    {(() => {
                        if (schedule.costCenterCodes && schedule.costCenterCodes.length > 0) {
                            return schedule.costCenterCodes.join(", ");
                        }
                        const ccs = Array.from(new Set(schedule.assetIds.map(id => {
                            const a = assets.find(asset => asset.id === id);
                            return typeof a?.costCenter === 'object' ? (a.costCenter as any).code : a?.costCenter;
                        }).filter(Boolean)));
                        
                        if (ccs.length === 0) return "-";
                        if (ccs.length > 2) return `${ccs.slice(0, 2).join(", ")} (+${ccs.length - 2})`;
                        return ccs.join(", ");
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1 max-h-[150px] overflow-y-auto pr-2">
                      {schedule.assetIds.map(assetId => {
                        const asset = assets.find(a => a.id === assetId);
                        return (
                          <div key={assetId} className="text-base border-b border-slate-100 last:border-0 py-1">
                            <span className="font-bold text-slate-700">{asset?.tagNumber || "S/P"}</span>
                            <span className="text-slate-600 ml-2">{asset?.name || "Desconhecido"}</span>
                          </div>
                        );
                      })}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      {schedule.userIds.map(uid => {
                        const u = users.find(user => String(user.id) === String(uid));
                        return <span key={uid} className="text-base text-muted-foreground">{u?.name || "Usuário"}</span>
                      })}
                    </div>
                  </TableCell>
                  <TableCell className="text-lg">{schedule.approvedBy || "-"}</TableCell>
                </TableRow>
              ))}
              {completedSchedules.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-lg">
                    Nenhum inventário concluído.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
        )}
      </Card>

      <NewAssetFromInventoryDialog
        open={isNewAssetDialogOpen}
        onOpenChange={(open) => {
          setIsNewAssetDialogOpen(open);
          if (!open) {
            setScannedInvoiceKey(""); // Limpa a chave escaneada ao fechar
          }
        }}
        initialCode={newAssetInitialCode}
        costCenters={costCenters}
        assetClasses={assetClasses}
        defaultCostCenter={performingSchedule?.costCenterCodes?.[0]}
        onSuccess={handleNewAssetCreated}
        onStartScan={() => setIsInvoiceScanning(true)}
        scannedInvoiceKey={scannedInvoiceKey}
      />

      {/* Diálogo para Realizar Inventário */}
      <Dialog open={!!performingSchedule} onOpenChange={(open) => !open && setPerformingSchedule(null)}>
        <DialogContent className="w-full h-full max-w-full max-h-full md:max-w-[95vw] md:max-h-[95vh] p-0 md:p-6 flex flex-col gap-0">
          <DialogHeader className="p-4 pb-2 md:p-0 bg-white border-b md:border-none">
            <DialogTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5" />
              Conferência de Inventário
            </DialogTitle>
            <DialogDescription className="hidden md:block">
              Utilize o leitor de QR Code ou digite a plaqueta para confirmar os ativos.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-hidden flex flex-col bg-slate-50/50">
             {/* Área de Scan e Resumo */}
             <div className="bg-white p-4 border-b md:border md:rounded-lg flex flex-col gap-4 shrink-0 shadow-sm md:shadow-none md:m-0">
                <div className="w-full">
                    <Label htmlFor="scan-input">Leitura de Plaqueta / QR Code</Label>
                    <form onSubmit={handleScan} className="flex gap-2 mt-1">
                        <div className="relative flex-1">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="icon" 
                                className="absolute left-0 top-0 h-10 w-10 text-muted-foreground hover:text-foreground z-10"
                                onClick={startScanning}
                            >
                                <QrCode className="h-5 w-5" />
                            </Button>
                            <Input 
                                id="scan-input"
                                value={scanInput}
                                onChange={(e) => setScanInput(e.target.value)}
                                placeholder="Bipe ou digite o código..."
                                className="pl-10 bg-white"
                                autoFocus
                                autoComplete="off"
                            />
                        </div>
                        <Button type="submit" size="icon" className="w-12 shrink-0">
                            <CheckCircle2 className="h-5 w-5" />
                        </Button>
                    </form>
                </div>
                <div className="grid grid-cols-3 gap-2 text-sm w-full">
                    <div className="flex flex-col items-center bg-slate-50 p-2 rounded border">
                        <span className="text-muted-foreground text-xs uppercase font-bold">Total</span>
                        <span className="font-bold text-lg">{performingSchedule?.assetIds.length || 0}</span>
                    </div>
                    <div className="flex flex-col items-center bg-green-50 p-2 rounded border border-green-100 text-green-700">
                        <span className="flex items-center gap-1 text-xs uppercase font-bold"><CheckCircle2 className="w-3 h-3" /> Feito</span>
                        <span className="font-bold text-lg">{Object.values(executionData).filter(d => d.verified).length}</span>
                    </div>
                    <div className="flex flex-col items-center bg-orange-50 p-2 rounded border border-orange-100 text-orange-700">
                        <span className="flex items-center gap-1 text-xs uppercase font-bold"><AlertCircle className="w-3 h-3" /> Falta</span>
                        <span className="font-bold text-lg">{Object.values(executionData).filter(d => !d.verified).length}</span>
                    </div>
                </div>
             </div>

             <div className="flex-1 overflow-auto bg-white md:border md:rounded-md md:mt-4">
             <Table className="text-base">
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-[60px] text-center bg-slate-50 sticky top-0 z-10 text-base">Status</TableHead>
                   <TableHead className="bg-slate-50 sticky top-0 z-10 text-base">Ativo</TableHead>
                   <TableHead className="bg-slate-50 sticky top-0 z-10 text-base w-[220px]">Localização</TableHead>
                   <TableHead className="bg-slate-50 sticky top-0 z-10 min-w-[150px] text-base">Obs</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {performingSchedule && assets?.filter(a => performingSchedule.assetIds.includes(a.id)).map(asset => {
                   const isVerified = executionData[asset.id]?.verified;
                   return (
                   <TableRow key={asset.id} className={isVerified ? "bg-green-50/50" : ""}>
                     <TableCell className="text-center p-2 align-middle">
                       <div className="flex justify-center items-center">
                          {isVerified ? (
                              <CheckCircle2 className="w-8 h-8 text-green-600" />
                          ) : (
                              <Checkbox 
                                checked={false} 
                                onCheckedChange={(checked) => setExecutionData(prev => ({
                                  ...prev,
                                  [asset.id]: { ...prev[asset.id], verified: !!checked }
                                }))}
                                className="w-6 h-6 border-2"
                              /> 
                          )}
                       </div>
                     </TableCell>
                     <TableCell className="p-2 align-middle">
                        <div className="flex flex-col">
                            <span className="font-bold text-base">{asset.tagNumber}</span>
                            <span className="text-sm text-muted-foreground line-clamp-2 leading-tight">{asset.name}</span>
                            <span className="text-xs font-mono text-slate-400 mt-0.5">{asset.assetNumber}</span>
                        </div>
                     </TableCell>
                     <TableCell className="p-2 align-middle">
                        <div className="flex flex-col gap-1">
                            <span className="text-sm text-muted-foreground">
                                {(() => {
                                   const ccCode = typeof asset.costCenter === 'object' && asset.costCenter ? (asset.costCenter as any).code : asset.costCenter;
                                   const cc = costCenters.find(c => c.code === ccCode);
                                   return cc ? `${cc.code} - ${cc.name}` : (ccCode || "-");
                                })()}
                            </span>
                        <Select 
                          value={executionData[asset.id]?.costCenter || ""} 
                          onValueChange={(val) => setExecutionData(prev => ({
                            ...prev,
                            [asset.id]: { ...prev[asset.id], costCenter: val }
                          }))}
                        >
                              <SelectTrigger className="h-8 text-sm w-full bg-white border-slate-200">
                                <SelectValue placeholder="Mover..." />
                          </SelectTrigger>
                          <SelectContent>
                            {costCenters?.map((cc: any) => (
                              <SelectItem key={cc.id} value={cc.code}>
                                    {cc.code} - {cc.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        </div>
                     </TableCell>
                     <TableCell className="p-2 align-middle">
                      <Textarea
                          value={executionData[asset.id]?.observations || ""}
                          onChange={(e) => setExecutionData(prev => ({
                            ...prev,
                            [asset.id]: { ...prev[asset.id], observations: e.target.value }
                          }))}
                          placeholder="Obs..."
                        className="text-sm min-h-[60px] bg-white resize-none"
                        />
                     </TableCell>
                   </TableRow>
                 )})}
               </TableBody>
             </Table>
             </div>
          </div>
      
          <DialogFooter className="p-4 border-t bg-white md:bg-transparent mt-auto">
            <div className="flex gap-3 w-full">
                <Button variant="outline" className="flex-1 h-12 text-base" onClick={() => setPerformingSchedule(null)}>Voltar</Button>
                <Button className="flex-1 bg-green-600 hover:bg-green-700 h-12 text-base" onClick={() => performingSchedule && handleCompleteInventory(performingSchedule.id)}>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Finalizar
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Scanner Overlay */}
      {(isScanning || isInvoiceScanning) && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col">
            <div className="relative flex-1 bg-black flex items-center justify-center">
                <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
                <div className="absolute inset-0 border-2 border-white/50 m-12 rounded-lg pointer-events-none"></div>
                <div className="absolute top-4 right-4 z-[101]">
                    <Button variant="ghost" size="icon" className="text-white bg-black/50 hover:bg-black/70 rounded-full" onClick={() => {
                      setIsScanning(false);
                      setIsInvoiceScanning(false);
                    }}>
                        <X className="h-8 w-8" />
                    </Button>
                </div>
            </div>
            <div className="p-6 bg-black text-white text-center font-medium">
                Aponte a câmera para o {isScanning ? 'código do ativo' : 'código de barras da NF-e'}
            </div>
        </div>
      )}

      {/* Diálogo para Validar/Aprovar Inventário */}
      <Dialog open={!!reviewingSchedule} onOpenChange={(open) => !open && setReviewingSchedule(null)}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-blue-600" />
              Validar Inventário
            </DialogTitle>
            <DialogDescription>
              Verifique as alterações apontadas antes de aprovar. As mudanças de centro de custo serão aplicadas aos ativos.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto py-4">
             <Table className="text-base">
               <TableHeader>
                 <TableRow>
                   <TableHead className="w-[50px] text-center">
                      <Checkbox 
                        checked={reviewingSchedule?.results?.length === selectedForApproval.length && (reviewingSchedule?.results?.length || 0) > 0}
                        onCheckedChange={() => {
                          if (selectedForApproval.length === (reviewingSchedule?.results?.length || 0)) setSelectedForApproval([]);
                          else setSelectedForApproval(reviewingSchedule?.results?.map(r => r.assetId) || []);
                        }}
                      />
                   </TableHead>
                   <TableHead className="text-base">Ativo</TableHead>
                   <TableHead className="text-center text-base">Verificado</TableHead>
                   <TableHead className="text-base">Centro de Custo (Atual)</TableHead>
                   <TableHead className="text-base">Centro de Custo (Novo)</TableHead>
                   <TableHead className="text-base">Observações</TableHead>
                 </TableRow>
               </TableHeader>
               <TableBody>
                 {reviewingSchedule?.results?.map((result, index) => {
                   const asset = assets.find(a => a.id === result.assetId);
                   const currentCC = typeof asset?.costCenter === 'object' && asset.costCenter ? (asset.costCenter as any).code : asset?.costCenter || "-";
                   const newCCCode = result.newCostCenter;
                   const newCC = costCenters.find(c => c.code === newCCCode);
                   const newCCLabel = newCC ? `${newCC.code} - ${newCC.name}` : newCCCode;
                   
                   const isChange = result.newCostCenter && result.newCostCenter !== currentCC;

                   return (
                     <TableRow key={index} className={`${isChange ? "bg-yellow-50" : ""} ${!selectedForApproval.includes(result.assetId) ? "opacity-60" : ""}`}>
                       <TableCell className="text-center">
                          <Checkbox 
                            checked={selectedForApproval.includes(result.assetId)}
                            onCheckedChange={() => toggleApproval(result.assetId)}
                          />
                       </TableCell>
                       <TableCell>
                          <div className="font-medium text-base">{asset?.name || "Ativo não encontrado"}</div>
                          <div className="text-sm text-muted-foreground">{asset?.assetNumber}</div>
                       </TableCell>
                       <TableCell className="text-center">
                          {result.verified ? <CheckCircle2 className="w-5 h-5 text-green-600 mx-auto" /> : <XCircle className="w-5 h-5 text-red-600 mx-auto" />}
                       </TableCell>
                       <TableCell className="text-base">{currentCC}</TableCell>
                       <TableCell>
                          {result.newCostCenter ? (
                              <span className={`text-base ${isChange ? "font-bold text-orange-700" : ""}`}>
                                  {newCCLabel}
                              </span>
                          ) : (
                              <span className="text-muted-foreground italic text-base">Mantido</span>
                          )}
                       </TableCell>
                       <TableCell className="text-sm text-muted-foreground">
                          {result.observations || "-"}
                       </TableCell>
                     </TableRow>
                   );
                 })}
               </TableBody>
             </Table>
          </div>

          <DialogFooter className="gap-2 pt-4 border-t">
              <Button variant="destructive" onClick={() => reviewingSchedule && handleRejectInventory(reviewingSchedule)}>
                  <XCircle className="w-4 h-4 mr-2" />
                  Rejeitar (Retornar)
              </Button>
              <Button className="bg-green-600 hover:bg-green-700" onClick={() => {
                  if (reviewingSchedule) {
                    handleApproveInventory(reviewingSchedule);
                    setReviewingSchedule(null);
                  }
              }}>
                  <Check className="w-4 h-4 mr-2" />
                  Aprovar e Atualizar
              </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}