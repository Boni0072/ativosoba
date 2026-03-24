import { useState, useEffect, useMemo } from 'react';
import { db } from "@/lib/firebase";
import { getFirestore, doc, onSnapshot, updateDoc, collection } from 'firebase/firestore';
import { useAuth } from '@/_core/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, Bell, CheckCircle2, XCircle, Eye, Check, ArrowRightLeft, ClipboardList, FileText, Send, Mail, Mailbox } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from 'wouter';
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogClose } from "@/components/ui/dialog";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default function NotificationsPage() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const [projects, setProjects] = useState<any[]>([]);
  const [schedules, setSchedules] = useState<any[]>([]);
  const [dbSchedules, setDbSchedules] = useState<any[]>([]); // Estado separado
  const [movements, setMovements] = useState<any[]>([]);
  const [costCenters, setCostCenters] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [rejectionDialog, setRejectionDialog] = useState<{open: boolean, projectId: string | null}>({open: false, projectId: null});
  const [rejectionReason, setRejectionReason] = useState("");
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Estado para forçar atualização quando os mocks mudam
  const [mockUpdateTrigger, setMockUpdateTrigger] = useState(0);

  useEffect(() => {
    const handler = () => setMockUpdateTrigger(prev => prev + 1);
    window.addEventListener("local-mock-update", handler);
    return () => window.removeEventListener("local-mock-update", handler);
  }, []);

  // Data fetching
  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "projects"), (snapshot) => setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    
    // Busca apenas dados reais do banco
    const unsubSchedules = onSnapshot(collection(db, "inventory_schedules"), (snapshot) => {
      setDbSchedules(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubMovements = onSnapshot(collection(db, "asset_movements"), (snapshot) => setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubCostCenters = onSnapshot(collection(db, "cost_centers"), (snapshot) => setCostCenters(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    const unsubUsers = onSnapshot(collection(db, "users"), (snapshot) => setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
    
    const timer = setTimeout(() => setIsLoading(false), 500);

    return () => {
      unsubProjects();
      unsubSchedules();
      unsubMovements();
      unsubCostCenters();
      unsubUsers();
      clearTimeout(timer);
    };
  }, []); // Remove dependências instáveis daqui

  // Efeito dedicado para combinar DB + Mocks
  useEffect(() => {
      // Garante que o usuário veja notificações mesmo sem dados no banco (Modo Demo/Frontend-Only)
      const currentUserId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;
      
      // LÊ O ESTADO DOS MOCKS DO LOCALSTORAGE
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
          createdAt: new Date().toISOString()
        }
      ] : [];

      // APLICA FILTROS E STATUS ATUALIZADOS
      const mockSchedules = mockSchedulesRaw.map(s => {
          if (statusOverrides[s.id]) {
              return { ...s, status: statusOverrides[s.id] };
          }
          return s;
      }).filter(s => !processedMocks.includes(s.id));

      setSchedules([...dbSchedules, ...mockSchedules]);
  }, [dbSchedules, user, mockUpdateTrigger]); // Recalcula sempre que DB ou Mock mudar

  // Memoized pending items
  const userId = (user as any)?.id || (user as any)?.openId || (user as any)?.uid || (user as any)?.sub;
  const userRole = (user as any)?.role;

  const approvalSteps = [
    { id: 'aguardando_classificacao', label: 'Classificação', requiredRole: 'classificacao' },
    { id: 'aguardando_engenharia', label: 'Engenharia', requiredRole: 'engenharia' },
    { id: 'aguardando_diretoria', label: 'Diretoria', requiredRole: 'diretoria' },
    { id: 'aprovado', label: 'Aprovado', requiredRole: null }
  ];

  const pendingProjectApprovals = useMemo(() => {
    if (!projects || !user) return [];
    const pendingStatuses = ['aguardando_classificacao', 'aguardando_engenharia', 'aguardando_diretoria'];
    return projects.filter(p => {
        if (!userRole) return false;
        if (!pendingStatuses.includes(p.status)) return false;

        if (userRole === 'admin' || userRole === 'diretoria') return true;

        const currentStep = approvalSteps.find(s => s.id === p.status);
        return currentStep && userRole === currentStep.requiredRole;
    });
  }, [projects, user, userRole]);

  const myPendingSchedules = useMemo(() => schedules.filter(s => 
    s.status === 'pending' && userId && s.userIds && s.userIds.map(String).includes(String(userId))
  ), [schedules, userId]);

  const pendingInventoryApprovals = useMemo(() => schedules.filter(s => 
    s.status === 'waiting_approval' && (
      userRole === 'admin' || 
      userRole === 'diretoria' ||
      (s.requesterId && String(s.requesterId) === String(userId))
    )
  ), [schedules, userId, userRole]);

  const pendingMovementApprovals = useMemo(() => {
    if (!userId || !costCenters.length || !user) return [];
    return movements.filter(mov => {
        if (mov.status !== 'pending_approval' || mov.type !== 'transfer_cost_center') return false;
        
        // Admin/Diretoria can approve any movement
        if (userRole === 'admin' || userRole === 'diretoria') return true;

        const destCC = costCenters.find(cc => cc.code === mov.destinationCostCenter);
        if (destCC) {
            return destCC.responsible === user.name || destCC.responsibleEmail === user.email;
        }
        return false;
    });
  }, [movements, costCenters, user, userId, userRole]);

  // --- Email Notification Logic ---
  const allPendingProjectApprovals = useMemo(() => {
    if (!projects) return [];
    const pendingStatuses = ['aguardando_classificacao', 'aguardando_engenharia', 'aguardando_diretoria'];
    return projects.filter(p => pendingStatuses.includes(p.status));
  }, [projects]);

  const allPendingSchedules = useMemo(() => schedules.filter(s => s.status === 'pending'), [schedules]);
  const allPendingInventoryApprovals = useMemo(() => schedules.filter(s => s.status === 'waiting_approval'), [schedules]);
  const allPendingMovementApprovals = useMemo(() => movements.filter(mov => mov.status === 'pending_approval' && mov.type === 'transfer_cost_center'), [movements]);

  const notificationsByUser = useMemo(() => {
    const groups: Record<string, { userName: string; userEmail: string; tasks: any[] }> = {};

    const findUserById = (id: string) => users.find(u => u.id === id);
    const findUserByName = (name: string) => users.find(u => u.name === name);
    const findUserByEmail = (email: string) => users.find(u => u.email === email);

    const addToGroup = (userKey: string, userObject: { name: string, email: string } | undefined, task: any) => {
        if (!userKey || !userObject || !userObject.name) return;

        if (!groups[userKey]) {
            groups[userKey] = {
                userName: userObject.name,
                userEmail: userObject.email || '',
                tasks: []
            };
        }
        groups[userKey].tasks.push(task);
    };

    allPendingProjectApprovals.forEach(project => {
        const step = approvalSteps.find(s => s.id === project.status);
        if (!step || !step.requiredRole) return;
        const responsibleUsers = users.filter(u => u.role === step.requiredRole || u.role === 'diretoria' || u.role === 'admin');
        responsibleUsers.forEach(u => addToGroup(u.id, u, { ...project, type: 'project_approval' }));
    });

    allPendingSchedules.forEach(schedule => {
        schedule.userIds.forEach((uid: string) => {
            const userAccount = findUserById(uid);
            if (userAccount) addToGroup(userAccount.id, userAccount, { ...schedule, type: 'inventory_execution' });
        });
    });

    allPendingInventoryApprovals.forEach(schedule => {
        if (schedule.requesterId) {
            const userAccount = findUserById(schedule.requesterId);
            if (userAccount) addToGroup(userAccount.id, userAccount, { ...schedule, type: 'inventory_approval' });
        }
        users.filter(u => u.role === 'admin').forEach(admin => addToGroup(admin.id, admin, { ...schedule, type: 'inventory_approval' }));
    });

    allPendingMovementApprovals.forEach(movement => {
        const destCC = costCenters.find(cc => cc.code === movement.destinationCostCenter);
        if (destCC) {
            let userAccount;
            if (destCC.responsibleEmail) userAccount = findUserByEmail(destCC.responsibleEmail);
            if (!userAccount && destCC.responsible) userAccount = findUserByName(destCC.responsible);
            if (userAccount) addToGroup(userAccount.id, userAccount, { ...movement, type: 'movement_approval' });
        }
        users.filter(u => u.role === 'admin' || u.role === 'diretoria').forEach(u => addToGroup(u.id, u, { ...movement, type: 'movement_approval' }));
    });

    Object.values(groups).forEach(group => {
        group.tasks = Array.from(new Map(group.tasks.map(item => [item.id, item])).values());
    });

    return Object.values(groups).sort((a, b) => a.userName.localeCompare(b.userName));
  }, [allPendingProjectApprovals, allPendingSchedules, allPendingInventoryApprovals, allPendingMovementApprovals, users, costCenters]);

  const handleSendToUser = (userGroup: any) => {
    const recipient = userGroup.userEmail || '';
    if (!recipient && !window.confirm(`O responsável ${userGroup.userName} não possui e-mail. Deseja abrir o rascunho sem destinatário?`)) return;

    const taskTypes = {
      project_approval: (p: any) => `- Obra: ${p.name} (Status: ${p.status.replace(/_/g, ' ')})`,
      movement_approval: (m: any) => {
          if (m.isBatch || (m.assets && m.assets.length > 1)) {
              return `- Lote: ${m.assets.length} ativos para o CC ${m.destinationCostCenter}`;
          }
          return `- Ativo: ${m.assetName} (${m.assetNumber}) para o CC ${m.destinationCostCenter}`;
      },
      inventory_execution: (s: any) => `- Inventário para ${s.date?.toDate ? s.date.toDate().toLocaleDateString('pt-BR') : s.date} com ${s.assetIds.length} ativos`,
      inventory_approval: (s: any) => `- Inventário realizado em ${s.date?.toDate ? s.date.toDate().toLocaleDateString('pt-BR') : s.date} com ${s.results?.length || 0} ativos`,
    };

    const taskHeaders = {
      project_approval: "APROVAÇÕES DE OBRAS",
      movement_approval: "APROVAÇÕES DE MOVIMENTAÇÃO",
      inventory_execution: "INVENTÁRIOS PARA EXECUTAR",
      inventory_approval: "APROVAÇÕES DE INVENTÁRIO",
    };

    let corpoEmail = `Olá ${userGroup.userName},\n\nIdentificamos ${userGroup.tasks.length} pendências no Sistema de Gestão de Obras aguardando sua regularização:\n\n`;
    Object.entries(taskHeaders).forEach(([type, header]) => {
      const tasks = userGroup.tasks.filter((t: any) => t.type === type);
      if (tasks.length > 0) {
        corpoEmail += `➡️ ${header} (${tasks.length}):\n`;
        tasks.forEach((task: any) => corpoEmail += `${(taskTypes as any)[type](task)}\n`);
        corpoEmail += '\n';
      }
    });

    corpoEmail += `\nSolicitamos a gentileza de acessar o sistema para realizar as tratativas necessárias.\n\nLink: ${window.location.origin}/notifications\n\nAtenciosamente,\nGestão de Ativos`;
    const subject = encodeURIComponent(`Cobrança de Pendências - ${userGroup.tasks.length} item(ns)`);
    const body = encodeURIComponent(corpoEmail);
    window.location.href = `mailto:${recipient}?subject=${subject}&body=${body}`;
  };

  // Handlers
  const handleApproveProject = async (project: any) => {
    const currentStepIndex = approvalSteps.findIndex(s => s.id === project.status);
    if (currentStepIndex === -1 || currentStepIndex >= approvalSteps.length - 1) return;
    
    const nextStep = approvalSteps[currentStepIndex + 1];
    
    try {
        const historyEntry = {
            status: nextStep.id,
            date: new Date().toISOString(),
            user: user?.name || "Usuário",
            role: (user as any)?.role || "",
            notes: "Aprovado via Central de Notificações"
        };
        const newHistory = [...(project.approvalHistory || []), historyEntry];
        await updateDoc(doc(db, "projects", project.id), {
            status: nextStep.id,
            approvalHistory: newHistory,
            updatedAt: new Date().toISOString()
        });
        toast.success(`Projeto ${project.name} aprovado para ${nextStep.label}!`);
    } catch (error) {
        toast.error("Erro ao aprovar projeto.");
    }
  };

  const handleRejectProject = async () => {
    if (!rejectionDialog.projectId || !rejectionReason) return;
    
    try {
        const project = projects.find(p => p.id === rejectionDialog.projectId);
        const historyEntry = {
            status: 'rejeitado',
            date: new Date().toISOString(),
            user: user?.name || "Usuário",
            role: (user as any)?.role || "",
            notes: rejectionReason
        };
        const newHistory = [...(project?.approvalHistory || []), historyEntry];
        await updateDoc(doc(db, "projects", rejectionDialog.projectId), {
            status: 'rejeitado',
            notes: rejectionReason,
            approvalHistory: newHistory,
            updatedAt: new Date().toISOString()
        });
        toast.success("Projeto rejeitado.");
        setRejectionDialog({open: false, projectId: null});
        setRejectionReason("");
    } catch (error) {
        toast.error("Erro ao rejeitar projeto.");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const totalNotifications = pendingProjectApprovals.length + myPendingSchedules.length + pendingInventoryApprovals.length + pendingMovementApprovals.length;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Bell className="h-8 w-8 text-slate-700" />
          <h1 className="text-3xl font-bold text-slate-700">
            Central de Notificações ({totalNotifications})
          </h1>
        </div>
        {(userRole === 'admin' || userRole === 'diretoria') && (
          <Button onClick={() => setShowEmailModal(true)}>
            <Mail className="mr-2 h-4 w-4" /> Enviar Cobrança
          </Button>
        )}
      </div>

      {totalNotifications === 0 && (
        <Card className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 mb-4" />
          <p className="text-lg text-muted-foreground">Você está em dia! Nenhuma ação pendente.</p>
        </Card>
      )}

      {/* Project Approvals */}
      {pendingProjectApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <FileText size={20} />
              Aprovações de Obras Pendentes ({pendingProjectApprovals.length})
            </CardTitle>
            <CardDescription>As seguintes obras aguardam sua análise e aprovação para prosseguir no fluxo.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {pendingProjectApprovals.map(project => (
              <div key={project.id} className="bg-white p-4 rounded-lg border shadow-sm flex flex-col md:flex-row justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-slate-800">{project.name}</h3>
                    <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-800 rounded-full font-medium capitalize">
                      {project.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm bg-slate-50 p-3 rounded-md border border-slate-100">
                    <div>
                      <span className="text-xs text-slate-500 block font-medium uppercase">Capex</span>
                      <span className="font-mono font-medium text-slate-700">{formatCurrency(Number(project.plannedCapex || 0))}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block font-medium uppercase">Opex</span>
                      <span className="font-mono font-medium text-slate-700">{formatCurrency(Number(project.plannedOpex || 0))}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block font-medium uppercase">Valor Planejado</span>
                      <span className="font-mono font-bold text-blue-600">{formatCurrency(Number(project.plannedValue || 0))}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end md:self-center">
                  <Button variant="outline" size="sm" className="text-red-600 hover:bg-red-50 border-red-200" onClick={() => setRejectionDialog({open: true, projectId: project.id})}>
                    <XCircle className="w-4 h-4 mr-1" /> Rejeitar
                  </Button>
                  <Button variant="outline" size="sm" className="text-slate-600" onClick={() => setLocation('/projects')}>
                    <Eye className="w-4 h-4 mr-1" /> Visualizar
                  </Button>
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => handleApproveProject(project)}>
                    <Check className="w-4 h-4 mr-1" /> Aprovar
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Inventory Schedules */}
      {myPendingSchedules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-700">
              <ClipboardList size={20} />
              Inventários para Executar ({myPendingSchedules.length})
            </CardTitle>
            <CardDescription>Você foi designado para realizar a contagem física dos seguintes inventários.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {myPendingSchedules.map(schedule => (
              <div key={schedule.id} className="flex items-center justify-between bg-white p-3 rounded-md border shadow-sm">
                <div>
                  <p className="text-base font-medium text-slate-700">Agendado para: {new Date(schedule.date).toLocaleDateString('pt-BR')}</p>
                  <p className="text-sm text-slate-500">{schedule.assetIds.length} ativos para conferir</p>
                  {schedule.notes && <p className="text-sm text-slate-500 italic mt-1">"{schedule.notes}"</p>}
                </div>
                <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => setLocation(`/inventory?schedule=${schedule.id}`)}>
                  <Check className="w-4 h-4 mr-2" /> Iniciar Contagem
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Inventory Approvals */}
      {pendingInventoryApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-700">
              <CheckCircle2 size={20} />
              Aprovações de Inventário ({pendingInventoryApprovals.length})
            </CardTitle>
            <CardDescription>Os seguintes inventários foram concluídos e aguardam sua aprovação.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingInventoryApprovals.map(schedule => (
              <div key={schedule.id} className="flex items-center justify-between bg-white p-3 rounded-md border shadow-sm">
                <div>
                  <p className="text-base font-medium text-slate-700">Realizado em: {new Date(schedule.date).toLocaleDateString('pt-BR')}</p>
                  <p className="text-sm text-slate-500">{schedule.results?.length || 0} ativos verificados</p>
                </div>
                <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white" onClick={() => setLocation(`/inventory?schedule=${schedule.id}`)}>
                  <Eye className="w-4 h-4 mr-2" /> Verificar na Página
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Asset Movement Approvals */}
      {pendingMovementApprovals.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-cyan-700">
              <ArrowRightLeft size={20} />
              Aprovações de Movimentação de Ativos ({pendingMovementApprovals.length})
            </CardTitle>
            <CardDescription>Ativos foram transferidos para um centro de custo sob sua responsabilidade e aguardam seu aceite.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {pendingMovementApprovals.map(movement => (
              <div key={movement.id} className="flex items-center justify-between bg-white p-3 rounded-md border shadow-sm">
                <div>
                  <p className="text-base font-medium text-slate-700">Ativo: {movement.assetName} ({movement.assetNumber})</p>
                  <p className="text-sm text-slate-500">Transferido para: {movement.destinationCostCenter}</p>
                </div>
                <Button size="sm" className="bg-cyan-600 hover:bg-cyan-700 text-white" onClick={() => setLocation('/asset-movements')}>
                  <Eye className="w-4 h-4 mr-2" /> Verificar na Página
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Rejection Dialog */}
      <Dialog open={rejectionDialog.open} onOpenChange={(open) => !open && setRejectionDialog({open: false, projectId: null})}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar Projeto</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição para o solicitante.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea placeholder="Motivo da rejeição..." value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectionDialog({open: false, projectId: null})}>Cancelar</Button>
            <Button variant="destructive" onClick={handleRejectProject}>Confirmar Rejeição</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Modal */}
      <Dialog open={showEmailModal} onOpenChange={setShowEmailModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-6 w-6 text-slate-700" />
              Central de Notificação por E-mail
            </DialogTitle>
            <DialogDescription>
              Envie alertas por e-mail para os responsáveis com pendências no sistema.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-1 -m-1">
            {notificationsByUser.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center text-slate-500">
                <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-lg">Tudo em ordem!</p>
                <p>Nenhum responsável com pendências encontrado.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {notificationsByUser.map((group, idx) => (
                  <Card key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 hover:shadow-md transition-shadow">
                    <div className="flex-1">
                      <h4 className="font-bold text-slate-800">{group.userName}</h4>
                      <p className="text-sm text-slate-500 mb-2">{group.userEmail || 'Sem e-mail cadastrado'}</p>
                      <div className="flex gap-2 text-xs">
                        <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded border border-blue-100">
                          {group.tasks.length} pendência(s)
                        </span>
                      </div>
                    </div>
                    <Button
                      onClick={() => handleSendToUser(group)}
                      className={`flex items-center gap-2 transition-colors ${
                        group.userEmail 
                          ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm' 
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                      }`}
                      title={group.userEmail ? `Enviar para ${group.userEmail}` : 'Abrir rascunho (sem e-mail cadastrado)'}
                    >
                      <Mail className="w-4 h-4" />
                      Enviar Cobrança
                    </Button>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="pt-4 border-t">
            <DialogClose asChild>
              <Button variant="outline">Fechar</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}