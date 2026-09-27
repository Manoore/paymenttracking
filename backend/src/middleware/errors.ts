import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { HttpError } from "../lib/errors.js";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "not_found", message: "Route not found" } });
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: { code: "validation_error", message: "Invalid input", details: err.issues },
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if (err instanceof MulterError) {
    return res.status(400).json({ error: { code: "upload_error", message: err.message } });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: { code: "bad_id", message: `Invalid ${err.path}` } });
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: { code: "internal", message: "Something went wrong" } });
}
