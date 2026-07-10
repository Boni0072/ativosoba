import { TRPCError } from "@trpc/server";
import { collection, doc, getDoc, getDocs, query, updateDoc, where, setDoc } from "firebase/firestore";
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

export const budgetsRouter = router({
  listByProject: protectedProcedure
    .input(z.object({ projectId: z.coerce.string() }))
    .query(async ({ input }) => {
      const budgetsRef = collection(db, "budgets");
      const q = query(budgetsRef, where("projectId", "==", input.projectId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt,
        };
      });
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.coerce.string() }))
    .query(async ({ input }) => {
      const docRef = doc(db, "budgets", input.id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) throw new TRPCError({ code: "NOT_FOUND", message: "Orçamento não encontrado" });
      
      // Calcular realizado em tempo real
      const expensesRef = collection(db, "expenses");
      
      // Busca despesas por budgetId (string e number)
      const bidStr = String(input.id);
      const bidNum = Number(input.id);
      const queries = [getDocs(query(expensesRef, where("budgetId", "==", bidStr)))];
      if (!isNaN(bidNum)) queries.push(getDocs(query(expensesRef, where("budgetId", "==", bidNum))));
      
      const snapshots = await Promise.all(queries);
      const uniqueExpenses = new Map();
      snapshots.forEach(snap => snap.docs.forEach(doc => uniqueExpenses.set(doc.id, doc)));
      
      let calculatedRealized = 0;
      uniqueExpenses.forEach((doc: any) => {
        const data = doc.data();
        calculatedRealized += parseAmount(data.amount);
      });

      return { 
        id: docSnap.id, 
        ...docSnap.data(),
        realizedAmount: calculatedRealized.toFixed(2),
        createdAt: docSnap.data().createdAt?.toDate ? docSnap.data().createdAt.toDate().toISOString() : docSnap.data().createdAt,
        updatedAt: docSnap.data().updatedAt?.toDate ? docSnap.data().updatedAt.toDate().toISOString() : docSnap.data().updatedAt,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        projectId: z.coerce.string(),
        name: z.string(),
        description: z.string().optional(),
        plannedAmount: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      const id = Date.now().toString();
      await setDoc(doc(db, "budgets", id), {
        ...input,
        description: input.description ?? null,
        realizedAmount: "0",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.coerce.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        plannedAmount: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const docRef = doc(db, "budgets", id);
      await updateDoc(docRef, { ...data, updatedAt: new Date() });
      return { success: true };
    }),

  recalculate: protectedProcedure
    .input(z.object({ projectId: z.coerce.string() }))
    .mutation(async ({ input }) => {
      // 1. Buscar todos os budgets do projeto
      const budgetsRef = collection(db, "budgets");
      const qBudgets = query(budgetsRef, where("projectId", "==", input.projectId));
      const budgetsSnap = await getDocs(qBudgets);

      // 2. Buscar todas as despesas do projeto
      const expensesRef = collection(db, "expenses");
      
      // Busca despesas por projectId (string e number)
      const pidStr = String(input.projectId);
      const pidNum = Number(input.projectId);
      const queries = [getDocs(query(expensesRef, where("projectId", "==", pidStr)))];
      if (!isNaN(pidNum) && pidStr !== String(pidNum)) queries.push(getDocs(query(expensesRef, where("projectId", "==", pidNum))));
      
      const snapshots = await Promise.all(queries);
      const uniqueExpenses = new Map<string, any>();
      snapshots.forEach(snap => snap.docs.forEach(doc => uniqueExpenses.set(doc.id, doc)));
      console.log(`[Recalculate] Project ${input.projectId}: Found ${uniqueExpenses.size} expenses.`);

      // 3. Calcular totais por budget
      const totals: Record<string, number> = {};
      
      // Inicializa zerado para todos os budgets
      budgetsSnap.docs.forEach(doc => {
        totals[doc.id] = 0;
      });

      // Soma as despesas
      uniqueExpenses.forEach((doc: any) => {
        const data = doc.data();
        const bId = data.budgetId ? String(data.budgetId).trim().replace(/['"]/g, "") : "";
        if (bId && totals[bId] !== undefined) {
          totals[bId] += parseAmount(data.amount);
        }
      });

      console.log("[Recalculate] Totals calculated:", totals);

      // 4. Atualiza os documentos
      const updates = budgetsSnap.docs.map(doc => 
        updateDoc(doc.ref, { realizedAmount: totals[doc.id].toFixed(2) })
      );

      await Promise.all(updates);
      return { success: true };
    }),
});