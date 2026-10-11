# Repository guide for agents

This repository is a course of interactive NLP lectures in **Ukrainian**. Each lecture is a single static HTML page opened directly in the browser, with no build step, published via GitHub Pages. You will mostly be asked to write a new lecture, extend an existing one, add glossary terms, or narrate sections. Follow this guide exactly: the lectures must look, behave and use terminology consistently.

Write all lecture content (page text, glossary entries, narration) in Ukrainian. This guide is in English, but the Ukrainian strings quoted in it are the literal text to use.

## Shared files

Shared look, behaviour and terminology live in separate files:

| File | Contents |
|---|---|
| `common.css` | palette (light and dark themes), typography, header, table of contents, cards, callouts, demo panels, formulas, code, quizzes |
| `common.js` | helpers (`$`, `$$`, `esc`, `fmt`, `store`, `cssVar`), table of contents, reading progress, lecture mode, theme toggle, keyboard, quizzes, Python highlighting, "Обговоріть розділ з ШІ" buttons |
| `glossary.js` | shared glossary: one definition per term for all lectures (see "Glossary") |
| `glossary.html` | page listing every term, with search and a lecture filter; built from `glossary.js` |
| `_template.html` | starter template with an example of every block |
| `index.html` | list of lectures with progress, plus keyword search over every lecture section and the glossary (see "Search") |
| `narration.js` | player for narrated sections (see "Narration") |

## Starting a new lecture

1. Copy `_template.html` to `NN-short-name.html` (e.g. `04-word2vec.html`).
2. Replace the `<title>`, the `.brand` text in the header and the eyebrow in the first section.
3. Add a lecture card to `index.html`.
4. Put page-specific styles in the page's `<style>` and demo logic in a `<script>` after `common.js`. Do not modify `common.*` for a single lecture. If a component is needed by two lectures, move it into `common.css`.
5. Mark up glossary terms and add the new terms this lecture introduces (see "Glossary").

## Page structure

```
header.topbar      ← identical in every lecture
div.wrap
  nav.toc          ← filled automatically from the sections' data-title
  main
    section.slide#s0   ← hero: eyebrow, h1, .lead, .agenda (outline)
    section.slide#s1…  ← sections
    section.slide#sN   ← "Підсумок і тест": .cards + .quiz + .kbd-hint
script[src=glossary.js]
script[src=common.js]
script             ← this lecture's demos
```

Every section has the form `<section class="slide" id="sN" data-title="Назва для змісту">`. In lecture mode (button or <kbd>L</kbd>) the font grows and each section fills the screen. <kbd>←</kbd> <kbd>→</kbd> move between sections, <kbd>T</kbd> toggles the theme.

### Section

1. `.eyebrow`: `Розділ N · <b>ключове слово</b>`. For bridges between lectures, e.g. `<b>місток з лекції 03</b>`.
2. `h2`: heading.
3. `p.lead`: the one idea the student should take away from the section.
4. Text, cards and callouts.
5. A demo, if the idea can be made hands-on.

## Components

| Block | Markup | When to use |
|---|---|---|
| Cards | `.cards > .card` (`.k` label, `h4`, `p`) | lists, summaries, "three approaches" |
| Comparison | `.vs > .card` + `.card.b` | "A vs B" (blue / orange border) |
| Two columns | `.two` | text next to a demo or code |
| Callout | `.callout` | definition, important clarification |
| Question | `.callout.q` with `.qm` | question to the audience |
| Warning | `.callout.warn` with `.qm` | pitfalls, common mistakes |
| Expandable | `details.more > summary + .body` | optional details |
| Term | `<span class="term" data-g="key">` | glossary term: tooltip with the definition and a link to the lecture |
| Note | `<span class="term" title="…">` | one-off clarification that is not and will not be in the glossary |
| Formula | `.formula`, `<var>`, `.frac`, `.sum`, `.c1/.c2/.c3` | formulas without LaTeX |
| Pipeline | `.pipe > .pstep` (`.l`, `.t`) + `.arrow`; `.emb` / `.hot` for emphasis | sequence of steps |
| Code | `pre.code[data-lang=python] > code.py` + `.codelabel` | code examples |
| Quiz | `.quiz[data-ans=N]` with `.q`, `.opts > button.opt`, `.ans` | check at the end of the lecture |
| Self-check | `details.check > summary + .quiz` | optional 1–2 questions at the end of a section; collapsed by default |

## Glossary

All lectures share one glossary in `glossary.js`. A term is defined once, and every lecture that mentions it links to the same definition. That way "логіт" in lecture 05 and in lecture 08 means the same thing, and the student can always get back to where the term was explained.

### Markup in a lecture

```html
<span class="term" data-g="logit">логітів</span>
```

- `data-g` is the term's key in `glossary.js`. The word inside can be in any grammatical form.
- `common.js` shows a tooltip on hover, focus (<kbd>Tab</kbd>) or tap: the name, English equivalent, definition, a "Докладніше в лекції NN" link and a link to `glossary.html`. If the reader is already in the section that explains the term, the "Докладніше" link is hidden.
- Mark up the **first occurrence** of a term in regular lecture text: paragraph, list, card, callout. Do not mark up headings, eyebrows, code, demos, quizzes or tables. Mark it up again only in a distant section where the term becomes central again.
- Terms from **earlier** lectures matter most: the student refreshes the definition immediately and sees where it was explained.
- An unknown key does not break the page: the term stays plain text and the console logs `glossary.js: немає терміна …`.
- `<span class="term" title="…">` without `data-g` is for one-off notes that do not belong in the glossary (e.g. "Robertson, Spärck Jones, 1970-90-ті").

### Extending the glossary

Before writing a lecture, read `glossary.js` (or `glossary.html`): the terms you need may already exist.

1. **The term exists**: mark it up with `data-g` and do not write a different definition in the lecture. If the definition is inaccurate or outdated, fix it in `glossary.js`; the change applies to every lecture at once. Check that it stays correct for earlier lectures.
2. **This lecture explains the term in more depth than the one `src` points to**: move `src` to the new section.
3. **A new term** that this lecture introduces and later lectures will need: add an entry to this lecture's block (`/* ---------- лекція NN: … ---------- */`, create it if needed):

```js
"logit":{term:"логіт",en:"logit",def:"Сирий ненормалізований скор моделі перед softmax…",src:"05-attention-transformers.html#s15",see:["softmax"]},
```

| Field | What to write |
|---|---|
| key | Latin, kebab-case (`kv-cache`, `byte-level`). **Never rename keys:** lectures and `glossary.html#key` link to them. |
| `term` | Ukrainian name in the nominative case, as used in the lectures; established English names stay as is (`softmax`, `BERT`) |
| `en` | English equivalent, full form of an abbreviation; optional |
| `def` | 1–2 sentences understandable without the lecture's context. `<var>`, `<sub>`, `<sup>`, `<code>` are allowed; no links and no "як ми бачили вище" |
| `src` | `file.html#sN`: the section that explains the term most thoroughly |
| `see` | keys of 1–3 related terms; optional |

Do not add: library and function names (`AutoModel`, `CountVectorizer`), terms that appear once and are explained in place, generic words like "модель" or "вектор".

After changes, check in `glossary.html` that the term is there and its `src` link leads to the right section.

## Interactive demos

Every key idea should have a demo where possible. Skeleton:

```html
<div class="demo">
  <div class="head"><h4>Назва</h4><span class="tag">interactive</span><span class="hint">Що робити і на що дивитися.</span></div>
  <div class="ctl"><label><span>Параметр = <span class="v" id="pV">1</span></span><input type="range" id="p" …></label></div>
  <!-- output: .out (monospace text), .result > .big (large number), .legendrow, SVG (.chart) or canvas -->
</div>
```

- Tag: `interactive` (user-controlled) or `animation` (plays by itself).
- Wrap each demo's logic in an IIFE `(function(){ … })();` under a `/* ===== N. name ===== */` comment.
- If a demo draws on canvas or SVG with colours from `cssVar("--blue")`, register the function: `redraws.push(draw)`. It will then redraw on theme change, lecture mode and window resize. Colours set via `var(--…)` in CSS or inline styles update on their own.
- Verify demos in both themes and on a narrow screen (≈390 px).
- No external libraries: the page must work offline (except fonts).

## Narration

A section can be narrated: the student presses "🔊 Послухати розділ", the lecturer's voice explains the material, and the page highlights the relevant blocks and drives the demos. The button tooltip explains that this is not plain text-to-speech but a lecturer walking through the section and showing how to use the demos. A subtitle bar appears at the bottom. The "Текст" button shows the full narration text with the current word highlighted; clicking a word seeks to it.

Audio is generated locally with StyleTTS2 (Ukrainian, free), not a paid service. Reference example of a finished section: `narration/05-attention-transformers/s4.txt`.

### Workflow

1. Write the text in `narration/<lecture>/<section>.txt` following the rules below.
2. Insert actions into the text (table below).
3. Check stress marks: `narrate.py <file> --check`. Fix errors (see "Stress and pronunciation").
4. Generate audio: `narrate.py <file>`.
5. Add `data-narr="audio/<lecture>/<section>"` to the section and include `<script src="narration.js"></script>` after `common.js`.
6. Have the user listen to the whole section on the page, together with highlighting and demos. You cannot judge the audio yourself; say so explicitly.

### Writing the text

Write what **a lecturer would say**, not a retelling of the page: why this idea matters, an analogy, "подивіться сюди", what is happening in the demo right now, a bridge to the next section.

- **Natural spoken Ukrainian.** The text is read aloud, so it must sound like a teacher talking, not a translation from English. Read every sentence as if aloud: if nobody would say it that way, rewrite it.
- **No calques or bureaucratese.** Some corrections from `s4`:

  | Bad | Good |
  |---|---|
  | кожен токен бачить кожного напряму | кожен токен напряму бачить усі інші |
  | рекурентність викинули повністю | від рекурентності відмовилися повністю |
  | слово себе рекламує | слово себе представляє |
  | словник, який пробачає | поблажливий словник |
  | увага розмазується | увага розпорошується |
  | модель ні на чому не фокусується | модель ні на чому не зосереджується |
  | за два розділи ми побачимо | коли ми дійдемо до формули, ви побачите |
  | давайте подивимось | подивімося |

- **Short sentences.** The model voices each sentence separately, and a long sentence sounds monotonous. Two ten-word sentences beat one of twenty-five.
- **Numbers and abbreviations as words:** "дві тисячі сімнадцятий", "корінь із де-ка".
- **English words only when unavoidable** (a paper title, a term the student will see in code). If a common Ukrainian word exists, use it: "відеокарта", not "GPU". Every remaining English word must be added to the lexicon (see below).
- **Address the student:** "бачите?", "зверніть увагу", "тепер ваша черга". End a section that has a demo by inviting the student to try it.

### Actions

An action fires when the voice reaches that point. Selectors are resolved inside the section.

| Action | Effect |
|---|---|
| `[[hl\|selector]]` | highlights the element and scrolls to it |
| `[[unhl]]` | removes the highlight |
| `[[set\|#id\|value\|ms]]` | smoothly moves a slider (the `input` receives an `input` event) |
| `[[click\|selector]]` | clicks a button (or an SVG element) |
| `[[check\|selector\|0 or 1]]` | unchecks or checks a checkbox (the `input` receives a `change` event) |
| `[[call\|hook\|args…\|ms]]` | calls `narrHooks.hook(…)` from the lecture's demo |
| `[[pause]]`, `[[pause\|0.6]]` | not an action but silence in the audio (default 0.4 s) |

**Actions must set state, not toggle it.** When the student seeks, the player instantly replays every action from the start up to that point. So a `click` on "Далі →" or on a checkbox goes wrong if the demo was no longer in its initial state. Click a specific step (`#encFlow .fb[data-s="3"]`, `#scSteps button[data-i="2"]`), tab or mode, and set checkboxes with `check`. If a button is only relative ("Крок →"), first press reset (`↺` or a mode switch) and then the required number of steps, so a replay gives the same result. The same applies to toggle buttons like "клацніть ще раз, щоб відпустити": those need a hook.

A hook is needed when the demo is not driven by sliders and buttons (e.g. a point must be dragged). Register it in the demo's IIFE: `(window.narrHooks=window.narrHooks||{}).lkQ=(x,y,ms)=>{…}`. The last argument is the animation duration; it is 0 during seeking.

The script inserts pauses between sentences and paragraphs itself. Use `[[pause]]` only for emphasis, 2–3 times per section: after a title, before the answer to a question ("Відповідь проста: [[pause|0.3]] …"). A `[[pause]]` mid-sentence splits it into two chunks that each sound like a separate sentence, so put it only after a colon or a dash.

### Stress and pronunciation

Stress is placed automatically by `ukrainian-word-stress`, taking grammar into account ("як сло**ва́** дізнаються" but "значення сло́**ва**"). It gets roughly one word in forty wrong, so check every new text:

```
.venv-styletts/Scripts/python tools/narrate.py narration/<lecture>/<section>.txt --check
```

The script prints the text as the model will read it, with a stress mark on every word. Review every word of two or more syllables. Stress on one-syllable words has no effect. Two stress marks in one word (`че́рзі́`) mean the stressifier is unsure; fix those words too.

To fix, put `+` after the stressed vowel: `напря+му`.

- If the word is **always** stressed this way (`напряму`, `навпіл`, `коли`, `черга`), add it to `narration/lexicon.txt`: `напряму = напря+му`. The lexicon is shared by all lectures.
- If the stress **depends on meaning** (`ва́ги`, plural of "вага", vs `ваги́`, genitive), put `+` directly in the narration text: `Праворуч — ва+ги.` The `+` is not shown in subtitles.

The model does not read Latin script at all: it skips it, and the script warns about it. Every English word in the narration must be in the lexicon with a Ukrainian pronunciation: `softmax = софтма+кс`, `Python = па+йтон`. Subtitles show the original spelling.

### Generation

Requires an NVIDIA GPU (8 GB is enough; a section takes about 20 s). Create the separate `.venv-styletts` environment once (it is in `.gitignore`); install commands are at the top of `tools/narrate.py`. A separate environment is needed because the StyleTTS2 packages pin old versions of `numpy` and `transformers`.

```
.venv-styletts/Scripts/python tools/narrate.py narration/<lecture>/<section>.txt [--force]
```

The script voices each sentence separately and joins them with pauses, so subtitles and actions match the audio exactly. It writes `audio/<lecture>/<section>.mp3`, `.cues.js` and `.align.json`. If only the actions changed, the audio is not regenerated. `--force` regenerates unconditionally.

Voice and parameters are the same for all lectures and are set in `tools/narrate.py`. Do not change them for a single section, or the lecturer's voice will "jump" between sections.

| Parameter | Value | Meaning |
|---|---|---|
| `VOICE` | `narration/voice.pt` | the "Кирило Татарченко" voice from the `patriotyk/styletts2-ukrainian` demo |
| `STYLE_MODEL` | `patriotyk/styletts2_ukrainian_multispeaker` | model |
| `SPEED` | `1.15` | tempo; `1.0` sounds as if every word is spoken separately |
| `GAP_SENT`, `GAP_LONG` | `0.4`, `0.25` | pause between sentences; up to 0.25 s longer after a long sentence |
| `GAP_PARA` | `0.9` | pause between paragraphs |
| `GAP_PAUSE` | `0.4` | duration of `[[pause]]` without an argument |

If the parameters are changed anyway, regenerate every narrated section with `--force`.

The old ElevenLabs path remains as `--engine eleven` (needs `ELEVEN_LABS_API_KEY` in `.env`). It is paid and gives no control over stress. Do not use it unless asked.

### What gets published

The site needs only `narration.js`, `audio/<lecture>/<section>.mp3` and `.cues.js`. Narration texts (`narration/`), the voice, the lexicon, the script (`tools/`) and `.align.json` files are excluded from GitHub Pages in `_config.yml` but stay in the repository.

## Colours

Use colours only through the variables; that is what makes the dark theme work automatically.

| Variable | Meaning |
|---|---|
| `--blue`, `--blue-soft` | primary accent: links, "variant A", query (Q) |
| `--orange`, `--orange-soft` | secondary accent: "variant B", warnings, key (K) |
| `--aqua` | positive, "correct", value (V) |
| `--violet` | questions, current-step highlight |
| `--rose`, `--olive` | extra series (e.g. attention heads) |
| `--ink`, `--ink-2`, `--muted` | text: primary, secondary, muted |
| `--bg`, `--surface`, `--surface-2`, `--line`, `--line-soft` | backgrounds and borders |
| `--hl`, `--hl-ink` | highlighter marker |

`--tfidf` and `--bm25` are legacy names for `--blue` and `--orange` left over from lecture 02. Do not use them in new code.

## Language and tone

- Lectures are in Ukrainian. Give the English term in parentheses on first use: "самоувага (self-attention)". Glossary terms already show the English equivalent in the tooltip, so add parentheses only when the English name itself matters to the text.
- Short paragraphs, one idea per paragraph. Write as "ми" and address the student as "ви".
- Cross-references to other lectures: "див. лекцію 03".
- The lecture ends with a "Підсумок і тест" section: 4–6 cards and 3–5 `.quiz` questions.
- After key sections you may add a `details.check` with 1–2 questions. They are optional: do not repeat questions from the final quiz and do not refer to them in the text as a required step.

## Progress and quizzes

`common.js` tracks progress by itself; nothing needs to be added to the lecture:

- A section is marked read (✓ in the table of contents) when its end comes into view. Above the table of contents the page shows "Прочитано N/M" and the minutes remaining. In lecture mode and on narrow screens the counter appears in the header.
- Section time is estimated at ≈130 words/min plus 1 min per demo. To set it manually, add `data-min="5"` to `section.slide`.
- If the student returns to a lecture, a prompt at the bottom offers to continue from the section where they stopped.
- Quiz answers are saved, and under the lecture's last question a score and a "Скинути відповіді" button appear.
- Everything is stored in `localStorage` under `prog:<file>` and `quiz:<file>`, so `index.html` shows progress on the cards. Quizzes are identified by their order on the page. If you insert a question into a lecture students are already taking, give the existing questions `data-id` with their previous index (zero-based) so saved answers do not shift.

## Search

`index.html` has a simple keyword search over all lectures. Nothing to maintain: on first focus it `fetch`es every lecture linked from an `a.lcard`, indexes each `section.slide[id]` (title, `h2`, `.lead`, subheadings, text; demos reduced to their `h4` and `.hint`, quizzes skipped) and searches `glossary.js` too. Matching is by word prefix with a crude Ukrainian ending cut, so "токенізатор" also finds "токенізатори". Results link to `file.html#sN`.

- A new lecture is searchable as soon as its card is in `index.html`.
- `fetch` does not work from `file://`: there the search covers only the glossary and says so. Test with `python -m http.server`.

## Discussing a section with AI

At the end of every section except `s0`, `common.js` adds a "💬 Обговорити розділ з ШІ" button. No API is used. The button copies a prompt ("будь моїм репетитором" + the section text) to the clipboard and opens a dialog with instructions and links to ChatGPT, Claude and Gemini. The student opens a chat in their own account and pastes the prompt.

- The prompt has two clearly separated parts: an `=== ІНСТРУКЦІЯ ===` block and the material inside `<lecture_section>` tags. The AI replies in the language of the student's latest message, not the lecture's, so the student can ask in any language.
- The text is taken straight from the page. Demos are replaced with a line `[Інтерактивне демо «назва»: підказка]`, quizzes, self-checks and eyebrows are skipped, and `.formula` formulas are flattened to a line: `(a)/(b)`, `x_i`, `Σ_{t ∈ q}`. So no extra markup is needed, but **a demo's hint (`.hint`) must make sense without the demo itself**.
- Claude fills in the prompt itself via `claude.ai/new?q=…`, and the dialog says so. ChatGPT also has `?q=`, but it works unreliably, and Gemini has no such parameter, so for both the prompt is pasted from the clipboard. If the URL is longer than `AI_URL_MAX` (16000 characters; Cyrillic takes ≈6 URL characters per letter), the chat opens without the prompt and it is pasted from the clipboard too. The `?q=` parameter is not officially documented: if a service stops supporting it, remove the `q` field from `AI_CHATS`.
- Chats are configured in `AI_CHATS` in `common.js`: `url` is the new-chat page, `q` is the URL prefix for the prompt if the service supports it.
- To remove the button from a section, add `data-ask="off"` to `section.slide`. The buttons are hidden in lecture mode and when printing.
