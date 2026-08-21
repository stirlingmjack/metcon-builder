# Metcon Builder

A small, offline-friendly web app that generates a daily metcon-style
workout using only the equipment you actually own and the space you
actually have. No backend, no account, no build step — it's plain
HTML/CSS/JS and stores everything (settings + history) in your browser's
`localStorage`.

## Running it

Just open `index.html` in a browser, or serve the folder statically:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

(Serving it avoids some browsers' quirks with `file://` + localStorage,
but opening the file directly also works in most browsers.)

## How it works

- **`js/data.js`** — the equipment defaults and the movement library.
  Each movement is tagged with the equipment it needs, how much floor
  space it needs, a rough movement pattern (squat/hinge/push/pull/
  carry/core/cardio), and a baseline rep/cal/second range.
- **`js/rng.js`** — a small seedable PRNG (mulberry32). "Today's" workout
  is seeded from the date, so reloading the page shows the same workout
  until you hit Generate/Regenerate.
- **`js/generator.js`** — the pure generation logic: filters the movement
  library down to what your equipment/space allow, picks a format (AMRAP,
  For Time, EMOM, Tabata, Chipper), picks 1–4 movements with a soft
  preference for pattern variety and for movements you haven't done the
  last few days, and scales reps/weights to your chosen duration and
  intensity. Has no DOM dependency, so it's unit-tested directly in
  Node — see `test/generator.test.js` (`node test/generator.test.js`).
- **`js/storage.js`** — reads/writes settings and a date-keyed workout
  history to `localStorage`.
- **`js/app.js`** — wires the above to the DOM: renders the workout card,
  the settings form, the daily log (completed/Rx-or-scaled/notes), and
  the history list.

## Customizing your gear

Click **⚙ Settings** to change what equipment you have, how much of it
(kettlebell/sandbag/barbell/dumbbell weights are comma-separated lists —
list a weight twice if you own two of that bell), and how much floor
space you're working with. Pull-up bar, jump rope, and plyo box are wired
up but off by default; flip them on if your setup grows. Settings persist
across sessions and immediately regenerate today's workout.

## Adding movements or formats

Both are plain data/objects in `js/data.js` — add an entry to `MOVEMENTS`
(equipment key, space requirement, pattern, scheme, and a `[low, high]`
baseline range) or to `FORMATS`, and the generator picks it up
automatically. If you add a new equipment key, also add its default in
`DEFAULT_EQUIPMENT` and a matching field in the Settings form
(`index.html` + `js/app.js`).
