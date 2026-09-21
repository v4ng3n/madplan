# Madplan

Familiens mobilvenlige madplan med opskrifter og en fælles indkøbsliste.

## Arkitektur

- Cloudflare Pages serverer hjemmesiden fra public/
- Cloudflare Pages Functions håndterer /api/checklist
- Cloudflare D1 gemmer afkrydsninger, så flere telefoner deler samme indkøbsliste
- public/data/madplan.json indeholder den aktuelle uge og er den fil, der opdateres ugentligt

## Cloudflare Pages

Opret et Pages-projekt fra GitHub-repositoriet v4ng3n/madplan.

Indstillinger:

- Production branch: main
- Framework preset: None
- Build command: tom
- Build output directory: public
- Root directory: /

## D1

1. Opret en D1-database, fx madplan-db.
2. Kør SQL'en i schema.sql på databasen.
3. I Pages-projektets bindings skal databasen bindes som DB.
4. Lav en ny deployment efter at bindingen er oprettet.

## Domæne

Tilføj madplan.v4ng3n.xyz som custom domain på Pages-projektet.

## Synkronisering

Indkøbslisten gemmes i D1. Når siden er åben, henter den ny status ca. hvert 2. sekund, så to telefoner kan se hinandens afkrydsninger næsten med det samme.

## Ugentlig madplan

Den automatiske ugeopdatering skal kun erstatte filen public/data/madplan.json.

En ny værdi i week giver automatisk en frisk afkrydsningsliste uden at slette historiske uger.
