# Event site

One-page event site. Plain HTML, CSS and vanilla JS, no build step. All content lives in `data/event.json`.

## Run locally
The page loads its content with `fetch`, so serve the folder instead of opening the file:

```
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy
GitHub Pages: Settings, then Pages, then "Deploy from a branch" with `main` and `/ (root)`.
