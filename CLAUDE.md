# CLAUDE.md — Convenciones del proyecto para AI Assistants

## Skills personalizadas

Siempre leer `.agents/skills/` al inicio de cada conversación para conocer las skills disponibles del proyecto.

## Base de datos

- **Prisma ORM** es la única capa de acceso a la DB. Importar `prisma` desde `@/lib/prisma`.
- `src/lib/db.ts` fue eliminado — era un legacy de mysql2 con credenciales hardcodeadas. No recrarlo.
- El schema está definido en `prisma/schema.prisma`.
- Al modificar el schema, siempre generar una migración con `npm run db:migrate`.
- Nunca editar archivos dentro de `prisma/migrations/` manualmente.

## Compatibilidad MySQL ↔ PostgreSQL (Neon)

El proyecto alterna entre **MySQL** (local/prod) y **PostgreSQL/Neon** (temporal). Al escribir código o modificar el schema, mantener compatibilidad con ambos:

- **No usar tipos exclusivos de un provider** en el schema Prisma: evitar `@db.VarChar`, `@db.Text`, `@db.UnsignedInt`, `@db.TinyInt`, etc. — son decoradores específicos de MySQL que rompen en PostgreSQL. Usarlos solo si ya existen y no se está modificando ese campo.
- **Enums nativos**: MySQL los maneja diferente a PostgreSQL. Preferir tablas de referencia (como `estado_triple`) en lugar de enums Prisma cuando se necesite compatibilidad.
- **`@default(autoincrement())`**: compatible en ambos.
- **Migraciones**: al cambiar de provider hay que regenerar migraciones desde cero (`prisma migrate reset`). Las migraciones de MySQL no son portables a PostgreSQL.
- El `provider` en `schema.prisma` y el formato de `DATABASE_URL` deben cambiar juntos al migrar de provider.

Neon + AI: npx neonctl@latest init (aún no instalado)

## Variables de entorno

- Todos los secretos viven en `.env` (git-ignored).
- `.env.example` es la plantilla commiteada al repo.
- MySQL: `DATABASE_URL=mysql://user:password@host:port/database`
- PostgreSQL/Neon: `DATABASE_URL=postgresql://user:password@host/database?sslmode=require`

## Scripts clave

- `npm run db:setup` — aplicar migraciones + seed (correr luego de clonar)
- `npm run db:migrate` — después de cambios en el schema, generar migración
- `npm run db:reset` — borrado completo de la DB y reconstrucción (destructivo)

## Patrón de API

- Las API routes viven en `src/app/api/[resource]/route.ts`
- La lógica de negocio vive en `src/services/[resource].service.ts`
- Los services usan `prisma` directamente — no usar SQL crudo salvo necesidad extrema

## UI / Componentes

- Los botones **no llevan iconos** — solo texto plano. No agregar íconos (Lucide, SVG, etc.) dentro de `<Button>` u otros elementos de acción.

## Tablas con datos de referencia (gestionadas por seed)

- `roles` — role_id=4 mapea a "usuario" (default para nuevos usuarios). IDs: 1=Developer, 2=SuperAdmin, 3=Admin, 4=Usuario, 5=Invitado
- `estado_triple` — enum: si (1), no (2), n_a (3) — mapeado a "n/a" en la DB
- `estado_proyectos` — estados del ciclo de vida: implementado (1), en_proceso (2), pausado (3), cancelado (4), sin_asignar (5)
- `estado_contratacion` — estado de contratación de un proyecto: en_proceso (1), finalizado (2)

# Estilos

Cuando quieras usar "space-y-2" o "space-y-4" en un contenedor de elementos, reemplazalo por "flex flex-col gap-2" o "flex flex-col gap-4" respectivamente, ya que space puede traer ciertos bugs que con flex no pasan.
