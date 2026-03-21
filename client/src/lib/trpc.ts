// Backend e tRPC removidos.
// Este objeto é mantido apenas para evitar erros de importação em arquivos não migrados.

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
        console.warn(`⚠️ [Migração] Chamada residual ao tRPC detectada em: trpc.${path.join('.')}.useQuery()`);
        return () => dummyQuery;
      }
      if (prop === 'useMutation') {
        return () => ({ 
          mutate: () => console.warn("⚠️ [Frontend-Only] Backend removido. Esta mutação foi interceptada e ignorada."), 
          mutateAsync: async () => { console.warn("⚠️ [Frontend-Only] Backend removido. Esta mutação foi interceptada e ignorada."); return {}; }, 
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
