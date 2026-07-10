import { TRPCError } from "@trpc/server";
import { collection, deleteDoc, doc, getDoc, getDocs, query, updateDoc, where, setDoc, orderBy, limit } from "firebase/firestore";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { db } from "../../firebase";

export const projectsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    try {
      const projectsRef = collection(db, "projects");
      // Filtra projetos pelo ID do usuário logado (openId)
      const q = query(projectsRef, where("userId", "==", ctx.user.openId));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          code: data.code || null,
          name: data.name,
          description: data.description,
          status: data.status,
          // Converte Timestamp do Firestore para string ISO ou mantém se já for string
          startDate: data.startDate?.toDate?.()?.toISOString() || data.startDate,
          endDate: data.endDate?.toDate?.()?.toISOString() || data.endDate,
          location: data.location,
          createdAt: data.createdAt?.toDate?.()?.toISOString(),
        };
      });
    } catch (error: any) {
      console.error("Erro ao listar projetos:", error);

      // FALLBACK PARA DESENVOLVIMENTO:
      // Se o Firestore negar permissão (comum ao usar SDK Cliente no servidor sem regras públicas),
      // retornamos um dado fictício para que a aplicação não trave.
      if (process.env.NODE_ENV === "development" && (error.code === "permission-denied" || error.message?.includes("permission"))) {
        console.warn("\n⚠️  AVISO: PERMISSÃO NEGADA NO FIRESTORE");
        console.warn("👉 Para corrigir: Vá no Console do Firebase > Firestore > Regras e altere para 'allow read, write: if true;'");
        
        return [{
          id: "1",
          code: "OBRA-000",
          name: "Projeto Exemplo (Modo Dev)",
          description: "Este projeto é exibido porque o Firestore bloqueou o acesso. Verifique as regras de segurança no console.",
          status: "planejamento",
          startDate: new Date().toISOString(),
          location: "Ambiente Local",
          createdAt: new Date().toISOString(),
        }];
      }

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Falha ao buscar projetos: ${error.message || "Erro desconhecido"}`,
      });
    }
  }),

  getById: protectedProcedure
    .input(z.object({ id: z.coerce.string() }))
    .query(async ({ input, ctx }) => {
      const docRef = doc(db, "projects", input.id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      }

      const data = docSnap.data();
      if (data.userId !== ctx.user.openId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Não autorizado" });
      }

      return {
        id: docSnap.id,
        code: data.code || null,
        name: data.name,
        description: data.description,
        status: data.status,
        startDate: data.startDate?.toDate?.()?.toISOString() || data.startDate,
        endDate: data.endDate?.toDate?.()?.toISOString() || data.endDate,
        location: data.location,
        createdAt: data.createdAt?.toDate?.()?.toISOString(),
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Nome é obrigatório"),
        description: z.string().optional(),
        status: z.enum(["aguardando_classificacao", "aguardando_engenharia", "aguardando_diretoria", "aprovado", "rejeitado", "planejamento", "em_andamento", "concluido", "pausado"]).default("aguardando_classificacao"),
        startDate: z.string().or(z.date()),
        endDate: z.string().or(z.date()).optional(),
        location: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      try {
        // Lógica para gerar código sequencial (OBRA-001, OBRA-002...)
        const projectsRef = collection(db, "projects");
        // Busca o último projeto que tenha um código começando com "OBRA-"
        const qCode = query(
          projectsRef,
          where("code", ">=", "OBRA-"),
          where("code", "<=", "OBRA-\uf8ff"),
          orderBy("code", "desc"),
          limit(1)
        );
        
        const codeSnap = await getDocs(qCode);
        let nextCode = "OBRA-001";

        if (!codeSnap.empty) {
          const lastCode = codeSnap.docs[0].data().code;
          const matches = lastCode.match(/(\d+)$/);
          if (matches) {
            const nextNum = parseInt(matches[0], 10) + 1;
            nextCode = `OBRA-${String(nextNum).padStart(3, "0")}`;
          }
        }

        // Gera ID numérico (string) para compatibilidade com frontend legado
        const id = Date.now().toString();
        await setDoc(doc(db, "projects", id), {
          userId: ctx.user.openId,
          code: nextCode,
          name: input.name,
          description: input.description || null,
          status: input.status,
          startDate: new Date(input.startDate),
          endDate: input.endDate ? new Date(input.endDate) : null,
          location: input.location || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        return { id, code: nextCode };
      } catch (error) {
        console.error("Erro ao criar projeto:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Falha ao criar projeto",
        });
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.coerce.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(["aguardando_classificacao", "aguardando_engenharia", "aguardando_diretoria", "aprovado", "rejeitado", "planejamento", "em_andamento", "concluido", "pausado"]).optional(),
        startDate: z.string().or(z.date()).optional(),
        endDate: z.string().or(z.date()).optional(),
        location: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const docRef = doc(db, "projects", input.id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      if (docSnap.data().userId !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN", message: "Não autorizado" });

      const updateData: any = { updatedAt: new Date() };
      if (input.name) updateData.name = input.name;
      if (input.description !== undefined) updateData.description = input.description;
      if (input.status) updateData.status = input.status;
      if (input.startDate) updateData.startDate = new Date(input.startDate);
      if (input.endDate !== undefined) updateData.endDate = input.endDate ? new Date(input.endDate) : null;
      if (input.location !== undefined) updateData.location = input.location;

      await updateDoc(docRef, updateData);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.coerce.string() }))
    .mutation(async ({ ctx, input }) => {
      const docRef = doc(db, "projects", input.id);
      const docSnap = await getDoc(docRef);

      if (!docSnap.exists()) throw new TRPCError({ code: "NOT_FOUND", message: "Projeto não encontrado" });
      if (docSnap.data().userId !== ctx.user.openId) throw new TRPCError({ code: "FORBIDDEN", message: "Não autorizado" });

      await deleteDoc(docRef);
      return { success: true };
    }),
});
