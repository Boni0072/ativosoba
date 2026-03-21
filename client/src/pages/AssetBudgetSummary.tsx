import React, { useState, useEffect } from "react";
import { db } from "@/lib/firebase";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2 } from "lucide-react";

// Helper for currency formatting
const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default function AssetBudgetSummary({ asset }: { asset: any }) {
  const [budgets, setBudgets] = useState<any[]>([]);
  const [budgetItems, setBudgetItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (asset.projectId) {
      const q = query(collection(db, "budgets"), where("projectId", "==", String(asset.projectId)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setBudgets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      setIsLoading(false);
    }
  }, [asset.projectId]);

  const assetBudget = budgets?.find(
    (b) =>
      (b.name && b.name.includes(asset.name)) ||
      (asset.assetNumber && b.name && b.name.includes(asset.assetNumber)) ||
      (b.description && b.description.includes(asset.name)) ||
      (asset.assetNumber && b.description && b.description.includes(asset.assetNumber))
  );

  useEffect(() => {
    if (assetBudget?.id) {
      const q = query(collection(db, "budget_items"), where("budgetId", "==", String(assetBudget.id)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        setBudgetItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      });
      return () => unsubscribe();
    }
  }, [assetBudget]);

  const totalBudgetItems =
    budgetItems?.reduce((acc: number, curr: any) => acc + parseFloat(curr.amount || "0"), 0) || 0;

  if (isLoading) {
    return <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="space-y-6 pt-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4 bg-slate-50">
          <p className="text-sm text-muted-foreground">Total Acumulado (Composição)</p>
          <p className="text-2xl font-bold text-blue-700">{formatCurrency(totalBudgetItems)}</p>
        </Card>
        <Card className="p-4 bg-slate-50 border-dashed">
          <p className="text-sm text-muted-foreground">Orçamento Planejado</p>
          <p className="text-2xl font-bold">{formatCurrency(assetBudget?.plannedAmount ? Number(assetBudget.plannedAmount) : 0)}</p>
        </Card>
      </div>

      {/* Realized Details Section */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Detalhamento da Composição</h3>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead>Classe Contábil</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {budgetItems && budgetItems.length > 0 ? (
                budgetItems.map((item: any) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.description}</TableCell>
                    <TableCell>{item.accountingClass || "-"}</TableCell>
                    <TableCell>{item.notes || "-"}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(Number(item.amount))}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    Nenhum item de orçamento compõe este ativo.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <tfoot className="bg-slate-50 font-bold">
              <TableRow>
                <TableCell colSpan={3} className="text-right">Total Acumulado</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(totalBudgetItems)}
                </TableCell>
              </TableRow>
            </tfoot>
          </Table>
        </div>
      </div>
    </div>
  );
}