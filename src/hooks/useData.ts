import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { api } from '../services/api';

type Api = typeof api;
type Key = keyof Api;
type Data<K extends Key> = Awaited<ReturnType<Api[K]>>;

/** Hook genérico: useData('events') → { data, isLoading, error, refetch } */
export function useData<K extends Key>(key: K): UseQueryResult<Data<K>> {
  return useQuery<Data<K>>({ queryKey: [key], queryFn: () => (api[key] as () => Promise<Data<K>>)() });
}
