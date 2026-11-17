import { createApp } from '../server.js';

let appPromise: ReturnType<typeof createApp> | null = null;

function getApp() {
  if (!appPromise) {
    appPromise = createApp({ attachWs: false, skipStatic: true }).catch((err: unknown) => {
      appPromise = null;
      throw err;
    });
  }
  return appPromise;
}

export default async function handler(req: any, res: any) {
  const { app } = await getApp();
  return app(req, res);
}
