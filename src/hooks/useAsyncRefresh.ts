import { useCallback, useState } from 'react';

export async function runRefreshTask(
  task: () => Promise<void>,
  setRefreshing: (value: boolean) => void,
  onError?: (error: unknown) => void
): Promise<void> {
  setRefreshing(true);
  try {
    await task();
  } catch (error) {
    onError?.(error);
  } finally {
    setRefreshing(false);
  }
}

export function useAsyncRefresh(
  task: () => Promise<void>,
  onError?: (error: unknown) => void
) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    await runRefreshTask(task, setRefreshing, onError);
  }, [task, onError]);

  return { refreshing, onRefresh };
}
