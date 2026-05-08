import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Roles — requeridos por FK con users. role_id=4 es el default para nuevos usuarios.
  const roles = [
    { id: 1, name: "Developer", label: "Developer", value: "developer" },
    { id: 2, name: "SuperAdmin", label: "Super Admin", value: "superadmin" },
    { id: 3, name: "Admin", label: "Admin", value: "admin" },
    { id: 4, name: "Usuario", label: "Usuario", value: "usuario" },
    { id: 5, name: "Invitado", label: "Invitado", value: "invitado" },
  ];
  for (const r of roles) {
    await prisma.roles.upsert({
      where: { id: r.id },
      update: { name: r.name, label: r.label, value: r.value },
      create: r,
    });
  }

  // Usuarios base del Ministerio (role_id 1=Developer, 2=SuperAdmin).
  const usuarios = [
    {
      email: "damian.laterza@bue.edu.ar",
      full_name: "Damián Laterza",
      role_id: 1,
    },
    {
      email: "florencia.parodi@bue.edu.ar",
      full_name: "Florencia Parodi",
      role_id: 2,
    },
    {
      email: "tamara.cergneux@bue.edu.ar",
      full_name: "Tamara Cergneux",
      role_id: 2,
    },
  ];
  for (const u of usuarios) {
    await prisma.users.upsert({
      where: { email: u.email },
      update: {},
      create: u,
    });
  }

  // Ministerio — proveedor reservado con id=1.
  // Why: cuando un proyecto se transfiere "al Ministerio" (no a otro proveedor externo),
  // se asigna a este registro. Reportes de pago a externos lo excluyen por id.
  await prisma.proveedores.upsert({
    where: { id: 1 },
    update: { label: "Ministerio", value: "ministerio" },
    create: { id: 1, label: "Ministerio", value: "ministerio" },
  });

  // Áreas iniciales del Ministerio (acronimo == nombre por convención del usuario).
  const areas = ["SSGDA", "SSTEDU", "SSPIE", "SSGAD", "UM", "DGHPEF", "DGAJUR"];
  for (const a of areas) {
    await prisma.areas.upsert({
      where: { acronimo: a },
      update: { nombre: a },
      create: { nombre: a, acronimo: a },
    });
  }

  // Contrato base del Ministerio — destino para transferencias internas.
  // Why: cuando un proyecto se transfiere "al Ministerio" (sale del proveedor
  // externo), se asigna a este contrato dummy. fecha_fin y cantidad_horas son
  // null porque el contrato del Ministerio no tiene fecha límite ni tope de
  // horas (regla de negocio).
  await prisma.contratos.upsert({
    where: { numero_expediente: "INTERNO-MINISTERIO" },
    update: {
      fecha_fin: null,
      cantidad_horas: null,
    },
    create: {
      nombre: "Desarrollo interno del Ministerio",
      numero_expediente: "INTERNO-MINISTERIO",
      proveedor_id: 1,
      fecha_inicio: new Date("2024-01-01"),
      fecha_fin: null,
      cantidad_horas: null,
      valor_hora: null,
      observaciones:
        "Contrato base creado por defecto. Recibe transferencias internas de proyectos al Ministerio.",
    },
  });

  // Sincronizar secuencias de PostgreSQL después de upserts con id explícito.
  // Why: insertar con `id: 1` no avanza la secuencia, entonces el primer
  // create() autoincremental intenta usar id=1 y choca con unique constraint.
  // Esto la deja apuntando a MAX(id) + 1.
  const tablasConIdExplicito = ["roles", "proveedores", "areas"];
  for (const tabla of tablasConIdExplicito) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${tabla}', 'id'), COALESCE((SELECT MAX(id) FROM "${tabla}"), 0) + 1, false)`,
    );
  }

  console.log("Seed completado.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
