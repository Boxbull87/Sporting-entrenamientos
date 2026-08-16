# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Single-page web app for a fútbol sala club ("Sporting FS Almería") used by coaches to manage
training tasks, training sessions, set-piece plays (ABP), squads and matchday stats across
multiple teams/coaches. UI and all code comments are in Spanish.

## Architecture

- **Everything lives in one file: `index.html`** (~7,400 lines) — HTML, inline CSS and all
  JavaScript. No build step, no bundler, no `package.json`, no local dependencies.
- **Firebase is the entire backend**: Firebase Auth (email/password) for login, Firestore for
  all data. Firestore `onSnapshot` real-time listeners (see `REALTIME LISTENERS`, ~line 2290)
  populate plain global JS arrays (`tasks`, `sessions`, `teams`, `coaches`, `plays`,
  `playSessions`, etc.), which are re-rendered into the DOM as template-literal HTML strings —
  no framework, no virtual DOM.
- Navigation is a plain tab system: `.tab[data-tab="x"]` buttons toggle `#tab-x` divs. Not a router.
- `sw.js` (service worker) and `manifest.json`/icons are referenced in `<head>` for PWA install
  support but are **not present in this repo** — only `index.html` is tracked in git.

## Tech stack

- Vanilla JS (ES6+), no framework.
- Firebase 10.12.2, compat SDKs (`firebase-app-compat`, `firebase-auth-compat`,
  `firebase-firestore-compat`), loaded from the `gstatic.com` CDN.
- `jspdf@2.5.1` — session → PDF export.
- `xlsx-js-style` — task bank → Excel export.
- `gif.js` — tactical whiteboard animation export.
- All loaded via `<script src>` CDN tags in `<head>`; nothing to `npm install`.

## Running it

No build/install. Open `index.html` in a browser, or serve the folder statically — it's a
pure client app.

- Firebase project config is hardcoded near the top of the file: `const FIREBASE_CONFIG = {...}` (~line 27).
- Firestore security rules are **not deployed from this repo** — they're documented as a plain
  HTML comment at the very end of the file (`REGLAS_FIRESTORE`, ~line 7314) and must be pasted
  manually into the Firebase console whenever they change.
- First account ever registered auto-becomes `gestor` (admin) and is auto-activated; every
  later signup gets role `entrenador` and `active:false` until a gestor approves them from the
  "Entrenadores" tab.

## Roles

Defined ~line 1544: `ROLE_GESTOR` ("gestor"), `ROLE_EDITOR` ("editor"), `ROLE_COACH` ("entrenador").
- **gestor**: full admin — manages coaches, teams, all content, sees Papelera (trash).
- **editor**: can write tasks/plays/categories/teams like a gestor, but no coach management, no trash.
- **entrenador**: normal coach; scoped to their own team(s) via `coach.teamIds`; can only edit/delete what they created.

## Firestore data model

Collections: `coaches`, `categories` (task folders), `tasks`, `sessions`, `abpCategories` (ABP
folders), `plays` (ABP set-piece plays), `playSessions` (ABP sessions, can be public via a
`#public=<id>` link), `playSessionFolders`, `gameModelFiles` (external doc links), `teams`,
`players`, `matchdays` (jornadas + per-match stats).

Most collections use **soft delete** (`deleted:true`, `deletedAt`, `deletedBy`) instead of a
real delete. The gestor-only **Papelera** tab (~line 7124) restores or purges them.

## Important Firestore rules (`REGLAS_FIRESTORE` comment, end of file)

- `isActive()` gates almost everything: the coach doc must have `active:true`.
- `isEditor()` (gestor or editor) can write `categories`, `tasks`, `abpCategories`, `plays`,
  `playSessionFolders`, `gameModelFiles`, `teams`.
- **`sessions` has a special multi-coach update rule**: besides the creator/gestor having full
  rights, any coach whose `teamIds` overlaps the session's `teamIds` may update the doc but
  **only** touching `postObservationsByCoach` (their own per-coach observations) and/or
  `teamIds` (used to detach their team into an independent copy). This is what backs the
  "session shared with several teams behaves independently per team" feature, implemented
  client-side via `forkSessionForTeams_` in `index.html`.
- `playSessions` can be read without auth when `public:true` (public share links).
- `players` / `matchdays` writes are scoped to the coach's own `teamIds` unless gestor.

## Main functional areas

All inside `index.html` — search for these comment banners to jump around:

- **Tareas** (`TASK FORM` ~3944): task bank organized in Drive-like folders; each task can
  attach a **Pizarra táctica** (`TACTICAL WHITEBOARD` ~2896) — a canvas-based drawing/animation
  tool (tokens, arrows, shapes, multi-frame playback, GIF export) shared by tasks and ABP plays.
- **Sesiones** (`SESSIONS` ~5576): build a training session from tasks across 3 blocks
  (calentamiento / principal / vuelta), assign it to one or more teams, per-coach observations.
  Saved sessions list is grouped coach → team → month → **week of month** (real calendar weeks,
  Monday-based, via `sessionWeekOfMonth_`). A session shared across a coach's own multiple teams
  becomes independent per team the moment it's edited or deleted from one of them
  (`forkSessionForTeams_`, used by `forkAndEditSession`, `editSession`, `deleteSession`).
  Export to PDF via jsPDF (`EXPORTAR SESIÓN A PDF` ~6169).
- **Modelo de juego** (~7036): just external doc links (Drive/Dropbox/etc.), no file storage.
- **ABP** (`ABP · BANCO DE JUGADAS` ~6586, `ABP · SESIONES` ~6813): set-piece plays bank +
  sessions built from them, with public share links (`#public=<id>`, no login required).
- **Plantilla** (`EQUIPOS Y PLANTILLA DE JUGADORES` ~4335): teams, players, matchdays (jornadas)
  and per-match player stats; also a team-comparison view ("Comparar equipos").
- **Entrenadores** (`COACHES MANAGEMENT` ~4279, gestor-only): approve/activate coaches, assign
  roles and teams.
- **Papelera** (~7124, gestor-only): restore or permanently purge soft-deleted items.
- **Copia de seguridad** (~7219): full JSON export/import of all Firestore collections.
- Task bank export to Excel (`EXPORTAR BANCO DE TAREAS A EXCEL` ~6461).
