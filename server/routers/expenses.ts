import { TRPCError } from "@trpc/server";
import { collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, setDoc } from "firebase/firestore";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../../firebase";

const parseAmount = (value: unknown): number => {
  if (typeof value === "number") return value;
  if (!value) return 0;
  // Remove R$, espaços normais (\s) e espaços não-quebráveis (\u00A0)
  let str = String(value).replace(/[R$\s\u00A0]/g, "").trim();
  
  // Lógica robusta para detectar formato BR (1.000,00) vs US (1,000.00)
  if (str.includes(",") && str.includes(".")) {
    const lastDotIndex = str.lastIndexOf(".");
    const lastCommaIndex = str.lastIndexOf(",");
    if (lastCommaIndex > lastDotIndex) {
      // Vírgula por último = Decimal BR (ex: 1.000,00)
      str = str.replace(/\./g, "");
      str = str.replace(",", ".");
    } else {
      // Ponto por último = Decimal US (ex: 1,000.00)
      str = str.replace(/,/g, "");
    }
  } else if (str.includes(",")) {
    // Apenas vírgula: Assume decimal BR (ex: 100,00)
    str = str.replace(/\./g, "");
    str = str.replace(",", ".");
  } else if (str.includes(".")) {
    const parts = str.split(".");
    if (parts.length > 2) {
      // Múltiplos pontos = Milhar (ex: 1.000.000)
      str = str.replace(/\./g, "");
    } else {
      // Um ponto: Se tiver 3 casas decimais exatas, assume milhar (ex: 1.000)
      // Caso contrário (ex: 10.50), assume decimal
      if (parts[1].length === 3) {
        str = str.replace(/\./g, "");
      }
    }
  }
  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
};

export const expensesRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.coerce.string().optional() }))
    .query(async ({ input }) => {
      const expensesRef = collection(db, "expenses");
      const q = (input.projectId && input.projectId !== "all")
        ? query(expensesRef, where("projectId", "==", input.projectId))
        : query(expensesRef);
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        };
      });
    }),

  listByBudget: protectedProcedure
    .input(z.object({ budgetId: z.coerce.string() }))
    .query(async ({ input }) => {
      const expensesRef = collection(db, "expenses");
      const q = query(expensesRef, where("budgetId", "==", input.budgetId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          date: data.date?.toDate ? data.date.toDate().toISOString() : data.date,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        };
      });
    }),

  fetchNfeData: protectedProcedure
    .input(z.object({ accessKey: z.string().length(44, "A chave de acesso deve ter 44 dígitos.") }))
    .mutation(async ({ input }) => {
      // =================================================================
      // INTEGRAÇÃO COM API DE NOTA FISCAL
      // Aqui você faria a chamada para um serviço externo de consulta de NF-e
      // usando a `input.accessKey`.
      //
      // Exemplo (usando um serviço fictício `nfeApi`):
      //
      // try {
      //   const nfeData = await nfeApi.consultar(input.accessKey);
      //   return {
      //     description: `NF-e ${nfeData.numero} - ${nfeData.fornecedor.nome}`,
      //     amount: nfeData.valorTotal.toString(),
      //     date: nfeData.dataEmissao,
      //     notes: `Fornecedor: ${nfeData.fornecedor.nome}, CNPJ: ${nfeData.fornecedor.cnpj}`
      //   };
      // } catch (error) {
      //   throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Falha ao consultar dados da NF-e.' });
      // }
      //
      // Como não temos uma API real, vamos retornar dados mocados.
      // =================================================================

      // REMOVIDO: Simulação de chamada de API com um pequeno delay
      // REMOVIDO: MOCK: Simulação de uma nota fiscal com múltiplos itens
      // REMOVIDO: Calcula o total somando os itens
      // REMOVIDO: Cria uma lista formatada para o campo de notas

      throw new TRPCError({
        code: 'NOT_IMPLEMENTED',
        message: 'A integração com a API de Nota Fiscal não está implementada. Por favor, configure a chamada para um serviço externo de consulta de NF-e.',
      });
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.coerce.string(),
        budgetId: z.union([z.string(), z.number()]).optional().nullable(),
        description: z.string(),
        amount: z.string(),
        type: z.enum(["capex", "opex"]),
        category: z.string().optional(),
        date: z.string().or(z.date()),
        notes: z.string().optional(),
        assetId: z.string().optional().nullable(),
      })
    )
    .mutation(async ({ input }) => {
      const projectRef = doc(db, "projects", input.projectId);
      const projectSnap = await getDoc(projectRef);

      if (!projectSnap.exists()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado." });
      }

      const projectData = projectSnap.data();
      const blockedStatuses = ["aprovado", "em_andamento", "concluido"];
      if (blockedStatuses.includes(projectData.status)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Não é possível alocar despesas para projetos com status "${projectData.status}". O projeto já foi aprovado e as despesas estão bloqueadas.`,
        });
      }

      const id = Date.now().toString();
      
      // Sanitiza o budgetId para garantir que não salve "null" (texto) ou "" (vazio)
      const rawBudgetId = input.budgetId;
      const budgetId = (rawBudgetId && String(rawBudgetId) !== "null" && String(rawBudgetId) !== "") 
        ? String(rawBudgetId).trim().replace(/['"]/g, "") 
        : null;

      await setDoc(doc(db, "expenses", id), {
        ...input,
        budgetId,
        category: input.category ?? null,
        notes: input.notes ?? null,
        assetId: input.assetId ?? null, // Explicitly set assetId
        date: new Date(input.date),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Atualizar o valor realizado no budget vinculado
      if (budgetId) {
        const budgetRef = doc(db, "budgets", budgetId);
        const budgetSnap = await getDoc(budgetRef);
        
        if (budgetSnap.exists()) {
          const budgetData = budgetSnap.data();
          const currentRealized = parseAmount(budgetData.realizedAmount);
          const expenseAmount = parseAmount(input.amount);
          const newRealized = (currentRealized + expenseAmount).toFixed(2);
          
          await updateDoc(budgetRef, { realizedAmount: newRealized });
        }
      }

      // Atualizar o valor total de CAPEX do ativo, se houver
      if (input.assetId) {
        const assetRef = doc(db, "assets", String(input.assetId));
        const assetSnap = await getDoc(assetRef);

        if (assetSnap.exists()) {
          const assetData = assetSnap.data();
          const currentTotalCapex = parseAmount(assetData.totalCapex || 0);
          const expenseAmount = parseAmount(input.amount);
          const newTotalCapex = (currentTotalCapex + expenseAmount).toFixed(2);

          await updateDoc(assetRef, { totalCapex: newTotalCapex });
        }
      }

      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.coerce.string(),
        budgetId: z.union([z.string(), z.number()]).optional().nullable(),
        description: z.string().optional(),
        amount: z.string().optional(),
        type: z.enum(["capex", "opex"]).optional(),
        category: z.string().optional(),
        date: z.string().or(z.date()).optional(),
        notes: z.string().optional(),
        assetId: z.string().optional().nullable(),
        accountingAccount: z.string().optional().nullable(), // Adicionado
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const docRef = doc(db, "expenses", id);
      const expenseSnap = await getDoc(docRef);

      if (!expenseSnap.exists()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Despesa não encontrada" });
      }

      const currentData = expenseSnap.data();
      const oldAmount = parseAmount(currentData.amount);
      const newAmount = data.amount ? parseAmount(data.amount) : oldAmount;
      
      const oldBudgetId = currentData.budgetId || null;
      const oldAssetId = currentData.assetId || null; // Get old assetId

      // Sanitiza o novo budgetId se ele foi enviado
      const rawNewBudgetId = data.budgetId;
      const newBudgetId = rawNewBudgetId !== undefined 
        ? ((rawNewBudgetId && String(rawNewBudgetId) !== "null" && String(rawNewBudgetId) !== "") 
            ? String(rawNewBudgetId).trim().replace(/['"]/g, "") 
            : null)
        : oldBudgetId;

      // Sanitiza o novo assetId se ele foi enviado
      const rawNewAssetId = data.assetId;
      const newAssetId = rawNewAssetId !== undefined
        ? ((rawNewAssetId && rawNewAssetId !== null && rawNewAssetId !== "")
            ? rawNewAssetId
            : null)
        : oldAssetId;

      // Lógica de atualização de saldo nos budgets (se mudou valor ou budget)
      // if (oldAmount !== newAmount || oldBudgetId !== newBudgetId) {
      //   // 1. Remover valor do budget antigo
      //   if (oldBudgetId) {
      //     const oldBudgetRef = doc(db, "budgets", oldBudgetId);
      //     const oldBudgetSnap = await getDoc(oldBudgetRef);
      //     if (oldBudgetSnap.exists()) {
      //       const currentRealized = parseAmount(oldBudgetSnap.data().realizedAmount);
      //       await updateDoc(oldBudgetRef, { realizedAmount: (currentRealized - oldAmount).toFixed(2) });
      //     }
      //   }

      //   // 2. Adicionar valor ao budget novo
      //   if (newBudgetId) {
      //     const newBudgetRef = doc(db, "budgets", newBudgetId);
      //     const newBudgetSnap = await getDoc(newBudgetRef);
      //     if (newBudgetSnap.exists()) {
      //       const currentRealized = parseAmount(newBudgetSnap.data().realizedAmount);
      //       await updateDoc(newBudgetRef, { realizedAmount: (currentRealized + newAmount).toFixed(2) });
      //     }
      //   }
      // }

      // Lógica de atualização do totalCapex do ativo (se mudou valor ou ativo)
      // if (oldAmount !== newAmount || oldAssetId !== newAssetId) {
      //   // 1. Remover valor do ativo antigo
      //   if (oldAssetId) {
      //     const oldAssetRef = doc(db, "assets", oldAssetId);
      //     const oldAssetSnap = await getDoc(oldAssetRef);
      //     if (oldAssetSnap.exists()) {
      //       const currentTotalCapex = parseAmount(oldAssetSnap.data().totalCapex || 0);
      //       await updateDoc(oldAssetRef, { totalCapex: (currentTotalCapex - oldAmount).toFixed(2) });
      //     }
      //   }

      //   // 2. Adicionar valor ao ativo novo
      //   if (newAssetId) {
      //     const newAssetRef = doc(db, "assets", newAssetId);
      //     const newAssetSnap = await getDoc(newAssetRef);
      //     if (newAssetSnap.exists()) {
      //       const currentTotalCapex = parseAmount(newAssetSnap.data().totalCapex || 0);
      //       await updateDoc(newAssetRef, { totalCapex: (currentTotalCapex + newAmount).toFixed(2) });
      //     }
      //   }
      // }


      const updateData: any = { ...data, updatedAt: new Date() };
      if (data.date) updateData.date = new Date(data.date);
      if (data.budgetId !== undefined) updateData.budgetId = newBudgetId;
      if (data.assetId !== undefined) updateData.assetId = newAssetId; // Update assetId in expense document
      if (data.accountingAccount !== undefined) updateData.accountingAccount = data.accountingAccount || null; // Handle accountingAccount

      // Remove undefined keys to prevent Firestore error
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          delete updateData[key];
        }
      });

      await updateDoc(docRef, updateData);
      return { success: true };
    }),

  linkToBudget: protectedProcedure
    .input(
      z.object({
        expenseIds: z.array(z.string()),
        budgetId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { expenseIds, budgetId } = input;
      
      // Atualizar despesas em paralelo
      const updates = expenseIds.map(id => 
        updateDoc(doc(db, "expenses", id), { 
          budgetId: String(budgetId).trim().replace(/['"]/g, ""), 
          updatedAt: new Date() 
        })
      );

      await Promise.all(updates);
      return { success: true };
    }),

  linkToAsset: protectedProcedure
    .input(
      z.object({
        expenseId: z.string(),
        assetId: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const { expenseId, assetId } = input;
      const expenseRef = doc(db, "expenses", expenseId);
      
      await updateDoc(expenseRef, { 
        assetId: assetId,
        updatedAt: new Date() 
      });

      // Optional: We might need to recalculate asset value here in the future
      
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.coerce.string() }))
    .mutation(async ({ input }) => {
      const docRef = doc(db, "expenses", input.id);
      
      // Antes de deletar, recuperar dados para subtrair do budget e do ativo
      const expenseSnap = await getDoc(docRef);
      if (expenseSnap.exists()) {
        const expenseData = expenseSnap.data();
        const expenseAmount = parseAmount(expenseData.amount);

        // Subtrair do budget, se houver
        if (expenseData.budgetId) {
          const budgetRef = doc(db, "budgets", expenseData.budgetId);
          const budgetSnap = await getDoc(budgetRef);
          if (budgetSnap.exists()) {
            const currentRealized = parseAmount(budgetSnap.data().realizedAmount);
            await updateDoc(budgetRef, { realizedAmount: (currentRealized - expenseAmount).toFixed(2) });
          }
        }

        // Subtrair do totalCapex do ativo, se houver
        if (expenseData.assetId) {
          const assetRef = doc(db, "assets", String(expenseData.assetId));
          const assetSnap = await getDoc(assetRef);
          if (assetSnap.exists()) {
            const currentTotalCapex = parseAmount(assetSnap.data().totalCapex || 0);
            await updateDoc(assetRef, { totalCapex: (currentTotalCapex - expenseAmount).toFixed(2) });
          }
        }
      }

      await deleteDoc(docRef);
      return { success: true };
    }),
});