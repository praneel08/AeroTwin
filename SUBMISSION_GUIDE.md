# SIH 2026 Submission Guide

Checklist before sharing this repository link, following the standard
[NSUT-SIH-DEMO](https://github.com/NSUT-SIH-26/NSUT-SIH-DEMO) template.

## Required repository content

- [x] Actual source code is present (`src/`, `demo/`).
- [x] `README.md` explains the project clearly.
- [x] PS ID and PS title are included (SIH 26249, Ministry of Defence).
- [x] Problem statement and proposed solution are explained.
- [x] Key features are listed.
- [x] Technology stack is listed.
- [x] Setup and run instructions work (`python -m src.pipeline --serve`).
- [x] Team members and roles are mentioned (see the Team table in section 1 of the README).
- [x] Important screenshots are added to `assets/screenshots/`.
- [x] Final PPT/presentation is linked from `submission/PRESENTATION.md`.
- [x] Demo video link is added to `submission/DEMO.md`.
- [ ] Repository is accessible to reviewers.

## Recommended structure

```text
AeroTwin/
├── README.md
├── SUBMISSION_GUIDE.md
├── requirements.txt
├── submission/
│   ├── PRESENTATION.md
│   └── DEMO.md
├── src/                 # ml/, anomaly/, nlp/, fleet/, pipeline, paths
├── demo/                # backend/ (FastAPI) and frontend/ (React + Three.js)
├── docs/
│   ├── architecture.md
│   ├── literature_survey.md
│   └── problem_statement.txt
├── assets/
│   └── screenshots/
├── data/                # downloaded datasets (git-ignored)
├── models/              # trained weights (git-ignored)
└── reports/             # result files and benchmark.md
```

## Presentation

The deck is hosted on Google Drive and linked from `submission/PRESENTATION.md`: https://drive.google.com/file/d/1FaXCgO1cnWS0HmVXmlaM3yUKPJN67sAh/view?usp=drive_link. Check the sharing setting is "Anyone with the link" so reviewers are not asked to request access.

## Demo video

Recorded and linked in `submission/DEMO.md`: https://youtu.be/ehU8d_xvV-Y. Check that it plays in a logged-out browser without requesting permission.

## Screenshots

Put the most useful screens in `assets/screenshots/`. Regenerate them any time with the app running: `python -m demo.screenshots` (needs `playwright install chromium`). See that folder's `README.md` for what each one shows.

## Do not upload

- Passwords, API keys, access tokens
- `.env` files containing secrets
- Private credentials or other confidential information
- Downloaded datasets and trained weights (they are git-ignored and re-created by the pipeline)

## Before submission

Open the repository in a private/incognito browser window (or while logged out) and verify a reviewer can access the code, presentation, screenshots and demo video link. Then follow the README setup on a clean clone to confirm it runs.
