export type OnclickaShow = () => Promise<unknown>;

declare global {
  interface Window {
    initCdTma?: (options: { id: number }) => Promise<OnclickaShow>;
  }
}
