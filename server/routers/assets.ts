import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { db } from "../../firebase";
import { collection, getDocs, query, where } from "firebase/firestore";
import { TRPCError } from "@trpc/server";

export const assetRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        projectId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      try {
        const assetsRef = collection(db, "assets");
        let q;

        if (input.projectId) {
          q = query(assetsRef, where("projectId", "==", input.projectId), where("status", "in", ["planejamento", "em_desenvolvimento"]));
        } else {
          q = query(assetsRef, where("status", "in", ["planejamento", "em_desenvolvimento"]));
        }

        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        }));
      } catch (error: any) {
        console.error("Erro detalhado ao listar ativos:", JSON.stringify(error, null, 2));

        if (error.code === 'FAILED_PRECONDITION') {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "A consulta de ativos falhou, provavelmente por falta de um índice no Firestore. Verifique o log do servidor para encontrar um link para criar o índice necessário.",
          });
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Falha ao buscar ativos: ${error.message || "Erro desconhecido"}`,
        });
      }
    }),
});
