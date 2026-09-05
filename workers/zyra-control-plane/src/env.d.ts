/// <reference types="@cloudflare/workers-types" />

type WorkerEnv = {
  [Key in keyof Env]?: Env[Key] extends string ? string : Env[Key];
} & {
  ZYRA_CONTROL_PLANE_TOKEN?: string;
  ZYX_KV?: KVNamespace;
  ZYX_STAGING_KV?: KVNamespace;
};
