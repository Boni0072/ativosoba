import React, { useState, useEffect, useRef } from "react";
import { db, storage } from "@/lib/firebase";
import { collection, onSnapshot, query, where, addDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Pencil, Plus, Trash2, AlertTriangle, FileText, X, Check, Camera, CameraOff, ScanLine, Search, Database, Key } from "lucide-react";
import { toast } from "sonner";

export default function ExpensesPage() {
  const [projects, setProjects] = useState<any[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "projects"), (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(data);
    });
    return () => unsubscribe();
  }, []);

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedProjectId) {
      setIsLoading(true);
      const q = query(collection(db, "expenses"), where("projectId", "==", String(selectedProjectId)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setExpenses(data);
        setIsLoading(false);
      });
      return () => unsubscribe();
    } else {
      setExpenses([]);
    }
  }, [selectedProjectId]);

  const selectedProject = projects?.find(p => String(p.id) === String(selectedProjectId));

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [nfeKey, setNfeKey] = useState("");
  const [formData, setFormData] = useState({
    description: "",
    amount: "",
    quantity: "1",
    type: "capex" as "capex" | "opex",
    category: "",
    date: new Date().toISOString().split("T")[0],
    notes: "",
    assetId: null as string | null,
    attachment: null as File | null,
    invoiceNumber: "",
    ncm: "",
    projectId: null as string | null,
    cfop: "",
    unit: "",
  });
  const [nfeProducts, setNfeProducts] = useState<any[]>([]);

  const [assets, setAssets] = useState<any[] | null>(null);

  useEffect(() => {
    if (formData.projectId) {
      setAssets(null);
      const q = query(collection(db, "assets"), where("projectId", "==", String(formData.projectId)));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setAssets(data);
      });
      return () => unsubscribe();
    } else {
      setAssets(null);
    }
  }, [formData.projectId]);

  const selectedProjectForForm = projects?.find(p => String(p.id) === String(formData.projectId));
  // Bloqueia despesas se o projeto já foi aprovado pela diretoria (status 'aprovado', 'em_andamento', 'concluido')
  const isBlocked = selectedProjectForForm?.status === 'aprovado' || selectedProjectForForm?.status === 'em_andamento' || selectedProjectForForm?.status === 'concluido';


  const resetForm = () => {
    setFormData({
      description: "",
      amount: "",
      quantity: "1",
      type: "capex",
      category: "",
      date: new Date().toISOString().split("T")[0],
      notes: "",
      assetId: null,
      attachment: null,
      invoiceNumber: "",
      ncm: "",
      projectId: null,
      cfop: "",
      unit: "",
    });
    setNfeProducts([]);
    setEditingId(null);
    setNfeKey("");
  };

  // Scanner de código de barras
  const [scannerActive, setScannerActive] = useState(false);
  const [scannerSupported, setScannerSupported] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!('BarcodeDetector' in window)) {
      setScannerSupported(false);
    }
  }, []);

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
        } catch (err) {}
      }, 500);
    } catch (err) {
      toast.error('Não foi possível acessar a câmera.');
      setScannerActive(false);
    }
  };

  const stopScanner = () => {
    if (scanIntervalRef.current) { clearInterval(scanIntervalRef.current); scanIntervalRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
    setScannerActive(false);
  };

  useEffect(() => {
    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  // Conexões salvas para consulta NF-e
  const [savedConnections, setSavedConnections] = useState<any[]>([]);
  const [selectedNfeConn, setSelectedNfeConn] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('data_connections');
    if (saved) {
      try {
        setSavedConnections(JSON.parse(saved));
      } catch (e) {}
    }
  }, []);

  // Recarregar conexões quando houver mudança no localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('data_connections');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSavedConnections(parsed.map((c: any) => ({
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

  const handleFetchNfe = async () => {
    const cleaned = nfeKey.replace(/\D/g, '');
    if (cleaned.length !== 44) {
      toast.error('A chave deve ter exatamente 44 dígitos.');
      return;
    }

    if (!selectedNfeConn) {
      toast.error('Selecione uma conexão ativa para consultar.');
      return;
    }

    const conn = savedConnections.find((c: any) => c.id === selectedNfeConn);
    if (!conn || !conn.connected) {
      toast.error('A conexão selecionada não está ativa. Conecte-se na página de Conexões.');
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/nfe/${cleaned}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Falha ao consultar a NF-e.');
      }
      const nfeData = await response.json();

      setNfeProducts(nfeData.products || []);
      setFormData(prev => ({
        ...prev,
        description: nfeData.description || `NF-e: ${nfeData.emitente?.nome || 'Desconhecido'}`,
        amount: String(nfeData.amount || '0'),
        date: nfeData.date ? new Date(nfeData.date).toISOString().split("T")[0] : prev.date,
        invoiceNumber: nfeData.numero || '',
        notes: nfeData.notes || `Itens importados da NF-e ${nfeData.numero}.`
      }));

      toast.success(`NF-e ${nfeData.numero || ''} consultada via ${conn.name}!`, {
        description: `${nfeData.products?.length || 0} itens foram importados.`
      });
    } catch (error: any) {
      toast.error("Erro na Consulta", { description: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAttachmentChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFormData(prev => ({ ...prev, attachment: file }));

    // Se for XML, processa os dados
    if (file.name.toLowerCase().endsWith('.xml')) {
      try {
        const text = await file.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(text, "text/xml");

        const get = (tag: string, parent: Element | Document = xmlDoc) => {
          const el = parent.getElementsByTagName(tag)[0];
          return el ? el.textContent?.trim() || "" : "";
        };

        const emitente = get("xNome", xmlDoc.getElementsByTagName("emit")[0]);
        const nNF = get("nNF");
        const dhEmi = get("dhEmi") || get("dEmi");
        const vNF = get("vNF");
        const infCpl = get("infCpl");

        const products: any[] = [];
        const dets = xmlDoc.getElementsByTagName("det");
        
        for (let i = 0; i < dets.length; i++) {
            const prod = dets[i].getElementsByTagName("prod")[0];
            const imposto = dets[i].getElementsByTagName("imposto")[0];
            const icmsWrapper = imposto?.getElementsByTagName("ICMS")[0];
            const icmsNode = icmsWrapper ? icmsWrapper.firstElementChild : null;
            const ipiWrapper = imposto?.getElementsByTagName("IPI")[0];
            const ipiTrib = ipiWrapper?.getElementsByTagName("IPITrib")[0];

            if (prod) {
                products.push({
                    code: get("cProd", prod),
                    description: get("xProd", prod),
                    ncm: get("NCM", prod),
                    cest: get("CEST", prod),
                    cfop: get("CFOP", prod),
                    unit: get("uCom", prod),
                    quantity: parseFloat(get("qCom", prod) || "0"),
                    unitPrice: parseFloat(get("vUnCom", prod) || "0"),
                    totalPrice: parseFloat(get("vProd", prod) || "0"),
                    discount: parseFloat(get("vDesc", prod) || "0"),
                    cst: icmsNode ? (get("CST", icmsNode) || get("CSOSN", icmsNode)) : "",
                    orig: icmsNode ? get("orig", icmsNode) : "",
                    icmsBase: icmsNode ? parseFloat(get("vBC", icmsNode) || "0") : 0,
                    icmsValue: icmsNode ? parseFloat(get("vICMS", icmsNode) || "0") : 0,
                    icmsRate: icmsNode ? parseFloat(get("pICMS", icmsNode) || "0") : 0,
                    ipiValue: ipiTrib ? parseFloat(get("vIPI", ipiTrib) || "0") : 0,
                    ipiRate: ipiTrib ? parseFloat(get("pIPI", ipiTrib) || "0") : 0,
                });
            }
        }

        setNfeProducts(products);
        
        setFormData(prev => ({
            ...prev,
            description: emitente || prev.description,
            amount: vNF || prev.amount,
            date: dhEmi ? new Date(dhEmi).toISOString().split("T")[0] : prev.date,
            invoiceNumber: nNF || prev.invoiceNumber,
            notes: `${prev.notes} ${infCpl}`.trim(),
            ncm: products[0]?.ncm || prev.ncm,
            cfop: products[0]?.cfop || prev.cfop,
            unit: products[0]?.unit || prev.unit,
        }));

        toast.success("Dados extraídos do XML com sucesso!");
      } catch (error) {
        console.error("Erro ao processar XML", error);
        toast.error("Falha ao processar o arquivo XML.");
      }
    }
  };

  const handleOpenChange = (isOpen: boolean) => {
    setOpen(isOpen);
    if (isOpen) {
      if (!editingId) {
        setFormData(prev => ({ ...prev, projectId: selectedProjectId }));
      }
    } else {
      resetForm();
    }
  };

  const handleAddProductRow = () => {
    setNfeProducts([...nfeProducts, {
      code: "", description: "", ncm: "", cest: "", cst: "", orig: "", cfop: "", unit: "", quantity: 0, unitPrice: 0, totalPrice: 0, discount: 0, icmsBase: 0, icmsValue: 0, icmsRate: 0, ipiValue: 0, ipiRate: 0
    }]);
  };

  const handleRemoveProductRow = (index: number) => {
    const newProducts = [...nfeProducts];
    newProducts.splice(index, 1);
    setNfeProducts(newProducts);
  };

  const handleProductChange = (index: number, field: string, value: any) => {
    const newProducts = [...nfeProducts];
    newProducts[index] = { ...newProducts[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
        newProducts[index].totalPrice = Number(newProducts[index].quantity) * Number(newProducts[index].unitPrice);
    }
    setNfeProducts(newProducts);
  };

  const handleEdit = (expense: any) => {
    setFormData({
      description: expense.description,
      amount: expense.amount,
      quantity: expense.quantity ? String(expense.quantity) : "1",
      type: expense.type,
      category: expense.category || "",
      date: expense.date?.toDate ? expense.date.toDate().toISOString().split("T")[0] : (expense.date ? new Date(expense.date).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]),
      notes: expense.notes || "",
      assetId: expense.assetId ? String(expense.assetId) : null,
      attachment: null, // Reset attachment on edit for now
      invoiceNumber: expense.invoiceNumber || "",
      ncm: expense.ncm || "",
      cfop: expense.cfop || "",
      projectId: expense.projectId,
      unit: expense.unit || "",
    });
    setEditingId(expense.id);
    setOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.projectId) {
      toast.error("Selecione uma obra");
      return;
    }

    if (isBlocked && !editingId) {
      toast.error("Este projeto já foi aprovado e as despesas estão bloqueadas.");
      return;
    }

    let attachmentUrl = null;
    if (formData.attachment) {
      try {
        const fileName = `${Date.now()}_${formData.attachment.name}`;
        const storageRef = ref(storage, `expenses/${fileName}`);
        const snapshot = await uploadBytes(storageRef, formData.attachment);
        attachmentUrl = await getDownloadURL(snapshot.ref);
      } catch (error) {
        console.error("Erro ao fazer upload do arquivo:", error);
        toast.error("Erro ao salvar o anexo. Tente novamente.");
        return;
      }
    }

    const submissionData = {
      projectId: formData.projectId,
      description: formData.description,
      amount: formData.amount,
      quantity: Number(formData.quantity) || 1,
      type: formData.type,
      category: formData.category || "",
      date: new Date(formData.date),
      notes: formData.notes || "",
      assetId: formData.type === 'capex' ? formData.assetId : null,
      invoiceNumber: formData.invoiceNumber,
      attachmentUrl: attachmentUrl,
      ncm: formData.ncm,
      cfop: formData.cfop,
      unit: formData.unit,
    };

    console.log({ assetIdType: typeof submissionData.assetId, assetIdValue: submissionData.assetId });

    try {
      if (editingId) {
        const docRef = doc(db, "expenses", editingId);
        await updateDoc(docRef, {
          ...submissionData,
          date: new Date(formData.date).toISOString(), // Ensure date is ISO
          updatedAt: new Date().toISOString()
        });
        toast.success("Despesa atualizada com sucesso!");
      } else {
        await addDoc(collection(db, "expenses"), {
          ...submissionData,
          date: new Date(formData.date).toISOString(),
          createdAt: new Date().toISOString()
        });
        toast.success("Despesa criada com sucesso!");
      }
      setOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.message || (editingId ? "Erro ao atualizar despesa" : "Erro ao criar despesa"));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    try {
      await deleteDoc(doc(db, "expenses", id));
      toast.success("Despesa deletada com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao deletar despesa");
    }
  };

  const totalCapex = expenses?.filter(e => e.type === 'capex').reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const totalOpex = expenses?.filter(e => e.type === 'opex').reduce((sum, e) => sum + Number(e.amount), 0) || 0;
  const totalGeneral = totalCapex + totalOpex;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-slate-700">Despesas</h1>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm h-10 px-6">
              <Plus size={20} />
              Nova Despesa
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-4xl flex flex-col max-h-[90vh]">
            <DialogHeader className="flex flex-row items-start justify-between border-b pb-4 space-y-0 gap-4">
              <div className="flex flex-col gap-1">
                <DialogTitle>{editingId ? "Editar Despesa" : "Registrar Nova Despesa"}</DialogTitle>
                <DialogDescription>Insira os detalhes da nova despesa, importando de uma NF-e ou preenchendo manualmente.</DialogDescription>
              </div>
              <Button type="submit" form="expense-form" className="bg-green-600 hover:bg-green-700 text-white font-bold shadow-md shrink-0" disabled={(isBlocked && !editingId)}>
                <Check className="mr-2 h-4 w-4" /> 
                {editingId ? "Atualizar" : "Registrar"}
              </Button>
            </DialogHeader>
            <form id="expense-form" onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="overflow-y-auto p-4 -mx-4 space-y-4 flex-1"> {/* Added scrollable div */}
              <div className="space-y-2 p-4 border rounded-lg bg-slate-50">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Search size={16} />
                  Importar da NF-e (Opcional)
                </label>
                
                {/* Seletor de Conexão */}
                <div className="flex gap-2">
                  <Select value={selectedNfeConn} onValueChange={setSelectedNfeConn}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Selecione uma conexão ativa..." />
                    </SelectTrigger>
                    <SelectContent>
                      {savedConnections.filter((c: any) => c.connected && c.type === 'api').length === 0 ? (
                        <SelectItem value="__none__" disabled>Nenhuma conexão ativa</SelectItem>
                      ) : (
                        savedConnections.filter((c: any) => c.connected && c.type === 'api').map((conn: any) => (
                          <SelectItem key={conn.id} value={conn.id}>
                            <div className="flex items-center gap-2">
                              <Database className="w-3 h-3 text-green-500" />
                              <span>{conn.name}</span>
                              <span className="text-xs text-slate-400">({conn.type})</span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Input da Chave com Scanner */}
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                    <Key className="w-4 h-4" />
                  </div>
                  <Input
                    value={nfeKey.replace(/(\d{4})(?=\d)/g, '$1 ')}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/\D/g, '');
                      if (cleaned.length <= 44) setNfeKey(cleaned);
                    }}
                    placeholder="0000 0000 0000 0000 0000 0000 0000 0000 0000 0000 0000"
                    className="pl-10 pr-20 font-mono text-sm tracking-wider"
                    maxLength={55}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    {scannerSupported && (
                      <button
                        type="button"
                        onClick={scannerActive ? stopScanner : startScanner}
                        className={`p-1 rounded-md transition-colors ${
                          scannerActive 
                            ? 'bg-red-100 text-red-600' 
                            : 'bg-slate-100 text-slate-500 hover:bg-blue-100 hover:text-blue-600'
                        }`}
                        title={scannerActive ? 'Parar scanner' : 'Ler código de barras'}
                      >
                        {scannerActive ? <CameraOff className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                      </button>
                    )}
                    <span className={`text-[10px] font-bold ${nfeKey.replace(/\D/g, '').length === 44 ? 'text-green-500' : 'text-slate-400'}`}>
                      {nfeKey.length}/44
                    </span>
                  </div>
                </div>

                {/* Preview da Câmera */}
                {scannerActive && (
                  <div className="relative rounded-lg overflow-hidden border-2 border-blue-400 bg-black">
                    <video ref={videoRef} className="w-full h-36 object-cover" playsInline muted />
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="w-3/4 h-0.5 bg-blue-400/60 animate-pulse rounded-full" />
                    </div>
                    <div className="absolute top-2 left-2 bg-blue-600/80 text-white text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                      <ScanLine className="w-3 h-3 animate-pulse" />
                      Apontando para o código de barras...
                    </div>
                    <button type="button" onClick={stopScanner} className="absolute top-2 right-2 bg-red-500/80 text-white p-1 rounded-full hover:bg-red-600 transition">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Botão Buscar */}
                <Button
                  type="button"
                  onClick={handleFetchNfe}
                  disabled={isLoading || nfeKey.replace(/\D/g, '').length !== 44 || !selectedNfeConn}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm gap-2"
                >
                  {isLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Consultando NF-e...</>
                  ) : (
                    <><Search className="h-4 w-4" /> Consultar Nota Fiscal</>
                  )}
                </Button>

                {!scannerSupported && (
                  <div className="flex items-center gap-1 text-[10px] text-amber-600">
                    <AlertTriangle className="w-3 h-3" />
                    <span>Scanner não suportado neste navegador.</span>
                  </div>
                )}
              </div>
              <div>
                <label className="text-sm font-medium">Obra</label>
                <Select value={formData.projectId || ""} onValueChange={(v) => setFormData(prev => ({ ...prev, projectId: v, assetId: null }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma obra" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects?.map((p) => (
                      <SelectItem key={p.id} value={p.id.toString()}>
                        {p.name} {(p.status === 'aprovado' || p.status === 'em_andamento' || p.status === 'concluido') ? '(Bloqueado)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {formData.projectId && isBlocked && !editingId && (
                <div className="flex items-center gap-2 p-3 text-sm text-yellow-800 bg-yellow-50 border border-yellow-200 rounded-md">
                  <AlertTriangle size={16} />
                  <span>Projeto aprovado/concluído. Despesas bloqueadas.</span>
                </div>
              )}

              <div>
                <label className="text-sm font-medium">Descrição</label>
                <Input
                  required
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Ex: Compra de cimento"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Valor (R$)</label>
                  <Input
                    required
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Quantidade</label>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium">NCM</label>
                  <Input
                    value={formData.ncm}
                    onChange={(e) => setFormData({ ...formData, ncm: e.target.value })}
                    placeholder="0000.00.00"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">CFOP</label>
                  <Input
                    value={formData.cfop}
                    onChange={(e) => setFormData({ ...formData, cfop: e.target.value })}
                    placeholder="0000"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Unidade</label>
                  <Input
                    value={formData.unit}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    placeholder="UN"
                  />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Tipo</label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v as "capex" | "opex" })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capex">Capex (Capital)</SelectItem>
                    <SelectItem value="opex">Opex (Operacional)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {formData.type === "capex" && (
                <div>
                  <label className="text-sm font-medium">Vincular ao Ativo</label>
                  <Select 
                    key={`${formData.projectId || "no-project"}-${assets?.length || 0}`} // Força atualização ao carregar ativos
                    disabled={!formData.projectId}
                    value={formData.assetId === null ? "none" : String(formData.assetId)} 
                    onValueChange={(v) => setFormData(prev => ({ ...prev, assetId: v === "none" ? null : v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={(!assets && formData.projectId) ? "Carregando..." : "Selecione um ativo (Opcional)"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {assets?.map((asset) => (
                        <SelectItem key={asset.id} value={String(asset.id)}>
                          {asset.tagNumber ? `${asset.tagNumber} - ${asset.name}` : asset.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Categoria</label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Materiais"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Data</label>
                <Input
                  type="date"
                  required
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Notas</label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Observações adicionais..."
                  className="min-h-[120px]"
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Número da Nota Fiscal</label>
                  <Input
                    value={formData.invoiceNumber}
                    onChange={(e) => setFormData({ ...formData, invoiceNumber: e.target.value })}
                    placeholder="Ex: 123456"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Arquivo (PDF/Imagem/XML)</label>
                  <Input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.xml"
                    onChange={handleAttachmentChange}
                    className="cursor-pointer"
                  />
                </div>
              </div>

              {formData.attachment && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-md flex items-center justify-between">
                    <div className="flex items-center gap-2 text-green-800 overflow-hidden">
                        <FileText size={18} className="shrink-0" />
                        <span className="text-sm font-medium truncate">{formData.attachment.name}</span>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-green-700 hover:text-red-600 hover:bg-green-100" onClick={() => setFormData({...formData, attachment: null})}>
                        <X size={14} />
                    </Button>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium">Dados dos Produtos / Serviços</label>
                  <Button type="button" variant="outline" size="sm" onClick={handleAddProductRow} className="h-6 text-xs"><Plus size={12} className="mr-1"/> Adicionar Item</Button>
                </div>
                <div className="border rounded-md overflow-x-auto bg-white">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-100 font-medium text-slate-600 border-b">
                      <tr>
                        <th className="px-2 py-1 whitespace-nowrap">CÓDIGO PRODUTO</th>
                        <th className="px-2 py-1">DESCRIÇÃO DO PRODUTO / SERVIÇO</th>
                        <th className="px-2 py-1 whitespace-nowrap">NCM/SH</th>
                        <th className="px-2 py-1 whitespace-nowrap">O/CST</th>
                        <th className="px-2 py-1 whitespace-nowrap">CFOP</th>
                        <th className="px-2 py-1 whitespace-nowrap">UN</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">QUANT</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">VALOR UNIT</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">VALOR TOTAL</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">VALOR DESC</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">B.CÁLC ICMS</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">VALOR ICMS</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">VALOR IPI</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">ALÍQ. ICMS</th>
                        <th className="px-2 py-1 text-right whitespace-nowrap">ALÍQ. IPI</th>
                        <th className="px-2 py-1 w-[30px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {nfeProducts.length > 0 ? (
                        nfeProducts.map((prod, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-1"><Input className="h-6 text-xs px-1 font-mono" value={prod.code} onChange={(e) => handleProductChange(idx, 'code', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1" value={prod.description} onChange={(e) => handleProductChange(idx, 'description', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-20" value={prod.ncm} onChange={(e) => handleProductChange(idx, 'ncm', e.target.value)} /></td>
                              <td className="p-1">
                                <div className="flex gap-0.5">
                                  <Input className="h-6 text-xs px-1 w-6" value={prod.orig} onChange={(e) => handleProductChange(idx, 'orig', e.target.value)} />
                                  <Input className="h-6 text-xs px-1 w-10" value={prod.cst} onChange={(e) => handleProductChange(idx, 'cst', e.target.value)} />
                                </div>
                              </td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-16" value={prod.cfop} onChange={(e) => handleProductChange(idx, 'cfop', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-12" value={prod.unit} onChange={(e) => handleProductChange(idx, 'unit', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-16 text-right" type="number" value={prod.quantity} onChange={(e) => handleProductChange(idx, 'quantity', e.target.value)} /></td>
                            <td className="p-1"><Input className="h-6 text-xs px-1 w-20 text-right" type="number" value={prod.unitPrice} onChange={(e) => handleProductChange(idx, 'unitPrice', e.target.value)} /></td>
                            <td className="p-1 text-right font-medium text-xs px-2">{Number(prod.totalPrice).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                              <td className="p-1"><Input className="h-6 text-xs px-1 w-16 text-right" type="number" value={prod.discount} onChange={(e) => handleProductChange(idx, 'discount', e.target.value)} /></td>
                              <td className="p-1"><Input className="h-6 text-xs px-1 w-16 text-right" type="number" value={prod.icmsBase} onChange={(e) => handleProductChange(idx, 'icmsBase', e.target.value)} /></td>
                              <td className="p-1"><Input className="h-6 text-xs px-1 w-16 text-right" type="number" value={prod.icmsValue} onChange={(e) => handleProductChange(idx, 'icmsValue', e.target.value)} /></td>
                              <td className="p-1"><Input className="h-6 text-xs px-1 w-16 text-right" type="number" value={prod.ipiValue} onChange={(e) => handleProductChange(idx, 'ipiValue', e.target.value)} /></td>
                              <td className="p-1"><Input className="h-6 text-xs px-1 w-12 text-right" type="number" value={prod.icmsRate} onChange={(e) => handleProductChange(idx, 'icmsRate', e.target.value)} /></td>
                              <td className="p-1"><Input className="h-6 text-xs px-1 w-12 text-right" type="number" value={prod.ipiRate} onChange={(e) => handleProductChange(idx, 'ipiRate', e.target.value)} /></td>
                            <td className="p-1 text-center"><Button variant="ghost" size="icon" className="h-6 w-6 text-red-500" onClick={() => handleRemoveProductRow(idx)}><X size={12} /></Button></td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={10} className="px-2 py-4 text-center text-slate-400 italic">Nenhum item importado. Utilize a busca por chave de acesso ou anexe um arquivo XML.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Project Selection */}
      <Card className="p-6">
        <label className="text-sm font-medium">Selecione uma Obra</label>
        <Select value={selectedProjectId || ""} onValueChange={(v) => setSelectedProjectId(v)}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione uma obra" />
          </SelectTrigger>
          <SelectContent>
            {projects?.map((p) => (
              <SelectItem key={p.id} value={p.id.toString()}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Card>

      {/* Summary */}
      {selectedProjectId && (
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="p-6">
            <p className="text-gray-500 text-sm mb-2">Total Capex</p>
            <p className="text-3xl font-bold text-blue-600">R$ {totalCapex.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </Card>
          <Card className="p-6">
            <p className="text-gray-500 text-sm mb-2">Total Opex</p>
            <p className="text-3xl font-bold text-green-600">R$ {totalOpex.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
          </Card>
        </div>
      )}

      {/* Expenses List */}
      {selectedProjectId && (
        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-96">
              <Loader2 className="animate-spin" />
            </div>
          ) : expenses && expenses.length > 0 ? (
            <div className="rounded-md border bg-white">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descrição</TableHead>
                    <TableHead>Categoria</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead className="text-center">Qtd</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Conta Contábil</TableHead>
                    <TableHead>Nota Fiscal</TableHead>
                    <TableHead>Notas</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="font-medium">{expense.description}</TableCell>
                      <TableCell>{expense.category || "—"}</TableCell>
                      <TableCell>{new Date(expense.date).toLocaleDateString("pt-BR")}</TableCell>
                      <TableCell className="text-center">{(expense as any).quantity || 1}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          expense.type === 'capex' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                        }`}>
                          {expense.type.toUpperCase()}
                        </span>
                      </TableCell>
                      <TableCell>{(expense as any).accountingAccount || "—"}</TableCell>
                      <TableCell>
                        {(expense as any).invoiceNumber ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-slate-600" title={`NF: ${(expense as any).invoiceNumber}`}>
                              <FileText size={14} />
                              <span className="text-xs font-medium">{(expense as any).invoiceNumber}</span>
                            </div>
                            {(expense as any).attachmentUrl && (
                              <a href={(expense as any).attachmentUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-600 hover:underline flex items-center gap-0.5">
                                <FileText size={10} /> Ver PDF
                              </a>
                            )}
                          </div>
                        ) : "—"}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={expense.notes || ""}>
                        {expense.notes || "—"}
                      </TableCell>
                      <TableCell className="text-right font-bold">R$ {Number(expense.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                        onClick={() => handleEdit(expense)}
                      >
                            <Pencil size={16} className="text-blue-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                        onClick={() => handleDelete(expense.id)}
                      >
                            <Trash2 size={16} className="text-red-600" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <tfoot className="bg-slate-50 font-bold">
                  <TableRow>
                    <TableCell colSpan={6} className="text-right">Total Acumulado</TableCell>
                    <TableCell className="text-right">
                      R$ {totalGeneral.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                </tfoot>
              </Table>
            </div>
          ) : (
            <Card className="p-12 text-center">
              <p className="text-gray-500">Nenhuma despesa registrada para esta obra.</p>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
