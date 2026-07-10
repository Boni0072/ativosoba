// Backend e tRPC removidos.
// Este objeto é mantido apenas para evitar erros de importação em arquivos não migrados.
import { toast } from "sonner";
import { playSuccessSound, playErrorSound } from "./utils";

const noop = () => {};

// Mock seguro para resultados de queries (evita crash do React ao renderizar 'data')
const dummyQuery = {
  data: [], // Alterado para [] (array vazio) para evitar erros de "cannot read properties of undefined (reading 'map')"
  isLoading: false,
  isPending: false,
  isError: false,
  error: null,
  refetch: noop,
  isFetching: false
};

// Proxy para utils que engole qualquer chamada (ex: utils.users.list.invalidate())
const dummyUtils = new Proxy(() => {}, {
  get: () => () => {},
  apply: () => {},
});

// Mocking Proxy to prevent crashes on chained access like trpc.useUtils()
const createRecursiveProxy = (path: string[] = []) => {
  return new Proxy(() => {}, {
    get: (_target, prop) => {
      const currentPath = [...path, String(prop)];
      
      // Retorna mocks específicos para hooks do React Query/tRPC
      if (prop === 'useQuery') {
        const pathStr = path.join('.').toLowerCase();
        console.log(`📡 [Mock Query] Detectado: ${pathStr}`);

        // Mock Genérico Expandido: Atende inventário, ativos, notificações e agendamentos
        // Isso garante que a contagem e os detalhes do item funcionem
        if (pathStr.includes('count') || pathStr.includes('schedule') || pathStr.includes('agend') || pathStr.includes('notification') || pathStr.includes('alert') || pathStr.includes('inventory') || pathStr.includes('asset')) {
          
          // Se o caminho sugerir contagem numérica, retorna número
          if (pathStr.includes('count')) {
             return () => ({ ...dummyQuery, data: 1 });
          }

          // Tenta recuperar o ID do usuário logado para garantir que ele veja o agendamento
          let currentUserId = "user-id-placeholder";
          if (typeof window !== 'undefined') {
            try {
              const u = localStorage.getItem("obras_user");
              if (u) currentUserId = JSON.parse(u).id;
            } catch (e) {}
          }

          const now = new Date().toISOString();

          // Objeto "Super Mock" que satisfaz interfaces de Agendamento, Ativo, Notificação e Item de Inventário
          const mockData = {
            // Identificadores
            id: "mock-id-123",
            _id: "mock-id-123",
            
            // Relacionamentos (Essencial: inclui seu usuário como responsável)
            userIds: [currentUserId, "other-user"], 
            assetIds: ["mock-asset-1"],
            requesterId: currentUserId,
            
            // Dados do Ativo
            assetId: "mock-asset-1",
            assetCode: "ATV-000006",
            plaqueta: "ATV-000006",
            name: "CALHAS",
            description: "CALHAS DE FERRO",
            
            // Dados do Agendamento/Inventário
            status: "pending", // Status corrigido para 'pending' (padrão do sistema)
            date: now,
            scheduledDate: now,
            
            // Dados de Notificação e Contagem
            title: "Inventário Pendente",
            message: "Você possui itens pendentes de contagem.",
            type: "info",
            read: false,
            expectedCount: 1,
            counted: 0,
            total: 1,
            createdAt: now,
            responsible: "Flavia Andrade",
            // Campos de aprovação simulados para aparecer na tabela
            approver: "Ricardo (Gerente)",
            approvers: [{ name: "Ricardo (Gerente)", role: "Gerente" }],
            approvedBy: "Ricardo (Gerente)"
          };

          // 🔥 CORREÇÃO MÁGICA (HYBRID MOCK):
          // Cria um Array que também possui as propriedades do Objeto.
          // Isso faz funcionar tanto telas que usam .map() quanto telas que usam .id direto.
          const hybridData = [mockData];
          Object.assign(hybridData, mockData);

          return () => ({ ...dummyQuery, data: hybridData });
        }

        return () => dummyQuery;
      }
      if (prop === 'useMutation') {
        return () => ({ 
          mutate: (variables: any, options: any) => {
            console.log("✅ [Mock Mutation] Sucesso simulado:", variables);
            
            // Simulação de Erro para teste de sinalização sonora/visual
            // Se qualquer campo contiver a palavra "erro", o sistema simula uma falha
            if (JSON.stringify(variables).toLowerCase().includes("erro")) {
              playErrorSound();
              toast.error("Falha na operação (Simulação)", { description: "O backend rejeitou a ação.", duration: 4000 });
              if (options?.onError) options.onError(new Error("Simulated Error"), variables, null);
              return;
            }

            // Simula um objeto de resposta com ID gerado e dados enviados
            const mockData = { id: Math.random().toString(36).slice(2), ...variables };
            
            // 🔥 SINALIZAÇÃO VISUAL E SONORA 🔥
            playSuccessSound();
            toast.success("Operação realizada com sucesso!", {
              description: "Registro salvo localmente (Modo Mock)",
              duration: 4000,
            });

            if (options?.onSuccess) options.onSuccess(mockData, variables, null);
            if (options?.onSettled) options.onSettled(mockData, null, variables, null);
          }, 
          mutateAsync: async (variables: any, options: any) => { 
            console.log("✅ [Mock Mutation] Sucesso simulado (Async):", variables);
            
            // Simulação de Erro para teste de sinalização sonora/visual
            if (JSON.stringify(variables).toLowerCase().includes("erro")) {
              playErrorSound();
              toast.error("Falha na operação (Simulação)", { description: "O backend rejeitou a ação.", duration: 4000 });
              if (options?.onError) options.onError(new Error("Simulated Error"), variables, null);
              // Lança erro para que o catch do frontend pegue
              throw new Error("Simulated Error"); 
            }

            // Simula um objeto de resposta com ID gerado e dados enviados
            const mockData = { id: Math.random().toString(36).slice(2), ...variables };
            
            // 🔥 SINALIZAÇÃO VISUAL E SONORA 🔥
            playSuccessSound();
            toast.success("Operação realizada com sucesso!", {
              description: "Registro salvo localmente (Modo Mock)",
              duration: 4000,
            });

            if (options?.onSuccess) options.onSuccess(mockData, variables, null);
            if (options?.onSettled) options.onSettled(mockData, null, variables, null);
            // Retorna os dados simulados com ID, o que destrava interfaces que dependem disso
            return mockData; 
          }, 
          isPending: false, 
          isLoading: false 
        });
      }
      if (prop === 'useUtils' || prop === 'useContext') return () => dummyUtils;
      if (prop === 'Provider') return ({ children }: any) => children;
      return createRecursiveProxy(currentPath);
    },
    apply: () => createRecursiveProxy(),
  });
};

export const trpc = createRecursiveProxy() as any;
