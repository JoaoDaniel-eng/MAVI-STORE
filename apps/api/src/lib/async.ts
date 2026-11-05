import type { NextFunction, Request, RequestHandler, Response } from "express";

/** Encaminha erros de handlers async para o errorHandler (Express 4). */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
