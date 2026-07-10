@@ -0,0 +1,114 @@
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface DataAnalyzerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onAnalyze: (data: any[], columns: string[], fileName: string) => void;
}

export default function DataAnalyzerModal({ open, onOpenChange, file, onAnalyze }: DataAnalyzerModalProps) {
  const [sheets, setSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [columns, setColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);

  useEffect(() => {
    if (file && open) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const wb = XLSX.read(data, { type: 'array' });
          setWorkbook(wb);
          setSheets(wb.SheetNames);
          setSelectedSheet(wb.SheetNames[0]);
        } catch (error) {
          toast.error("Erro ao ler o arquivo da planilha.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else if (!open) {
      // Reset state when modal closes
      setSheets([]);
      setSelectedSheet('');
      setColumns([]);
      setSelectedColumns([]);
      setWorkbook(null);
    }
  }, [file, open]);

  useEffect(() => {
    if (selectedSheet && workbook) {
      const ws = workbook.Sheets[selectedSheet];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
      if (data.length > 0) {
        const header = data[0].map(String);
        setColumns(header);
        setSelectedColumns(header); // Select all by default
      }
    }
  }, [selectedSheet, workbook]);

  const handleToggleColumn = (column: string) => {
    setSelectedColumns(prev =>
      prev.includes(column) ? prev.filter(c => c !== column) : [...prev, column]
    );
  };

  const handleAnalyze = () => {
    if (!workbook || !selectedSheet || selectedColumns.length === 0) {
      toast.warning("Selecione uma planilha e pelo menos uma coluna.");
      return;
    }
    const ws = workbook.Sheets[selectedSheet];
    const data = XLSX.utils.sheet_to_json(ws) as any[];
    const filteredData = data.map(row => {
      const newRow: any = {};
      selectedColumns.forEach(col => {
        newRow[col] = row[col];
      });
      return newRow;
    });
    onAnalyze(filteredData, selectedColumns, file?.name || "Análise");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Analisador de Planilha</DialogTitle>
          <DialogDescription>Selecione a aba e as colunas que deseja visualizar.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label className="text-right">Planilha</Label>
            <Select value={selectedSheet} onValueChange={setSelectedSheet}>
              <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
              <SelectContent>{sheets.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Colunas para Análise</Label>
            <ScrollArea className="h-48 rounded-md border p-4">
              <div className="grid grid-cols-2 gap-2">
                {columns.map(col => (
                  <div key={col} className="flex items-center space-x-2">
                    <Checkbox id={col} checked={selectedColumns.includes(col)} onCheckedChange={() => handleToggleColumn(col)} />
                    <Label htmlFor={col} className="font-normal">{col}</Label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleAnalyze}>Analisar Colunas Selecionadas</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

Com essas alterações, o botão "Conciliação" agora abrirá um seletor de arquivos que permite múltiplas seleções. O novo `ReconciliationModal` receberá esses arquivos, os processará e permitirá que você configure a chave de união para cada um, exibindo um resultado consolidado de presença ou ausência dos registros em cada fonte.

<!--
[PROMPT_SUGGESTION]Como posso exportar o resultado da conciliação para um arquivo Excel?[/PROMPT_SUGGESTION]
[PROMPT_SUGGESTION]Adicione uma coluna no resultado da conciliação que mostre a diferença de valores entre as fontes.[/PROMPT_SUGGESTION]
-->