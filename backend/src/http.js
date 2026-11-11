export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function sendError(error, res) {
  if (res.headersSent) return res.end();
  const uploadError = error.name === "MulterError";
  const status = error instanceof HttpError ? error.status : uploadError ? (error.code === "LIMIT_FILE_SIZE" ? 413 : 400) : error.type === "entity.parse.failed" ? 400 : 500;
  const message = error instanceof HttpError ? error.message : uploadError ? "Upload limit exceeded (8 MB per file, at most 8 photos)." : status === 400 ? "Invalid request body." : "Something went wrong.";
  if (status === 500) console.error({ name: error.name, code: error.code });
  res.status(status).json({ error: message });
}
