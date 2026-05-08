---
name: Modelo proyecto vs contrato — el contrato no es contenedor
description: Regla de dominio crítica — un proyecto puede tener fechas que excedan al contrato; el contrato no actúa como contenedor estricto del proyecto.
type: project
---

El proyecto siempre tiene fecha_inicio y fecha_fin propias (no hereda del contrato). El contrato NO es un contenedor estricto: las fechas del proyecto pueden exceder a las del contrato.

La única regla cruzada entre fechas de proyecto y contrato es:
- Si el contrato tiene prórroga: `proyecto.fecha_fin <= contrato.fecha_fin_vigente` (no puede exceder).
- Si el contrato NO tiene prórroga: `proyecto.fecha_fin` puede exceder libremente.
- `proyecto.fecha_inicio` no tiene restricción cruzada con el contrato.

**Why:** Discusión con el dueño del producto en abril 2026. Inicialmente se asumió que el contrato delimitaba al proyecto (fechas del contrato = límites del proyecto), pero en la práctica los proyectos pueden continuar después que finaliza el contrato cuando éste no tiene prórroga. La existencia de prórroga es la única señal que cierra esa "ventana" de extensión.

**How to apply:** No asumir en validaciones, schemas Zod ni UI que `proyecto.fecha_fin <= contrato.fecha_fin` salvo que el contrato tenga prórroga. Tampoco bloquear `proyecto.fecha_inicio < contrato.fecha_inicio`. Cuando se agregue una prórroga a un contrato que ya tiene proyectos extendidos, bloquear la creación de la prórroga hasta que las fechas se ajusten.
