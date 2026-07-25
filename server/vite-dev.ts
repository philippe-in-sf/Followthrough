import fs from "node:fs";
import path from "node:path";
import type { Express, NextFunction, Request, Response } from "express";
import { applyCspNonceToHtml } from "./security.js";

export async function attachViteDevServer(app: Express) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "custom",
  });

  const sendIndex = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ) => {
    try {
      const source = fs.readFileSync(path.resolve(process.cwd(), "index.html"), "utf8");
      const transformed = await vite.transformIndexHtml(req.originalUrl, source);
      res
        .status(200)
        .type("html")
        .send(applyCspNonceToHtml(transformed, res.locals.cspNonce));
    } catch (error) {
      vite.ssrFixStacktrace(error as Error);
      next(error);
    }
  };

  app.get(["/", "/index.html"], sendIndex);
  app.use(vite.middlewares);
  app.get(/.*/, sendIndex);
}
