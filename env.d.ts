/// <reference types="vite/client" />
/// <reference types="@remix-run/node" />

declare namespace NodeJS {
  interface ProcessEnv {
    STUDYPERKS_OFFER_SYNC_SECRET?: string;
    STUDYPERKS_OFFER_SYNC_URL?: string;
    STUDYPERKS_OFFER_RECONCILE_TOKEN?: string;
    STUDYPERKS_SAVINGS_API_SECRET?: string;
  }
}
