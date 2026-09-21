# Madplan

Familiens mobilvenlige madplan med opskrifter og en fælles indkøbsliste.

## Arkitektur

Projektet kører som en Cloudflare Worker med statiske assets:

- `public/` indeholder hjemmesiden
- `src/worker.js` håndterer API-kald
- `wrangler.jsonc` er Cloudflare-konfigurationen
- Cloudflare D1 gemmer afkrydsninger, så flere telefoner deler samme indkøbsliste
- `public/data/madplan.json` indeholder den aktuelle uge og er den fil, der opdateres ugentligt

Kun requests til `/api/*` køres gennem Worker-koden først. Statiske filer serveres direkte fra Cloudflare Assets.

## Cloudflare build

Projektet er sat op til Git-baseret deployment.

Anbefalede indstillinger:

- Production branch: `main`
- Build command: `exit 0`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

Der er ikke noget separat "Build output directory"-felt i Workers-opsætningen. `wrangler.jsonc` angiver i stedet:

```json
"assets": {
  "directory": "./public",
  "binding": "ASSETS",
  "run_worker_first": ["/api/*"]
}
```

## D1

Databasen skal bindes som `DB`.

Når D1-databasen er oprettet, tilføjes dens `database_name` og `database_id` til `wrangler.jsonc`.

Kør derefter SQL'en i `schema.sql`.

## Synkronisering

Indkøbslisten gemmes i D1. Når siden er åben, henter den ny status ca. hvert 2. sekund, så to telefoner kan se hinandens afkrydsninger næsten med det samme.

## Ugentlig madplan

Den automatiske ugeopdatering skal kun erstatte:

`public/data/madplan.json`

En ny værdi i `week` giver automatisk en frisk afkrydsningsliste uden at slette historiske uger.
