import { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ArrowRight, CheckCircle2, Sheet } from 'lucide-react';
import { toast } from 'sonner';

interface DataAnalyzerModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  file: File | null;
  onAnalyze: (data: any[], columns: string[], fileName: string) => void;
}

export default function DataAnalyzerModal({ open, onOpenChange, file, onAnalyze }: DataAnalyzerModalProps) {
  const [step, setStep] = useState<'select_sheet' | 'select_columns'>('select_sheet');
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);

  useEffect(() => {
    if (file && open) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = e.target?.result;
          const wb = XLSX.read(data, { type: 'array' });
          setWorkbook(wb);
          setSheetNames(wb.SheetNames);
          setSelectedSheet(wb.SheetNames[0] || '');
          setStep('select_sheet');
        } catch (error) {
          toast.error("Erro ao ler o arquivo da planilha.");
          onOpenChange(false);
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }, [file, open]);

  const goToColumnSelection = () => {
    if (!workbook || !selectedSheet) return;
    const worksheet = workbook.Sheets[selectedSheet];
    const sheetHeaders = XLSX.utils.sheet_to_json(worksheet, { header: 1 })[0] as string[];
    setHeaders(sheetHeaders);
    setSelectedColumns(sheetHeaders); // Seleciona todas por padrão
    setStep('select_columns');
  };

  const handleColumnToggle = (column: string) => {
    setSelectedColumns(prev =>
      prev.includes(column) ? prev.filter(c => c !== column) : [...prev, column]
    );
  };

  const handleFinishAnalysis = () => {
    if (!workbook || !selectedSheet || selectedColumns.length === 0) {
      toast.warning("Selecione pelo menos uma coluna.");
      return;
    }
    const worksheet = workbook.Sheets[selectedSheet];
    const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];
    onAnalyze(jsonData, selectedColumns, file?.name || "Análise");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Analisador de Dados da Planilha</DialogTitle>
          <DialogDescription>Selecione a aba e as colunas que deseja usar para criar seu relatório.</DialogDescription>
        </DialogHeader>

        {step === 'select_sheet' && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <Sheet className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold">Passo 1: Selecione a Aba</h3>
            </div>
            <Select value={selectedSheet} onValueChange={setSelectedSheet}>
              <SelectTrigger><SelectValue placeholder="Selecione a aba..." /></SelectTrigger>
              <SelectContent>
                {sheetNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button onClick={goToColumnSelection} disabled={!selectedSheet}>
                Selecionar Colunas <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {step === 'select_columns' && (
          <div className="py-4 space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h3 className="font-semibold">Passo 2: Selecione as Colunas (Blocos)</h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 max-h-64 overflow-y-auto p-4 border rounded-md bg-slate-50">
              {headers.map(header => (
                <div key={header} className="flex items-center space-x-2">
                  <Checkbox id={header} checked={selectedColumns.includes(header)} onCheckedChange={() => handleColumnToggle(header)} />
                  <Label htmlFor={header} className="cursor-pointer">{header}</Label>
                </div>
              ))}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('select_sheet')}>Voltar</Button>
              <Button onClick={handleFinishAnalysis} disabled={selectedColumns.length === 0}>Confirmar Seleção</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}