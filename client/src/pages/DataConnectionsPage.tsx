import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  CheckCircle2, XCircle, Database, Link2, Loader2, FileText, 
  Server, Cloud, HardDrive, Table, MoreHorizontal, 
  Plus, Trash2, Eye, EyeOff, RefreshCw, Wifi, WifiOff,
  Settings, Key, Globe, Shield, Zap, BarChart3
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Tipos de conexão suportados
type ConnectionType = 
  | 'firebase' 
  | 'googleDrive' 
  | 'bigQuery'
  | 'postgresql'
  | 'mysql'
  | 'sqlserver'
  | 'mongodb'
  | 'oracle'
  | 'snowflake'
  | 'redshift'
  | 'powerbi'
  | 'excel'
  | 'api'
  | 'supabase';

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
  connected?: boolean; // Adicionado para o formulário
}

interface Connection {
  id: string;
  type: ConnectionType;
  name: string;
  connected: boolean;
  config: Partial<ConnectionConfig>;
  lastTested?: Date;
  createdAt: Date;
}

const connectionTypeInfo: Record<ConnectionType, {
  title: string;
  description: string;
  icon: any;
  color: string;
  bgColor: string;
  fields: string[];
}> = {
  firebase: {
    title: 'Firebase Firestore',
    description: 'Banco de dados NoSQL da Google para sincronização em tempo real.',
    icon: Database,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    fields: ['projectId', 'clientEmail', 'privateKey'],
  },
  googleDrive: {
    title: 'Google Drive',
    description: 'Acesse planilhas e documentos do Google Drive.',
    icon: Cloud,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    fields: ['clientEmail', 'privateKey', 'projectId'],
  },
  bigQuery: {
    title: 'Google BigQuery',
    description: 'Data warehouse para análises complexas e BI.',
    icon: Table,
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50',
    fields: ['projectId', 'clientEmail', 'privateKey', 'database'],
  },
  postgresql: {
    title: 'PostgreSQL',
    description: 'Banco de dados relacional open-source avançado.',
    icon: Database,
    color: 'text-blue-800',
    bgColor: 'bg-blue-100',
    fields: ['host', 'port', 'database', 'username', 'password'],
  },
  mysql: {
    title: 'MySQL',
    description: 'Sistema de gerenciamento de banco de dados relacional.',
    icon: Database,
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    fields: ['host', 'port', 'database', 'username', 'password'],
  },
  sqlserver: {
    title: 'SQL Server',
    description: 'Sistema de gerenciamento de banco de dados da Microsoft.',
    icon: Server,
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    fields: ['host', 'port', 'database', 'username', 'password'],
  },
  mongodb: {
    title: 'MongoDB',
    description: 'Banco de dados NoSQL orientado a documentos.',
    icon: Database,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    fields: ['host', 'port', 'database', 'username', 'password'],
  },
  oracle: {
    title: 'Oracle Database',
    description: 'Sistema de gerenciamento de banco de dados corporativo.',
    icon: Database,
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    fields: ['host', 'port', 'database', 'username', 'password'],
  },
  snowflake: {
    title: 'Snowflake',
    description: 'Data warehouse nativo em nuvem para análises.',
    icon: Cloud,
    color: 'text-blue-500',
    bgColor: 'bg-blue-50',
    fields: ['host', 'database', 'username', 'password'],
  },
  redshift: {
    title: 'Amazon Redshift',
    description: 'Data warehouse rápido e escalável da AWS.',
    icon: Database,
    color: 'text-orange-500',
    bgColor: 'bg-orange-50',
    fields: ['host', 'port', 'database', 'username', 'password'],
  },
  excel: {
    title: 'Arquivos Excel/CSV',
    description: 'Importe dados de arquivos locais.',
    icon: FileText,
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    fields: [],
  },
  api: {
    title: 'API REST',
    description: 'Conecte-se a qualquer API REST externa.',
    icon: Globe,
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    fields: ['host', 'apiKey'],
  },
  powerbi: {
    title: 'Power BI Workspace',
    description: 'Conecte-se a workspaces do Power BI para visualizar relatórios e dashboards. Insira o ReportId e a URL de embed do seu relatório.',
    icon: BarChart3,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50',
    fields: ['host', 'projectId'],
  },
  supabase: {
    title: 'Supabase',
    description: 'Plataforma open-source com PostgreSQL e autenticação.',
    icon: Database,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    fields: ['host', 'database', 'apiKey'],
  },
};

const defaultPorts: Record<string, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlserver: 1433,
  mongodb: 27017,
  oracle: 1521,
  redshift: 5439,
};

// Lista de provedores pré-configurados para conexão rápida
const quickConnectProviders = [
  { type: 'firebase' as ConnectionType, name: 'Firebase Padrão', host: 'firebase.googleapis.com' },
  { type: 'supabase' as ConnectionType, name: 'Supabase Projeto', host: 'supabase.co' },
  { type: 'snowflake' as ConnectionType, name: 'Snowflake Trial', host: 'trial.snowflakecomputing.com' },
];

export default function DataConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingState, setLoadingState] = useState<Record<string, boolean>>({});
  const [showPassword, setShowPassword] = useState<Record<string, boolean>>({});
  
  // Estados do Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Connection | null>(null);
  const [formData, setFormData] = useState<Partial<ConnectionConfig>>({
    type: 'postgresql',
    name: '',
    host: '',
    port: 5432,
    database: '',
    username: '',
    password: '',
    apiKey: '',
    projectId: '',
    clientEmail: '',
    privateKey: '',
    connectionString: '',
    sslEnabled: true,
    connected: false,
  });

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

  // Salvar conexões
  const saveConnections = (newConnections: Connection[]) => {
    setConnections(newConnections);
    localStorage.setItem('data_connections', JSON.stringify(newConnections));
    window.dispatchEvent(new Event('storage')); // Notifica outras abas/componentes
  };

  const getEmptyForm = (type: ConnectionType): Partial<ConnectionConfig> => ({
    type,
    name: connectionTypeInfo[type].title,
    host: '',
    port: defaultPorts[type] || undefined,
    database: '',
    username: '',
    password: '',
    apiKey: '',
    projectId: '',
    clientEmail: '',
    privateKey: '',
    connectionString: '',
    sslEnabled: true,
    connected: false,
  });

  const handleOpenNew = (type?: ConnectionType) => {
    setEditingConnection(null);
    setFormData(getEmptyForm(type || 'postgresql'));
    setModalOpen(true);
  };

  const handleOpenEdit = (conn: Connection) => {
    setEditingConnection(conn);
    setFormData({
      ...getEmptyForm(conn.type),
      ...conn.config,
      type: conn.type,
      name: conn.name,
      connected: conn.connected, // Carrega o status atual da conexão
    });
    setModalOpen(true);
  };

  const handleSave = () => {
    if (!formData.name?.trim()) {
      toast.error('O nome da conexão é obrigatório');
      return;
    }

    const newConnection: Connection = {
      id: editingConnection?.id || `conn-${Date.now()}`,
      type: formData.type!,
      name: formData.name!,
      connected: formData.connected || false, // Salva o status do switch
      config: { ...formData },
      createdAt: editingConnection?.createdAt || new Date(),
    };

    if (editingConnection) {
      const updated = connections.map(c => c.id === editingConnection.id ? newConnection : c);
      saveConnections(updated);
      toast.success(`Conexão "${newConnection.name}" atualizada!`);
    } else {
      saveConnections([...connections, newConnection]);
      toast.success(`Conexão "${newConnection.name}" criada!`);
    }

    setModalOpen(false);
  };

  const handleDelete = (id: string) => {
    const conn = connections.find(c => c.id === id);
    const updated = connections.filter(c => c.id !== id);
    saveConnections(updated);
    toast.success(`Conexão "${conn?.name}" removida.`);
  };

  const handleTestConnection = async (id: string) => {
    setLoadingState(prev => ({ ...prev, [id]: true }));

    const conn = connections.find(c => c.id === id);
    if (!conn) {
      toast.error("Conexão não encontrada.");
      setLoadingState(prev => ({ ...prev, [id]: false }));
      return;
    }

    let success = false;
    let errorMessage = "Falha ao testar a conexão. Verifique as credenciais e o host.";

    if (conn.type === 'powerbi') {
      // Lógica específica para Power BI: verifica se a URL é acessível sem carregar o conteúdo completo
      try {
        const response = await fetch(conn.config.host || '', {
          method: 'HEAD', // Faz uma requisição leve, apenas para os cabeçalhos
          mode: 'no-cors', // Evita erros de CORS, já que não precisamos ler a resposta
        });
        // Se a requisição foi feita (mesmo que opaca), consideramos a URL válida.
        // O 'no-cors' resulta em status 0, mas a requisição é feita.
        // Se a URL for inválida ou inacessível, o fetch() em si lançará um erro.
        success = true;
      } catch (e: any) {
        console.error("Power BI connection test failed:", e);
        errorMessage = "A URL do relatório parece inválida ou inacessível. Verifique o endereço e as permissões de rede.";
        success = false;
      }
    } else {
      // Lógica de simulação para outras conexões
      await new Promise(resolve => setTimeout(resolve, 1500));
      success = Math.random() > 0.3; // Mantém a simulação para outros tipos
    }

    const updated = connections.map(c => c.id === id ? { ...c, connected: success, lastTested: new Date() } : c);
    saveConnections(updated);
    setLoadingState(prev => ({ ...prev, [id]: false }));

    if (success) {
      toast.success(`Conexão "${updated.find(c => c.id === id)?.name}" testada com sucesso!`);
    } else {
      toast.error(`Falha na conexão "${conn.name}"`, { description: errorMessage });
    }
  };

  const renderFormFields = () => {
    const type = formData.type!;
    const fields = connectionTypeInfo[type]?.fields || [];
    const info = connectionTypeInfo[type];

    return (
      <div className="space-y-4">
        <div>
          <Label>Nome da Conexão</Label>
          <Input
            value={formData.name || ''}
            onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
            placeholder={`Minha conexão ${info.title}`}
          />
        </div>

        {fields.includes('host') && (
          <div>
            <Label>Host / Endereço</Label>
            <Input
              value={formData.host || ''}
              onChange={e => setFormData(prev => ({ ...prev, host: e.target.value }))}
              placeholder={type === 'api' ? 'https://api.exemplo.com' : 'db.exemplo.com'}
            />
          </div>
        )}

        {fields.includes('port') && (
          <div>
            <Label>Porta</Label>
            <Input
              type="number"
              value={formData.port || ''}
              onChange={e => setFormData(prev => ({ ...prev, port: parseInt(e.target.value) || undefined }))}
            />
          </div>
        )}

        {fields.includes('database') && (
          <div>
            <Label>Database / Schema</Label>
            <Input
              value={formData.database || ''}
              onChange={e => setFormData(prev => ({ ...prev, database: e.target.value }))}
              placeholder="meu_banco"
            />
          </div>
        )}

        {fields.includes('username') && (
          <div>
            <Label>Usuário</Label>
            <Input
              value={formData.username || ''}
              onChange={e => setFormData(prev => ({ ...prev, username: e.target.value }))}
              placeholder="usuario"
            />
          </div>
        )}

        {fields.includes('password') && (
          <div>
            <Label>Senha</Label>
            <div className="relative">
              <Input
                type={showPassword[formData.type || ''] ? 'text' : 'password'}
                value={formData.password || ''}
                onChange={e => setFormData(prev => ({ ...prev, password: e.target.value }))}
                placeholder="********"
              />
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-0 top-0 h-full"
                onClick={() => setShowPassword(prev => ({ ...prev, [formData.type || '']: !prev[formData.type || ''] }))}
              >
                {showPassword[formData.type || ''] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}

        {fields.includes('apiKey') && (
          <div>
            <Label>API Key</Label>
            <Input
              type="password"
              value={formData.apiKey || ''}
              onChange={e => setFormData(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
            />
          </div>
        )}

        {fields.includes('projectId') && (
          <div>
            <Label>Project ID (Google Cloud)</Label>
            <Input
              value={formData.projectId || ''}
              onChange={e => setFormData(prev => ({ ...prev, projectId: e.target.value }))}
              placeholder="meu-projeto-123"
            />
          </div>
        )}

        {fields.includes('clientEmail') && (
          <div>
            <Label>Client Email (Service Account)</Label>
            <Input
              value={formData.clientEmail || ''}
              onChange={e => setFormData(prev => ({ ...prev, clientEmail: e.target.value }))}
              placeholder="client@project.iam.gserviceaccount.com"
            />
          </div>
        )}

        {fields.includes('privateKey') && (
          <div>
            <Label>Private Key</Label>
            <textarea
              className="flex min-h-[100px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              value={formData.privateKey || ''}
              onChange={e => setFormData(prev => ({ ...prev, privateKey: e.target.value }))}
              placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
            />
          </div>
        )}

        {(type === 'postgresql' || type === 'mysql' || type === 'sqlserver' || type === 'mongodb') && (
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label>SSL/TLS</Label>
              <p className="text-sm text-muted-foreground">Criptografar conexão</p>
            </div>
            <Switch
              checked={formData.sslEnabled ?? true}
              onCheckedChange={checked => setFormData(prev => ({ ...prev, sslEnabled: checked }))}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-700">Conexões de Dados</h1>
          <p className="text-muted-foreground mt-1">
            Gerencie conexões com bancos de dados e serviços externos
          </p>
        </div>
        <div className="flex gap-2">
          <Select onValueChange={(value) => handleOpenNew(value as ConnectionType)}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Nova Conexão" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(connectionTypeInfo).map(([key, info]) => (
                <SelectItem key={key} value={key}>
                  <div className="flex items-center gap-2">
                    <info.icon className={`w-4 h-4 ${info.color}`} />
                    {info.title}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Quick Connect */}
      {connections.length === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="font-medium text-blue-800 mb-3 flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Conexões Rápidas
          </h3>
          <p className="text-sm text-blue-600 mb-3">
            Escolha um provedor pré-configurado para começar rapidamente:
          </p>
          <div className="flex flex-wrap gap-2">
            {quickConnectProviders.map((provider) => (
              <Button
                key={provider.type}
                variant="outline"
                size="sm"
                className="bg-white"
                onClick={() => {
                  setEditingConnection(null);
                  setFormData({
                    ...getEmptyForm(provider.type),
                    name: provider.name,
                    host: provider.host,
                  });
                  setModalOpen(true);
                }}
              >
                {React.createElement(connectionTypeInfo[provider.type].icon, { className: "w-4 h-4 mr-2" })}
                {provider.name}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Connections Grid */}
      {connections.length === 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.entries(connectionTypeInfo).map(([key, info]) => {
            const Icon = info.icon;
            return (
              <Card key={key} className="flex flex-col hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handleOpenNew(key as ConnectionType)}
              >
                <CardHeader>
                  <div className="flex items-start gap-4">
                    <div className={`p-3 rounded-lg ${info.bgColor}`}>
                      <Icon className={`w-6 h-6 ${info.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{info.title}</CardTitle>
                      <CardDescription className="text-sm mt-1">{info.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardFooter>
                  <Button variant="outline" className="w-full">
                    <Plus className="mr-2 h-4 w-4" />
                    Configurar
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {connections.map((conn) => {
            const info = connectionTypeInfo[conn.type];
            const Icon = info.icon;
            const isLoading = loadingState[conn.id];

            return (
              <Card key={conn.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className={`p-3 rounded-lg ${info.bgColor}`}>
                        <Icon className={`w-6 h-6 ${info.color}`} />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{conn.name}</CardTitle>
                        <CardDescription className="text-sm mt-1">{info.title}</CardDescription>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-slate-400 hover:text-red-500"
                      onClick={() => handleDelete(conn.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="flex-grow space-y-3">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    {conn.connected ? (
                      <div className="flex items-center gap-2 text-green-600 bg-green-50 px-2 py-1 rounded-md border border-green-200">
                        <Wifi className="w-4 h-4" />
                        <span className="text-sm font-medium">Conectado</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-slate-500 bg-slate-100 px-2 py-1 rounded-md border">
                        <WifiOff className="w-4 h-4" />
                        <span className="text-sm font-medium">Desconectado</span>
                      </div>
                    )}
                    {conn.lastTested && (
                      <span className="text-xs text-slate-400">
                        Testado: {conn.lastTested.toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>

                  {/* Detalhes da conexão */}
                  <div className="space-y-1 text-sm text-slate-500">
                    {conn.config.host && (
                      <div className="flex items-center gap-2">
                        <Globe className="w-3 h-3" />
                        <span className="truncate">{conn.config.host}</span>
                      </div>
                    )}
                    {conn.config.database && (
                      <div className="flex items-center gap-2">
                        <Database className="w-3 h-3" />
                        <span className="truncate">{conn.config.database}</span>
                      </div>
                    )}
                    {conn.config.username && (
                      <div className="flex items-center gap-2">
                        <Key className="w-3 h-3" />
                        <span>{conn.config.username}</span>
                      </div>
                    )}
                  </div>

                  {conn.config.sslEnabled && (
                    <div className="flex items-center gap-1 text-xs text-green-600">
                      <Shield className="w-3 h-3" />
                      SSL habilitado
                    </div>
                  )}

                  {/* Criado em */}
                  <div className="text-xs text-slate-400">
                    Criado em: {conn.createdAt.toLocaleDateString('pt-BR')}
                  </div>
                </CardContent>
                <CardFooter className="grid grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestConnection(conn.id)}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-1 h-4 w-4" />
                    )}
                    Testar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleOpenEdit(conn)}
                  >
                    <Settings className="mr-1 h-4 w-4" />
                    Editar
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Configuração */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingConnection ? (
                <>Editar: {editingConnection.name}</>
              ) : (
                <>
                  Nova Conexão: {connectionTypeInfo[formData.type || 'postgresql']?.title}
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              Configure os parâmetros de conexão abaixo.
            </DialogDescription>
          </DialogHeader>

          {/* Tipo de conexão (só na criação) */}
          {!editingConnection && (
            <div className="mb-4">
              <Label>Tipo de Conexão</Label>
              <Select
                value={formData.type}
                onValueChange={(value) => {
                  const type = value as ConnectionType;
                  setFormData(getEmptyForm(type));
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(connectionTypeInfo).map(([key, info]) => (
                    <SelectItem key={key} value={key}>
                      <div className="flex items-center gap-2">
                        <info.icon className={`w-4 h-4 ${info.color}`} />
                        {info.title}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {renderFormFields()}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave}>
              {editingConnection ? 'Salvar Alterações' : 'Criar Conexão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
