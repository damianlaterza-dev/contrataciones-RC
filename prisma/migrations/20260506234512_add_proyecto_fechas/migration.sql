/*
  Warnings:

  - Added the required column `fecha_fin` to the `proyectos` table without a default value. This is not possible if the table is not empty.
  - Added the required column `fecha_inicio` to the `proyectos` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "proyectos" ADD COLUMN     "fecha_fin" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "fecha_inicio" TIMESTAMP(3) NOT NULL;
