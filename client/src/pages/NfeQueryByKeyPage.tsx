import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, FileText, Key, CheckCircle, AlertTriangle, 
  Loader2, X, Download, Info, Database, Globe, Shield,
  Building, Calendar, DollarSign, Package, ArrowRight,
  ExternalLink, Wifi, WifiOff, ChevronDown, RefreshCw,
  Camera, CameraOff, ScanLine
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import * as XLSX from "xlsx";

interface ConnectionConfig {
  id: string;
  type: ConnectionType;
  name: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  apiKey?: string;
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
  connectionString?: string;
  sslEnabled: boolean;
}

type ConnectionType = 
  | 'firebase' | 'googleDrive' | 'bigQuery' | 'postgresql'
  | 'mysql' | 'sqlserver' | 'mongodb' | 'oracle'
  | 'snowflake' | 'redshift' | 'powerbi'
  | 'excel' | 'api' | 'supabase';

interface Connection {
  id: string;
  type: ConnectionType;
  name: string;
  connected: boolean;
  config: Partial<ConnectionConfig>;
  lastTested?: Date;
  createdAt: Date;
}

// Serviços de consulta NF-e disponíveis por tipo de conexão
const nfeServices: Record<string, { name: string; provider: string }> = {
  api: { name: 'API SEFAZ', provider: 'SEFAZ' },
  postgresql: { name: 'Banco NF-e', provider: 'PostgreSQL' },
  firebase: { name: 'Firebase NF-e', provider: 'Firebase' },
  supabase: { name: 'Supabase NF-e', provider: 'Supabase' },
};

export default function NfeQueryByKeyPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedConnection, setSelectedConnection] = useState<string>('');
  const [nfeKey, setNfeKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState<'key' | 'query' | 'result'>('key');

  // Carregar conexões salvas
  useEffect(() => {
    const saved = localStorage.getItem('data_connections');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setConnections(parsed.map((c: any) => ({
          ...c,
          createdAt: new Date(c.createdAt),
          lastTested: c.lastTested ? new Date(c.lastTested) : undefined,
        })));
      } catch (e) {
        console.error('Erro ao carregar conexões:', e);
      }
    }
  }, []);

  // Recarregar conexões quando houver mudança no localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('data_connections');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setConnections(parsed.map((c: any) => ({
            ...c,
            createdAt: new Date(c.createdAt),
            lastTested: c.lastTested ? new Date(c.lastTested) : undefined,
          })));
        } catch (e) { console.error('Erro ao recarregar conexões:', e); }
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Valida chave de 44 dígitos
  const isValidKey = nfeKey.replace(/\D/g, '').length === 44;

  // Formata a chave para exibição
  const formatKey = (key: string) => {
    const cleaned = key.replace(/\D/g, '');
    return cleaned.replace(/(\d{4})(?=\d)/g, '$1 ');
  };

  // Simula consulta na SEFAZ usando a conexão selecionada
  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedConnection) {
      toast.error('Selecione uma conexão para realizar a consulta.');
      return;
    }

    if (!isValidKey) {
      toast.error('A chave de acesso deve ter exatamente 44 dígitos.');
      return;
    }

    const conn = connections.find(c => c.id === selectedConnection);
    if (!conn) {
      toast.error('Conexão não encontrada.');
      return;
    }

    if (!conn.connected) {
      toast.error(`A conexão "${conn.name}" não está ativa. Conecte-se primeiro na página de Conexões.`);
      return;
    }

    setIsLoading(true);
    setStep('query');

    try {
      // Usa o host da conexão ou fallback para localhost
      const host = conn.config.host ? (conn.config.host.startsWith('http') ? conn.config.host : `http://${conn.config.host}`) : 'http://localhost:3001';
      const apiUrl = `${host}/api/nfe/${nfeKey.replace(/\D/g, '')}`;
      const response = await fetch(apiUrl);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao consultar a NF-e. Verifique a chave e tente novamente.');
      }

      const nfeData = await response.json();

      // Adiciona informações da conexão usada
      nfeData.conexaoUsada = conn.name;
      nfeData.provider = conn.type;

      setResult(nfeData);
      setShowModal(true);
      setStep('result');
      toast.success(`NF-e ${nfeData.numero} consultada via ${conn.name}!`);
    } catch (error: any) {
      toast.error('Erro na Consulta', { description: error.message });
      setStep('key');
    } finally {
      setIsLoading(false);
    }
    /*
    // Simula o tempo de consulta na SEFAZ
    await new Promise(resolve => setTimeout(resolve, 2500));

    // Dados simulados da NF-e consultada
    const nfeData = {
      chave: nfeKey.replace(/\D/g, ''),
      numero: String(Math.floor(Math.random() * 100000)).padStart(9, '0'),
      serie: String(Math.floor(Math.random() * 999) + 1).padStart(3, '0'),
      modelo: '55',
      emissao: new Date().toISOString(),
      emitente: {
        cnpj: '11.222.333/0001-81',
        nome: 'Empresa Fornecedora LTDA',
        fantasia: 'Fornecedor Exemplo',
        ie: '123.456.789.011',
        endereco: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP, 01310-100',
      },
      destinatario: {
        cnpj: '99.888.777/0001-66',
        nome: 'Oba Engenharia e Construções S.A.',
        ie: '987.654.321.099',
        endereco: 'Rua do Comércio, 500 - Centro, São Paulo - SP, 01001-000',
      },
      transporte: {
        modal: 'Rodoviário',
        frete: 'CIF',
        transportadora: 'Transportadora Rápida Ltda',
        placa: 'ABC-1234',
      },
      valores: {
        baseCalculoIcms: 15750.00,
        valorIcms: 2835.00,
        baseCalculoIcmsSt: 0,
        valorIcmsSt: 0,
        valorProdutos: 15000.00,
        valorFrete: 500.00,
        valorSeguro: 100.00,
        valorDesconto: 0,
        valorOutras: 50.00,
        valorIpi: 0,
        valorTotal: 15650.00,
      },
      produtos: [
        { codigo: '001', descricao: 'Cimento CP-V ARI 50kg', ncm: '2523.10.00', cfop: '6101', un: 'SC', qtd: 500, vlUnit: 25.00, vlTotal: 12500.00, cest: '01.001.00' },
        { codigo: '002', descricao: 'Areia Média para Construção', ncm: '2505.90.00', cfop: '6101', un: 'M3', qtd: 20, vlUnit: 75.00, vlTotal: 1500.00, cest: '01.002.00' },
        { codigo: '003', descricao: 'Ferro CA-50 10mm (12m)', ncm: '7214.20.00', cfop: '6101', un: 'KG', qtd: 1000, vlUnit: 6.50, vlTotal: 6500.00, cest: '02.001.01' },
        { codigo: '004', descricao: 'Tijolo Cerâmico 8 Furos (Milheiro)', ncm: '6901.00.00', cfop: '6101', un: 'MIL', qtd: 10, vlUnit: 850.00, vlTotal: 8500.00, cest: '03.001.00' },
      ].map(p => ({ ...p, vlTotal: p.qtd * p.vlUnit })),
      imposto: {
        vTotTrib: 3120.00,
      },
      conexaoUsada: conn.name,
      provider: conn.type,
    };

    // Recalcula valor total dos produtos
    const valorProdutos = nfeData.produtos.reduce((acc: number, p: any) => acc + p.vlTotal, 0);
    nfeData.valores.valorProdutos = valorProdutos;
    nfeData.valores.valorTotal = valorProdutos + nfeData.valores.valorFrete + nfeData.valores.valorSeguro + nfeData.valores.valorOutras - nfeData.valores.valorDesconto;

    setResult(nfeData);
    setShowModal(true);
    setStep('result');
    setIsLoading(false);
    toast.success(`NF-e ${nfeData.numero} consultada via ${conn.name}!`);
    */
  };

  const downloadExcel = () => {
    if (!result || !result.produtos) return;

    const wsData = [
      {
        'Código': '',
        'Descrição': '',
        'NCM': '',
        'CFOP': '',
        'Un.': '',
        'Quantidade': '',
        'Valor Unit.': '',
        'Valor Total': '',
      },
      ...result.produtos.map((p: any) => ({
        'Código': p.codigo,
        'Descrição': p.descricao,
        'NCM': p.ncm,
        'CFOP': p.cfop,
        'Un.': p.un,
        'Quantidade': p.qtd,
        'Valor Unit.': p.vlUnit,
        'Valor Total': p.vlTotal,
      })),
    ];

    const ws = XLSX.utils.json_to_sheet(wsData, { skipHeader: false });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Itens NF-e');
    
    // Informações do cabeçalho
    XLSX.utils.sheet_add_aoa(ws, [
      ['NF-e Nº', result.numero],
      ['Emitente', result.emitente.nome],
      ['CNPJ', result.emitente.cnpj],
      ['Valor Total', `R$ ${result.valores.valorTotal.toFixed(2)}`],
      [''],
    ], { origin: 'A1' });

    XLSX.writeFile(wb, `NF-e_${result.numero}_${new Date().getTime()}.xlsx`);
    toast.success('Excel exportado com sucesso!');
  };

  // Scanner de código de barras
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  // Verifica suporte ao BarcodeDetector
  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setScannerSupported(false);
    }
  }, []);

  // Iniciar scanner
  const startScanner = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScannerActive(true);

      // Tenta detectar códigos a cada 500ms
      const barcodeDetector = new (window as any).BarcodeDetector({ 
        formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'codabar', 'itf', 'qr_code', 'data_matrix', 'pdf417'] 
      });
      
      scanIntervalRef.current = window.setInterval(async () => {
        if (!videoRef.current || !barcodeDetector) return;
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue.replace(/\D/g, '');
            if (rawValue.length >= 44) {
              setNfeKey(rawValue.slice(0, 44));
              stopScanner();
              toast.success('Código de barras detectado!');
            }
          }
        } catch (err) {
          // Erro silencioso no scan
        }
      }, 500);
    } catch (err) {
      toast.error('Não foi possível acessar a câmera. Verifique as permissões.');
      setScannerActive(false);
    }
  };

  // Parar scanner
  const stopScanner = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setScannerActive(false);
  };

  // Cleanup ao desmontar
  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const connectedConnections = connections.filter(c => c.connected);
  const nonConnectedConnections = connections.filter(c => !c.connected);

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-700">Consulta NF-e por Chave</h1>
          <p className="text-muted-foreground mt-1">
            Utilize uma conexão cadastrada para consultar Notas Fiscais Eletrônicas na SEFAZ
          </p>
        </div>
      </div>

      {/* Status de Conexões */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-green-50 border-green-200">
          <CardContent className="flex items-center gap-3 p-4">
            <Wifi className="w-8 h-8 text-green-600" />
            <div>
              <p className="text-2xl font-bold text-green-700">{connectedConnections.length}</p>
              <p className="text-sm text-green-600">Conexões Ativas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-slate-50 border-slate-200">
          <CardContent className="flex items-center gap-3 p-4">
            <Database className="w-8 h-8 text-slate-600" />
            <div>
              <p className="text-2xl font-bold text-slate-700">{connections.length}</p>
              <p className="text-sm text-slate-500">Total de Conexões</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="flex items-center gap-3 p-4">
            <FileText className="w-8 h-8 text-blue-600" />
            <div>
              <p className="text-2xl font-bold text-blue-700">
                {JSON.parse(localStorage.getItem('nfe_query_history') || '[]').length}
              </p>
              <p className="text-sm text-blue-600">Consultas Realizadas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Painel de Consulta */}
      <Card className="border-t-4 border-t-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-700">
            <Search className="w-5 h-5 text-blue-500" />
            Nova Consulta
          </CardTitle>
          <CardDescription>
            Selecione a conexão e digite a chave de 44 dígitos da NF-e
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleQuery} className="space-y-6">
            {/* Seletor de Conexão */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Conexão para Consulta
              </label>
              <Select value={selectedConnection} onValueChange={setSelectedConnection}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione uma conexão ativa..." />
                </SelectTrigger>
                <SelectContent>
                  {connectedConnections.length === 0 ? (
                    <SelectItem value="__none__" disabled>
                      Nenhuma conexão ativa disponível
                    </SelectItem>
                  ) : (
                    connectedConnections.map((conn) => (
                      <SelectItem key={conn.id} value={conn.id}>
                        <div className="flex items-center gap-2">
                          <Database className="w-4 h-4 text-green-500" />
                          <span>{conn.name}</span>
                          <span className="text-xs text-slate-400">({conn.type})</span>
                        </div>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
              {nonConnectedConnections.length > 0 && (
                <p className="text-xs text-amber-600 mt-1">
                  {nonConnectedConnections.length} conexão(ões) inativa(s). Ative-as na página de Conexões.
                </p>
              )}
            </div>

            {/* Informação sobre a conexão selecionada */}
            {selectedConnection && (() => {
              const conn = connections.find(c => c.id === selectedConnection);
              if (!conn) return null;
              return (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    <Globe className="w-5 h-5 text-blue-600" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-800">{conn.name}</p>
                      <p className="text-blue-600 text-xs">
                        Tipo: {conn.type} | Host: {conn.config?.host || 'N/A'}
                        {conn.config?.sslEnabled && ' | SSL: Sim'}
                      </p>
                    </div>
                    <div className="ml-auto">
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">
                        <Wifi className="w-3 h-3" />
                        Ativa
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Input da Chave */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">
                Chave de Acesso (44 dígitos)
              </label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                  <Key className="w-5 h-5" />
                </div>
                <Input
                  value={formatKey(nfeKey)}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/\D/g, '');
                    if (cleaned.length <= 44) setNfeKey(cleaned);
                  }}
                  placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                  className="pl-10 pr-20 font-mono text-lg tracking-wider"
                  maxLength={55}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
                  {scannerSupported && (
                    <button
                      type="button"
                      onClick={scannerActive ? stopScanner : startScanner}
                      className={`p-1.5 rounded-md transition-colors ${
                        scannerActive 
                          ? 'bg-red-100 text-red-600 hover:bg-red-200' 
                          : 'bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600'
                      }`}
                      title={scannerActive ? 'Parar scanner' : 'Ler código de barras'}
                    >
                      {scannerActive ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
                    </button>
                  )}
                  <span className={`text-xs font-bold ${isValidKey ? 'text-green-500' : 'text-slate-400'}`}>
                    {nfeKey.length}/44
                  </span>
                </div>
              </div>
              
              {/* Preview da Câmera */}
              {scannerActive && (
                <div className="relative rounded-lg overflow-hidden border-2 border-blue-400 bg-black">
                  <video
                    ref={videoRef}
                    className="w-full h-48 object-cover"
                    playsInline
                    muted
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-3/4 h-1 bg-blue-400/60 animate-pulse rounded-full" />
                  </div>
                  <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
                    <ScanLine className="w-3 h-3 animate-pulse" />
                    Apontando para o código de barras...
                  </div>
                  <button
                    type="button"
                    onClick={stopScanner}
                    className="absolute top-2 right-2 bg-red-500/80 text-white p-1.5 rounded-full hover:bg-red-600 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {!scannerSupported && (
                <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-2 rounded-md">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Scanner não suportado neste navegador. Digite manualmente os 44 dígitos.</span>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Info className="w-3 h-3" />
                <span>A chave de acesso está localizada no canto superior direito da DANFE</span>
              </div>
            </div>

            {/* Botão Consultar */}
            <div className="flex gap-3">
              <Button
                type="submit"
                disabled={isLoading || !isValidKey || !selectedConnection}
                className="bg-blue-600 hover:bg-blue-700 text-white flex-1 h-12 text-base gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Consultando SEFAZ...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Consultar Nota Fiscal
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Modal de Resultado */}
      {showModal && result && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 p-6 text-white sticky top-0 z-10">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-6 h-6" />
                    <h2 className="text-2xl font-bold">NF-e Encontrada</h2>
                  </div>
                  <p className="text-blue-200 text-sm">
                    Nº {result.numero} | Série {result.serie} | Modelo {result.modelo}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-xs bg-blue-500/30 rounded-full px-3 py-1 inline-flex">
                    <Database className="w-3 h-3" />
                    <span>Consultada via: {result.conexaoUsada}</span>
                  </div>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-1 hover:bg-white/20 rounded-full transition"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Chave da NF-e */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <p className="text-xs text-slate-500 mb-1">Chave de Acesso</p>
                <p className="font-mono text-sm text-slate-700 tracking-wider">
                  {formatKey(result.chave)}
                </p>
              </div>

              {/* Grid: Emitente e Destinatário */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-700">Emitente</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-slate-500">Razão Social:</span> <span className="font-medium">{result.emitente.nome}</span></p>
                    <p><span className="text-slate-500">CNPJ:</span> {result.emitente.cnpj}</p>
                    <p><span className="text-slate-500">IE:</span> {result.emitente.ie}</p>
                    <p><span className="text-slate-500">Endereço:</span> {result.emitente.endereco}</p>
                  </div>
                </div>
                <div className="border border-slate-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building className="w-4 h-4 text-green-600" />
                    <h3 className="font-bold text-slate-700">Destinatário</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <p><span className="text-slate-500">Razão Social:</span> <span className="font-medium">{result.destinatario.nome}</span></p>
                    <p><span className="text-slate-500">CNPJ:</span> {result.destinatario.cnpj}</p>
                    <p><span className="text-slate-500">IE:</span> {result.destinatario.ie}</p>
                    <p><span className="text-slate-500">Endereço:</span> {result.destinatario.endereco}</p>
                  </div>
                </div>
              </div>

              {/* Valores */}
              <div className="border border-slate-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <h3 className="font-bold text-slate-700">Valores da Nota</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-slate-500">Base ICMS</p>
                    <p className="font-medium">R$ {result.valores.baseCalculoIcms.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Valor ICMS</p>
                    <p className="font-medium">R$ {result.valores.valorIcms.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Valor Produtos</p>
                    <p className="font-medium">R$ {result.valores.valorProdutos.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Frete</p>
                    <p className="font-medium">R$ {result.valores.valorFrete.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Seguro</p>
                    <p className="font-medium">R$ {result.valores.valorSeguro.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Desconto</p>
                    <p className="font-medium">R$ {result.valores.valorDesconto.toFixed(2)}</p>
                  </div>
                  <div className="col-span-2 bg-green-50 rounded-lg p-2">
                    <p className="text-green-700 font-bold">VALOR TOTAL DA NOTA</p>
                    <p className="text-2xl font-bold text-green-600">
                      R$ {result.valores.valorTotal.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Produtos */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-600" />
                    <h3 className="font-bold text-slate-700">
                      Produtos ({result.produtos.length})
                    </h3>
                  </div>
                  <Button variant="outline" size="sm" onClick={downloadExcel} className="gap-2">
                    <Download className="w-4 h-4" />
                    Exportar Excel
                  </Button>
                </div>
                <div className="overflow-x-auto max-h-72 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-100 text-slate-600 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">Cód.</th>
                        <th className="px-4 py-2 text-left">Descrição</th>
                        <th className="px-4 py-2 text-left">NCM</th>
                        <th className="px-4 py-2 text-left">CFOP</th>
                        <th className="px-4 py-2 text-right">Qtd</th>
                        <th className="px-4 py-2 text-right">Vl. Unit</th>
                        <th className="px-4 py-2 text-right">Vl. Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {result.produtos.map((p: any, idx: number) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="px-4 py-2 font-mono text-xs">{p.codigo}</td>
                          <td className="px-4 py-2">{p.descricao}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{p.ncm}</td>
                          <td className="px-4 py-2 text-xs text-slate-500">{p.cfop}</td>
                          <td className="px-4 py-2 text-right">{p.qtd} {p.un}</td>
                          <td className="px-4 py-2 text-right">R$ {p.vlUnit.toFixed(2)}</td>
                          <td className="px-4 py-2 text-right font-medium">R$ {p.vlTotal.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 font-medium">
                      <tr>
                        <td colSpan={6} className="px-4 py-2 text-right text-slate-600">Total dos Produtos:</td>
                        <td className="px-4 py-2 text-right text-green-600">R$ {result.valores.valorProdutos.toFixed(2)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Ações */}
              <div className="flex gap-3 justify-end pt-2">
                <Button variant="outline" onClick={() => setShowModal(false)}>
                  Fechar
                </Button>
                <Button variant="outline" onClick={downloadExcel} className="gap-2">
                  <Download className="w-4 h-4" />
                  Exportar
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                  <ExternalLink className="w-4 h-4" />
                  DANFE (Simulado)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}