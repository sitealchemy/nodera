# Nodera — by Brainode

A local design tool for building small marketing websites: describe a page,
Manus generates it, and you edit the result in a precision visual editor —
selection, optical nudging, responsive scopes, directions, snapshots and
HTML/JSON export.

The whole product UI is in **Polish**. The codebase (identifiers, comments) is
mixed English/Polish.

> **Status: local single-user tool.** Projects live in the browser's IndexedDB.
> Generation calls the real Manus API through a small local backend that keeps
> the key server-side. There is no authentication, no cloud sync and no
> publishing — see [What is and is not real](#what-is-and-is-not-real).

---

## Quick start

**Prerequisites:** Node.js 18+ and [bun](https://bun.sh) (the repo's lockfile is `bun.lock`).

```bash
bun install
cp .env.example .env   # then paste your Manus API key into MANUS_API_KEY
bun run dev
```

Open <http://localhost:3000>. One command runs both halves: the Vite dev server
serves the app, and a plugin (`server/manusPlugin.ts`) mounts the local backend
at `/api/manus/*` in the same process.

### The Manus API key

`MANUS_API_KEY` is read only in Node, by `server/manusApi.ts`. It is deliberately
**not** prefixed `VITE_`: anything named `VITE_*` is inlined into the browser
bundle and shipped to every visitor.

Without a key the app still opens and the demo project still works; the
dashboard shows what to configure, and generation is refused with that message
rather than failing obscurely.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on `0.0.0.0:3000` |
| `npm run build` | `tsc` typecheck, then production build to `dist/` |
| `npm run preview` | Serve the built `dist/` on port 3000 |
| `bun run lint` | `tsc --noEmit` over src, server, e2e and the configs |
| `bun run test` | Unit tests (Vitest) |
| `bun run test:e2e` | End-to-end tests (Playwright, Manus mocked) |
| `bun run test:e2e:report` | Opens the last Playwright HTML report |

---

## Stack

- **React 18** + **TypeScript 5.7**, no router and no state library
- **Vite 6** with `@vitejs/plugin-react`
- **Tailwind CSS 4** via the `@tailwindcss/vite` plugin (`@import "tailwindcss"`
  in `src/index.css`; there is no `tailwind.config.js`)
- **lucide-react** for icons
- `clsx` and `tailwind-merge` are dependencies but are not currently imported
  anywhere in `src/`

---

## The three screens

`src/App.tsx` holds a `screen` state of `'intake' | 'directions' | 'editor'`.
There is no router — navigation is a `useState` switch, and no URL changes.

**Note:** `screen` initialises to `'editor'`, so the app opens straight into the
editor with the demo project loaded. The intake screen is only reachable by
going to Directions (the "Kierunek:" pill in the top bar) and then pressing the
back arrow.

### 1. Intake (`IntakeView`)

A brief-capture form: a large textarea pre-filled with interview notes, plus a
list of extracted "project assumptions" categorised as `cel` (goal), `odbiorcy`
(audience), `charakter` (character), `materialy` (materials) and `braki` (gaps).
Submitting jumps to the Directions screen — the notes and assumptions are
accepted by the callback but currently discarded rather than used to generate
anything.

### 2. Directions (`DirectionsView`)

A shelf of three pre-authored design directions. Picking one sets
`activeDirectionId` and opens the editor.

| Direction | Positioning | Concept |
| --- | --- | --- |
| **Materia** | Faithful to the brief | Sculptural display of the ceramics; close crops of fired clay, restrained palette |
| **Pracownia** | Interpretive | People and process first — the makers, the studio, an invitation to the wheel |
| **Rytm** | Exploratory | Gallery-like contrast; large asymmetric crops, architectural typography |

### 3. Editor

The main workspace, a five-region layout:

- **`TopBar`** — brand, direction switcher, subpage tabs, viewport width
  (desktop 1280 / tablet 768 / mobile 375), edit-scope selector, undo/redo, and
  the three modal triggers (Proposal, Publish, Export).
- **`SidebarLeft`** — five icon tabs: Pages, Directions shelf, element Tree,
  global design Tokens (accent colour picker, four palette presets, button
  radius), and Assets (the stock photo set).
- **`Canvas`** — renders the page tree to real DOM, with zoom (50–160%) and a
  deliberate **safe-exploration model**: clicking does nothing until you either
  hold <kbd>Shift</kbd> or toggle "Wybierz obiekt". This keeps scrolling and
  reading the page non-destructive.
- **`SidebarRight`** — the inspector for the selected element: text content,
  the optical-offset pad, and font size / padding / border-radius fields (shown
  only when the element already has that property set).
- **`BottomBar`** — the natural-language command bar, with a context strip
  showing project · page · selected element · responsive scope, three
  quick-command chips, and one-click undo of the last command.

---

## Core concepts

### The document model (`src/types/document.ts`)

A page is a recursive tree of `NodeElement`:

```ts
interface NodeElement {
  id: string;
  name: string;                      // human label, shown in the tree & badges
  tag: 'h1' | 'p' | 'button' | 'img' | 'section' | ...;
  type: 'heading' | 'text' | 'button' | 'card' | 'grid' | ...;
  content?: string;
  tokenRef?: string;                 // e.g. "buttonPrimary" — links to a global token
  styles: ElementStyles;             // inline CSS-in-JS
  responsiveOverrides?: { mobile?: ...; tablet?: ... };
  opticalOffset?: { x: number; y: number };
  children?: NodeElement[];
}
```

Styling is **inline per node**, not Tailwind classes. The Canvas spreads
`styles` straight onto the element, then merges `responsiveOverrides.mobile` or
`.tablet` over it depending on the active viewport.

The full state tree is:

```
ProjectState
├── assumptions[]           brief facts extracted at intake
├── directions{}            3 × DirectionOption, each with its own pages{}
│   └── pages{}             4 × PageDocument → root: NodeElement
├── tokens                  global design tokens (accent, radius, fonts)
├── comments[]              client feedback pinned to element ids
└── snapshots[]             frozen copies of pages + tokens
```

### Optical offset (±1px nudging)

The feature the UI leans on hardest. Instead of changing margins — which would
push neighbours around and disturb a flex/grid layout — a node carries an
`opticalOffset` applied as a CSS `transform: translate(x, y)`. It moves the
element visually without affecting layout flow.

It is reachable three ways: the directional pad in the right inspector, the
arrow keys while the selected element's "Optyka ±1px" action is armed, and the
left/right arrow buttons on the floating toolbar over a selected element. The
current offset shows as a `Δ +2px, -1px` badge on the selection outline, and
export writes it out as a `transform`.

### Responsive scope vs. viewport

These two are **deliberately independent**: the viewport buttons change how wide
the preview renders, while "Zakres operacji" decides *where an edit is written*.
With scope set to `mobile`, style edits land in `responsiveOverrides.mobile`
instead of the shared `styles`. The inspector shows which of the two you are
editing ("Edytujesz regułę wspólną" vs. "nadpisanie dla smartfona").

### Design tokens

Changing the accent colour — in the Tokens tab or by command — walks every page
of **every** direction and recolours any node whose `tag` is `button` or whose
`tokenRef` is `buttonPrimary`. That is what makes "change all the buttons to
cobalt" apply consistently across all four subpages at once.

### Undo / redo

`App.tsx` keeps `historyStack` and `futureStack` of deep-cloned `ProjectState`
snapshots, capped at **25 entries**. Every mutation funnels through
`commitProjectUpdate()`. Note the top bar tooltips advertise Cmd/Ctrl+Z and
Cmd/Ctrl+Y, but no keyboard handler is bound — undo/redo is button-only today.

### Persistence

`StorageService` writes the whole `ProjectState` to `localStorage` under
`nodera_project_state_v1` on every change, and reloads it at boot, falling back
to `INITIAL_SPLOT_PROJECT`. **To get back to a clean demo, clear that key** (or
call `StorageService.resetToDemo()` — note that nothing in the UI currently
calls it).

---

## The command bar

The bottom input accepts Polish natural-language instructions. It is **not an
LLM** — `src/services/aiAdapter.ts` is a deterministic chain of keyword
matches. Understanding the six recognised patterns is the difference between the
tool looking magic and looking broken:

| Recognised keywords | Effect |
| --- | --- |
| `warsztat` + (`eksponuj` \| `wyżej` \| `pokaż`) | Moves the workshops section directly below the hero, rewrites the primary CTA, and recolours the workshop title to the accent |
| `kolor` + (`przycisk` \| `cta` \| `token`) | Sets the accent token and recolours every button across all pages. Colour from `kobalt`/`niebiesk` → `#24486E`, `leśn`/`zielon`/`szałw` → `#3E5748`, `czarn`/`grafit` → `#1C1B19`, `mied`/`ciepł` → `#A86645` |
| `powiększ` \| `zwiększ` \| `pomniejsz` \| `zmniejsz` | Scales the selected element's `fontSize` (or `height`) by ±20%. Honours the responsive scope |
| `korekt` \| `przesuń` \| `px` \| `offset` | Applies a ±1px optical nudge; direction from `lewo`/`prawo`/`gór`/`dół`, defaulting to 1px left |
| `kontakt` + `koniec` | Moves the "Kontakt" item to the end of the main nav |
| `napisz` \| `treść` \| `redag` \| `tekst` | Appends a fixed phrase to the selected element's text |

Anything else hits a fallback that reports success and changes nothing. The
three cases that require a selected element (resize, nudge, rewrite) silently
fall through to that same fallback when nothing is selected.

Each result returns a summary plus `detailedSteps`, surfaced in the green
confirmation strip with a "Cofnij tę zmianę" undo link.

---

## Proposal, publish and export

**Proposal (`ProposalView`)** — an immutable snapshot of pages + tokens at a
point in time, rendered read-only, with a threaded comment form that pins
feedback to a named element. New snapshots are titled automatically
(`Propozycja {direction} (v{n})`).

**Publish checklist (`PublishChecklistView`)** — five checks across content,
links, forms, accessibility and layout, with a form test and a publish button.
The checklist is a **hardcoded array**, not computed from the document; the form
test and the publish action are `setTimeout` simulations, and the resulting
"public address" is a fixed string.

**Export (`CodeExportModal`)** — the one genuinely useful output.
`StorageService.generateExportHtml()` walks the node tree and emits a standalone
HTML document: semantic tags, camelCase style keys converted to kebab-case
inline CSS, optical offsets as `transform`, token colours on `body`, and the
Tailwind CDN script in the head. You can copy it, download it per page, or
download the whole `ProjectState` as JSON.

---

## The demo project

`src/data/splotDemo.ts` (~500 lines) is a complete fictional client:
**Pracownia Splot**, a ceramics studio in Kazimierz Dolny run by Magda and Piotr
Winiarscy, offering wheel-throwing (850 zł) and slab-forming (480 zł) weekend
workshops. Four subpages: `start`, `warsztaty`, `o-pracowni`, `kontakt`.
Photography is hot-linked from Unsplash, so **the canvas needs network access**
to show images.

Worth knowing when reading the file: only the `start` page actually differs
between directions. `createPracowniaPages()` and `createRytmPages()` both call
`createMateriaPages()` and patch it — Pracownia swaps in a people-first hero,
while **Rytm changes only two lines** (a background colour and the headline). The
other three subpages are identical across all three directions.

---

## Project layout

```
src/
├── App.tsx                     screen routing, all state, all mutation handlers
├── main.tsx                    React root
├── index.css                   Tailwind import + scrollbar styling
├── types/document.ts           the whole data model
├── data/splotDemo.ts           demo project, tokens, image set
├── services/
│   ├── aiAdapter.ts            keyword-matching command interpreter
│   └── storage.ts              localStorage, snapshots, HTML/JSON export
└── components/
    ├── Editor/                 TopBar, SidebarLeft, Canvas, SidebarRight, BottomBar
    └── Views/                  IntakeView, DirectionsView, ProposalView,
                                PublishChecklistView, CodeExportModal
```

All state lives in `App.tsx` and flows down as props; there is no context,
reducer or store. Mutations follow one shape consistently: deep-clone the
project, find the node by id, mutate, `commitProjectUpdate()`.

---

## What is and is not real

Being explicit, because the UI presents all of these as working features:

| Area | Reality |
| --- | --- |
| Natural-language commands | Keyword matching over six hardcoded cases. No model call, no network |
| Direction generation | Three directions authored by hand in `splotDemo.ts`. The intake form's notes are discarded |
| Publish | `setTimeout(1200)`, then a success panel with a hardcoded URL |
| Pre-publish checklist | A static array of five results, not derived from the document |
| Form test | `setTimeout(800)`, then success |
| Comments | Stored in `localStorage` — single-browser, not shared |
| HTML export | **Genuine** — real traversal, real inline CSS, real downloadable file |
| JSON export | **Genuine** — the full serialised `ProjectState` |
| Editor, nudging, tokens, responsive overrides, undo | **Genuine** — these all operate on the real document model |

### Known gaps in the code

- `xrayMode`, `focusMode` and `workScope` are declared in `App.tsx` and passed
  into child components, but no UI ever sets them — the Canvas branches for
  x-ray outlines and focus dimming are unreachable.
- The "Tekst" quick action on the canvas selection toolbar toggles a flag but
  opens no editor; `Canvas`'s `onUpdateElementContent` prop is never invoked,
  and its signature `(id, newContent)` does not match the `(newContent)` handler
  passed from `App.tsx`. Editing text works through the right inspector instead.
- `DirectionsView` has a `comparing` state for side-by-side comparison that is
  never read.
- The subpage labels in `TopBar` are a hardcoded ternary chain over the four
  demo slugs; any other slug falls through to "Kontakt".
- Nothing in the UI calls `StorageService.resetToDemo()` or
  `exportProjectJson()` from the project level.

---

## License

See [LICENSE](LICENSE).
