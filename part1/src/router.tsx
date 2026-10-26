import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isNetworkError, markDown, markUp } from "./lib/net";
import { OFFLINE_MAX_AGE } from "./lib/offline";

// A request that gets no answer marks the app offline; any answer marks it online again.
const seen = {
  onSuccess: () => markUp(),
  onError: (e: unknown) => {
    if (isNetworkError(e)) markDown();
  },
};

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache(seen),
    mutationCache: new MutationCache(seen),
    defaultOptions: {
      // Kept long enough to be saved on the phone and shown offline.
      queries: { gcTime: OFFLINE_MAX_AGE },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
