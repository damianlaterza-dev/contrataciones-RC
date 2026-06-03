/*
  Warnings:

  - You are about to drop the column `cantidad_horas` on the `contratos` table. All the data in the column will be lost.
  - You are about to drop the column `valor_hora` on the `contratos` table. All the data in the column will be lost.
  - You are about to drop the column `area_id` on the `proyectos` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "proyectos" DROP CONSTRAINT "fk_proyectos_area";

-- DropIndex
DROP INDEX "idx_proyectos_area";

-- AlterTable
ALTER TABLE "contrato_incrementos" ADD COLUMN     "renglon_id" INTEGER;

-- AlterTable
ALTER TABLE "contrato_prorrogas" ADD COLUMN     "renglon_id" INTEGER;

-- AlterTable
ALTER TABLE "contratos" DROP COLUMN "cantidad_horas",
DROP COLUMN "valor_hora",
ADD COLUMN     "fechas_updated_at" TIMESTAMP(3),
ADD COLUMN     "fechas_updated_by" TEXT;

-- AlterTable
ALTER TABLE "proyectos" DROP COLUMN "area_id";

-- CreateTable
CREATE TABLE "proyecto_areas" (
    "proyecto_id" INTEGER NOT NULL,
    "area_id" INTEGER NOT NULL,

    CONSTRAINT "proyecto_areas_pkey" PRIMARY KEY ("proyecto_id","area_id")
);

-- CreateTable
CREATE TABLE "contrato_renglones" (
    "id" SERIAL NOT NULL,
    "contrato_id" INTEGER NOT NULL,
    "numero" INTEGER NOT NULL,
    "cantidad_horas" INTEGER,
    "valor_hora" DECIMAL(65,30),

    CONSTRAINT "contrato_renglones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_proyecto_areas_area" ON "proyecto_areas"("area_id");

-- CreateIndex
CREATE INDEX "idx_renglones_contrato" ON "contrato_renglones"("contrato_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_renglones_contrato_numero" ON "contrato_renglones"("contrato_id", "numero");

-- CreateIndex
CREATE INDEX "idx_incrementos_renglon" ON "contrato_incrementos"("renglon_id");

-- CreateIndex
CREATE INDEX "idx_prorrogas_renglon" ON "contrato_prorrogas"("renglon_id");

-- AddForeignKey
ALTER TABLE "proyecto_areas" ADD CONSTRAINT "proyecto_areas_proyecto_id_fkey" FOREIGN KEY ("proyecto_id") REFERENCES "proyectos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_areas" ADD CONSTRAINT "proyecto_areas_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "areas"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "contrato_renglones" ADD CONSTRAINT "fk_renglones_contrato" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_prorrogas" ADD CONSTRAINT "fk_prorrogas_renglon" FOREIGN KEY ("renglon_id") REFERENCES "contrato_renglones"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_incrementos" ADD CONSTRAINT "fk_incrementos_renglon" FOREIGN KEY ("renglon_id") REFERENCES "contrato_renglones"("id") ON DELETE SET NULL ON UPDATE CASCADE;
