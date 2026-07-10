import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Search, DollarSign, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);

export default function CapexReportPage() {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const q = query(collection(db, "expenses"), where("type", "==", "capex"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setExpenses(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubProjects = onSnapshot(collection(db, "projects"), (snapshot) => {
      setProjects(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    const unsubAssets = onSnapshot(collection(db, "assets"), (snapshot) => {
      setAssets(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
    return () => {
      unsubProjects();
      unsubAssets();
    };
  }, []);

  const getProjectName = (projectId: string) => projects.find(p => p.id === projectId)?.name || "N/A";
  const getAssetName = (assetId: string) => assets.find(a => a.id === assetId)?.name || "N/A";

  const filteredExpenses = useMemo(() => {
    if (!searchTerm) return expenses;
    const s = searchTerm.toLowerCase();
    return expenses.filter(exp => 
      (exp.description || "").toLowerCase().includes(s) ||
      getProjectName(exp.projectId).toLowerCase().includes(s) ||
      (exp.assetId && getAssetName(exp.assetId).toLowerCase().includes(s))
    );
  }, [expenses, searchTerm, projects, assets]);

  const totalCapex = useMemo(() => {
    return filteredExpenses.reduce((sum, exp) => sum + Number(exp.amount || 0), 0);
  }, [filteredExpenses]);

  const handleExportExcel = () => {
    if (filteredExpenses.length === 0) {
      toast.error("Não há dados para exportar.");
      return;
    }
    const dataToExport = filteredExpenses.map(exp => ({
      "Data": exp.date?.toDate ? exp.date.toDate().toLocaleDateString('pt-BR') : new Date(exp.date).toLocaleDateString('pt-BR'),
      "Descrição": exp.description,
      "Obra": getProjectName(exp.projectId),
      "Ativo Vinculado": exp.assetId ? getAssetName(exp.assetId) : "N/A",
      "Valor": Number(exp.amount || 0),
      "Categoria": exp.category || "N/A",
      "Notas": exp.notes || "",
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Relatorio_CAPEX");
    XLSX.writeFile(wb, `relatorio_capex_${new Date().toISOString().split('T')[0]}.xlsx`);
    toast.success("Relatório CAPEX exportado!");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Relatório de Despesas (CAPEX)</h1>
        <div className="flex items-center gap-2">
          <Button onClick={handleExportExcel} variant="outline" className="ml-auto">
            <Download className="mr-2 h-4 w-4" /> Exportar para Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="text-green-600" />
            Valor Total (CAPEX)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-4xl font-bold text-green-600">{formatCurrency(totalCapex)}</p>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por descrição, obra ou ativo..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Ativo Vinculado</TableHead>
                <TableHead className="text-right">Valor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="mx-auto animate-spin" /></TableCell></TableRow>
              ) : filteredExpenses.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">Nenhuma despesa CAPEX encontrada.</TableCell></TableRow>
              ) : (
                filteredExpenses.map(exp => (
                  <TableRow key={exp.id}>
                    <TableCell>{exp.date?.toDate ? exp.date.toDate().toLocaleDateString('pt-BR') : new Date(exp.date).toLocaleDateString('pt-BR')}</TableCell>
                    <TableCell className="font-medium">{exp.description}</TableCell>
                    <TableCell>{getProjectName(exp.projectId)}</TableCell>
                    <TableCell>{exp.assetId ? getAssetName(exp.assetId) : "-"}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(Number(exp.amount || 0))}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}