// Minimal Deno global type declarations for VS Code IntelliSense.
// These are only needed when the Deno VS Code extension is NOT installed.
// The actual types are provided at runtime by the Deno runtime itself.

declare namespace Deno {
  export interface Env {
    get(key: string): string | undefined
    set(key: string, value: string): void
    delete(key: string): void
    has(key: string): boolean
    toObject(): { [index: string]: string }
  }
  export const env: Env
}
