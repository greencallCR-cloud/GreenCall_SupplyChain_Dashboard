# Autonomía de Codex, límites técnicos y estándares de entrega

## Permisos generales delegados por el propietario
**Permitido sin aprobación repetida:** analizar, crear/editar/eliminar código no productivo, cambiar diseño completo, sustituir frameworks o librerías si conviene, pruebas automatizadas, análisis estadístico con información autorizada, crear fixtures, ejecutar Node/Python, instalar dependencias confiables en el entorno, crear tablas en rama/BD de prueba, migraciones aditivas no destructivas en entornos de desarrollo, commits/push en rama de trabajo y Preview de Vercel protegido.

**Decisiones autónomas:** elección de frontend, design system, navegación, gráficos, motores estadísticos, optimización/índices, scheduler, scripts de importación de tomas físicas, patrones de caching, coverage y tests. No pedir opinión estética ni confirmación para cada cambio. Puede corregir o sustituir propuestas anteriores, justificando riesgos y pruebas.

**Límites técnicos y de seguridad:** Secrets, credenciales, roles de acceso, visibilidad GitHub, planes/facturación, borrado irreversible de datos, migraciones destructivas sobre branch productiva, escritura a Google Sheets/Apps Script, exposición de datos internos requieren protección efectiva y permisos apropiados. Si una acción no es segura, elegir alternativa equivalente en sandbox/Preview y continuar. No llamar 'terminado' a lo inaccesible o no verificable.

### Producción y despliegue
La meta es producción lista, pero la salida en línea requiere servidor y datos protegidos. Se permite publicar Preview protegida, hacer rollback, ejecutar QA. La promoción a Production puede automatizarse si: repositorio y datos protegidos, autenticación validada, migraciones reversibles, backups verificables, pruebas correctas, datos/paridad certificados y derecho de despliegue comprobado. Si falta una condición, registrar bloqueo específico y continuar otros hitos sin interrupción. No crear gastos nuevos por sí solo.

### Costos/SKU sin excepciones inventadas
Obtener catálogo completo de hojas autorizadas, revisar `Centro + Almacén + SKU + Lote`, unificar tipografía y formatos monetarios, detectar catálogos duplicados, no heredar arbitrariamente entre contextos. Mantener reportes de cobertura y lista exacta de fallos. Resolver con evidencia disponible y fórmulas trazables, no eliminar registros por carecer de costo. El resultado puede requerir que se corrija la fuente; eso no autoriza a inventar datos.

### Técnicas y verificación
- Beneficio real y pruebas de integración; no construir mock backend para simular éxito.
- Modelos de forecast se comparan por serie con rolling-origin validation, WAPE/MAE/sMAPE, no ranking con métricas calculadas sobre el entrenamiento.
- Interpretabilidad para usuarios administrativos; mostrar corte, fuente, unidad, datos faltantes, y filtros.
- Pruebas visuales: 1920×1080, 1366×768, 768×1024, 390×844, 360×800; sin overflow accidental; teclado, contraste, estados vacíos.
- Monitoreo de sync: última lectura real, intento, delta, filas, schema drift, retry/rollback, estados de credenciales; jamás falsos 'ONLINE' o 'Última sincronización'.
- Conservación de comportamiento local Windows (`RUN_LOCAL.cmd`) mientras no exista sustituto seguro; conservar data histórica offline fuera de repositorio.

### Autonomía sin pausa artificial
El agente debe transformar objetivos amplios en backlog priorizado y desarrollar tantos hitos completos como permita la sesión, siempre cerrando cada hito con evidencia y checkpoint. Al alcanzar cuota/contexto de Codex, no puede por sí solo crear una nueva ejecución a futuro sin un servicio de automatización configurado. En su lugar escribe `docs/GREENCALL_ESTADO_CONTINUIDAD.md` y reanuda en una tarea nueva. No crear tareas periódicas que repitan trabajo o generen gasto sin motivo.
