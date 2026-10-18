# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Single-page web app for a fútbol sala club ("Sporting FS Almería") used by coaches to manage
training tasks, training sessions, set-piece plays (ABP), squads, matchday stats, video scouting,
season periodization and post-session workload surveys across multiple teams/coaches. UI and all
code comments are in Spanish.

## Architecture

- **Everything lives in one file: `index.html`** (1,06 MB, **~13.380 lines**) — HTML, inline CSS
  and all JavaScript. No build step, no bundler, no `package.json`, no local dependencies.
  Because it's one huge file, keep edits surgical and search for the section banners below to
  jump around.
- **Firebase is the entire backend**: Firebase Auth (email/password) for login, Firestore for
  all data. Firestore `onSnapshot` real-time listeners (see `REALTIME LISTENERS`, ~line 3377)
  populate plain global JS arrays (`tasks`, `sessions`, `teams`, `coaches`, `plays`,
  `playSessions`, `sessionSurveys`, `mesociclos`, `microciclos`, etc.), which are re-rendered
  into the DOM as template-literal HTML strings — no framework, no virtual DOM.
- Navigation is a plain tab system: `.tab[data-tab="x"]` buttons toggle `#tab-x` divs. Not a
  router. **Except** for a handful of `location.hash` entry points read once at startup
  (see "Public / no-login links" below), which route to dedicated standalone screens.
- `sw.js`, `manifest.json` and icons exist in the repo and are referenced in `<head>` for PWA
  install support, but aren't otherwise touched by app code. `sw.js` deliberately caches
  nothing (it fetches straight through); it exists only so Chrome/Android offer a real
  "Instalar app" with the right icon.

## Tech stack

- Vanilla JS (ES6+), no framework.
- Firebase 10.12.2, compat SDKs (`firebase-app-compat`, `firebase-auth-compat`,
  `firebase-firestore-compat`), loaded from the `gstatic.com` CDN.
- `jspdf@2.5.1` — session / matchday / convocatoria / rival-report / season-summary → PDF export.
- `xlsx-js-style` — task bank and season stats → Excel export.
- `gif.js` — tactical whiteboard animation export.
- `chart.js@4.4.4` + `chartjs-plugin-datalabels` — charts in the stats dashboard.
- All loaded via `<script src>` CDN tags in `<head>`; nothing to `npm install`.

## Running it / repo

No build/install. Open `index.html` in a browser, or serve the folder statically — it's a
pure client app. (Python is available on this machine, so `python -m http.server 8765` in the
repo root is the quickest way to serve it for a manual check.)

- Firebase project config is hardcoded near the top of the file: `const FIREBASE_CONFIG = {...}`
  (~line 27).
- Firestore security rules are **not deployed from this repo** — they're documented as a plain
  HTML comment at the very end of the file (`REGLAS_FIRESTORE`, ~line 13212) and must be pasted
  manually into the Firebase console whenever they change. Several features (public ABP links,
  public workload survey, private matchday notes) depend on those rules being current, so a
  client change that needs a rules change **also** requires the user to re-paste them.
- First account ever registered auto-becomes `gestor` (admin) and is auto-activated; every
  later signup gets role `entrenador` and `active:false` until a gestor approves them from the
  "Entrenadores" tab.
- Git is initialized in this folder. Commit after each confirmed change; only `git push` when the
  user explicitly asks. Intended remote: `https://github.com/Boxbull87/Sporting-entrenamientos`
  (add it manually with `git remote add origin ...` if it isn't configured).

## Roles

Defined ~line 2481 (`ROLE_GESTOR`): `ROLE_GESTOR` ("gestor"), `ROLE_EDITOR` ("editor"),
`ROLE_COACH` ("entrenador").
- **gestor**: full admin — manages coaches, teams, all content, sees Papelera (trash).
- **editor**: can write tasks/plays/categories/teams like a gestor, but no coach management, no trash.
- **entrenador**: normal coach; scoped to their own team(s) via `coach.teamIds`; can only edit/delete what they created.

Role-gated UI is toggled in `initAppUI()` (~line 2715): editor-only panels, gestor-only
"Entrenadores"/"Papelera" tabs and public-link management buttons.

## Firestore data model

Collections: `coaches`, `categories` (task folders), `tasks`, `sessions`, `abpCategories` (ABP
folders), `plays` (ABP set-piece plays), `playSessions` (ABP sessions, can be public via a
`#public=<id>` link), `playSessionFolders`, `gameModelFiles` (external doc links), `teams`,
`players`, `matchdays` (jornadas + per-match stats — includes an embedded `rivalReport` field:
opponent scouting notes filled before the match), `mesociclos`/`microciclos` (periodización),
`sessionSurveys` (post-session workload survey answers, see "Cargas de trabajo" below).

Collections written by the **sister app Scouting FS** (same Firebase project, separate repo:
`github.com/Boxbull87/Sporting-Scout`) — this app only ever **reads** them:
`partidos_scouting` (a tagged match, linked to a jornada via `partidoSportingId`, and to a team
via `teamIdSporting`), `eventos_scouting` (tagged events, joined by `partidoId`), and
`paneles_scouting` (per-coach tagging panels; not used here at all).

Most collections use **soft delete** (`deleted:true`, `deletedAt`, `deletedBy`) instead of a
real delete. The gestor-only **Papelera** tab (~line 12978) restores or purges them. Exception:
`matchdays`, `mesociclos`, `microciclos` and `sessionSurveys` have no soft delete.

**Matchday squad with guest players from other teams**: a `matchdays` doc carries
`playerStats` (one entry per squad member) plus **`extraPlayerIds`** (array of player ids from
*other* teams of the club that were called up for that match — e.g. a youth player stepping up
to the senior side). `matchdayRoster_(m)` (~line 8207) is the single place that merges the
team's own roster with `extraPlayerIds`; `matchdayIsGuest_(m, p)` / `matchdayGuestBadgeHtml_(m, p)`
decide the "otra categoría" badge. Everything matchday-related consumes that helper:
the convocatoria/stats table, the match timeline picker, the report notes/ratings, the success
markers, the match PDF, the season summary (`computeTeamSummary_`) and the individual player
card. It mirrors `attendanceExtraPlayerIds` in "Control de asistencia" — same pattern, different
collection. No rules change is needed for it (`matchdays` write is `isActive()` for any field).

**Private matchday notes**: player notes + match report live in a separate subdocument
`matchdays/{id}/private/report` with its own rule, *not* as fields on the matchday doc — Firestore
can't filter field-by-field within a document, so the only way to keep other coaches from reading
it is for it to not be in the document they can see. It's read/written **by direct path,
matchday by matchday** (`cargarNotasPrivadas_`/`notasPrivadas_`, ~line 3409), never via
`db.collectionGroup("private")` — a collection-group query would need a wildcard rule *and* still
fail for a normal coach because rules don't filter results. Don't "simplify" this into a
collection-group query.

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
- `notifySections` — which notification sections this coach wants to be warned about.
- `lastSeenAt` / `seenIds` — per-section "seen up to" timestamp and per-item seen ids, used by
  the in-app notification bell (see "Notificaciones" below).

## Public / no-login links (`location.hash`, read at startup ~line 2654)

Checked in this order so the regexes don't need to be mutually exclusive:

| Hash | Screen | Loader |
|---|---|---|
| `#publicplay=<playId>` | one ABP play | `loadPublicPlay` |
| `#public=<playSessionId>` | one ABP session | `loadPublicPlaySession` |
| `#survey=<sessionId>` | public workload survey form (a player fills it in) | `loadSurveyForm` |
| `#loads=1` | read-only whole "Cargas de trabajo" board | `loadPublicWorkloads` |
| `#task=<taskId>` | deep link to one task inside the app (needs login) | `handleDeepLink` |

The first four fully bypass auth (the auth screen is hidden before login). Any of them requires
the corresponding doc to be public (`public:true` on `plays`/`playSessions`, `surveyPublic:true`
on `sessions`).

## Important Firestore rules (`REGLAS_FIRESTORE` comment, end of file)

- `isActive()` gates almost everything: the coach doc must have `active:true`.
- `isEditor()` (gestor or editor) can write `categories`, `tasks`, `abpCategories`, `plays`,
  `playSessionFolders`, `gameModelFiles`, `teams`.
- **`sessions` has a special multi-coach update rule**: besides the creator/gestor having full
  rights, any coach whose `teamIds` overlaps the session's `teamIds` may update the doc but
  **only** touching `postObservationsByCoach`,
  `attendance`/`attendanceExtraPlayerIds` (their team's attendance map) and/or `teamIds` (used to
  detach their team into an independent copy). This backs the "session shared with several teams
  behaves independently per team" feature (`forkSessionForTeams_`). If `sessions` gains any new
  field a shared coach must write, it has to be added to that `hasOnly([...])` list **and** the
  user must re-paste the rules. Practical consequence for the UI: changing a session's
  `taskIds`/`blocks`/`blocksSnapshot` is creator-or-gestor only, which is why the
  "add task to a session" picker only lists sessions that pass `canEditSession_(s)`.
- `matchdays` is `isActive()` read/write for **any** field — that's why the guest-squad field
  (`extraPlayerIds`) needed no rules change.
- `sessions` and `players`/`teams` have **public read** clauses: `sessions` when
  `resource.data.surveyPublic == true`; `teams` and `players` are `allow read: if true`
  (deliberately — the public survey needs to match a player by name across the whole club). They
  only expose non-sensitive fields (name/dorsal/position/team).
- `playSessions` (ABP sessions) has **no** multi-coach clause — only the creator or gestor can
  ever update/delete one; folder membership there is just an array field (`folderIds`).
- `coaches` update rule allows a coach to freely write any field on **their own** doc as long as
  `role` and `active` don't change — this is what lets the per-coach favorite/team-folder/
  notification fields above be written client-side without any rules changes.
- `playSessions` / `plays` can be read without auth when public.
- `matchdays/{id}/private/{docId}` is gestor-only or the coach whose `teamIds` includes the
  matchday's `teamId`.
- `sessionSurveys`: publicly readable only for sessions with `surveyPublic == true`; public
  create/update only when the doc id is `"{sessionId}_{playerId}"`, the session has the survey
  enabled, and the player exists.
- `partidos_scouting`/`eventos_scouting` are `isActive()` read/write (same scope as `matchdays`);
  `paneles_scouting` is restricted to its own `coachUid`.

## Main functional areas

All inside `index.html` — search for these comment banners to jump around:

- **Tareas** (`TASK FORM` ~5269): task bank organized in Drive-like folders (nestable,
  `folderChildren_`/`folderDescendantIds_`); each task can attach a **Pizarra táctica**
  (`TACTICAL WHITEBOARD` ~4120) — a canvas-based drawing/animation tool (tokens, arrows, shapes,
  multi-frame playback, GIF export) shared by tasks and ABP plays. A reusable read-only viewer
  (`VISOR DE PIZARRA REUTILIZABLE` ~11810) renders a saved board outside the editor.
  The bank (`renderTaskList`, ~line 5673) lists each task with ★ / Ver / **➕ Añadir a sesión**
  (see next bullet) / Editar / Eliminar (the last two only for gestor/editor).
- **Añadir tareas del banco a una sesión** (`BANCO DE TAREAS · AÑADIR TAREAS A UNA SESIÓN`
  ~5466, `renderTaskList` + the `addToSessionModal`): lets you build/populate a training session
  *starting from the bank*, the other way round from the session editor's own task browser.
  - **Modo selección** (`taskSelectMode`/`taskSelectIds`): the "☑️ Seleccionar varias" button in
    the bank turns every card into a tickable row (clicking the card body also toggles it); a bar
    shows the count and "➕ Añadir a sesión".
  - `openAddToSessionModal(taskIds)` opens a picker with the tasks being added, a block selector
    (**default = the task's own `phase`**, via `sessionBlockForTask_`) and the list of sessions
    this coach can edit, grouped by month and filterable by name/team/date. Sessions that already
    contain all the selected tasks show "✔ Ya está" and are disabled.
  - Choosing an existing session writes immediately (`addTasksToSession_`): appends to
    `blocks[block]`, rebuilds `taskIds`, and refreshes `blocksSnapshot` (the title snapshot the
    public survey reads). It never overwrites a task already in the session, and it also updates
    the **local** `sessions` object so a second add before the snapshot arrives can't clobber the
    first write.
  - "➕ Crear sesión nueva con estas tareas" instead calls `startNewSessionWithTasks_`, which
    resets the session editor, prefills the chosen block and shows it — **nothing is written**
    until the coach presses "Guardar sesión".
- **Sesiones** (`SESSIONS` ~10058): build a training session from tasks across 3 blocks
  (calentamiento / principal / vuelta), assign it to one or more teams, per-coach observations.
  Saved sessions list is grouped coach → team → month (`sessionsByMonthHtml_`). A session shared
  across a coach's own multiple teams becomes independent per team the moment it's edited or
  deleted from one of them (`forkSessionForTeams_`). Export to PDF via jsPDF
  (`EXPORTAR SESIÓN A PDF` ~11239). Its own task browser is `renderSessionTaskBrowser`
  (~line 10336), driven by `sessionFilterFolderIds` (intersection of folders) + phase/level/
  players/favorites filters.
  - **Equipos de entrenamiento por tarea** (in `taskTeamsHtml_`): `s.taskGroups` =
    `{taskId:[{id,teamId,name,playerIds}]}` (each training team belongs to ONE of the session's
    teams; a task with no teams is done by everyone). Players may come from other categories:
    adding one puts them in the `sessionGuestIds` pool (`collectSessionGuests_`); the previous
    shape (`s.groups`) is still read via `sessionTaskTeamsRaw_` and migrated on save.
    Everything is filtered per team via `sessionGroupsFor_`/`taskGroupsFor_`/`taskAppliesToTeam_`.
  - **Asistencia** per session (`s.attendance`/`s.attendanceExtraPlayerIds`, maps keyed by team
    id): coaches with a shared session write it, so those two keys are in the `sessions` rule's
    `hasOnly` list. Per-session attendance lets you call up players from other categories via a
    name search (`attendanceAddPlayerSearch` / `renderAttendanceAddResults_`); this is the
    pattern the matchday squad copied.
- **Cargas de trabajo** (~11112, `renderSessionLoads_`): results of the public post-session
  survey, grouped team → month like the other session lists. Activating the survey on a session
  is done from "✏️ Editar sesión" → "Activar encuesta para jugadores" (writes `surveyPublic`).
  Each session stores a `blocksSnapshot` of its task titles so the survey can show them; each
  answer stores a `taskSnapshot` of {title,rating} plus `rpe` (session hardness /10), `pain` +
  `painDetail`, `fatigueBefore`, `fatigueAfter`. Doc id is `"{sessionId}_{playerId}"`, so
  resubmitting replaces the previous answer. Public read-only board via `#loads=1`. This is why
  anything that changes a session's tasks must keep `blocksSnapshot` in sync.
- **Scouting FS** (`SCOUTING FS — lectura de solo consulta` ~7320): reads the sister app's
  `partidos_scouting`/`eventos_scouting`. Three entry points share the same functions:
  a single matchday in "Jornadas", a single matchday in "Estadísticas", and a whole season in
  "Estadísticas". `cargarScoutingDeJornada_` (one match) and `cargarScoutingDeEquipo_`
  (aggregates a team's matches within a set of matchday ids) both normalise data through
  `scoutProyectoDesdeDoc_` into a "proyecto" list, which is what the dashboard consumes.
- **Panel de Estadísticas** (`PANEL DE ESTADÍSTICAS (jerarquía de 4 niveles)` ~7753): replaced
  the old "📄 Texto / 📊 Dashboard" toggle with one view — level 1 header + KPIs, level 2
  own-vs-rival comparison, level 3 highlights + individual performance, level 4 collapsible
  detail tables. Chart.js instances are tracked in `scoutChartInstances_` and destroyed via
  `scoutDestruirGrafico_` before re-render. "Por quinteto" and "Rendimiento individual" only
  appear for a single match (they need `cambiosQuinteto`/`plantillaPropia`).
- **Notificaciones** (~3575): in-app bell (`#btnNotifBell`/`#notifPanel`) warning about new items
  in 5 sections (`NOTIFY_SECTIONS`: tasks, sessions, plays, playSessions, gameModelFiles). Reads
  `coach.notifySections`/`lastSeenAt`/`seenIds`; never notifies about your own items
  (`item.createdBy === currentUser.uid`). Also renders red dots on the home cards and re-renders
  the listings so each item shows its own dot.
- **Modelo de juego** (~12528): just external doc links (Drive/Dropbox/etc.), no file storage.
- **ABP** (`ABP · BANCO DE JUGADAS` ~11862, `ABP · SESIONES` ~12128): set-piece plays bank +
  sessions built from them, with public share links. An ABP session can be filed into **several
  folders at once** (`folderIds` array, `playSessionCategoryIds`); editing/deleting one that's in
  >1 folder asks which folder and forks off an independent copy for just that one
  (`forkPlaySessionForFolders_`), same pattern as the training-session team fork. Public link
  management (enable/disable/regenerate all) is gestor-only.
- **Favoritos** (★, `FAVORITOS` ~5410): per-coach personal folders (with subfolders) to organize
  favorited tasks/plays — see data model above. Generic helpers parameterized by
  `section` ("tasks"/"abp"): `coachFavFolders_`, `favFolderChildren_`, `favCountInFolderTree_`,
  `openFavFolderPick`, `openFavFolderActions`.
- **Mi equipo** (`MI EQUIPO` ~6133, its own tab): a personal, team-scoped lens on the app for a
  coach with one or more assigned teams. Pick a team → menu with:
  - **Plantilla** → nested submenu (Plantilla de jugadores / Jornadas / Estadísticas / Resumen)
    that jumps into the *same* views as the main Plantilla tab, pre-locked to that team
    (`plantillaBackTarget` makes "← Volver" return here instead of Plantilla's own home).
  - **ABP** / **Tareas** → *not* the ★ favorites — a separate, per-team folder tree the coach
    builds by hand-picking any bank item into it (`renderMiEquipoSection_`,
    `teamFolderCountTree_`, `openTeamFolderActions`). The "➕ Añadir" search matches by item
    title **or** by the name of any of its main-bank folders. Deleting a folder here keeps
    orphaned items' (now-empty) map entry so they show under "Sin carpeta" — don't
    accidentally revert that to `delete map[itemId]`, that was a real bug once already.
  - **Sesiones** → training sessions filtered to just that team (`renderMiEquipoSessions`).
  - **Mesociclos** → season periodization: a mesociclo (`mesociclos`) is a date-ranged phase
    (name, color, `objetivos`/`marcadoresExito`/`evaluacion` free text); a microciclo
    (`microciclos`) belongs to one mesociclo (`mesocicloId`) and its dates must fall inside the
    parent's range. Shown as a Gantt-style timeline (`renderMesociclosTimeline_`); no soft delete.
    The team's calendar colors each day's top half by its mesociclo and bottom half by its
    microciclo (`mesocicloEnFecha_`/`microcicloEnFecha_`).
  - **Calendario** (bottom of the menu screen): `renderMiEquipoCalendar_` — month grid of that
    team's sessions/matchdays, click a day to create one.
- **Plantilla** (`EQUIPOS Y PLANTILLA DE JUGADORES` ~5934): teams, players, matchdays (jornadas)
  and per-match player stats; also a team-comparison view ("Comparar equipos"), the
  "Estadísticas" submenu (see Panel de Estadísticas above) and the individual player card
  (`openPlayerProfile`), which lists the player's matchdays **including ones played as a guest
  for another team**.
- **Jornadas** (`JORNADAS — CRONOLOGÍA DEL PARTIDO` ~8567): one matchday's detail — goal events
  timeline, per-player stats, `rivalReport` (opponent scouting), convocatoria PDF, rival-report
  PDF, season summary PDF/Excel, and the embedded Scouting FS panel. The
  **"📋 Convocatoria y estadísticas de jugadores"** accordion is where the squad is set
  (`renderMatchdayStatsTable`, ~line 8264; `matchdayStatsRowHtml_`): it lists the team's roster
  plus any **guest players from other teams** (`extraPlayerIds`, added through the
  `mdAddPlayerSearch` box) and shows one state/goals/cards row per player. Guests only become
  visible in the other matchday sections (timeline, report, PDF…) **after** pressing
  "💾 Guardar convocatoria", which writes `playerStats` + `extraPlayerIds` together — that's the
  same "edit in memory, save explicitly" pattern the attendance modal uses.
- **Control de asistencia** (`renderAttendanceControlView_`/`computeAttendanceSummary_` ~9780):
  cross-session attendance summary, which already included guest players from other categories —
  it's the reference implementation the matchday guest squads were modelled on.
- **Entrenadores** (`COACHES MANAGEMENT` ~5861, gestor-only): approve/activate coaches, assign
  roles and teams.
- **Papelera** (~12978, gestor-only): restore or permanently purge soft-deleted items
  (`TRASH_RETENTION_DAYS = 30`).
- **Copia de seguridad** (~13074): full JSON export/import of all Firestore collections.
- Task bank export to Excel (`EXPORTAR BANCO DE TAREAS A EXCEL` ~11736).

## Known rough edges / gotchas

- `catName_()` is defined twice, identically, at top level. Harmless (the second wins) but
  worth removing if you're in that area.
- The `ensureSpace`/`sectionBar`/`fullBox`/`fitText` helpers are defined multiple times, but
  each copy is **local to a different PDF-export function** — that duplication is intentional
  and fine.
- There is no test suite and no build/lint step. Verification is manual in the browser (serve
  the folder and check the console; `python -m http.server` works).
- Because there's a single 13k-line file, always confirm line numbers with a search before
  editing; banner comments and function names above are the most reliable anchors.
