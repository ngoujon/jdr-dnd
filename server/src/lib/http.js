/** Erreur applicative portant un code HTTP. */
export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (msg, details) => new HttpError(400, msg, details);
export const unauthorized = (msg = 'Authentification requise') => new HttpError(401, msg);
export const forbidden = (msg = 'Accès refusé') => new HttpError(403, msg);
export const notFound = (msg = 'Ressource introuvable') => new HttpError(404, msg);
export const conflict = (msg) => new HttpError(409, msg);

/** Enveloppe un handler async pour router les rejets vers le middleware d'erreur. */
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** Valide `payload` avec un schema zod et renvoie des erreurs lisibles. */
export const parseBody = (schema, payload) => {
  const result = schema.safeParse(payload);
  if (!result.success) {
    throw badRequest('Données invalides', result.error.flatten().fieldErrors);
  }
  return result.data;
};
