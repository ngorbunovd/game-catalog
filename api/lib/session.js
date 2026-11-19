import crypto from 'crypto';

const SECRET = process.env.SESSION_SECRET || 'dev-secret-change-me';
const COOKIE_NAME = 'antology_session';
const MAX_AGE = 1000 * 60 * 60 * 24 * 365;

const sign = id => crypto.createHmac('sha256', SECRET).update(id).digest('hex').slice(0, 16);

export function sessionMiddleware(req, res, next) {
  const raw = req.cookies?.[COOKIE_NAME];
  let id = null;
  if (typeof raw === 'string') {
    const [candidateId, sig] = raw.split('.');
    if (candidateId && sig && sig === sign(candidateId)) id = candidateId;
  }
  if (!id) {
    id = crypto.randomUUID();
    res.cookie(COOKIE_NAME, `${id}.${sign(id)}`, {
      httpOnly: true,
      sameSite: 'lax',
      // Secure только когда соединение реально по HTTPS: каталог должен
      // работать по http:// из локальной сети, где Secure-cookie не шлются
      secure: req.secure,
      maxAge: MAX_AGE,
    });
  }
  req.sessionId = id;
  next();
}