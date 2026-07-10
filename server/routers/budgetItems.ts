import { TRPCError } from "@trpc/server";
import { collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, setDoc } from "firebase/firestore";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../../firebase";

export const budgetItemsRouter = router({
  listByBudget: protectedProcedure
    .input(z.object({ budgetId: z.coerce.string() }))
    .query(async ({ input }) => {
      const itemsRef = collection(db, "budgetItems");
      const q = query(itemsRef, where("budgetId", "==", input.budgetId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    }),

  listByProject: protectedProcedure
    .input(z.object({ projectId: z.coerce.string() }))
    .query(async ({ input }) => {
      // 1. Fetch all budgets for the project
      const budgetsRef = collection(db, "budgets");
      const qBudgets = query(budgetsRef, where("projectId", "==", input.projectId));
      const budgetsSnap = await getDocs(qBudgets);
      const budgetIds = budgetsSnap.docs.map(doc => doc.id);

      if (budgetIds.length === 0) {
        return [];
      }

      // 2. Fetch all budget items for those budgets, handling Firestore's 30-item limit for 'in' queries
      const itemsRef = collection(db, "budgetItems");
      const allItems: any[] = [];
      const idChunks: string[][] = [];

      for (let i = 0; i < budgetIds.length; i += 30) {
        idChunks.push(budgetIds.slice(i, i + 30));
      }

      for (const chunk of idChunks) {
        const qItems = query(itemsRef, where("budgetId", "in", chunk));
        const itemsSnap = await getDocs(qItems);
        itemsSnap.forEach(doc => {
          allItems.push({ id: doc.id, ...doc.data() });
        });
      }
      
      return allItems;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.coerce.string() }))
    .query(async ({ input }) => {
      const docRef = doc(db, "budgetItems", input.id);
      const docSnap = await getDoc(docRef);
      if (!docSnap.exists()) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
      return { id: docSnap.id, ...docSnap.data() };
    }),

  create: protectedProcedure
    .input(
      z.object({
        budgetId: z.coerce.string(),
        description: z.string(),
        amount: z.string(),
        type: z.enum(["capex", "opex"]),
        accountingClass: z.string().optional(),
        assetClass: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const id = Date.now().toString();
      await setDoc(doc(db, "budgetItems", id), {
        ...input,
        accountingClass: input.accountingClass ?? null,
        assetClass: input.assetClass ?? null,
        notes: input.notes ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      return { id };
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.coerce.string(),
        description: z.string().optional(),
        amount: z.string().optional(),
        type: z.enum(["capex", "opex"]).optional(),
        accountingClass: z.string().optional(),
        assetClass: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const { id, ...data } = input;
      const docRef = doc(db, "budgetItems", id);
      await updateDoc(docRef, { ...data, updatedAt: new Date() });
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.coerce.string() }))
    .mutation(async ({ input }) => {
      await deleteDoc(doc(db, "budgetItems", input.id));
      return { success: true };
    }),
});