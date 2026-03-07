# RecklessDrivin Angular site

This is the top-level Angular frontend for the project. It hosts:

- the WASM game shell
- the level editor
- resource and sprite editing tools

## Local development

```bash
npm ci
npm start
```

Open `http://localhost:4200/`.

If you want to mimic the GitHub Pages repo path locally, use:

```bash
npm run start:repo
```

Open `http://localhost:4200/RecklessDrivinPort/`.

## Build and test

```bash
npm test -- --watch=false
npm run build
```

## Notes

- The app now uses a **relative base href** so the same build works both locally and on GitHub Pages.
- If `reckless_drivin.js` has not been built yet, the game panel will fail to load while the editor still works.
- The full production-like local workflow is documented in `/dev-readme.md`.
- Data format notes live in `/documentation/level-editor-data-structures.md`.
