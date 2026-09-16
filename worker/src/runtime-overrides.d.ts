export {};

declare global {
  /**
   * Cloudflare Workers' current type package defaults Body.json() to an
   * opaque object when no generic is supplied. NightSafe validates request
   * fields at the route boundary, so keep the Web-standard permissive JSON
   * return type until each endpoint is migrated to explicit request schemas.
   */
  interface Body {
    json<T = any>(): Promise<T>;
  }

  /**
   * Keep multipart access compatible with the runtime's string/File values.
   * Individual upload handlers still validate that an entry is a File before
   * reading it.
   */
  interface FormData {
    get(name: string): any;
  }
}
