import { QueryClient } from '@tanstack/react-query';
import { subscribeLocalData } from '@/lib/localData';

export const queryClientInstance = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

subscribeLocalData(() => {
  void queryClientInstance.invalidateQueries();
});
