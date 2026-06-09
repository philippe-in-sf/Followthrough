export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function notFound(message = "Record not found") {
  return new HttpError(404, message);
}

export function badRequest(message: string) {
  return new HttpError(400, message);
}
