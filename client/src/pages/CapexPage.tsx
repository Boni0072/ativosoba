import { useState, useEffect, useMemo } from "react";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, Search, Maximize2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const POWER_BI_CAPEX_URL =
  "https://app.powerbi.com/groups/me/reports/e20bac7e-eb33-4b60-9549-489c554be921/fbae5443abbd47b080d0?ctid=86b6ee0d-1deb-4ae1-9fe6-f782dbc36f7f&pbi_source=shareVisual&visual=be7b561915808d0e2253&height=184.00&width=1240.00&bookmarkGuid=cdca6684-383b-4536-bd68-87b8320b8a77";

const POWER_BI_CAPEX_EMBED_URL =
  "https://app.powerbi.com/reportEmbed?reportId=e20bac7e-eb33-4b60-9549-489c554be921&ctid=86b6ee0d-1deb-4ae1-9fe6-f782dbc36f7f&pageName=fbae5443abbd47b080d0&visualName=be7b561915808d0e2253&bookmarkGuid=cdca6684-383b-4536-bd68-87b8320b8a77";

const POWER_BI_FULL_REPORT_EMBED_URL =
  "https://app.powerbi.com/reportEmbed?reportId=e20bac7e-eb33-4b60-9549-489c554be921&ctid=86b6ee0d-1deb-4ae1-9fe6-f782dbc36f7f";

export default function CapexPage() {
  const [showFullReport, setShowFullReport] = useState(false);
  const [assets, setAssets] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "assets"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setAssets(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  const capexAssets = useMemo(() => {
    return assets.filter(asset =>
      asset.status === "planejamento" ||
      asset.status === "em_desenvolvimento"
    );
  }, [assets]);

  const filteredAssets = useMemo(() => {
    if (!searchTerm.trim()) return capexAssets;
    const s = searchTerm.toLowerCase();
    return capexAssets.filter(asset =>
      String(asset.name || "").toLowerCase().includes(s) ||
      String(asset.assetNumber || "").toLowerCase().includes(s) ||
      String(asset.tagNumber || "").toLowerCase().includes(s) ||
      String(asset.description || "").toLowerCase().includes(s)
    );
  }, [capexAssets, searchTerm]);

  const getProjectName = (projectId: string) => {
    const project = projects.find(p => String(p.id) === String(projectId));
    return project?.name || "\u2014";
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const formatCostCenter = (costCenter: any) => {
    if (typeof costCenter === "object" && costCenter?.code) return costCenter.code;
    return costCenter || "\u2014";
  };

  const totalValue = filteredAssets.reduce((acc, asset) => acc + Number(asset.value || 0), 0);

  const handleExportExcel = () => {
    if (filteredAssets.length === 0) {
      toast.error("N\u00e3o h\u00e1 ativos para exportar.");
      return;
    }

    const data = filteredAssets.map(asset => ({
      "N\u00ba Ativo": asset.assetNumber || "",
      "Plaqueta": asset.tagNumber || "",
      "Nome": asset.name || "",
      "Descri\u00e7\u00e3o": asset.description || "",
      "Valor (R$)": Number(asset.value || 0),
      "Quantidade": Number(asset.quantity || 1),
      "Status": asset.status === "planejamento" ? "Planejamento" : "Em Desenvolvimento",
      "Obra": getProjectName(asset.projectId),
      "Centro de Custo": formatCostCenter(asset.costCenter),
      "Data In\u00edcio": asset.startDate ? new Date(asset.startDate).toLocaleDateString("pt-BR") : "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wscols = Object.keys(data[0]).map(key => ({ wch: Math.max(key.length, 15) }));
    ws["!cols"] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "CAPEX");
    XLSX.writeFile(wb, `capex_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Relat\u00f3rio CAPEX exportado com sucesso!");
  };

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">CAPEX - Imobilizado em Andamento</h1>
          <p className="text-slate-500 text-sm mt-1">
            {capexAssets.length} ativos em andamento
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowFullReport(!showFullReport)}
            className={`border-blue-200 text-blue-700 hover:bg-blue-50 ${showFullReport ? "bg-blue-100" : ""}`}
          >
            <Maximize2 className="mr-2 h-4 w-4" />
            {showFullReport ? "Fechar Relat\u00f3rio" : "Relat\u00f3rio Completo"}
          </Button>
          <Button variant="outline" onClick={handleExportExcel}>
            <Download className="mr-2 h-4 w-4" />
            Exportar Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Total de Ativos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-800">{filteredAssets.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Valor Total</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-500">Em Planejamento</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {capexAssets.filter(a => a.status === "planejamento").length}
            </div>
          </CardContent>
        </Card>
      </div>

      {showFullReport && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Relat\u00f3rio Completo Power BI - CAPEX</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="w-full overflow-x-auto">
              <iframe
                title="Relat\u00f3rio Completo Power BI"
                width="100%"
                height="600"
                src={POWER_BI_FULL_REPORT_EMBED_URL}
                frameBorder="0"
                allowFullScreen
                className="w-full min-h-[600px] rounded-md"
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Tabela Power BI - CAPEX</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-500">
            Visual compartilhado do Power BI referente aos dados de CAPEX.
          </p>
          <div className="w-full overflow-x-auto">
            <iframe
              title="Tabela CAPEX - Power BI"
              width="1240"
              height="184"
              src={POWER_BI_CAPEX_EMBED_URL}
              frameBorder="0"
              allowFullScreen
              className="w-full min-h-[184px] rounded-md border"
            />
          </div>
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Buscar por nome, n\u00ba ativo, plaqueta..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[100px]">N\u00ba Ativo</TableHead>
                  <TableHead className="w-[100px]">Plaqueta</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Descri\u00e7\u00e3o</TableHead>
                  <TableHead className="text-right">Valor (R$)</TableHead>
                  <TableHead className="text-center">Qtd</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Obra</TableHead>
                  <TableHead>Centro de Custo</TableHead>
                  <TableHead>Data In\u00edcio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAssets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-slate-500">
                      {searchTerm ? "Nenhum ativo encontrado para esta busca." : "Nenhum ativo CAPEX em andamento."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAssets.map((asset) => (
                    <TableRow key={asset.id} className="hover:bg-slate-50">
                      <TableCell className="font-mono text-xs">{asset.assetNumber || "\u2014"}</TableCell>
                      <TableCell className="font-mono text-xs">{asset.tagNumber || "\u2014"}</TableCell>
                      <TableCell className="font-medium">{asset.name || "\u2014"}</TableCell>
                      <TableCell className="text-xs text-slate-500 max-w-[200px] truncate">
                        {asset.description || "\u2014"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {asset.value ? formatCurrency(Number(asset.value)) : "\u2014"}
                      </TableCell>
                      <TableCell className="text-center">{asset.quantity || 1}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium
                          ${asset.status === "planejamento"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-yellow-100 text-yellow-700"
                          }`}
                        >
                          {asset.status === "planejamento" ? "Planejamento" : "Em Desenvolvimento"}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{getProjectName(asset.projectId)}</TableCell>
                      <TableCell className="text-xs">{formatCostCenter(asset.costCenter)}</TableCell>
                      <TableCell className="text-xs">
                        {asset.startDate ? new Date(asset.startDate).toLocaleDateString("pt-BR") : "\u2014"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
