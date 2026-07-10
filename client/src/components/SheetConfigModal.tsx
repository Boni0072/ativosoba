import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sheet, Info, Link as LinkIcon, Loader2 } from 'lucide-react';

interface SheetConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configKey?: string; // Chave para diferenciar configurações
}

export default function SheetConfigModal({ open, onOpenChange, configKey }: SheetConfigModalProps) {
  const [sheetLink, setSheetLink] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    // Define as chaves do localStorage com base na configKey
    const sheetLinkKey = configKey ? `sheet_link_${configKey}` : 'sheet_link'; // Chave para a planilha

    setLoading(true);
    try {
      // Simulação de salvamento
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Salvar link da planilha
      localStorage.setItem(sheetLinkKey, sheetLink);

      toast.success(`Link da planilha ${sheetLink.trim() ? 'salvo' : 'removido'} com sucesso!`);
      
      // Disparar evento para atualizar componentes que usam o Power BI
      window.dispatchEvent(new CustomEvent('powerbi-link-updated'));
      
      onOpenChange(false);
      
    } catch (error) {
      toast.error('Erro ao salvar o link. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    const sheetLinkKey = configKey ? `sheet_link_${configKey}` : 'sheet_link';

    localStorage.removeItem(sheetLinkKey);

    setSheetLink('');
    toast.success('Link da planilha removido.');
    window.dispatchEvent(new CustomEvent('powerbi-link-updated'));
    onOpenChange(false);
  };

  // Carregar token e link salvos ao abrir o modal
  useEffect(() => {
    if (open) {
      const sheetLinkKey = configKey ? `sheet_link_${configKey}` : 'sheet_link';
      const savedSheetLink = localStorage.getItem(sheetLinkKey) || '';
      setSheetLink(savedSheetLink);
    }
  }, [open, configKey]);

  const sheetLinkKey = configKey ? `sheet_link_${configKey}` : 'sheet_link';
  const hasLink = !!localStorage.getItem(sheetLinkKey);

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!loading) onOpenChange(isOpen); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sheet className="w-5 h-5 text-green-600" />
            Configurar Planilha
          </DialogTitle>
          <DialogDescription>Insira o link da sua planilha para visualizá-la na página.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="sheetLink" className="flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Link de Incorporação da Planilha</Label>
            <Input
              id="sheetLink"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/..."
              value={sheetLink}
              onChange={(e) => setSheetLink(e.target.value)}
              disabled={loading}
            />
            <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800 mt-2">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold mb-1">Como obter o link de incorporação:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li><strong>Google Sheets:</strong> Vá em <strong>Arquivo &gt; Compartilhar &gt; Publicar na web</strong>. Selecione "Incorporar" e copie o link do atributo `src`.</li>
                  <li><strong>Excel Online:</strong> Vá em <strong>Arquivo &gt; Compartilhar &gt; Incorporar</strong>. Copie a URL do campo "Código de inserção".</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          {hasLink && (
            <Button
              variant="outline"
              type="button"
              onClick={handleDisconnect}
              disabled={loading}
              className="w-full sm:w-auto border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 mr-auto"
            >
              Remover Link
            </Button>
          )}
          <Button
            onClick={handleConnect}
            disabled={loading}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? <Loader2 className="animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}