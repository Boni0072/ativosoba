import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { collection, deleteDoc, doc, getDocs, setDoc, writeBatch } from "firebase/firestore";
import { db } from "../../firebase";

export const accountingRouter = router({
  // Contas Contábeis
  listAccounts: protectedProcedure.query(async () => {
    const snapshot = await getDocs(collection(db, "accounting_accounts"));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, code: data.code, name: data.name, type: data.type };
    });
  }),
  createAccount: protectedProcedure
    .input(z.object({ code: z.string().min(1), name: z.string().min(1), type: z.string().optional() }))
    .mutation(async ({ input }) => {
      // Use o código da conta como ID para garantir unicidade.
      const docRef = doc(db, "accounting_accounts", input.code);
      await setDoc(docRef, { ...input, createdAt: new Date() });
      return { success: true, id: input.code };
    }),
  deleteAccount: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteDoc(doc(db, "accounting_accounts", input.id));
      return { success: true };
    }),
  updateAccount: protectedProcedure
    .input(z.object({ id: z.string(), code: z.string(), name: z.string(), type: z.string().optional() }))
    .mutation(async ({ input }) => {
      await setDoc(doc(db, "accounting_accounts", input.id), { ...input, updatedAt: new Date() }, { merge: true });
      return { success: true };
    }),
  bulkCreateAccounts: protectedProcedure
    .input(z.array(z.object({ code: z.string(), name: z.string(), type: z.string().optional() })))
    .mutation(async ({ input }) => {
      const batch = writeBatch(db);
      input.forEach(item => {
        // Usa o código como ID para criar ou sobrescrever (com merge)
        const docRef = doc(db, "accounting_accounts", item.code);
        batch.set(docRef, { ...item, createdAt: new Date() }, { merge: true });
      });
      await batch.commit();
      return { success: true };
    }),

  // Classes do Imobilizado
  listAssetClasses: protectedProcedure.query(async () => {
    const snapshot = await getDocs(collection(db, "asset_classes"));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { 
        id: doc.id, 
        code: data.code,
        name: data.name, 
        usefulLife: data.usefulLife,
        corporateUsefulLife: data.corporateUsefulLife,
        assetAccountCode: data.assetAccountCode,
        assetAccountDescription: data.assetAccountDescription,
        depreciationAccountCode: data.depreciationAccountCode,
        depreciationAccountDescription: data.depreciationAccountDescription,
        amortizationAccountCode: data.amortizationAccountCode,
        amortizationAccountDescription: data.amortizationAccountDescription,
        resultAccountCode: data.resultAccountCode,
        resultAccountDescription: data.resultAccountDescription,
      };
    });
  }),
  createAssetClass: protectedProcedure
    .input(z.object({ 
      code: z.string(),
      name: z.string(), 
      usefulLife: z.coerce.number(),
      corporateUsefulLife: z.coerce.number(),
      assetAccountCode: z.string().optional(),
      assetAccountDescription: z.string().optional(),
      depreciationAccountCode: z.string().optional(),
      depreciationAccountDescription: z.string().optional(),
      amortizationAccountCode: z.string().optional(),
      amortizationAccountDescription: z.string().optional(),
      resultAccountCode: z.string().optional(),
      resultAccountDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const id = input.code; // Usar o código da classe como ID
      await setDoc(doc(db, "asset_classes", id), { ...input, createdAt: new Date() });
      return { success: true };
    }),
  updateAssetClass: protectedProcedure
    .input(z.object({ 
      originalCode: z.string(),
      code: z.string(),
      name: z.string(), 
      usefulLife: z.coerce.number(),
      corporateUsefulLife: z.coerce.number(),
      assetAccountCode: z.string().optional(),
      assetAccountDescription: z.string().optional(),
      depreciationAccountCode: z.string().optional(),
      depreciationAccountDescription: z.string().optional(),
      amortizationAccountCode: z.string().optional(),
      amortizationAccountDescription: z.string().optional(),
      resultAccountCode: z.string().optional(),
      resultAccountDescription: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const { originalCode, ...data } = input;
      if (originalCode !== data.code) {
        await deleteDoc(doc(db, "asset_classes", originalCode));
      }
      await setDoc(doc(db, "asset_classes", data.code), { ...data, updatedAt: new Date() }, { merge: true });
      return { success: true };
    }),
  deleteAssetClass: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteDoc(doc(db, "asset_classes", input.id));
      return { success: true };
    }),
  bulkCreateAssetClasses: protectedProcedure
    .input(z.array(z.object({ 
      code: z.string(),
      name: z.string(), 
      usefulLife: z.coerce.number(),
      corporateUsefulLife: z.coerce.number(),
      assetAccountCode: z.string().optional(),
      assetAccountDescription: z.string().optional(),
      depreciationAccountCode: z.string().optional(),
      depreciationAccountDescription: z.string().optional(),
      amortizationAccountCode: z.string().optional(),
      amortizationAccountDescription: z.string().optional(),
      resultAccountCode: z.string().optional(),
      resultAccountDescription: z.string().optional(),
    })))
    .mutation(async ({ input }) => {
      const batch = writeBatch(db);
      input.forEach(assetClass => {
        const docRef = doc(db, "asset_classes", assetClass.code);
        batch.set(docRef, { ...assetClass, createdAt: new Date() });
      });
      await batch.commit();
      return { success: true };
    }),

  // Centros de Custo
  listCostCenters: protectedProcedure.query(async () => {
    const snapshot = await getDocs(collection(db, "cost_centers"));
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return { id: doc.id, code: data.code, name: data.name, department: data.department };
    });
  }),
  createCostCenter: protectedProcedure
    .input(z.object({ code: z.string(), name: z.string(), department: z.string() }))
    .mutation(async ({ input }) => {
      const id = Date.now().toString();
      await setDoc(doc(db, "cost_centers", id), { ...input, createdAt: new Date() });
      return { success: true };
    }),
  updateCostCenter: protectedProcedure
    .input(z.object({ id: z.string(), code: z.string(), name: z.string(), department: z.string() }))
    .mutation(async ({ input }) => {
      await setDoc(doc(db, "cost_centers", input.id), { ...input, updatedAt: new Date() }, { merge: true });
      return { success: true };
    }),
  deleteCostCenter: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await deleteDoc(doc(db, "cost_centers", input.id));
      return { success: true };
    }),
  bulkCreateCostCenters: protectedProcedure
    .input(z.array(z.object({ code: z.string(), name: z.string(), department: z.string() })))
    .mutation(async ({ input }) => {
      const batch = writeBatch(db);
      input.forEach(item => {
        const newDocRef = doc(collection(db, "cost_centers"));
        batch.set(newDocRef, { ...item, createdAt: new Date() });
      });
      await batch.commit();
      return { success: true };
    }),
});