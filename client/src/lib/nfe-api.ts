import { toast } from "sonner";
import { playErrorSound } from "./utils";

export interface NfeProduct {
  code: string;
  description: string;
  ncm: string;
  cest: string;
  cfop: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  cst: string;
  orig: string;
}

export interface NfeData {
  description: string;
  amount: number;
  date: string;
  notes: string;
  products: NfeProduct[];
}

export const nfeApi = {
  consultar: async (chave: string): Promise<NfeData> => {
    // Backend removido. A consulta automática via chave requer servidor proxy.
    // O sistema agora utiliza o processamento local de XML.
    const msg = "A consulta online está desativada na versão 'apenas frontend'. Por favor, faça o upload do arquivo XML da nota.";
    
    playErrorSound();
    toast.error("Funcionalidade Indisponível", { description: "Use o upload de XML." });
    
    throw new Error(msg);
  }
};