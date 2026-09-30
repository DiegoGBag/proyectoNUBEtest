# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

## Project context

The product vision, planned technology stack, multi-tenancy goals, and current
implementation status are documented in
[PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md).

The current UI prototype includes the Events heading, the Create event action,
and summary cards for total, upcoming, and completed events.

The Create event action now opens a responsive form based on the project mockup.
It supports event details, date and time, type, location, photo selection,
description, expected attendees, status, cancellation, and local metric updates
after submission.

Events created during the current session are stored in the frontend state.
The `Upcoming` summary card is interactive, shows a focus/hover outline, and
opens a board that groups planned and active events into columns by event type.

The `Completed` summary card has the same hover/focus outline and opens a
completed-events table. Events marked as completed or whose date has passed are
shown with their name, type, date, location, attendee count, and status.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
