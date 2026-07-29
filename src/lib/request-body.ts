import "server-only";

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Request body must be valid JSON.");
    this.name = "InvalidJsonBodyError";
  }
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size.");
    this.name = "RequestBodyTooLargeError";
  }
}

export async function readJsonBody(request: Request, maxBytes: number) {
  const contentLength = request.headers.get("content-length");

  if (contentLength) {
    const declaredBytes = Number(contentLength);
    if (Number.isFinite(declaredBytes) && declaredBytes > maxBytes) {
      throw new RequestBodyTooLargeError();
    }
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new InvalidJsonBodyError();
  }
}
