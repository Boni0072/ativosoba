import { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, addDoc, deleteDoc, doc, query, where } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, Edit2 } from "lucide-react";
import { toast } from "sonner";

interface BudgetItemForm {
  description: string;
  amount: string;
  type: "capex" | "opex";
  accountingClass: string;
  assetClass: string;
  notes: string;
}

export default function BudgetsPageNew() {
  const [projects, setProjects] = useState<any[]>([]);
  const [budgets, setBudgets] = useState<any[]>([]);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedBudgetId, setSelectedBudgetId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "projects"), (snap) => {
        setProjects(snap.docs.map(d => ({id: d.id, ...d.data()})));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if(selectedProjectId) {
        setIsLoading(true);
        const q = query(collection(db, "budgets"), where("projectId", "==", String(selectedProjectId)));
        const unsub = onSnapshot(q, (snap) => {
            setBudgets(snap.docs.map(d => ({id: d.id, ...d.data()})));
            setIsLoading(false);
        });
        return () => unsub();
    } else {
        setBudgets([]);
    }
  }, [selectedProjectId]);

  useEffect(() => {
    if(selectedBudgetId) {
        const q = query(collection(db, "budget_items"), where("budgetId", "==", String(selectedBudgetId)));
        const unsub = onSnapshot(q, (snap) => {
            setBudgetItems(snap.docs.map(d => ({id: d.id, ...d.data()})));
        });
        return () => unsub();
    } else {
        setBudgetItems([]);
    }
  }, [selectedBudgetId]);

  const [isCreatingBudget, setIsCreatingBudget] = useState(false);
  const [isCreatingItem, setIsCreatingItem] = useState(false);
  const [isDeletingItem, setIsDeletingItem] = useState(false);
  
  const [openBudgetDialog, setOpenBudgetDialog] = useState(false);
  const [openItemDialog, setOpenItemDialog] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ name: "", description: "", plannedAmount: "" });
  const [itemForm, setItemForm] = useState<BudgetItemForm>({
    description: "",
    amount: "",
    type: "capex",
    accountingClass: "",
    assetClass: "",
    notes: "",
  });

  const handleCreateBudget = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProjectId) {
      toast.error("Selecione uma obra");
      return;
    }
    try {
      setIsCreatingBudget(true);
      await addDoc(collection(db, "budgets"), {
        projectId: selectedProjectId,
        name: budgetForm.name,
        description: budgetForm.description || undefined,
        plannedAmount: budgetForm.plannedAmount,
        createdAt: new Date().toISOString()
      });
      toast.success("Budget criado com sucesso!");
      setBudgetForm({ name: "", description: "", plannedAmount: "" });
      setOpenBudgetDialog(false);
    } catch (error) {
      toast.error("Erro ao criar budget");
    } finally {
      setIsCreatingBudget(false);
    }
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBudgetId) {
      toast.error("Selecione um budget");
      return;
    }
    try {
      setIsCreatingItem(true);
      await addDoc(collection(db, "budget_items"), {
        budgetId: selectedBudgetId,
        description: itemForm.description,
        amount: itemForm.amount,
        type: itemForm.type,
        accountingClass: itemForm.accountingClass || undefined,
        assetClass: itemForm.assetClass || undefined,
        notes: itemForm.notes || undefined,
        createdAt: new Date().toISOString()
      });
      toast.success("Item adicionado com sucesso!");
      setItemForm({
        description: "",
        amount: "",
        type: "capex",
        accountingClass: "",
        assetClass: "",
        notes: "",
      });
      setOpenItemDialog(false);
    } catch (error) {
      toast.error("Erro ao adicionar item");
    } finally {
        setIsCreatingItem(false);
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      setIsDeletingItem(true);
      await deleteDoc(doc(db, "budget_items", id));
      toast.success("Item deletado com sucesso!");
    } catch (error) {
      toast.error("Erro ao deletar item");
    } finally {
        setIsDeletingItem(false);
    }
  };

  const totalPlanned = budgetItems?.reduce((sum, item) => sum + Number(item.amount), 0) || 0;
  const totalCapex = budgetItems?.filter(i => i.type === "capex").reduce((sum, item) => sum + Number(item.amount), 0) || 0;
  const totalOpex = budgetItems?.filter(i => i.type === "opex").reduce((sum, item) => sum + Number(item.amount), 0) || 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Budgets</h1>
        <Dialog open={openBudgetDialog} onOpenChange={setOpenBudgetDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus size={20} />
              Novo Budget
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Criar Novo Budget</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateBudget} className="space-y-4">
              <div>
                <label className="text-sm font-medium">Obra</label>
                <Select value={selectedProjectId || ""} onValueChange={(v) => setSelectedProjectId(v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Nome do Budget</label>
                <Input
                  required
                  value={budgetForm.name}
                  onChange={(e) => setBudgetForm({ ...budgetForm, name: e.target.value })}
                  placeholder="Ex: Budget Q1 2026"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Textarea
                  value={budgetForm.description}
                  onChange={(e) => setBudgetForm({ ...budgetForm, description: e.target.value })}
                  placeholder="Descrição do budget..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Valor Planejado (R$)</label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={budgetForm.plannedAmount}
                  onChange={(e) => setBudgetForm({ ...budgetForm, plannedAmount: e.target.value })}
                  placeholder="0,00"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isCreatingBudget}>
                {isCreatingBudget ? "Criando..." : "Criar Budget"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Project Selection */}
      <Card className="p-6">
        <label className="text-sm font-medium">Selecione uma Obra</label>
        <Select value={selectedProjectId || ""} onValueChange={(v) => setSelectedProjectId(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma obra" />
          </SelectTrigger>
          <SelectContent>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={String(p.id)}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {/* Budgets List */}
      {selectedProjectId && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="animate-spin" />
            </div>
          ) : budgets && budgets.length > 0 ? (
            budgets.map((budget) => (
              <Card key={budget.id} className="p-6">
                <div className="mb-4">
                  <h3 className="text-lg font-semibold text-foreground mb-1">{budget.name}</h3>
                  <p className="text-sm text-gray-600">{budget.description}</p>
                </div>

                {selectedBudgetId === budget.id && (
                  <div className="space-y-4">
                    {/* Summary Stats */}
                    <div className="grid md:grid-cols-4 gap-4 mb-6 p-4 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-xs text-gray-500">Total Planejado</p>
                        <p className="font-semibold text-foreground">R$ {totalPlanned.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Capex</p>
                        <p className="font-semibold text-blue-600">R$ {totalCapex.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Opex</p>
                        <p className="font-semibold text-orange-600">R$ {totalOpex.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                      <div>
                        <Dialog open={openItemDialog} onOpenChange={setOpenItemDialog}>
                          <DialogTrigger asChild>
                            <Button size="sm" className="w-full gap-2">
                              <Plus size={16} />
                              Adicionar Item
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Adicionar Item ao Budget</DialogTitle>
                            </DialogHeader>
                            <form onSubmit={handleAddItem} className="space-y-4">
                              <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">Descrição</label>
                                  <Input
                                    required
                                    value={itemForm.description}
                                    onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                                    placeholder="Ex: Compra de materiais"
                                  />
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Valor (R$)</label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    required
                                    value={itemForm.amount}
                                    onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })}
                                    placeholder="0,00"
                                  />
                                </div>
                              </div>

                              <div className="grid md:grid-cols-2 gap-4">
                                <div>
                                  <label className="text-sm font-medium">Classificação</label>
                                  <Select value={itemForm.type} onValueChange={(v: any) => setItemForm({ ...itemForm, type: v })}>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="capex">Capex (Capital)</SelectItem>
                                      <SelectItem value="opex">Opex (Operacional)</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <label className="text-sm font-medium">Classe Contábil</label>
                                  <Input
                                    value={itemForm.accountingClass}
                                    onChange={(e) => setItemForm({ ...itemForm, accountingClass: e.target.value })}
                                    placeholder="Ex: 1.1.1.01"
                                  />
                                </div>
                              </div>

                              <div>
                                <label className="text-sm font-medium">Classe do Imobilizado</label>
                                <Input
                                  value={itemForm.assetClass}
                                  onChange={(e) => setItemForm({ ...itemForm, assetClass: e.target.value })}
                                  placeholder="Ex: Máquinas e Equipamentos"
                                />
                              </div>

                              <div>
                                <label className="text-sm font-medium">Notas</label>
                                <Textarea
                                  value={itemForm.notes}
                                  onChange={(e) => setItemForm({ ...itemForm, notes: e.target.value })}
                                  placeholder="Observações adicionais..."
                                />
                              </div>

                              <Button type="submit" className="w-full" disabled={isCreatingItem}>
                                {isCreatingItem ? "Adicionando..." : "Adicionar Item"}
                              </Button>
                            </form>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </div>

                    {/* Items Table */}
                    {budgetItems && budgetItems.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 px-2">Descrição</th>
                              <th className="text-right py-2 px-2">Valor</th>
                              <th className="text-center py-2 px-2">Tipo</th>
                              <th className="text-left py-2 px-2">Classe Contábil</th>
                              <th className="text-left py-2 px-2">Imobilizado</th>
                              <th className="text-center py-2 px-2">Ação</th>
                            </tr>
                          </thead>
                          <tbody>
                            {budgetItems.map((item) => (
                              <tr key={item.id} className="border-b hover:bg-slate-50">
                                <td className="py-3 px-2">{item.description}</td>
                                <td className="text-right py-3 px-2 font-semibold">R$ {Number(item.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                <td className="text-center py-3 px-2">
                                  <span className={`px-2 py-1 rounded text-xs font-semibold ${item.type === 'capex' ? 'bg-blue-100 text-blue-800' : 'bg-orange-100 text-orange-800'}`}>
                                    {item.type.toUpperCase()}
                                  </span>
                                </td>
                                <td className="py-3 px-2 text-gray-600">{item.accountingClass || "—"}</td>
                                <td className="py-3 px-2 text-gray-600">{item.assetClass || "—"}</td>
                                <td className="text-center py-3 px-2">
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="text-red-600 hover:text-red-700 transition"
                                    disabled={isDeletingItem}
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        Nenhum item adicionado. Clique em "Adicionar Item" para começar.
                      </div>
                    )}
                  </div>
                )}

                {selectedBudgetId !== budget.id && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setSelectedBudgetId(String(budget.id))}
                  >
                    Ver Itens
                  </Button>
                )}
              </Card>
            ))
          ) : (
            <Card className="p-12 text-center">
              <p className="text-gray-500">Nenhum budget criado para esta obra.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
