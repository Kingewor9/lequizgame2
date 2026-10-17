declare module 'monetag-tg-sdk' {
  type MonetagAdHandler = () => Promise<unknown>;

  export default function createAdHandler(zoneId: number | string): MonetagAdHandler;
}
