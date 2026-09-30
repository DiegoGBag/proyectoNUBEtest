# Contexto del proyecto

## Vision

Construir una plataforma web centralizada para administrar distintos tipos de
eventos. La plataforma debe permitir organizar la informacion de forma
consistente y facilitar su consulta y administracion desde un solo lugar.

El proyecto se encuentra actualmente en la etapa inicial: existe un esqueleto
de frontend creado con React y Vite, pero aun no se han implementado las
funcionalidades de negocio ni el backend.

## Stack tecnologico previsto

- **Frontend:** React.
- **Backend:** Python con FastAPI.
- **Base de datos:** PostgreSQL.
- **Despliegue:** AWS.

## Objetivos de arquitectura

- Separar claramente el frontend, la API y la persistencia de datos.
- Diseñar la base de datos con soporte para **multi-tenancy**, de modo que
  varias organizaciones o clientes puedan utilizar la plataforma manteniendo
  sus datos aislados.
- Centralizar la informacion de los eventos y exponerla mediante una API
  consistente.
- Mantener una arquitectura preparada para crecer y desplegarse en AWS.

## Alcance inicial previsto

1. Definir el modelo de tenants, usuarios, permisos y eventos.
2. Crear la API con FastAPI.
3. Diseñar las migraciones y el esquema de PostgreSQL.
4. Integrar el frontend de React con la API.
5. Implementar autenticacion y autorizacion con aislamiento por tenant.
6. Preparar el despliegue y la configuracion operativa en AWS.

## Decisiones pendientes

Estas decisiones se concretaran durante el desarrollo:

- Estrategia de aislamiento multi-tenant:
  esquema compartido con `tenant_id`, esquema por tenant o base de datos por
  tenant.
- Tipos de eventos y campos especificos que administrara la plataforma.
- Proveedor y flujo de autenticacion.
- Servicios de AWS que se utilizaran para la aplicacion, la base de datos y
  los archivos.
- Entornos de desarrollo, pruebas y produccion.

## Estado actual

- Frontend React/Vite generado con la primera vista de Events:
  encabezado, boton de crear evento y tarjetas de resumen para eventos totales,
  proximos y completados.
- Flujo de creacion de eventos implementado en el frontend, con formulario,
  validacion de campos requeridos, carga de imagen y actualizacion de metricas.
- Los eventos creados se mantienen en el estado de la aplicacion y los eventos
  no completados aparecen en una vista agrupada por tipo.
- Backend aun no creado.
- Base de datos aun no configurada.
- Despliegue en AWS aun no configurado.

## UI inicial

La primera iteracion visual replica el mockup de la pantalla de eventos:

- Tema oscuro con fondo casi negro y tarjetas en gris oscuro.
- Titulo `Events` y subtitulo descriptivo.
- Boton azul `Create event` con estado hover y foco accesible.
- Tres tarjetas de estadisticas: `Total events`, `Upcoming` y `Completed`.
- Layout responsive: las estadisticas pasan de tres columnas a una columna en
  pantallas pequenas.
- El boton `Create event` abre el formulario completo de creacion; `Cancel`
  regresa al dashboard y el envio exitoso actualiza los contadores.
- La tarjeta `Upcoming` es interactiva: muestra un outline en hover/foco y
  abre la vista de eventos proximos agrupados en columnas por tipo.
- La tarjeta `Completed` tambien es interactiva: muestra un outline en
  hover/foco y abre una tabla de eventos completados o con fecha pasada. La
  tabla incluye nombre, tipo, fecha, ubicacion, asistentes y estado.
