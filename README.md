# BSc AI Practice

Free, unofficial practice quizzes for **BSc Artificial Intelligence students at Vrije Universiteit Amsterdam**, academic year 2026–2027.

**Period 1 courses**

| Course | Questions | Notes |
| --- | --- | --- |
| Introduction to AI | 97 over 12 lectures | Every lecture except the Introduction and Discrete Mathematics. Hints on every question. |
| Introduction to Psychology & its Methods | 650 over 13 topics | 50 per topic, many with a graph or table to read. |

## Features

- Instant feedback with an explanation for every answer
- Progress per lecture/topic, "retry my mistakes" mode, shuffle, keyboard shortcuts (A–E, H, ← →)
- Personal dashboard: nickname, daily goal, day streak, activity chart and 17 achievements
- "What to study next" suggestions based on your weak spots, open mistakes and upcoming exams
- Light and dark mode, works on phones
- Private by design: progress is stored only in your browser (localStorage). Export/import moves it to another device.

## Run it locally

It is a plain static site with no build step:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Adding a course next period

1. Add a data file in `data/` (see `ai-data.js` or `psych-data.js` for the format).
2. Register it in `buildCourses()` in `assets/core.js`.
3. Copy `intro-ai.html` to a new page and set `data-course` on `<body>`.
4. After changing any JS/CSS, bump the `?v=` number on the script and style links in all pages so browsers fetch the new files.

## Disclaimer

Made by students for students. Not affiliated with or endorsed by Vrije Universiteit Amsterdam. Questions are based on the 2026–2027 course material and may contain mistakes: please [open an issue](https://github.com/youngpietro/bsc-ai-practice/issues/new) if you spot one.

Live site: https://youngpietro.github.io/bsc-ai-practice/
