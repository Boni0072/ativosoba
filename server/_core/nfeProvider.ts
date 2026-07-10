// server/_core/nfeProvider.ts

import { consultarNfe } from '../nfe-scraper';

export interface NfeData {
  description: string;
  amount: number;
  date: string; // ISO date string
  notes?: string;
  isHomologation?: boolean;
}

/**
 * Simula a consulta a uma API de NF-e interna.
 * Em um ambiente de produção real, esta função faria uma chamada HTTP para um serviço externo.
 * Para fins de desenvolvimento/teste, ela retorna dados mocados.
 *
 * @param accessKey A chave de acesso da NF-e (44 dígitos).
 * @returns Dados da NF-e simulados.
 */
export async function fetchNfeDataInternal(accessKey: string): Promise<NfeData> {
  try {
    // Chama a função de scraping para obter os dados reais
    const nfeData = await consultarNfe(accessKey);
    return nfeData;
  } catch (error: any) {
    console.error(`[Provider] Erro ao consultar NF-e ${accessKey}:`, error);
    // Propaga o erro para ser tratado pelo endpoint da API
    throw new Error(error.message || 'Falha no provedor de dados da NF-e.');
  }
}
