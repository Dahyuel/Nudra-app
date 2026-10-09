import { type RequestHandler } from 'express';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const asyncHandler = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  try { Promise.resolve(handler(req, res, next)).catch(next); } catch (error) { next(error); }
};

export function protectRouter(router: any): void {
  for (const layer of router.stack ?? router._router?.stack ?? []) {
    if (layer.route) { protectRouter(layer.route); continue; }
    if (layer.handle?.stack) { protectRouter(layer.handle); continue; }
    const handler = layer.handle;
    if (!handler || handler.length === 4) continue;
    layer.handle = asyncHandler((req, res, next) => {
      for (const [key, value] of Object.entries(req.params)) {
        if ((key === 'id' || key.endsWith('Id')) && !UUID.test(value)) return res.status(400).json({ message: `Invalid ${key}` });
      }
      return handler(req, res, next);
    });
  }
}
