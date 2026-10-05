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
- [ ] Team members and roles are mentioned (see section 11 of the README).
- [x] Important screenshots are added to `assets/screenshots/`.
- [ ] Final PPT/presentation is placed in `submission/` (or an external link is added to `submission/PRESENTATION.md`).
- [ ] Demo video link is added to `submission/DEMO.md` (optional).
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

Upload the final PPT/PPTX to `submission/` when the file size is suitable for GitHub, using a clear filename such as `AeroTwin_SIH2026_Presentation.pptx`. If it is too large, use Google Drive/OneDrive and put the shareable viewer link in `submission/PRESENTATION.md`.

## Demo video

Optional. If recorded (see `submission/DEMO.md` for the suggested script), add its YouTube/Google Drive link there and make sure it is accessible without requesting permission.

## Screenshots

Put the most useful screens in `assets/screenshots/`. Regenerate them any time with the app running: `python -m demo.screenshots` (needs `playwright install chromium`). See that folder's `README.md` for what each one shows.

## Do not upload

- Passwords, API keys, access tokens
- `.env` files containing secrets
- Private credentials or other confidential information
- Downloaded datasets and trained weights (they are git-ignored and re-created by the pipeline)

## Before submission

Open the repository in a private/incognito browser window (or while logged out) and verify a reviewer can access the code, presentation, screenshots and demo video link. Then follow the README setup on a clean clone to confirm it runs.
