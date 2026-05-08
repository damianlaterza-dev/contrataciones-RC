/*
  Warnings:

  - Added the required column `fecha_fin_vinculo` to the `contrato_proyectos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fecha_inicio_vinculo` to the `contrato_proyectos` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "uq_contrato_proyecto";

-- AlterTable
ALTER TABLE "contrato_proyectos" ADD COLUMN     "fecha_fin_vinculo" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fecha_inicio_vinculo" TIMESTAMP(3) NOT NULL;
