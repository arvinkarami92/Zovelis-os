// Errors with an HTTP status, a stable machine-readable code and a message
// that is safe to show to people.

export class HttpError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) => new HttpError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Please log in.') => new HttpError(401, 'unauthorized', message);
export const forbidden = (message = "You can't do that.", code = 'forbidden') => new HttpError(403, code, message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict', details?: unknown) => new HttpError(409, code, message, details);
export const tooMany = (message = 'Too many requests. Try again in a minute.') => new HttpError(429, 'rate_limited', message);
