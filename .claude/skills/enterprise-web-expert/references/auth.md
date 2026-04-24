# Uwierzytelnianie i Autoryzacja — Wzorce i Implementacje

> **Stack użytkownika używa Better-Auth** — pełna konfiguracja, middleware `requireAuth()`, `requireRole()`, CORS i rozszerzenie sesji są w `references/stack-bun-hono.md` (sekcje 6 i 12). Poniżej: wzorce ogólne i podatności które obowiązują niezależnie od biblioteki.

## JWT — Best Practices

### Poprawna implementacja

```typescript
import jwt from 'jsonwebtoken';
import { redis } from './redis';

const ACCESS_TOKEN_TTL = 15 * 60; // 15 minut
const REFRESH_TOKEN_TTL = 30 * 24 * 3600; // 30 dni

// Generowanie tokenów
export function generateTokens(userId: string, roles: string[]) {
  const accessToken = jwt.sign(
    { sub: userId, roles, type: 'access' },
    process.env.JWT_SECRET!, // min 256 bitów!
    {
      expiresIn: ACCESS_TOKEN_TTL,
      issuer: 'api.example.com',
      audience: 'app.example.com',
    },
  );

  const refreshToken = jwt.sign(
    { sub: userId, type: 'refresh', jti: generateJTI() },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: REFRESH_TOKEN_TTL },
  );

  return { accessToken, refreshToken };
}

// Weryfikacja access tokena
export async function verifyAccessToken(token: string) {
  const payload = jwt.verify(token, process.env.JWT_SECRET!, {
    issuer: 'api.example.com',
    audience: 'app.example.com',
  }) as JWTPayload;

  // Sprawdź czy token nie jest na blocklist (po logout / zmianie hasła)
  const isBlocked = await redis.get(`blocked:${payload.jti}`);
  if (isBlocked) throw new UnauthorizedError('Token has been revoked');

  return payload;
}

// Unieważnienie przy logout
export async function revokeToken(jti: string, ttl: number) {
  await redis.setex(`blocked:${jti}`, ttl, '1');
}
```

### Czego NIE robić z JWT

```typescript
// ❌ ZŁE — zbyt długi czas życia
jwt.sign({ sub: userId }, secret, { expiresIn: '1y' });

// ❌ ZŁE — wrażliwe dane w payload (payload jest BASE64, nie zaszyfrowany!)
jwt.sign({ sub: userId, creditCard: '4111111111111111' }, secret);

// ❌ ZŁE — brak weryfikacji algorithm (algorithm confusion attack)
jwt.verify(token, secret); // zamiast tego:
jwt.verify(token, secret, { algorithms: ['HS256'] }); // ✓

// ❌ ZŁE — przechowywanie tokena w localStorage (XSS vulnerable)
localStorage.setItem('token', accessToken);
// ✓ LEPIEJ — HttpOnly cookie:
res.cookie('accessToken', accessToken, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: ACCESS_TOKEN_TTL * 1000,
});
```

## OAuth2 / OIDC — przepływy

### Authorization Code + PKCE (dla SPA / mobile)

```
1. Klient generuje code_verifier (random, min 43 znaki)
2. Klient oblicza code_challenge = base64url(sha256(code_verifier))
3. Redirect do: /authorize?response_type=code&client_id=X&
                redirect_uri=Y&code_challenge=Z&code_challenge_method=S256
4. Po logowaniu: redirect z ?code=AUTH_CODE
5. POST /token z { code, code_verifier, client_id, redirect_uri }
6. Serwer weryfikuje: sha256(code_verifier) === code_challenge
7. Zwraca access_token + refresh_token + id_token
```

Dlaczego PKCE? Chroni przed przechwyceniem authorization code przez złośliwą aplikację.

### Client Credentials (machine-to-machine)

```
POST /token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id=SERVICE_A
&client_secret=SECRET
&scope=payments:write

Response: { access_token, token_type: 'Bearer', expires_in }
```

Rotuj client secrets regularnie. Przechowuj w secrets manager (AWS Secrets Manager, Vault), nie w env vars w kodzie.

## RBAC — Implementacja

```typescript
// Definicja uprawnień
const PERMISSIONS = {
  'orders:read': 'Odczyt zamówień',
  'orders:write': 'Tworzenie/edycja zamówień',
  'orders:delete': 'Usuwanie zamówień',
  'users:admin': 'Zarządzanie użytkownikami',
} as const;

type Permission = keyof typeof PERMISSIONS;

// Role → Uprawnienia
const ROLE_PERMISSIONS: Record<string, Permission[]> = {
  viewer: ['orders:read'],
  editor: ['orders:read', 'orders:write'],
  admin: ['orders:read', 'orders:write', 'orders:delete', 'users:admin'],
};

// Middleware sprawdzający uprawnienia
export function requirePermission(permission: Permission) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user; // załadowany przez auth middleware

    const userPermissions = user.roles.flatMap(
      (role) => ROLE_PERMISSIONS[role] || [],
    );
    if (!userPermissions.includes(permission)) {
      logger.warn('Authorization denied', {
        userId: user.id,
        requiredPermission: permission,
        userRoles: user.roles,
        path: req.path,
      });
      return res.status(403).json({ error: 'Forbidden' });
    }

    next();
  };
}

// Użycie:
router.delete(
  '/orders/:id',
  requirePermission('orders:delete'),
  deleteOrderHandler,
);
```

## Autoryzacja zasobowa — obrona przed IDOR

```typescript
// ❌ ZŁE — nie sprawdza własności zasobu
async function getOrder(req: Request, res: Response) {
  const order = await orderRepo.findById(req.params.id);
  return res.json(order); // Każdy zalogowany user może zobaczyć każde zamówienie!
}

// ✓ POPRAWNE — sprawdzenie własności
async function getOrder(req: Request, res: Response) {
  const order = await orderRepo.findById(req.params.id);

  if (!order) {
    throw new NotFoundError('Order', req.params.id);
  }

  // Sprawdź własność — admin widzi wszystko, inni tylko swoje
  if (!req.user.roles.includes('admin') && order.userId !== req.user.id) {
    // Zwróć 404 zamiast 403 — nie ujawniaj że zasób istnieje!
    throw new NotFoundError('Order', req.params.id);
  }

  return res.json(order);
}
```

## Bezpieczna obsługa sesji

```typescript
import session from 'express-session';
import RedisStore from 'connect-redis';

app.use(
  session({
    store: new RedisStore({ client: redisClient }),
    secret: process.env.SESSION_SECRET!,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true, // brak dostępu przez JS (XSS protection)
      secure: true, // tylko HTTPS
      sameSite: 'strict', // CSRF protection
      maxAge: 24 * 60 * 60 * 1000, // 24h
    },
  }),
);

// WAŻNE: Regeneruj session ID po logowaniu (session fixation attack)
app.post('/login', async (req, res) => {
  const user = await authenticate(req.body);

  req.session.regenerate((err) => {
    // ← kluczowe!
    if (err) throw err;
    req.session.userId = user.id;
    req.session.roles = user.roles;
    res.json({ success: true });
  });
});

// Wylogowanie — zniszcz sesję
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});
```

## Security Headers — nie zapomnij

```typescript
import helmet from 'helmet';

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }),
);
```
