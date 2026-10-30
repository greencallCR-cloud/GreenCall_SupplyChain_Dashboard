# GreenCall Supply Chain — conexión automática a Google Sheets (v1.4)

## Objetivo y situación inicial

**Fuente principal:** Google Sheets `Copia_Series_General_Green_Call`, ID `1gUK6b2eLyC2Al5opwiNb1r21-QAYrsJtncS37aP8nj8`. La v1.4 **ya incorpora** como respaldo histórico los 173.761 registros saneados de `Consumos` cargados en v1.3. Sin configuración adicional, el dashboard arranca con esa copia y funciona desconectado.

**Arquitectura implementada:** Google Sheets (solo lectura) → Google Sheets API → adaptador de importación tipada (mismas reglas de negocio) → archivo JSON de almacenamiento local → indicadores/forecast existentes. No utiliza Supabase/SQL para las tablas operativas. Supabase podría reservarse más adelante para usuarios, auditoría, accesos y configuración, pero no se exige ni se modifica en esta entrega.

La aplicación no hace llamadas directas a Google desde el navegador; las credenciales permanecen en el servidor Node.js **local**, que escucha únicamente en `127.0.0.1`.

## Preparar una cuenta de servicio (operación a cargo de usuario autorizado)

1. Ingrese a **Google Cloud Console** con su cuenta autorizada y seleccione un proyecto de su organización. Active la **Google Sheets API**. No debe activar servicios adicionales ni editar producción.
2. En IAM y administración → Cuentas de servicio, cree una cuenta para **lectura de inventarios BI**. Cree una clave de tipo **JSON** únicamente si las políticas de su organización permiten claves descargables; guárdela fuera de la carpeta del dashboard, por ejemplo `C:\\GreenCallPrivado\\sheets-readonly.json`. **Nunca la adjunte a ChatGPT ni a un repositorio.** Si su organización prohíbe claves de cuentas de servicio, solicite al administrador una alternativa de autenticación administrada; esta versión no implementa OAuth de usuario.
3. En el archivo JSON, identifique `client_email`. En el Google Sheets principal, pulse Compartir y agregue ese correo con función **Lector**, nunca Editor. Confirme que la cuenta tenga permiso de consulta al libro requerido. El nombre de la cuenta de servicio termina en `.gserviceaccount.com`.
4. Extraiga el ZIP y abra `RUN_LOCAL.cmd`. Entre en **Administración** e introduzca la clave administrativa temporal que aparece en la consola de Node.
5. En **Google Sheets · Fuente principal**, indique la ruta absoluta del JSON (se utiliza en el servidor, no se copia al ZIP), confirme el ID de la hoja, configure intervalo y periodicidad de conciliación, y pulse **Guardar configuración**.
6. Pulse **Probar acceso**. Si responde con permiso denegado, revise la habilitación de API y que el correo de la cuenta se compartió como lector del Sheets. Luego pulse **Reconciliar todo** para efectuar la primera lectura completa. Consulte el progreso en el panel.
7. Al completar, el banner cambiará a **SHEETS CONECTADO**. El motor alimenta las mismas tarjetas, tablas, tendencias, ABC y forecast que ya calculaba con los datos importados. Los datos no se copian al navegador en masa.

## Modo automático (mientras RUN_LOCAL.cmd está abierto)

- Intervalo predeterminado: **10 minutos** (configurable 5–120 minutos).
- La **primera ejecución** hace lectura completa de las pestañas habilitadas; también al pulsar Reconciliar todo.
- En siguientes ciclos, `Consumos` relee **las 3.000 filas finales y las nuevas**. Otras pestañas operativas se consultan completas para obtener su snapshot vigente.
- Cada **24 horas** (configurable 1–168 h) se ejecuta reconciliación completa para detectar modificaciones o eliminaciones en filas antiguas de `Consumos`.
- Si la cantidad de filas disminuye drásticamente de forma inesperada, el reemplazo se bloquea por seguridad. Si la API falla a mitad de una carga, **no se aplica ningún dataset parcialmente**. Una importación manual no puede sustituir el snapshot al mismo tiempo que una sincronización activa.
- La configuración guarda **la ruta** del archivo JSON privado, **no la clave**, en `local-data/sheets-sync.json` del equipo. Antes del primer reemplazo automático se conserva `local-data/base.json.pre-sheets.backup` como respaldo local de los datos anteriores. Ese respaldo puede contener información operativa y no debe publicarse.
- Google Sheets se usa exclusivamente en lectura; no se editan celdas, Apps Script, ni otras cuentas. Si el equipo se apaga o se cierra la consola, **se detienen las sincronizaciones**; al volver a abrir la app, se reanudan según el calendario.
- Este mecanismo es **sincronización periódica**, no un disparador instantáneo en cada edición. Si se necesita publicación continua 24/7, será necesario un servicio siempre encendido y gestionar autenticación centralizada.

## Pestañas implementadas

- Consumos (Google) — datos de materiales y órdenes. El servidor consulta las columnas `A:Q` y `U:W`, excluyendo campos de identificación y nombre de clientes de las columnas intermedias.
- Inventario Real; Despachos Serializados; Despachos No Serializados.
- Rotación Técnicos; Devoluciones Rotación; Catálogo SKUs; Tecnicos (**no** consulta la columna de cédulas).
- Series SAP; Cantidades SAP; Existencias ETA; Cobros; Control Devoluciones Taller; Recepciones.
- Toma física sigue en el importador Excel: no existe una pestaña homóloga vinculada en el Sheets principal.

Las pestañas se identifican por **nombre exacto**, con encabezados validados; si faltan, se muestra un error y se mantiene el respaldo, nunca se fabrican datos. Los reportes CSV/XLSX continúan disponibles como vía alternativa.

## Capacidad y seguridad

Con más de 170.000 líneas, la API de Sheets se consulta en fragmentos de hasta **2.500 filas por bloque**, no a través de un CSV público ni como una sola petición de enorme tamaño. Se limitan las solicitudes y se aplica reintento con espera exponencial cuando Google devuelve errores temporales o `429` por cuota. Google publica cuotas para Sheets API; estas pueden cambiar.

- No copiar credenciales a `local-data`, `public`, `GitHub`, `Cloudflare` o `Supabase`.
- La ruta del archivo privado en configuración solo debe administrarla un usuario autorizado en su máquina.
- Utilizar **Lector** y scope `spreadsheets.readonly` de Google; no se requieren permisos de edición.
- El dashboard local y sus datos operativos no deben exponerse mediante un túnel o servidor público sin autenticación, TLS y políticas de acceso robustas.

## QA y limitaciones verificadas

El módulo tiene pruebas con respuesta API simulada (no con acceso real usando credenciales), que verifican carga inicial, nuevas filas, correcciones en cola, idempotencia, errores de red y seguridad. Se comprobó además que los endpoints de administración exigen sesión.

**No se ha probado una lectura con cuenta de servicio real del usuario** porque no se proporcionó una clave privada, y no sería apropiado incluirla en este ZIP. La activación requiere los pasos anteriores. La ejecución local sin conexión sí está verificada con los datos precargados.

Fuentes oficiales: https://developers.google.com/workspace/sheets/api/limits · https://developers.google.com/identity/protocols/oauth2/service-account
