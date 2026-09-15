const required = (name, fallback) => {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variable d'environnement manquante : ${name}`);
  }
  return value;
};

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: required('JWT_SECRET', process.env.NODE_ENV === 'production' ? undefined : 'dev-secret-not-for-production'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES || 25 * 1024 * 1024),
  uploadDir: process.env.UPLOAD_DIR || new URL('../../uploads/', import.meta.url).pathname,
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:8080,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
