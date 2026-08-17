# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Single-page web app for a fútbol sala club ("Sporting FS Almería") used by coaches to manage
training tasks, training sessions, set-piece plays (ABP), squads and matchday stats across
multiple teams/coaches. UI and all code comments are in Spanish.

## Architecture

- **Everything lives in one file: `index.html`** (~8,160 lines) — HTML, inline CSS and all
  JavaScript. No build step, no bundler, no `package.json`, no local dependencies.
- **Firebase is the entire backend**: Firebase Auth (email/password) for login, Firestore for
  all data. Firestore `onSnapshot` real-time listeners (see `REALTIME LISTENERS`, ~line 2481)
  populate plain global JS arrays (`tasks`, `sessions`, `teams`, `coaches`, `plays`,
  `playSessions`, etc.), which are re-rendered into the DOM as template-literal HTML strings —
  no framework, no virtual DOM.
- Navigation is a plain tab system: `.tab[data-tab="x"]` buttons toggle `#tab-x` divs. Not a router.
- `sw.js`, `manifest.json` and icons exist in the repo (merged in from an earlier GitHub upload)
  and are referenced in `<head>` for PWA install support, but aren't otherwise touched by app code.

## Tech stack

- Vanilla JS (ES6+), no framework.
- Firebase 10.12.2, compat SDKs (`firebase-app-compat`, `firebase-auth-compat`,
  `firebase-firestore-compat`), loaded from the `gstatic.com` CDN.
- `jspdf@2.5.1` — session → PDF export.
- `xlsx-js-style` — task bank → Excel export.
- `gif.js` — tactical whiteboard animation export.
- All loaded via `<script src>` CDN tags in `<head>`; nothing to `npm install`.

## Running it / repo

No build/install. Open `index.html` in a browser, or serve the folder statically — it's a
pure client app.

- Firebase project config is hardcoded near the top of the file: `const FIREBASE_CONFIG = {...}` (~line 27).
- Firestore security rules are **not deployed from this repo** — they're documented as a plain
  HTML comment at the very end of the file (`REGLAS_FIRESTORE`, ~line 8081) and must be pasted
  manually into the Firebase console whenever they change.
- First account ever registered auto-becomes `gestor` (admin) and is auto-activated; every
  later signup gets role `entrenador` and `active:false` until a gestor approves them from the
  "Entrenadores" tab.
- Git is initialized; remote `origin` = `https://github.com/Boxbull87/Sporting-entrenamientos`.
  Commit after each confirmed change; only `git push` when the user explicitly asks.

## Roles

Defined ~line 1544 area (search `ROLE_GESTOR`): `ROLE_GESTOR` ("gestor"), `ROLE_EDITOR` ("editor"), `ROLE_COACH` ("entrenador").
- **gestor**: full admin — manages coaches, teams, all content, sees Papelera (trash).
- **editor**: can write tasks/plays/categories/teams like a gestor, but no coach management, no trash.
- **entrenador**: normal coach; scoped to their own team(s) via `coach.teamIds`; can only edit/delete what they created.

## Firestore data model

Collections: `coaches`, `categories` (task folders), `tasks`, `sessions`, `abpCategories` (ABP
folders), `plays` (ABP set-piece plays), `playSessions` (ABP sessions, can be public via a
`#public=<id>` link), `playSessionFolders`, `gameModelFiles` (external doc links), `teams`,
`players`, `matchdays` (jornadas + per-match stats).

Most collections use **soft delete** (`deleted:true`, `deletedAt`, `deletedBy`) instead of a
real delete. The gestor-only **Papelera** tab (~line 7891) restores or purges them.

Per-coach personal organization (NOT Firestore collections — plain fields on the `coaches`
doc, only ever written by that coach):
- `favoriteTaskIds` / `favoritePlayIds` — the ★ favorite flag.
- `taskFavFolders` / `abpFavFolders` — that coach's own folders (with `parentId`, nestable)
  to organize their favorites. `favoriteTaskFolders` / `favoritePlayFolders` map each
  favorited item id → array of folder ids it's filed under (an item can be in several).
- `teamTaskFolders` / `teamAbpFolders` — separate, **per-team** folder trees (`{ [teamId]:
  [{id,name,parentId}] }`) a coach builds inside "Mi equipo → Tareas/ABP" to curate a hand-picked
  set of bank items (any item, not just favorites) for one specific team.
  `teamTaskFolderItems` / `teamAbpFolderItems` (`{ [teamId]: { [itemId]: [folderId,...] } }`)
  track membership; updated via Firestore dot-path (`field.teamId`) so one team's data never
  clobbers another's.

## Important Firestore rules (`REGLAS_FIRESTORE` comment, end of file)

- `isActive()` gates almost everything: the coach doc must have `active:true`.
- `isEditor()` (gestor or editor) can write `categories`, `tasks`, `abpCategories`, `plays`,
  `playSessionFolders`, `gameModelFiles`, `teams`.
- **`sessions` has a special multi-coach update rule**: besides the creator/gestor having full
  rights, any coach whose `teamIds` overlaps the session's `teamIds` may update the doc but
  **only** touching `postObservationsByCoach` (their own per-coach observations) and/or
  `teamIds` (used to detach their team into an independent copy). This backs the "session
  shared with several teams behaves independently per team" feature (`forkSessionForTeams_`).
- `playSessions` (ABP sessions) has **no** such special clause — only the creator or gestor can
  ever update/delete one; folder membership there is just an array field (`folderIds`), not a
  cross-coach sharing mechanism, so no extra rule is needed for it.
- `coaches` update rule allows a coach to freely write any field on **their own** doc as long as
  `role` and `active` don't change — this is what lets the per-coach favorite/team-folder fields
  above be written client-side without any rules changes.
- `playSessions` can be read without auth when `public:true` (public share links).
- `players` / `matchdays` writes are scoped to the coach's own `teamIds` unless gestor.

## Main functional areas

All inside `index.html` — search for these comment banners to jump around:

- **Tareas** (`TASK FORM` ~4196): task bank organized in Drive-like folders (nestable,
  `folderChildren_`/`folderDescendantIds_`); each task can attach a **Pizarra táctica**
  (`TACTICAL WHITEBOARD` ~3147) — a canvas-based drawing/animation tool (tokens, arrows, shapes,
  multi-frame playback, GIF export) shared by tasks and ABP plays.
- **Sesiones** (`SESSIONS` ~6264): build a training session from tasks across 3 blocks
  (calentamiento / principal / vuelta), assign it to one or more teams, per-coach observations.
  Saved sessions list is grouped coach → team → month (`sessionsByMonthHtml_`). A session shared
  across a coach's own multiple teams becomes independent per team the moment it's edited or
  deleted from one of them (`forkSessionForTeams_`, used by `forkAndEditSession`, `editSession`,
  `deleteSession`). Export to PDF via jsPDF (`EXPORTAR SESIÓN A PDF` ~6825).
- **Modelo de juego** (~7804): just external doc links (Drive/Dropbox/etc.), no file storage.
- **ABP** (`ABP · BANCO DE JUGADAS` ~7243, `ABP · SESIONES` ~7471): set-piece plays bank +
  sessions built from them, with public share links (`#public=<id>`, no login required). An ABP
  session can be filed into **several folders at once** (`folderIds` array,
  `playSessionCategoryIds`); editing/deleting one that's in >1 folder asks which folder and
  forks off an independent copy for just that one (`forkPlaySessionForFolders_`), same pattern
  as the training-session team fork above but keyed on folder instead of team.
- **Favoritos** (★, `FAVORITOS` ~4337): per-coach personal folders (with subfolders) to organize
  favorited tasks/plays — see data model above. Generic helpers parameterized by
  `section` ("tasks"/"abp"): `coachFavFolders_`, `favFolderChildren_`, `favCountInFolderTree_`,
  `openFavFolderPick`, `openFavFolderActions`.
- **Mi equipo** (`MI EQUIPO` ~1015 HTML / ~4777 JS, its own tab): a personal, team-scoped lens
  on the app for a coach with one or more assigned teams. Pick a team → menu with:
  - **Plantilla** → nested submenu (Plantilla de jugadores / Jornadas / Resumen) that jumps
    into the *same* views as the main Plantilla tab, pre-locked to that team
    (`plantillaBackTarget` makes "← Volver" return here instead of Plantilla's own home).
  - **ABP** / **Tareas** → *not* the ★ favorites — a separate, per-team folder tree the coach
    builds by hand-picking any bank item into it (`renderMiEquipoSection_`,
    `teamFolderCountTree_`, `openTeamFolderActions`). The "➕ Añadir" search matches by item
    title **or** by the name of any of its main-bank folders. Deleting a folder here keeps
    orphaned items' (now-empty) map entry so they show under "Sin carpeta" — don't
    accidentally revert that to `delete map[itemId]`, that was a real bug once already.
  - **Sesiones** → training sessions filtered to just that team (`renderMiEquipoSessions`).
- **Plantilla** (`EQUIPOS Y PLANTILLA DE JUGADORES` ~4623): teams, players, matchdays (jornadas)
  and per-match player stats; also a team-comparison view ("Comparar equipos").
- **Entrenadores** (`COACHES MANAGEMENT` ~4567, gestor-only): approve/activate coaches, assign
  roles and teams.
- **Papelera** (~7891, gestor-only): restore or permanently purge soft-deleted items.
- **Copia de seguridad** (~7987): full JSON export/import of all Firestore collections.
- Task bank export to Excel (`EXPORTAR BANCO DE TAREAS A EXCEL` ~7117).
