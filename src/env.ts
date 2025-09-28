export interface Env {
  STORE: R2Bucket;
  SITE_NAME?: string;
  ASSETS: Fetcher;
}

export type RouteHandler = (req: Request, env: Env, ctx: ExecutionContext) => Promise<Response>;
