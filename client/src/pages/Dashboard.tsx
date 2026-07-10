import { useState, useMemo, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, updateDoc, doc, addDoc } from "firebase/firestore";
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, Tooltip as RechartsTooltip, PieChart, Pie, Cell, Legend, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, LabelList, Mail, Brush } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, TrendingUp, DollarSign, Package, Activity, BarChart3, ArrowUpRight, AlertTriangle, TrendingDown, Target, Wallet, X, ChevronDown, ChevronRight, ClipboardList, Calendar, CheckCircle2, Clock, FileText, ChevronLeft, Bell, Check, Eye, ArrowRightLeft, Maximize2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

const formatCurrencyCompact = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
  }).format(value);

const sendEmailNotification = (to: string, subject: string, body: string) => {
  const mailtoLink = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.location.href = mailtoLink;
  toast.info(`Abrindo cliente de e-mail para notificar ${to}`);
};

const getAssetValue = (asset: any, allExpenses: any[]) => {
    if (!asset) return 0;
    const assetExpenses = allExpenses.filter(e => String(e.assetId) === String(asset.id));
    const expensesTotal = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    return Number(asset.value || 0) + expensesTotal;
};

const normalize = (str: any) => String(str || "").toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";

const STATUS_COLORS: Record<string, string> = {
  aguardando_classificacao: '#3b82f6', // blue-500
  aguardando_engenharia: '#eab308', // yellow-500
  aguardando_diretoria: '#f97316', // orange-500
  aprovado: '#22c55e', // green-500
  rejeitado: '#ef4444', // red-500
  planejamento: '#64748b', // slate-500
  em_andamento: '#a855f7', // purple-500
  concluido: '#14b8a6', // teal-500
  pausado: '#ec4899', // pink-500
  sem_status: '#94a3b8' // slate-400
};

const MOVEMENT_TYPES = [
    { value: "transfer_project", label: "Transferência entre Obras", type: "transfer" },
    { value: "transfer_cost_center", label: "Transferência de Centro de Custo", type: "transfer" },
    { value: "write_off_sale", label: "Baixa por Venda", type: "write_off" },
    { value: "write_off_obsolescence", label: "Baixa por Obsolescência", type: "write_off" },
    { value: "write_off_theft", label: "Baixa por Roubo/Furto", type: "write_off" },
    { value: "write_off_damage", label: "Baixa por Danos", type: "write_off" },
    { value: "write_off_partial", label: "Baixa Parcial", type: "partial_write_off" },
];

const statusLabels: { [key: string]: string } = {
    pending_approval: "Pendente",
    completed: "Concluído",
    rejected: "Rejeitado",
    em_transito: "Em Trânsito"
};

// Helper para processar datas do Firestore (Timestamp) ou Strings ISO
const parseDate = (value: any): Date => {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate(); // Firestore Timestamp
  if (value instanceof Date) return value;
  return new Date(value);
};

export default function Dashboard() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'budget' | 'assets'>('assets');
  const [depreciationType, setDepreciationType] = useState<'fiscal' | 'corporate'>('fiscal');
  const [showBurnRateDetails, setShowBurnRateDetails] = useState(false);
  const [showAssetsModal, setShowAssetsModal] = useState(false);
  const [isTablesExpanded, setIsTablesExpanded] = useState(true);
  const [isInventoryDataExpanded, setIsInventoryDataExpanded] = useState(true);
  const [isAssetsExpanded, setIsAssetsExpanded] = useState(true);
  const [isScheduleAnalysisExpanded, setIsScheduleAnalysisExpanded] = useState(true);
  const [isMovementsExpanded, setIsMovementsExpanded] = useState(true);
  const [isInventoryChartFullscreen, setIsInventoryChartFullscreen] = useState(false);
  const [depreciationModalData, setDepreciationModalData] = useState<any | null>(null);
  const [inventoryChartFilter, setInventoryChartFilter] = useState<'all' | 'completed' | 'pending'>('all');

  const [projects, setProjects] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [allBudgets, setAllBudgets] = useState<any[]>([]);
  const [assetClasses, setAssetClasses] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const handleAutoSchedule = async (ccCode: string, assetsToSchedule: any[]) => {
    const currentUserId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;
    
    if (!currentUserId) {
      toast.error("Usuário não autenticado.");
      return;
    }

    const cc = costCenters.find(c => c.code === ccCode);
    const assetIds = assetsToSchedule.map(a => a.id);

    // Identificar responsáveis baseados no CC
    let responsibleIds: string[] = [];
    if (cc?.responsible) {
      const foundUser = users.find(u => u.name?.trim().toLowerCase() === cc.responsible?.trim().toLowerCase());
      if (foundUser) responsibleIds.push(foundUser.id);
    }
    
    // Fallback: se não encontrar responsável, atribui ao usuário logado
    if (responsibleIds.length === 0) {
      responsibleIds.push(currentUserId);
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    try {
      const newSchedule = {
        requesterId: currentUserId,
        assetIds: assetIds,
        costCenterCodes: [ccCode],
        userIds: responsibleIds,
        date: tomorrow.toISOString().split('T')[0],
        notes: `Agendamento automático via Dashboard (Sugestão de Cronograma - CC: ${ccCode})`,
        status: 'pending',
        createdAt: new Date().toISOString()
      };

      await addDoc(collection(db, "inventory_schedules"), newSchedule);
      toast.success(`Agendamento criado com sucesso para o CC ${ccCode}!`, {
        description: `${assetIds.length} ativos atribuídos para amanhã.`
      });
    } catch (error) {
      console.error("Erro ao criar agendamento automático:", error);
      toast.error("Falha ao criar agendamento.");
    }
  };

  useEffect(() => {
    const handleQuotaError = (collectionName: string) => (error: any) => {
      if (error.code === 'resource-exhausted') {
        console.warn(`Limite de cota atingido para ${collectionName}`);
      }
    };

    const unsubProjects = onSnapshot(collection(db, "projects"), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Projetos"));

    const unsubCostCenters = onSnapshot(collection(db, "cost_centers"), (snapshot) => {
      setCostCenters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Centros de Custo"));

    const unsubExpenses = onSnapshot(collection(db, "expenses"), (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Despesas"));

    const unsubAssets = onSnapshot(collection(db, "assets"), (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Ativos"));

    const unsubBudgets = onSnapshot(collection(db, "budgets"), (snapshot) => {
      setAllBudgets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Budgets"));

    const unsubAssetClasses = onSnapshot(collection(db, "asset_classes"), (snapshot) => {
      setAssetClasses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Classes"));

    const unsubSchedules = onSnapshot(collection(db, "inventory_schedules"), (snapshot) => {
      setSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Inventários"));

    const unsubMovements = onSnapshot(collection(db, "asset_movements"), (snapshot) => {
      setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Movimentações"));

    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, handleQuotaError("Usuários"));

    // Pequeno delay para garantir que o loading não pisque muito rápido ou fique preso
    const timer = setTimeout(() => setIsLoading(false), 800);

    return () => {
      unsubProjects();
      unsubCostCenters();
      unsubExpenses();
      unsubAssets();
      unsubBudgets();
      unsubAssetClasses();
      unsubSchedules();
      unsubMovements();
      unsubUsers();
      clearTimeout(timer);
    };
  }, []);

  const getProjectName = (id: string) => projects.find(p => String(p.id) === String(id))?.name || "—";
  const getCostCenterName = (code: string) => {
      const cc = costCenters?.find((c: any) => c.code === code);
      return cc ? `${cc.code} - ${cc.name}` : code || "—";
  };

  const getLocalDateFromISO = (value: any) => {
    if (!value) return new Date();

    if (typeof value.toDate === 'function') {
        const date = value.toDate();
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }

    const isoString = String(value);
    if (isoString.length === 10 && isoString.includes('-')) {
        const [y, m, d] = isoString.split('-').map(Number);
        return new Date(y, m - 1, d);
    }
    const date = new Date(isoString);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  // Capex Metrics
  const totalCapex = expenses?.filter(e => e.type === 'capex').reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const totalOpex = expenses?.filter(e => e.type === 'opex').reduce((acc, curr) => acc + Number(curr.amount), 0) || 0;
  const totalExpenses = totalCapex + totalOpex;
  const capexPercentage = totalExpenses > 0 ? (totalCapex / totalExpenses) * 100 : 0;
  
  // Assets Metrics
  const totalAssetsValue = useMemo(() => {
    if (!assets) return 0;
    return assets.reduce((acc, asset) => {
      const assetExpenses = expenses?.filter(e => String(e.assetId) === String(asset.id)) || [];
      const cost = assetExpenses.reduce((sum, curr) => sum + Number(curr.amount), Number(asset.value || 0));
      return acc + cost;
    }, 0);
  }, [assets, expenses]);

  const assetsInProgress = assets?.filter(a => a.status !== 'concluido').length || 0;
  const assetsCompleted = assets?.filter(a => a.status === 'concluido').length || 0;
  const totalAssets = assets?.length || 0;

  // Inventory Metrics
  const totalSchedules = schedules?.length || 0;
  const completedSchedules = schedules?.filter(s => s.status === 'completed').length || 0;
  const pendingSchedules = schedules?.filter(s => s.status === 'pending').length || 0;
  const waitingApprovalSchedules = schedules?.filter(s => s.status === 'waiting_approval').length || 0;
  const inventoryCompletionRate = totalSchedules > 0 ? (completedSchedules / totalSchedules) * 100 : 0;

  // Asset Classes Metrics (Calculated)
  const assetClassesData = useMemo(() => {
    if (!assets || !expenses || !assetClasses) return [];
    
    const normalize = (str: string) => str?.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";

    const classMap: Record<string, { cost: number; count: number; assets: any[] }> = {};

    assets.forEach((asset: any) => {
      // Calculate Cost (Asset Value + Linked Expenses)
      const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
      const cost = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount), Number(asset.value || 0));

      const assetClassDef = assetClasses.find(c => normalize(c.name) === normalize(asset.assetClass));
      let className = assetClassDef ? assetClassDef.name : (asset.assetClass || "Não Classificado");

      if (asset.status === 'planejamento' || asset.status === 'em_desenvolvimento') {
        className = "Imobilizado em andamento";
      }

      if (!classMap[className]) {
        classMap[className] = { cost: 0, count: 0, assets: [] };
      }

      classMap[className].cost += cost;
      classMap[className].count += 1;
      classMap[className].assets.push({ ...asset, currentCost: cost });
    });

    return Object.entries(classMap)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.cost - a.cost);
  }, [assets, expenses, assetClasses, depreciationType]);

  // Monthly Inventory Chart Data (Current Year)
  const monthlyInventoryData = useMemo(() => {
    if (!schedules) return [];
    const currentYear = new Date().getFullYear();
    const months = Array.from({ length: 12 }, (_, i) => i);

    return months.map(monthIndex => {
      const monthName = new Date(currentYear, monthIndex, 1).toLocaleString('pt-BR', { month: 'short' });
      const monthSchedules = schedules.filter(s => {
        const d = parseDate(s.date);
        return d.getFullYear() === currentYear && d.getMonth() === monthIndex;
      });

      const completed = monthSchedules.filter(s => s.status === 'completed').length;
      const pending = monthSchedules.filter(s => s.status === 'pending' || s.status === 'waiting_approval').length;

      return {
        name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
        completed,
        pending
      };
    });
  }, [schedules]);

  // Budget Control Metrics (FP&A)
  const budgetMetrics = useMemo(() => {
    if (!projects || !expenses || !allBudgets) return null;

    // Helper para obter o orçamento de um projeto, replicando a lógica da página de Budgets
    const getProjectBudget = (project: any) => {
      let plannedValue = Number(project.plannedValue || 0);
      if (plannedValue === 0) {
        const projectBudgets = allBudgets.filter((b: any) => String(b.projectId) === String(project.id));
        plannedValue = projectBudgets.reduce((sum, b) => sum + Number(b.plannedAmount || 0), 0);
      }
      return plannedValue;
    };

    // Considera TODOS os projetos para alinhar com a página de Budgets (que lista tudo)
    const allProjects = projects;
    const allProjectIds = new Set(allProjects.map(p => String(p.id)));
    
    // Garante que apenas despesas de projetos existentes sejam somadas
    const validExpenses = expenses.filter(e => allProjectIds.has(String(e.projectId)));

    const totalBudget = allProjects.reduce((acc, p) => acc + getProjectBudget(p), 0);
    const totalRealized = validExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0);
    const deviation = totalBudget - totalRealized;
    const consumptionPct = totalBudget > 0 ? (totalRealized / totalBudget) * 100 : 0;
    
    // Burn Rate (Average monthly expense of current year)
    const currentYear = new Date().getFullYear();
    const currentYearExpenses = validExpenses.filter(e => parseDate(e.date).getFullYear() === currentYear);
    const monthsElapsed = new Date().getMonth() + 1;
    const burnRate = currentYearExpenses.reduce((acc, e) => acc + Number(e.amount || 0), 0) / monthsElapsed;
    const runRate = burnRate * 12;

    // Cost Center Analysis
    const ccMap: Record<string, { budget: number; realized: number }> = {};
    
    allProjects.forEach(p => {
        const cc = p.costCenter || "Sem CC";
        if (!ccMap[cc]) ccMap[cc] = { budget: 0, realized: 0 };
        ccMap[cc].budget += getProjectBudget(p);
    });

    validExpenses.forEach(e => {
        // Find project for expense to get CC
        const project = allProjects.find(p => String(p.id) === String(e.projectId));
        const cc = project?.costCenter || "Sem CC";
        if (!ccMap[cc]) ccMap[cc] = { budget: 0, realized: 0 };
        ccMap[cc].realized += Number(e.amount || 0);
    });

    const costCenterMetrics = Object.entries(ccMap).map(([name, data]) => {
        const pct = data.budget > 0 ? (data.realized / data.budget) * 100 : 0;
        let status: 'verde' | 'amarelo' | 'vermelho' = 'verde';
        if (pct > 95) status = 'vermelho';
        else if (pct > 80) status = 'amarelo';

        return { name, ...data, pct, status, deviation: data.budget - data.realized };
    }).sort((a, b) => b.realized - a.realized);

    // Monthly Evolution (Budget vs Realized)
    const months = Array.from({ length: 12 }, (_, i) => i);
    
    // Distribuição do orçamento
    const monthlyBudgetMap = new Array(12).fill(0);
    
    allProjects.forEach(p => {
        // Prioriza a distribuição mensal manual se existir
        if (p.monthlyDistribution && Array.isArray(p.monthlyDistribution)) {
             p.monthlyDistribution.forEach((val: any, index: number) => {
                if (index < 12) {
                    monthlyBudgetMap[index] += Number(val || 0);
                }
            });
            return;
        }

        // Fallback: Distribuição linear baseada na duração dos projetos
        const planned = getProjectBudget(p);
        if (planned <= 0) return;

        const start = p.startDate ? parseDate(p.startDate) : new Date();
        // Se não houver data fim, assume fim do ano atual ou +1 ano para projeção
        const end = p.estimatedEndDate ? parseDate(p.estimatedEndDate) : new Date(start.getFullYear() + 1, start.getMonth(), 0);
        
        const currentYearStart = new Date(currentYear, 0, 1);
        const currentYearEnd = new Date(currentYear, 11, 31);

        // Interseção entre a duração do projeto e o ano atual
        const effectiveStart = start < currentYearStart ? currentYearStart : start;
        const effectiveEnd = end > currentYearEnd ? currentYearEnd : end;

        if (effectiveStart > effectiveEnd) return;

        // Calcula valor mensal (distribuição linear durante a vida do projeto)
        const totalMonthsDuration = Math.max(1, (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1);
        const monthlyAmount = planned / totalMonthsDuration;

        const startMonthIndex = effectiveStart.getFullYear() === currentYear ? effectiveStart.getMonth() : 0;
        const endMonthIndex = effectiveEnd.getFullYear() === currentYear ? effectiveEnd.getMonth() : 11;

        for (let i = startMonthIndex; i <= endMonthIndex; i++) {
            monthlyBudgetMap[i] += monthlyAmount;
        }
    });

    const monthlyEvolution = months.map(monthIndex => {
        const monthName = new Date(currentYear, monthIndex, 1).toLocaleString('pt-BR', { month: 'short' });
        const monthRealized = currentYearExpenses
            .filter(e => parseDate(e.date).getMonth() === monthIndex)
            .reduce((acc, e) => acc + Number(e.amount || 0), 0);
        
        return { name: monthName, realized: monthRealized, budget: monthlyBudgetMap[monthIndex] };
    });

    // Projects by Status (Count)
    const statusMap: Record<string, number> = {};
    allProjects.forEach(p => {
        const status = p.status || 'sem_status';
        statusMap[status] = (statusMap[status] || 0) + 1;
    });

    const projectsByStatus = Object.entries(statusMap)
      .map(([name, value]) => ({ name, displayName: name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), value }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);

    return {
        totalBudget, totalRealized, deviation, consumptionPct, burnRate, runRate, costCenters: costCenterMetrics, monthlyEvolution, projectsByStatus
    };
  }, [projects, expenses, allBudgets]);

  // Análise de Movimentações
  const movementAnalysis = useMemo(() => {
    if (!movements.length || !costCenters.length || !assets.length) return null;

    const stats = {
      totalValueMoved: 0,
      transfersCount: 0,
      writeOffsCount: 0,
      pendingApproval: movements.filter(m => m.status === 'pending_approval').length,
      totalMovements: movements.length,
      completed: movements.filter(m => m.status === 'completed').length,
      rejected: movements.filter(m => m.status === 'rejected').length
    };
    
    const getCode = (val: any) => typeof val === 'object' && val ? val.code : val;

    const ccDataMap: Record<string, { 
        name: string, 
        balance: number, // For Saldo Líquido
        inMovements: any[],
        outMovements: any[],
        inCount: number,
        outCount: number,
        entradas: number,
        saidas: number,
        completed: number, // For Volume
        pending: number, // For Volume
        rejected: number, // For Volume
        total: number // For Volume
    }> = {};

    const initCC = (code: string) => {
        if (!code) return;
        if (!ccDataMap[code]) {
            const ccObj = costCenters.find(c => c.code === code);
            ccDataMap[code] = { 
                name: ccObj ? ccObj.name : code, 
                balance: 0,
                inMovements: [],
                outMovements: [],
                inCount: 0,
                outCount: 0,
                entradas: 0,
                saidas: 0,
                completed: 0,
                pending: 0,
                rejected: 0,
                total: 0
            };
        }
    };

    movements.forEach(m => {
      let val = Number(m.value || 0);

      if (val === 0 && assets.length > 0) {
        if (m.isBatch && m.assets) {
            // Sum value of all assets in batch
            val = m.assets.reduce((sum: number, item: any) => {
                const asset = assets.find(a => a.id === item.assetId);
                if (!asset) return sum;
                return sum + getAssetValue(asset, expenses);
            }, 0);
        } else if (m.assetId) {
            const asset = assets.find(a => a.id === m.assetId);
            if (asset) {
                const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
                val = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount), Number(asset.value || 0));
            }
        }
      }

      stats.totalValueMoved += val;
      if (m.movementCategory === 'transfer') stats.transfersCount++;
      if (m.movementCategory === 'write_off' || m.movementCategory === 'partial_write_off') stats.writeOffsCount++;

      const origin = getCode(m.originCostCenter);
      const dest = getCode(m.destinationCostCenter);
      const status = m.status; // pending_approval, completed, rejected
      
      // For financial balance (Saldo Líquido)
      if (status !== 'rejected') {
          if (m.type === 'transfer_cost_center') {
            if (dest) {
                initCC(dest);
                ccDataMap[dest].balance += val;
                ccDataMap[dest].entradas += val;
                ccDataMap[dest].inMovements.push(m);
                ccDataMap[dest].inCount++;
            }
            if (origin) {
                initCC(origin);
                ccDataMap[origin].balance -= val;
                ccDataMap[origin].saidas += val;
                ccDataMap[origin].outMovements.push(m);
                ccDataMap[origin].outCount++;
            }
          } else if (m.movementCategory === 'write_off' || m.movementCategory === 'partial_write_off') {
            if (origin) {
                initCC(origin);
                ccDataMap[origin].balance -= val;
                ccDataMap[origin].saidas += val;
                ccDataMap[origin].outMovements.push(m);
                ccDataMap[origin].outCount++;
            }
          }
      }

      // For volume chart (by status)
      const targetCC = (m.movementCategory === 'transfer' && (status === 'completed' || status === 'pending_approval') && dest) ? dest : origin;
      if (targetCC) {
        initCC(targetCC);
        if (status === 'completed') ccDataMap[targetCC].completed++;
        else if (status === 'pending_approval') ccDataMap[targetCC].pending++;
        else if (status === 'rejected') ccDataMap[targetCC].rejected++;
        ccDataMap[targetCC].total++;
      }
    });

    const performanceData = Object.values(ccDataMap)
      .sort((a, b) => (b.inCount + b.outCount) - (a.inCount + a.outCount))
      .slice(0, 10);

    const recentMovements = [...movements]
        .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())
        .slice(0, 5);

    return { stats, performanceData, recentMovements };
  }, [movements, costCenters, assets, expenses]);

  // Asset Movement Data (Current Year)
  const assetMovementData = useMemo(() => {
    if (!assets || !expenses || !assetClasses) return [];

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1);
    const now = new Date();

    const movementMap: Record<string, { 
      initialCost: number; 
      additions: number; 
      transfers: number;
      writeOffs: number;
    }> = {};
    
    const normalize = (str: string) => str?.toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";

    assets.forEach((asset: any) => {
      // Cost Calculation
      const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
      const totalCost = assetExpenses.reduce((acc, curr) => acc + Number(curr.amount), Number(asset.value || 0));
      
      // Date determination
      const acquisitionDateStr = asset.startDate; 
      const acquisitionDate = getLocalDateFromISO(acquisitionDateStr);
      
      const availabilityDateStr = asset.availabilityDate;
      const availabilityDate = availabilityDateStr ? getLocalDateFromISO(availabilityDateStr) : null;

      const writeOffDateStr = asset.writeOffDate;
      const writeOffDate = writeOffDateStr ? getLocalDateFromISO(writeOffDateStr) : null;

      // Determine if it's a transfer this year (CIP -> Class)
      let isTransfer = false;
      if (asset.status?.toLowerCase() === 'concluido') {
          if (availabilityDate && availabilityDate.getFullYear() === currentYear) {
              isTransfer = true;
          } else if (acquisitionDate >= startOfYear) {
              isTransfer = true;
          }
      }

      // Determine if it's a write-off this year
      let isWriteOff = false;
      if (asset.status?.toLowerCase() === 'baixado' && writeOffDate && writeOffDate.getFullYear() === currentYear) {
          isWriteOff = true;
      }

      const assetClassDef = assetClasses.find(c => normalize(c.name) === normalize(asset.assetClass));
      let className = assetClassDef ? assetClassDef.name : (asset.assetClass || "Não Classificado");

      if (asset.status === 'planejamento' || asset.status === 'em_desenvolvimento' || isTransfer) {
        className = "Imobilizado em andamento";
      }

      if (!movementMap[className]) {
        movementMap[className] = { initialCost: 0, additions: 0, transfers: 0, writeOffs: 0 };
      }
      
      // Cost Movement
      if (acquisitionDate < startOfYear) {
        movementMap[className].initialCost += totalCost;
      } else {
        movementMap[className].additions += totalCost;
      }

      // Handle Transfer
      if (isTransfer) {
          movementMap[className].transfers -= totalCost;
          
          const destClass = asset.assetClass || "Não Classificado";
          if (!movementMap[destClass]) {
             movementMap[destClass] = { initialCost: 0, additions: 0, transfers: 0, writeOffs: 0 };
          }
          movementMap[destClass].transfers += totalCost;
      }

      // Handle Write-Off
      if (isWriteOff) {
          movementMap[className].writeOffs += totalCost;
      }
    });

    return Object.entries(movementMap).map(([name, data]) => ({
      name,
      ...data,
      finalCost: data.initialCost + data.additions + data.transfers - data.writeOffs,
    })).sort((a, b) => b.finalCost - a.finalCost);
  }, [assets, expenses, assetClasses, depreciationType]);

  const assetMovementTotals = useMemo(() => {
    if (!assetMovementData) return null;
    return assetMovementData.reduce((acc, curr) => ({
      initialCost: acc.initialCost + curr.initialCost,
      additions: acc.additions + curr.additions,
      transfers: acc.transfers + curr.transfers,
      writeOffs: acc.writeOffs + curr.writeOffs,
      finalCost: acc.finalCost + curr.finalCost
    }), {
      initialCost: 0,
      additions: 0,
      transfers: 0,
      writeOffs: 0,
      finalCost: 0,
    });
  }, [assetMovementData]);

  const schedulesByCostCenter = useMemo(() => {
    if (!schedules.length || !costCenters.length) return [];

    const ccMap: Record<string, { name: string; completed: number; uncompleted: number }> = {};

    // Initialize map with all cost centers
    costCenters.forEach(cc => {
        ccMap[cc.code] = { name: cc.name || cc.code, completed: 0, uncompleted: 0 };
    });
    ccMap["Sem CC"] = { name: "Sem Centro de Custo", completed: 0, uncompleted: 0 };


    schedules.forEach(schedule => {
        let associatedCCs: string[] = [];
        if (schedule.costCenterCodes && schedule.costCenterCodes.length > 0) {
            associatedCCs = schedule.costCenterCodes;
        } else if (schedule.assetIds && schedule.assetIds.length > 0) {
            // Fallback: get CC from assets if not directly on schedule
            const assetCCs = schedule.assetIds.map((assetId: string) => {
                const asset = assets.find(a => a.id === assetId);
                if (!asset) return null;
                const ccCode = typeof asset.costCenter === 'object' ? asset.costCenter?.code : asset.costCenter;
                return ccCode;
            }).filter(Boolean);
            associatedCCs = [...new Set(assetCCs)]; // Unique CCs from assets
        }

        if (associatedCCs.length === 0) {
            associatedCCs.push("Sem CC");
        }

        associatedCCs.forEach(ccCode => {
            if (!ccMap[ccCode]) {
                 const ccObj = costCenters.find(c => c.code === ccCode);
                 ccMap[ccCode] = { name: ccObj ? ccObj.name : (ccCode === "Sem CC" ? "Sem Centro de Custo" : ccCode), completed: 0, uncompleted: 0 };
            }

            if (schedule.status === 'completed') {
                ccMap[ccCode].completed++;
            } else {
                ccMap[ccCode].uncompleted++;
            }
        });
    });

    return Object.values(ccMap).map(data => {
        const total = data.completed + data.uncompleted;
        const percentage = total > 0 ? (data.completed / total) * 100 : 0;
        return { ...data, total, percentage };
    }).filter(
        data => data.total > 0
    ).sort((a,b) => b.total - a.total);

  }, [schedules, assets, costCenters]);

  const filteredInventoryData = useMemo(() => {
    if (inventoryChartFilter === 'completed') {
      // Mostra apenas CCs que concluíram TUDO (pendentes === 0)
      return schedulesByCostCenter.filter(item => item.uncompleted === 0 && item.completed > 0);
    }
    if (inventoryChartFilter === 'pending') {
      // Mostra apenas CCs que ainda possuem QUALQUER coisa pendente
      return schedulesByCostCenter.filter(item => item.uncompleted > 0);
    }
    return schedulesByCostCenter;
  }, [schedulesByCostCenter, inventoryChartFilter]);

  const renderCustomizedLabel = (props: any) => {
    const { x, y, width, value, payload } = props;

    if (!payload || value === 0) {
      return null;
    }

    const { completed, percentage } = payload;

    return (
      <text x={x + width / 2} y={y} dy={-4} fill="#374151" fontSize={11} fontWeight={500} textAnchor="middle">
        {`${completed}/${value} (${percentage.toFixed(0)}%)`}
      </text>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Button 
          variant="outline" 
          onClick={() => setViewMode(prev => (prev === 'budget' ? 'assets' : 'budget'))}
          className="p-2 h-auto rounded-full transition-all duration-300 hover:shadow-md group border-slate-200 hover:border-blue-300 hover:bg-blue-50/30"
          title="Alternar Visão (Budget -> Ativos)"
        >
          <div className="animate-bounce">
            <img 
              src="/oba.svg" 
              alt="Alternar Visão" 
              className={`w-20 h-20 transition-all duration-700 ease-in-out group-hover:scale-110 ${viewMode !== 'budget' ? 'rotate-[360deg]' : 'rotate-0'}`} 
            />
          </div>
        </Button>
        <h1 className="text-3xl font-bold text-slate-700">
          {viewMode === 'budget' ? 'Dashboard: Controle de Imobilizado em Andamento' : 'Dashboard: Gestão de Ativos'}
        </h1>
      </div>

      {/* Seção Controle de Budget (FP&A) */}
      {viewMode === 'budget' && budgetMetrics && (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-2 bg-emerald-100 rounded-lg">
                    <Target className="w-6 h-6 text-emerald-700" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-slate-700">Controle de Imobilizado em Andamento (Budget)</h2>
                    <p className="text-sm text-slate-500">Visão consolidada de execução e desvios</p>
                </div>
            </div>

            {/* KPIs Principais */}
            <div className="grid md:grid-cols-4 gap-4">
                <Card className="border-l-4 border-l-blue-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Orçamento Total
                            <Wallet className="h-4 w-4 text-blue-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{formatCurrency(budgetMetrics.totalBudget)}</div>
                        <p className="text-sm text-muted-foreground mt-1">Planejado para o período</p>
                    </CardContent>
                </Card>
                <Card className={`border-l-4 shadow-sm py-3 gap-1 ${budgetMetrics.consumptionPct > 95 ? 'border-l-red-500' : budgetMetrics.consumptionPct > 80 ? 'border-l-yellow-500' : 'border-l-green-500'}`}>
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Realizado Acumulado
                            <Activity className="h-4 w-4 text-slate-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{formatCurrency(budgetMetrics.totalRealized)}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div 
                                    className={`h-full ${budgetMetrics.consumptionPct > 100 ? 'bg-red-500' : 'bg-blue-600'}`} 
                                    style={{ width: `${Math.min(budgetMetrics.consumptionPct, 100)}%` }} 
                                />
                            </div>
                            <span className={`text-sm font-bold ${budgetMetrics.consumptionPct > 95 ? 'text-red-600' : 'text-slate-600'}`}>
                                {budgetMetrics.consumptionPct.toFixed(1)}%
                            </span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Saldo Disponível
                            <TrendingDown className="h-4 w-4 text-purple-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold ${budgetMetrics.deviation < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(budgetMetrics.deviation)}
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                            {budgetMetrics.deviation < 0 ? 'Orçamento estourado' : 'Dentro do limite'}
                        </p>
                    </CardContent>
                </Card>
                <Card 
                    className="border-l-4 border-l-orange-500 shadow-sm py-3 gap-1 cursor-pointer hover:bg-slate-50 transition-colors"
                    onClick={() => setShowBurnRateDetails(!showBurnRateDetails)}
                >
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Taxa de Queimação (Projeção)
                            <TrendingUp className="h-4 w-4 text-orange-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{formatCurrency(budgetMetrics.runRate)}</div>
                        <p className="text-sm text-muted-foreground mt-1">Baseado no Taxa de Queimação mensal de {formatCurrency(budgetMetrics.burnRate)}</p>
                        {showBurnRateDetails && (
                            <div className="mt-4 pt-3 border-t border-orange-100 animate-in fade-in slide-in-from-top-2">
                                <div className="space-y-3">
                                    <div>
                                        <p className="text-xs font-semibold text-slate-700">Fórmula (Run Rate):</p>
                                        <code className="text-[10px] bg-slate-100 p-1 rounded block mt-1 text-slate-600">
                                            (Gasto YTD / Meses Decorridos) × 12
                                        </code>
                                    </div>
                                    
                                    {budgetMetrics.runRate > budgetMetrics.totalBudget ? (
                                        <div className="p-2 bg-red-50 text-red-700 rounded text-xs border border-red-100 flex gap-2 items-start">
                                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Alerta de Desvio</p>
                                                <p>Projeção excede o orçamento de {formatCurrency(budgetMetrics.totalBudget)}.</p>
                                                <p className="mt-1 font-medium border-t border-red-200 pt-1">
                                                    Ideal: Manter média mensal abaixo de {formatCurrency(budgetMetrics.totalBudget / 12)}.
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-2 bg-emerald-50 text-emerald-700 rounded text-xs border border-emerald-100 flex gap-2 items-start">
                                            <Target className="w-4 h-4 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="font-semibold">Dentro da Meta</p>
                                                <p>Projeção compatível com o orçamento total.</p>
                                                <p className="mt-1 font-medium border-t border-emerald-200 pt-1">
                                                    Teto Mensal: {formatCurrency(budgetMetrics.totalBudget / 12)}
                                                </p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Gráfico de Evolução Mensal */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-700">Execução Orçamentária Mensal (Planejado vs Realizado)</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart
                                    data={budgetMetrics.monthlyEvolution}
                                    margin={{
                                        top: 60,
                                        right: 30,
                                        left: 20,
                                        bottom: 5,
                                    }}
                                >
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis 
                                        dataKey="name" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#64748b', fontSize: 14 }} 
                                    />
                                    <YAxis 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fill: '#64748b', fontSize: 14 }} 
                                        tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { notation: "compact", compactDisplay: "short" }).format(value)} 
                                    />
                                    <RechartsTooltip
                                        cursor={{ fill: '#f1f5f9' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: number) => formatCurrency(value)}
                                    />
                                    <Legend 
                                        wrapperStyle={{ paddingTop: '20px' }}
                                        payload={[
                                            { value: 'Planejado', type: 'rect', color: '#cbd5e1' },
                                            { value: 'Realizado', type: 'rect', color: '#3b82f6' },
                                            { value: 'Acima do Budget', type: 'rect', color: '#ef4444' }
                                        ]}
                                    />
                                    <Bar dataKey="budget" name="Planejado" fill="#cbd5e1" radius={[4, 4, 0, 0]}>
                                        <LabelList 
                                            dataKey="budget" 
                                            position="top" 
                                            formatter={(value: number) => value > 0 ? formatCurrencyCompact(value) : ''} 
                                            style={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }} 
                                        />
                                    </Bar>
                                    <Bar dataKey="realized" name="Realizado" radius={[4, 4, 0, 0]}>
                                        {budgetMetrics.monthlyEvolution.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.realized > entry.budget ? '#ef4444' : '#3b82f6'} />
                                        ))}
                                        <LabelList 
                                            dataKey="realized" 
                                            position="top" 
                                            formatter={(value: number) => value > 0 ? formatCurrencyCompact(value) : ''} 
                                            style={{ fill: '#475569', fontSize: 11, fontWeight: 700 }} 
                                        />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Gráfico de Orçamento por Status */}
                <Card className="md:col-span-1">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-700">Obras por Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[350px] w-full relative">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={budgetMetrics.projectsByStatus}
                                        cx="50%"
                                        cy="45%"
                                        innerRadius={80}
                                        outerRadius={110}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={({ value }) => value}
                                    >
                                        {budgetMetrics.projectsByStatus.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.name] || '#94a3b8'} />
                                        ))}
                                    </Pie>
                                    <RechartsTooltip 
                                        formatter={(value: number) => value}
                                        contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0' }}
                                    />
                                    <Legend layout="horizontal" verticalAlign="bottom" align="center" formatter={(value, entry: any) => <span className="text-sm text-slate-600 ml-1">{budgetMetrics.projectsByStatus.find(i => i.name === value)?.displayName || value}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute top-[45%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center bg-white/90 w-24 h-24 rounded-full shadow-sm border border-slate-100 pointer-events-none z-10">
                                <span className="text-4xl font-bold text-slate-700">{projects?.length || 0}</span>
                                <span className="text-sm text-slate-500 font-medium uppercase">Obras</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* Tabela de Centros de Custo */}
                <Card className="md:col-span-1 overflow-hidden flex flex-col">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-semibold text-slate-700">Performance por Centro de Custo</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-auto p-0 max-h-[450px]">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="text-base">Centro de Custo</TableHead>
                                    <TableHead className="text-base text-right">Consumo</TableHead>
                                    <TableHead className="text-base text-center">Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {budgetMetrics.costCenters.map((cc) => (
                                    <TableRow key={cc.name}>
                                        <TableCell className="font-medium">{getCostCenterName(cc.name)}</TableCell>
                                        <TableCell className="text-base text-right">{cc.pct.toFixed(0)}%</TableCell>
                                        <TableCell className="text-center">
                                            <div className={`w-3 h-3 rounded-full mx-auto ${cc.status === 'verde' ? 'bg-green-500' : cc.status === 'amarelo' ? 'bg-yellow-400' : 'bg-red-500'}`} title={cc.status} />
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
        </div>
      )}

      {/* Seção Imobilizado */}
      {viewMode === 'assets' && (
      <div className="space-y-4 animate-in fade-in duration-500">
        <div className="flex items-center justify-between">
            <div 
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setIsAssetsExpanded(!isAssetsExpanded)}
            >
                {isAssetsExpanded ? <ChevronDown className="h-6 w-6 text-slate-600" /> : <ChevronRight className="h-6 w-6 text-slate-600" />}
                <div className="p-2 bg-orange-100 rounded-lg">
                    <Package className="w-6 h-6 text-orange-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-700">Gestão do Imobilizado (Ativos)</h2>
            </div>
        </div>

        {isAssetsExpanded && (
        <>
        <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                    <Card className="bg-gradient-to-br from-white to-slate-50 py-3 gap-1 shadow-sm">
                        <CardHeader className="pb-0">
                            <CardTitle className="text-base font-medium text-slate-500">Valor Total em Ativos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="text-3xl font-bold text-slate-800">{formatCurrency(totalAssetsValue)}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-sm px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium flex items-center">
                                    <ArrowUpRight className="w-3 h-3 mr-1" /> Ativos
                                </span>
                            </div>
                        </CardContent>
                    </Card>

                    <Card 
                        className="py-3 gap-1 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors"
                        onClick={() => setShowAssetsModal(true)}
                    >
                        <CardHeader className="pb-0">
                            <CardTitle className="text-base font-medium text-slate-500">Status dos Ativos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex justify-between items-end mb-2">
                                <div>
                                    <span className="text-3xl font-bold text-slate-700">{totalAssets}</span>
                                    <span className="text-sm text-muted-foreground ml-2">Total</span>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between text-base">
                                    <span className="text-slate-600">Concluídos</span>
                                    <span className="font-medium">
                                        {assetsCompleted} <span className="text-muted-foreground">({totalAssets > 0 ? ((assetsCompleted/totalAssets)*100).toFixed(1) : 0}%)</span>
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-green-500 h-full" style={{ width: `${totalAssets > 0 ? (assetsCompleted/totalAssets)*100 : 0}%` }} />
                                </div>
                                <div className="flex justify-between text-base">
                                    <span className="text-slate-600">Em Andamento</span>
                                    <span className="font-medium">
                                        {assetsInProgress} <span className="text-muted-foreground">({totalAssets > 0 ? ((assetsInProgress/totalAssets)*100).toFixed(1) : 0}%)</span>
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                                    <div className="bg-yellow-500 h-full" style={{ width: `${totalAssets > 0 ? (assetsInProgress/totalAssets)*100 : 0}%` }} />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-lg font-semibold text-slate-700">Inventário Mensal ({new Date().getFullYear()})</CardTitle>
                        <div className="bg-white/50 backdrop-blur-sm px-3 py-1 rounded flex gap-4 text-right">
                            <div>
                                <p className="text-[10px] text-orange-600 font-bold uppercase">Pendente</p>
                                <p className="text-lg font-bold text-orange-600">{monthlyInventoryData.reduce((acc, item) => acc + item.pending, 0)}</p>
                            </div>
                            <div>
                                <p className="text-[10px] text-green-600 font-bold uppercase">Realizado</p>
                                <p className="text-lg font-bold text-green-600">{monthlyInventoryData.reduce((acc, item) => acc + item.completed, 0)}</p>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[300px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyInventoryData} margin={{ top: 25, right: 10, left: 10, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                    <RechartsTooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Legend iconType="circle" wrapperStyle={{ paddingTop: 20 }} />
                                    <Bar dataKey="pending" name="Pendente" fill="#f97316" radius={[4, 4, 0, 0]}>
                                        <LabelList dataKey="pending" position="top" formatter={(v: number) => v > 0 ? v : ''} style={{ fill: '#f97316', fontSize: 10 }} />
                                    </Bar>
                                    <Bar dataKey="completed" name="Realizado" fill="#22c55e" radius={[4, 4, 0, 0]}>
                                        <LabelList dataKey="completed" position="top" formatter={(v: number) => v > 0 ? v : ''} style={{ fill: '#22c55e', fontSize: 10, fontWeight: 'bold' }} />
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="md:col-span-1">
            <Card className="h-full flex flex-col">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-slate-700">Distribuição por Classe (Custo)</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[350px]">
                    <div className="h-full w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={assetClassesData.slice(0, 6)}>
                                <PolarGrid stroke="#cbd5e1" />
                                <PolarAngleAxis dataKey="name" tick={{ fill: '#475569', fontSize: 16, fontWeight: 500 }} tickFormatter={(val) => val.toLowerCase() === 'imobilizado em andamento' ? 'Andamento' : val.split(' ')[0]} />
                                <PolarRadiusAxis angle={30} domain={[0, 'auto']} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={(value) => new Intl.NumberFormat('pt-BR', { notation: "compact" }).format(value)} />
                                <Radar name="Custo" dataKey="cost" stroke="#09c357" fill="#09c357" fillOpacity={0.7} />
                                <RechartsTooltip 
                                    formatter={(value: number) => formatCurrency(value)}
                                    contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    itemStyle={{ color: '#ea580c', fontWeight: 600 }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </CardContent>
            </Card>
            </div>
        </div>
        </>
        )}

        {/* Seção de Tabelas */}
        <div className="space-y-6">
            <div 
                className="flex items-center gap-2 cursor-pointer select-none" 
                onClick={() => setIsTablesExpanded(!isTablesExpanded)}
            >
                {isTablesExpanded ? <ChevronDown className="h-6 w-6 text-slate-600" /> : <ChevronRight className="h-6 w-6 text-slate-600" />}
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-teal-100 rounded-lg">
                        <FileText className="w-6 h-6 text-teal-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-700">Relatórios Detalhados</h2>
                </div>
            </div>
            {isTablesExpanded && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
        {/* Quadro de Movimentação */}
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-lg font-semibold text-slate-700">Quadro de Movimentação do Imobilizado (YTD)</CardTitle>
            </CardHeader>
            <CardContent>
                <div className="rounded-md border overflow-x-auto">
                    <Table className="text-base">
                        <TableHeader>
                            <TableRow>
                                <TableHead className="text-base">Classe</TableHead>
                                <TableHead className="text-right text-base">Saldo Inicial (Custo)</TableHead>
                                <TableHead className="text-right text-base">Adições</TableHead>
                                <TableHead className="text-right text-base">Transf.</TableHead>
                                <TableHead className="text-right text-base">Baixas</TableHead>
                                <TableHead className="text-right text-base">Saldo Final (Custo)</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {assetMovementData.map((item) => (
                                <TableRow key={item.name}>
                                    <TableCell className="font-medium whitespace-nowrap">{item.name}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(item.initialCost)}</TableCell>
                                    <TableCell className="text-right text-blue-600">+{formatCurrency(item.additions)}</TableCell>
                                    <TableCell className="text-right text-orange-600">{item.transfers !== 0 ? formatCurrency(item.transfers) : '-'}</TableCell>
                                    <TableCell className="text-right text-red-600">{item.writeOffs > 0 ? `-${formatCurrency(item.writeOffs)}` : '-'}</TableCell>
                                    <TableCell className="text-right font-medium">{formatCurrency(item.finalCost)}</TableCell>
                                </TableRow>
                            ))}
                            {assetMovementData.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={10} className="text-center py-6 text-muted-foreground">
                                        Nenhum dado de movimentação disponível.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                        {assetMovementTotals && (
                            <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200">
                                <TableRow>
                                    <TableCell>TOTAL GERAL</TableCell>
                                    <TableCell className="text-right">{formatCurrency(assetMovementTotals.initialCost)}</TableCell>
                                    <TableCell className="text-right text-blue-600">+{formatCurrency(assetMovementTotals.additions)}</TableCell>
                                    <TableCell className="text-right text-orange-600">{formatCurrency(assetMovementTotals.transfers)}</TableCell>
                                    <TableCell className="text-right text-red-600">-{formatCurrency(assetMovementTotals.writeOffs)}</TableCell>
                                    <TableCell className="text-right">{formatCurrency(assetMovementTotals.finalCost)}</TableCell>
                                </TableRow>
                            </tfoot>
                        )}
                    </Table>
                </div>
            </CardContent>
        </Card>
            </div>
            )}
        </div>

        {/* Seção de Movimentações e Performance */}
        <div className="space-y-6">
            <div 
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setIsMovementsExpanded(!isMovementsExpanded)}
            >
                {isMovementsExpanded ? <ChevronDown className="h-6 w-6 text-slate-600" /> : <ChevronRight className="h-6 w-6 text-slate-600" />}
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                        <ArrowRightLeft className="w-6 h-6 text-indigo-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-700">Análise de Movimentações e Performance</h2>
                </div>
            </div>

            {isMovementsExpanded && movementAnalysis && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <div className="grid md:grid-cols-4 gap-4">
                    <Card className="border-l-4 border-l-indigo-500 shadow-sm py-3">
                        <CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Valor Total Movimentado</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold text-slate-800">{formatCurrency(movementAnalysis.stats.totalValueMoved)}</div></CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-blue-500 shadow-sm py-3">
                        <CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Transferências</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold text-slate-800">{movementAnalysis.stats.transfersCount}</div></CardContent>
                    </Card>
                    <Card className="border-l-4 border-l-red-500 shadow-sm py-3">
                        <CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Baixas Realizadas</CardTitle></CardHeader>
                        <CardContent><div className="text-2xl font-bold text-slate-800">{movementAnalysis.stats.writeOffsCount}</div></CardContent>
                    </Card>
                    <Card className={`border-l-4 shadow-sm py-3 ${movementAnalysis.stats.pendingApproval > 0 ? 'border-l-orange-500 bg-orange-50' : 'border-l-green-500'}`}>
                        <CardHeader className="pb-0"><CardTitle className="text-sm font-medium text-slate-500 uppercase tracking-wider">Aprovações Pendentes</CardTitle></CardHeader>
                        <CardContent><div className={`text-2xl font-bold ${movementAnalysis.stats.pendingApproval > 0 ? 'text-orange-600' : 'text-green-600'}`}>{movementAnalysis.stats.pendingApproval}</div></CardContent>
                    </Card>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    <Card>
                        <CardHeader><CardTitle className="text-lg font-semibold text-slate-700">Movimentação de Ativos por Centro de Custo (Quantidade)</CardTitle></CardHeader>
                        <CardContent>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart 
                                        data={movementAnalysis.performanceData} 
                                        margin={{ top: 30, right: 30, left: 20, bottom: 90 }}
                                        onClick={(e) => {
                                            if (e && e.activePayload && e.activePayload.length > 0) {
                                                setDepreciationModalData(e.activePayload[0].payload);
                                            }
                                        }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis 
                                            dataKey="name" 
                                            angle={-45} 
                                            textAnchor="end" 
                                            interval={0} 
                                            tick={{ fill: '#64748b', fontSize: 11 }} 
                                            height={100} 
                                        />
                                        <YAxis tick={{ fontSize: 10, fill: '#64748b' }} allowDecimals={false} />
                                        <RechartsTooltip formatter={(val: number) => `${val} movimentações`} />
                                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                                        <Line 
                                            type="monotone" 
                                            dataKey="inCount" 
                                            name="Entradas" 
                                            stroke="#22c55e" 
                                            strokeWidth={2} 
                                            dot={{ r: 4, fill: "#22c55e", cursor: 'pointer' }}
                                            activeDot={{ r: 6 }}
                                        >
                                            <LabelList dataKey="inCount" position="top" offset={10} formatter={(val: number) => val > 0 ? val : ''} style={{ fontSize: 11, fontWeight: 600, fill: '#166534' }} />
                                        </Line>
                                        <Line 
                                            type="monotone" 
                                            dataKey="outCount" 
                                            name="Saídas/Baixas" 
                                            stroke="#ef4444" 
                                            strokeWidth={2} 
                                            dot={{ r: 4, fill: "#ef4444", cursor: 'pointer' }}
                                            activeDot={{ r: 6 }}
                                        >
                                            <LabelList dataKey="outCount" position="bottom" offset={10} formatter={(val: number) => val > 0 ? val : ''} style={{ fontSize: 11, fontWeight: 600, fill: '#991b1b' }} />
                                        </Line>
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-4 italic text-center">
                                * Mostra a quantidade de ativos que entraram e saíram de cada centro de custo.
                            </p>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                            <CardTitle className="text-lg font-semibold text-slate-700">Volume de Movimentações por Status (Top 10 CCs)</CardTitle>
                            <div className="relative h-20 w-20">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Concluídas', value: movementAnalysis.stats.completed, fill: '#22c55e' },
                                                { name: 'Pendentes', value: movementAnalysis.stats.pending, fill: '#f97316' },
                                                { name: 'Rejeitadas', value: movementAnalysis.stats.rejected, fill: '#ef4444' }
                                            ].filter(d => d.value > 0)}
                                            innerRadius={25}
                                            outerRadius={35}
                                            paddingAngle={2}
                                            dataKey="value"
                                            stroke="none"
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-sm font-bold text-slate-700 leading-none">{movementAnalysis.stats.totalMovements}</span>
                                    <span className="text-[8px] text-slate-400 font-medium uppercase">Total</span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={movementAnalysis.performanceData}
                                        margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis 
                                            dataKey="name" 
                                            angle={-45} 
                                            textAnchor="end" 
                                            interval={0} 
                                            tick={{ fill: '#64748b', fontSize: 11 }} 
                                            height={80}
                                        />
                                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#64748b', fontSize: 12 }} allowDecimals={false} />
                                        <RechartsTooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                                        <Bar dataKey="completed" name="Concluídas" stackId="a" fill="#22c55e" />
                                        <Bar dataKey="pending" name="Pendentes" stackId="a" fill="#f97316" />
                                        <Bar dataKey="rejected" name="Rejeitadas" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]}>
                                            <LabelList dataKey="total" position="top" style={{ fill: '#64748b', fontSize: 12 }} />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card className="mt-6">
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold text-slate-700">Movimentações Recentes</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Data</TableHead>
                                    <TableHead>Ativo</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Origem</TableHead>
                                    <TableHead>Destino</TableHead>
                                    <TableHead>Status</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {movementAnalysis.recentMovements.map(m => {
                                    const origin = m.originProjectId ? `Obra: ${getProjectName(m.originProjectId)}` : m.originCostCenter ? `CC: ${getCostCenterName(m.originCostCenter)}` : "-";
                                    let destination = "-";
                                    if (m.type === "transfer_project") destination = `Obra: ${getProjectName(m.destinationProjectId)}`;
                                    else if (m.type === "transfer_cost_center") destination = `CC: ${getCostCenterName(m.destinationCostCenter)}`;
                                    else if (m.movementCategory?.includes("write_off")) destination = "Baixa";

                                    return (
                                        <TableRow key={m.id}>
                                            <TableCell>{parseDate(m.date).toLocaleDateString('pt-BR')}</TableCell>
                                            <TableCell>
                                                <div className="font-medium">{m.isBatch ? `${m.assets?.length || 0} Ativos (Lote)` : m.assetName}</div>
                                                <div className="text-xs text-muted-foreground">{m.isBatch ? "-" : m.assetNumber}</div>
                                            </TableCell>
                                            <TableCell>{MOVEMENT_TYPES.find(t => t.value === m.type)?.label || m.type}</TableCell>
                                            <TableCell>{origin}</TableCell>
                                            <TableCell>{destination}</TableCell>
                                            <TableCell>
                                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                                    m.status === 'completed' ? 'bg-green-100 text-green-800' :
                                                    m.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
                                                    m.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                    'bg-gray-100 text-gray-800'
                                                }`}>
                                                    {statusLabels[m.status] || m.status}
                                                </span>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>
            </div>
            )}
        </div>

      <Dialog open={!!depreciationModalData} onOpenChange={() => setDepreciationModalData(null)}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Análise de Movimentação - {depreciationModalData?.name}</DialogTitle>
            <DialogDescription>Detalhes de depreciação e valores para os ativos movimentados neste centro de custo.</DialogDescription>
          </DialogHeader>
          {depreciationModalData && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
              <div className="col-span-1">
                <h4 className="font-semibold mb-2">Fluxo de Valor (R$)</h4>
                <div className="h-[250px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[{ name: 'Fluxo', Entradas: depreciationModalData.entradas, Saídas: depreciationModalData.saidas }]}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="name" />
                      <YAxis tickFormatter={(val) => new Intl.NumberFormat('pt-BR', { notation: "compact" }).format(val)} />
                      <RechartsTooltip formatter={(val: number) => formatCurrency(val)} />
                      <Legend />
                      <Bar dataKey="Entradas" fill="#22c55e" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="Entradas" position="top" formatter={(val: number) => val > 0 ? formatCurrencyCompact(val) : ''} style={{ fontSize: 11, fill: '#166534' }} />
                      </Bar>
                      <Bar dataKey="Saídas" fill="#ef4444" radius={[4, 4, 0, 0]}>
                        <LabelList dataKey="Saídas" position="top" formatter={(val: number) => val > 0 ? formatCurrencyCompact(val) : ''} style={{ fontSize: 11, fill: '#991b1b' }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="col-span-1 md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold">Ativos Movimentados</h4>
                </div>
                
                <div className="h-[250px] overflow-y-auto border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ativo</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Aprovador</TableHead>
                        <TableHead className="text-right">Data</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {[...(depreciationModalData.inMovements || []), ...(depreciationModalData.outMovements || [])]
                        .sort((a, b) => parseDate(b.createdAt).getTime() - parseDate(a.createdAt).getTime())
                        .map((movement: any, index: number) => {
                        const asset = assets.find(a => a.id === movement.assetId);
                        const isEntrada = depreciationModalData.inMovements.some((m: any) => m.id === movement.id);
                        
                        return (
                          <TableRow key={movement.id || index}>
                            <TableCell>
                              <div className="font-medium">{asset?.name || movement.assetName}</div>
                              <div className="text-xs text-muted-foreground">{asset?.assetNumber || movement.assetNumber}</div>
                            </TableCell>
                            <TableCell>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${isEntrada ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {isEntrada ? 'Entrada' : 'Saída'}
                                </span>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{movement.approvedBy || movement.rejectedBy || 'N/A'}</TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">{parseDate(movement.approvedAt || movement.rejectedAt || movement.createdAt).toLocaleDateString('pt-BR')}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

        {/* Seção de Dados de Inventário */}
        <div className="space-y-6">
            <div 
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setIsInventoryDataExpanded(!isInventoryDataExpanded)}
            >
                {isInventoryDataExpanded ? <ChevronDown className="h-6 w-6 text-slate-600" /> : <ChevronRight className="h-6 w-6 text-slate-600" />}
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-100 rounded-lg">
                        <ClipboardList className="w-6 h-6 text-blue-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-700">Dados de Inventário</h2>
                </div>
            </div>
            
            {isInventoryDataExpanded && (
            <div className="grid md:grid-cols-4 gap-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <Card className="border-l-4 border-l-blue-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Total Agendamentos
                            <Calendar className="h-4 w-4 text-blue-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{totalSchedules}</div>
                        <p className="text-sm text-muted-foreground mt-1">Ciclos registrados</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Concluídos
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{completedSchedules}</div>
                        <div className="flex items-center gap-2 mt-1">
                            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-green-500" style={{ width: `${inventoryCompletionRate}%` }} />
                            </div>
                            <span className="text-sm font-bold text-green-600">{inventoryCompletionRate.toFixed(0)}%</span>
                        </div>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-orange-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Pendentes
                            <Clock className="h-4 w-4 text-orange-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{pendingSchedules}</div>
                        <p className="text-sm text-muted-foreground mt-1">Aguardando execução</p>
                    </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500 shadow-sm py-3 gap-1">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base font-medium text-slate-500 flex justify-between">
                            Em Aprovação
                            <Activity className="h-4 w-4 text-purple-500" />
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-800">{waitingApprovalSchedules}</div>
                        <p className="text-sm text-muted-foreground mt-1">Aguardando validação</p>
                    </CardContent>
                </Card>
            </div>
            )}
        </div>

        {/* Seção de Análise de Cronograma e Agendamentos */}
        <div className="space-y-6">
            <div 
                className="flex items-center gap-2 cursor-pointer select-none"
                onClick={() => setIsScheduleAnalysisExpanded(!isScheduleAnalysisExpanded)}
            >
                {isScheduleAnalysisExpanded ? <ChevronDown className="h-6 w-6 text-slate-600" /> : <ChevronRight className="h-6 w-6 text-slate-600" />}
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-purple-100 rounded-lg">
                        <Calendar className="w-6 h-6 text-purple-600" />
                    </div>
                    <h2 className="text-xl font-semibold text-slate-700">Análise de Cronograma e Agendamentos</h2>
                </div>
            </div>

            {isScheduleAnalysisExpanded && (
            <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-300">
                <Card>
                    <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-lg font-semibold text-slate-700">Inventários por Centro de Custo</CardTitle>
                            <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-8 w-8 text-slate-400 hover:text-blue-600 transition-colors"
                                onClick={() => setIsInventoryChartFullscreen(true)}
                                title="Expandir gráfico"
                            >
                                <Maximize2 className="h-4 w-4" />
                            </Button>
                        </div>
                        <div className="flex items-center bg-slate-100 p-1 rounded-md">
                            <button
                                onClick={() => setInventoryChartFilter('all')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-sm transition-all ${inventoryChartFilter === 'all' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Todos
                            </button>
                            <button
                                onClick={() => setInventoryChartFilter('completed')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-sm transition-all ${inventoryChartFilter === 'completed' ? 'bg-white text-green-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Concluídos
                            </button>
                            <button
                                onClick={() => setInventoryChartFilter('pending')}
                                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-sm transition-all ${inventoryChartFilter === 'pending' ? 'bg-white text-orange-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                Pendentes
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <div className="h-[400px] w-full overflow-x-auto pb-4 custom-scrollbar">
                            <div style={{ minWidth: Math.max(800, filteredInventoryData.length * 80), height: '100%' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart
                                        data={filteredInventoryData}
                                        margin={{ top: 40, right: 30, left: 20, bottom: 60 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                        <XAxis 
                                            dataKey="name" 
                                            angle={-45} 
                                            textAnchor="end" 
                                            interval={0} 
                                            tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} 
                                            height={100} 
                                        />
                                        <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                                        <RechartsTooltip
                                            cursor={{ fill: '#f1f5f9' }}
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                            labelFormatter={(label) => <span className="font-bold text-blue-700">{label}</span>}
                                        />
                                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: 20 }}/>
                                        
                                    {(inventoryChartFilter === 'all' || inventoryChartFilter === 'completed') && (
                                        <Bar dataKey="completed" name="Concluídos" stackId={inventoryChartFilter === 'all' ? "a" : undefined} fill="#22c55e" barSize={40} radius={inventoryChartFilter === 'completed' ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                                             {inventoryChartFilter === 'completed' && <LabelList dataKey="completed" position="top" style={{ fontSize: 11, fill: '#166534', fontWeight: 'bold' }} />}
                                        </Bar>
                                    )}
                                    {(inventoryChartFilter === 'all' || inventoryChartFilter === 'pending') && (
                                        <Bar dataKey="uncompleted" name="Pendentes" stackId={inventoryChartFilter === 'all' ? "a" : undefined} fill="#d1d5db" barSize={40} radius={[4, 4, 0, 0]}>
                                            {inventoryChartFilter === 'all' ? (
                                                <LabelList
                                                    dataKey="total"
                                                    content={renderCustomizedLabel}
                                                />
                                            ) : (
                                                <LabelList dataKey="uncompleted" position="top" style={{ fontSize: 11, fill: '#475569', fontWeight: 'bold' }} />
                                            )}
                                        </Bar>
                                    )}
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </CardContent>
                </Card>


            {/* Propostas de Cronograma */}
            <Card className="bg-slate-50 border-slate-200">
                <CardHeader className="pb-2">
                    <CardTitle className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                        <Clock className="h-5 w-5 text-slate-500" />
                        Sugestões de Cronograma (Ativos não verificados há +1 ano)
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-2">
                        {(() => {
                            const oneYearAgo = new Date();
                            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
                            
                            const outdatedAssets = assets?.filter(a => {
                                // Considera concluídos e que não estão em agendamentos pendentes
                                if (a.status !== 'concluido') return false;
                                const isScheduled = schedules.some(s => s.status !== 'completed' && s.assetIds.includes(a.id));
                                if (isScheduled) return false;

                                // Verifica última data de inventário
                                const lastInventory = schedules
                                    .filter(s => s.status === 'completed' && s.assetIds.includes(a.id))
                                    .sort((a, b) => parseDate(b.date).getTime() - parseDate(a.date).getTime())[0];
                                
                                if (!lastInventory) return true; // Nunca inventariado
                                return parseDate(lastInventory.date) < oneYearAgo;
                            }) || [];

                            if (outdatedAssets.length === 0) {
                                return <p className="text-sm text-slate-500 italic">Nenhum ativo requer atenção imediata.</p>;
                            }

                            // Agrupa por Centro de Custo para sugestão
                            const assetsByCC = outdatedAssets.reduce((acc, asset) => {
                                const cc = typeof asset.costCenter === 'object' ? (asset.costCenter as any).code : asset.costCenter || "Sem CC";
                                if (!acc[cc]) acc[cc] = [];
                                acc[cc].push(asset);
                                return acc;
                            }, {} as Record<string, any[]>);

                            const suggestions = Object.entries(assetsByCC)
                            .sort((a, b) => b[1].length - a[1].length)
                            .slice(0, 3); // Top 3 sugestões

                            return (
                                <div className="grid md:grid-cols-3 gap-4">
                                    {suggestions.map(([cc, assetsInCC]) => (
                                        <div key={cc} className="bg-white p-3 rounded border border-slate-200 shadow-sm flex justify-between items-center">
                                            <div>
                                                <p className="font-medium text-slate-700">{getCostCenterName(cc)}</p>
                                                <p className="text-xs text-slate-500">{assetsInCC.length} ativos pendentes</p>
                                            </div>
                                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleAutoSchedule(cc, assetsInCC)}>
                                                Agendar
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            );
                        })()}
                    </div>
                </CardContent>
            </Card>
            </div>
            )}
        </div>

        {/* Modal de Detalhes dos Ativos em Andamento */}
        {showAssetsModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
                    <div className="p-4 border-b flex items-center justify-between bg-slate-50">
                        <h3 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                            <Activity className="w-5 h-5 text-yellow-600" />
                            Ativos em Andamento
                        </h3>
                        <Button variant="ghost" size="sm" onClick={() => setShowAssetsModal(false)} className="h-8 w-8 p-0 rounded-full">
                            <X className="w-5 h-5 text-slate-500" />
                        </Button>
                    </div>
                    <div className="flex-1 overflow-auto p-0">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Nome do Ativo</TableHead>
                                    <TableHead>Obra</TableHead>
                                    <TableHead>Classe</TableHead>
                                    <TableHead>Início</TableHead>
                                    <TableHead className="text-right">Valor Atual (Custo)</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {assets.filter(a => a.status !== 'concluido').map((asset) => {
                                    const assetExpenses = expenses.filter(e => String(e.assetId) === String(asset.id));
                                    const currentCost = assetExpenses.reduce((sum, curr) => sum + Number(curr.amount), Number(asset.value || 0));
                                    
                                    let projectName = '-';
                                    if (asset.projectId) {
                                        const p = projects.find(p => String(p.id) === String(asset.projectId));
                                        if (p) projectName = p.name;
                                    } else if (assetExpenses.length > 0) {
                                        const p = projects.find(p => String(p.id) === String(assetExpenses[0].projectId));
                                        if (p) projectName = p.name;
                                    }

                                    return (
                                        <TableRow key={asset.id}>
                                            <TableCell className="font-medium">{asset.name}</TableCell>
                                            <TableCell className="text-slate-600">{projectName}</TableCell>
                                            <TableCell>{asset.assetClass || '-'}</TableCell>
                                            <TableCell>{asset.startDate ? new Date(asset.startDate).toLocaleDateString('pt-BR') : '-'}</TableCell>
                                            <TableCell className="text-right font-semibold text-slate-700">{formatCurrency(currentCost)}</TableCell>
                                        </TableRow>
                                    );
                                })}
                                {assets.filter(a => a.status !== 'concluido').length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            Nenhum ativo em andamento no momento.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <div className="p-4 border-t bg-slate-50 flex justify-end">
                        <Button onClick={() => setShowAssetsModal(false)}>Fechar</Button>
                    </div>
                </div>
            </div>
        )}

      {/* Modal para Gráfico em Tela Cheia */}
      <Dialog open={isInventoryChartFullscreen} onOpenChange={setIsInventoryChartFullscreen}>
        <DialogContent className="max-w-[98vw] w-[98vw] h-[95vh] flex flex-col p-6 overflow-hidden bg-white/95 backdrop-blur-md border-slate-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-6 gap-4">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-slate-800">Inventários por Centro de Custo - Visão Detalhada</DialogTitle>
              <DialogDescription className="text-base text-slate-500">Controle de conformidade física por unidade de negócio.</DialogDescription>
            </DialogHeader>
            <div className="flex items-center bg-slate-100 p-1 rounded-md mr-12 border shadow-inner">
              {['all', 'completed', 'pending'].map(f => (
                <button key={f} onClick={() => setInventoryChartFilter(f as any)} className={`px-6 py-2 text-xs font-bold uppercase rounded-sm transition-all ${inventoryChartFilter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                  {f === 'all' ? 'Todos' : f === 'completed' ? 'Concluídos' : 'Pendentes'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 w-full bg-white rounded-xl border p-4 shadow-inner overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={filteredInventoryData}
                margin={{ top: 20, right: 30, left: 20, bottom: 120 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  angle={-45} 
                  textAnchor="end" 
                  interval={0} 
                  tick={{ fill: '#64748b', fontSize: 12, fontWeight: 500 }} 
                  height={120} 
                />
                <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 14 }} />
                <RechartsTooltip
                    cursor={{ fill: '#f1f5f9' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    labelFormatter={(label) => <span className="font-bold text-blue-700">{label}</span>}
                />
                <Legend verticalAlign="top" align="right" height={36}/>
                <Bar dataKey="completed" name="Concluídos" stackId="a" fill="#22c55e" />
                <Bar dataKey="uncompleted" name="Pendentes" stackId="a" fill="#d1d5db" radius={[4, 4, 0, 0]}>
                    {inventoryChartFilter === 'all' && (
                        <LabelList
                            dataKey="total"
                            content={renderCustomizedLabel}
                        />
                    )}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={() => setIsInventoryChartFullscreen(false)}>Fechar</Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
      )}

    </div>
  );
}
