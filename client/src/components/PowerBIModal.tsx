import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Sheet, Info, Link as LinkIcon } from 'lucide-react';

interface PowerBIModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  configKey?: string; // Chave para diferenciar configurações
}

export default function PowerBIModal({ open, onOpenChange, configKey }: PowerBIModalProps) {
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
            <Label htmlFor="sheetLink" className="flex items-center gap-2"><LinkIcon className="w-4 h-4" /> Link da Planilha (Google Sheets, etc.)</Label>
            <Input
              id="sheetLink"
              type="url"
              placeholder="https://docs.google.com/spreadsheets/..."
              value={sheetLink}
              onChange={(e) => setSheetLink(e.target.value)}
              disabled={loading}
            />
            <p className="text-xs text-slate-500">
              Cole o link de compartilhamento da sua planilha.
            </p>
            <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-md text-xs text-blue-800">
              <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold mb-1">Como obter o link correto (Excel Online/SharePoint):</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Abra a planilha no navegador.</li>
                  <li>Vá em <strong>Arquivo &gt; Compartilhar &gt; Incorporar</strong>.</li>
                  <li>Copie a URL que aparece dentro do atributo <strong>src="..."</strong> no código gerado.</li>
                </ol>
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
              className="w-full sm:w-auto border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
            >
              Remover Link
            </Button>
          )}
          <Button
            onClick={handleConnect}
            disabled={loading}
            className="w-full sm:w-auto bg-green-600 hover:bg-green-700 text-white"
          >
            {loading ? 'Salvando...' : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}