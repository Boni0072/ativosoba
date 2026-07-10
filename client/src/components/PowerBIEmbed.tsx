import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ExternalLink, AlertTriangle } from 'lucide-react';

interface PowerBIEmbedProps {
  title: string;
  reportId?: string;
  embedUrl?: string;
  configKey?: string; // Chave para diferenciar configurações de Power BI
  width?: string | number;
  height?: string | number;
}

export default function PowerBIEmbed({
  title,
  reportId,
  embedUrl,
  configKey,
  width = '100%',
  height = 541.25,
}: PowerBIEmbedProps) {
  const [hasPowerBiLink, setHasPowerBiLink] = useState(false);
  const [effectiveReportId, setEffectiveReportId] = useState('');
  const [effectiveEmbedUrl, setEffectiveEmbedUrl] = useState('');

  const updateFromStorage = () => {
    const reportIdKey = configKey ? `powerbi_report_id_${configKey}` : 'powerbi_report_id';
    const urlKey = configKey ? `powerbi_url_${configKey}` : 'powerbi_url';
    const linkKey = configKey ? `powerbi_link_${configKey}` : 'powerbi_link';
    const sheetLinkKey = configKey ? `sheet_link_${configKey}` : 'sheet_link';

    const rid = reportId || localStorage.getItem(reportIdKey) || '';
    const url = embedUrl || localStorage.getItem(urlKey) || localStorage.getItem(linkKey) || '';
    const sheetUrl = localStorage.getItem(sheetLinkKey);

    setEffectiveReportId(rid);
    setEffectiveEmbedUrl(url);
    setHasPowerBiLink(!!(rid || url) && !sheetUrl); // Só mostra se não houver link de planilha
  };

  useEffect(() => {
    updateFromStorage();
    const handlePowerBiUpdate = () => updateFromStorage();
    window.addEventListener('powerbi-link-updated', handlePowerBiUpdate);
    return () => { window.removeEventListener('powerbi-link-updated', handlePowerBiUpdate); };
  }, [reportId, embedUrl]);

  // Prioriza a URL de embed completa se ela já estiver no formato correto.
  // Caso contrário, monta a URL a partir do ID extraído.
  const src =
    effectiveEmbedUrl && effectiveEmbedUrl.includes("/reportEmbed")
      ? effectiveEmbedUrl
      : effectiveReportId ? `https://app.powerbi.com/reportEmbed?reportId=${effectiveReportId}` : effectiveEmbedUrl;

  const directUrl = effectiveReportId
    ? `https://app.powerbi.com/reports/${effectiveReportId}`
    : effectiveEmbedUrl;

  const handleOpenInNewTab = () => {
    if (directUrl) {
      window.open(directUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!hasPowerBiLink) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <ExternalLink className="w-12 h-12 mb-4 text-slate-300" />
            <p className="text-lg font-medium text-slate-500 mb-2">Nenhum relatório Power BI configurado</p>
            <p className="text-sm text-center max-w-md">
              Clique no botão "Power BI" na barra de navegação para configurar o link do seu relatório.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleOpenInNewTab}>
              <ExternalLink className="w-4 h-4 mr-1" />
              Abrir no Power BI
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Aviso sobre possível bloqueio do iframe */}
        <div className="px-4 pt-2 pb-1">
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p>
              Se o relatório não aparecer, clique em <strong>"Abrir no Power BI"</strong> para visualizá-lo diretamente no Power BI Service. 
              O embedding pode ser bloqueado pela política de segurança do Power BI dependendo do seu plano e configuração.
            </p>
          </div>
        </div>
        <div className="w-full overflow-x-auto p-0">
          <iframe
            title={title}
            width={width}
            height={height}
            src={src}
            frameBorder="0"
            allowFullScreen
            className="w-full rounded-md"
          />
        </div>
      </CardContent>
    </Card>
  );
}