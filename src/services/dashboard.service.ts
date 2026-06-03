import { prisma } from "@/lib/prisma";

export async function getDashboardStats() {
  const proyectos = await prisma.proyectos.findMany({
    include: {
      areas: { include: { areas: true } },
    },
  });

  const statsByArea = proyectos.reduce(
    (acc, proyecto) => {
      for (const pa of proyecto.areas) {
        const areaId = pa.area_id;
        const areaName = pa.areas.nombre;

        if (!acc[areaName]) {
          acc[areaName] = {
            areaId,
            areaName,
            total: 0,
            implementado: 0,
            enProceso: 0,
            pausado: 0,
            sinAsignar: 0,
          };
        }

        acc[areaName].total++;

        switch (proyecto.estado_id) {
          case 1:
            acc[areaName].implementado++;
            break;
          case 2:
            acc[areaName].enProceso++;
            break;
          case 3:
            acc[areaName].pausado++;
            break;
          case 4:
            acc[areaName].sinAsignar++;
            break;
        }
      }

      return acc;
    },
    {} as Record<
      string,
      {
        areaId: number;
        areaName: string;
        total: number;
        implementado: number;
        enProceso: number;
        pausado: number;
        sinAsignar: number;
      }
    >,
  );

  return Object.values(statsByArea);
}
