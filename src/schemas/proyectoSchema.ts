import { z } from "zod";

const usoMensualItemSchema = z.object({
  anio: z.number().int(),
  mes: z.number().int().min(1).max(12),
  horas_estimadas: z
    .number({ error: "Ingresá un valor válido" })
    .int()
    .min(0, "Debe ser 0 o mayor")
    .optional(),
});

export const proyectoSchema = z
  .object({
    nombre: z
      .string()
      .min(1, "El nombre del proyecto es requerido")
      .max(150, "Máximo 150 caracteres"),
    fecha_inicio: z
      .string()
      .min(1, "La fecha de inicio es requerida"),
    fecha_fin: z
      .string()
      .min(1, "La fecha de fin es requerida"),
    area_id: z
      .number({ error: "El área es requerida" })
      .int()
      .positive("El área es requerida"),
    contrato_id: z
      .number({ error: "El contrato es requerido" })
      .int()
      .positive("El contrato es requerido"),
    horas_proyectadas: z
      .number({ error: "Ingresá un valor válido" })
      .int()
      .min(0, "Debe ser 0 o mayor"),
    uso_mensual: z
      .array(usoMensualItemSchema)
      .superRefine((items, ctx) => {
        items.forEach((item, i) => {
          if (item.horas_estimadas == null) {
            ctx.addIssue({
              code: "custom",
              message: "Ingresá las horas estimadas",
              path: [i, "horas_estimadas"],
            });
          }
        });
      })
      .optional(),
  })
  .refine(
    (data) => new Date(data.fecha_fin) > new Date(data.fecha_inicio),
    {
      message: "La fecha de fin debe ser posterior a la fecha de inicio",
      path: ["fecha_fin"],
    },
  )
  .refine(
    (data) => {
      if (data.contrato_id && data.horas_proyectadas == null) return false;
      return true;
    },
    {
      message: "Las horas proyectadas son requeridas al asignar un contrato",
      path: ["horas_proyectadas"],
    },
  )

export type ProyectoData = z.infer<typeof proyectoSchema>;
export type UsoMensualItem = z.infer<typeof usoMensualItemSchema>;

export const editProyectoSchema = z
  .object({
    nombre: z
      .string()
      .min(1, "El nombre es requerido")
      .max(150, "Máximo 150 caracteres"),
    fecha_inicio: z.string().min(1, "La fecha de inicio es requerida"),
    fecha_fin: z.string().min(1, "La fecha de fin es requerida"),
    area_id: z
      .number({ error: "El área es requerida" })
      .int()
      .positive("El área es requerida"),
    estado_id: z.number().int().positive(),
    estado_contratacion_id: z.number().int().positive(),
  })
  .refine((d) => new Date(d.fecha_fin) > new Date(d.fecha_inicio), {
    message: "La fecha de fin debe ser posterior a la fecha de inicio",
    path: ["fecha_fin"],
  });

export type EditProyectoData = z.infer<typeof editProyectoSchema>;
