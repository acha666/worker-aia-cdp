interface QueueMetadataRefreshOptions {
  ctx: ExecutionContext;
  shouldRefresh: boolean;
  key: string;
  label: string;
  task: () => Promise<void>;
}

export function queueMetadataRefreshIfNeeded(options: QueueMetadataRefreshOptions): void {
  if (!options.shouldRefresh) {
    return;
  }

  options.ctx.waitUntil(
    options.task().catch((error) => {
      console.error(`Failed to refresh ${options.label} metadata for ${options.key}:`, error);
    })
  );
}
