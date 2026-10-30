# GreenCall Cloud — fase 1 (rama `develop-cloud`)

## Alcance REAL de este parche

- Agrega `api/status.mjs` compatible con Vercel: ya no debe devolver 404.
- Consulta `SELECT current_database()` en Neon usando `DATABASE_URL`, solo lectura.
- No expone URL, usuario, contraseña ni mensajes de error de PostgreSQL.
- Agrega `/api/dashboard`, `/api/rows`: HTTP 503 JSON mientras se migra la base. **No simula KPIs.**
- Agrega `/api/sheets/status` de diagnóstico sin afirmar sincronización real.
- La interfaz distingue aplicación local de Cloud en migración.
- Conserva el motor y los archivos locales de v1.4.1; la modificación de `refresh()` mantiene el flujo local.
- Ignora `local-data/base.json` y credenciales para evitar subirlos a GitHub.

## Pendiente (NO es aún versión productiva)

1. Crear migraciones PostgreSQL revisadas en una rama de Neon de pruebas.
2. Cargar el histórico original privado; NO colocarlo en `public/` ni subirlo a GitHub.
3. Hacer endpoints reales, paginación, agregados, controles de acceso y permisos.
4. Diseñar sincronización Sheets→Neon idempotente con auditoría/rollback.
5. Validar las métricas en períodos y cortes equiparables; QA responsive en navegador.
6. Habilitar producción solo tras autenticación y elección de plan empresarial.

## Pruebas

`npm run cloud:test` = tests unitarios sin acceso externo.
`npm run check` = validación de sintaxis.

La conexión real `DATABASE_URL` solo puede probarse en el despliegue Vercel autorizado; no se dispuso de la contraseña para ejecutarla en este entorno.

El paquete contiene SOLO los archivos nuevos/modificados y se copia en la **raíz del repositorio existente**, manteniendo las demás carpetas. No crear una subcarpeta de proyecto dentro del repositorio.

## Guía Windows

1. Confirmar rama `develop-cloud` en GitHub Desktop.
2. Pulsar **Show in Explorer** para abrir carpeta del repositorio.
3. Descomprimir `GreenCall_Cloud_Paso1_develop-cloud.zip` en una carpeta temporal.
4. Copiar **el contenido** de `GreenCall_Cloud_Paso1_develop-cloud` al interior del repositorio, aceptando reemplazo de `package.json`, `public/index.html` y `public/assets/app.js`.
5. No borrar `.git`, no pegar `base.json`, claves ni `.env`.
6. Revisar los cambios en GitHub Desktop y confirmar que `.gitignore` esté incluido.
7. Commit: `Cloud fase 1: API status + diagnóstico Neon` y luego **Push origin**.
8. En Vercel abrir `Deployments`, localizar el preview asociado a `develop-cloud` y abrir la URL del preview.
9. Ir a `/api/status` del DOMINIO PREVIEW (NO asumir que producción `main` ya cambió).
10. Si `DATABASE_URL` solo está configurada para Production, el preview devolverá `database.state = not_configured`. Se puede verificar código sin la credencial. Para probar Neon en el preview, añadir la variable a Preview en Vercel siguiendo controles de acceso, preferiblemente con una rama/base de Neon de desarrollo, y volver a desplegar.
11. `/api/dashboard` devolverá HTTP 503 JSON `DATA_MIGRATION_PENDING`, **comportamiento esperado** en esta etapa.

## Seguridad

La API de estado está disponible públicamente y solo expone estados genéricos. No se sirven datos operativos desde estos endpoints. `api/dashboard` bloquea la lectura hasta completar la migración. No subir snapshots, series, datos de clientes, material sensible ni claves a un proyecto público.

Vercel Hobby no es el destino productivo empresarial. Mantener la aplicación protegida.
