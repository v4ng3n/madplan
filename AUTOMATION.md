# Drift og automatisering

## Aviser

`update-flyers.yml` undersøger de officielle detailhandelssider fire gange i døgnet. Butikkernes sider angiver den officielle udgave. Udgiverens API leverer gyldighed, sidetal og originale signerede billeder via egen godkendt API-adgang. Hver side downloades og afkodes før manifestet publiceres. En manglende side, for lille opløsning eller udløbet udgave stopper hele opdateringen og giver en fejlet GitHub Actions-kørsel. Den tidligere komplette udgave bevares.

Der kan bruges en egen `TJEK_API_KEY` i GitHub Secrets. Uden en sådan læses konfigurationen fra butikkernes offentlige webklienter. Dette giver teknisk adgang, men dokumenterer ikke rettigheder til tredjepartsbrug. En forespørgsel om gratis adgang og skriftlig tilladelse er sendt til services@tjek.com den 13. oktober 2026. Der er endnu ikke modtaget godkendelse. Der gemmes ingen API-nøgler i projektet. Ingen billedsignaturer opfindes, ingen indlejringsbeskyttelse fjernes, og ingen tredjeparts produktudsnit bruges. Appen viser billeder via en afgrænset Cloudflare-proxy, der kun kan hente sider registreret i det verificerede manifest. Originale udgaver bevares i `public/data/flyer-editions/`, så links fra en allerede publiceret madplan stadig peger på den rigtige avis. Udløb vises tydeligt.

Teknisk adgang til offentlige billeder dokumenterer ikke i sig selv en licens til genpublicering. Tjeks vilkår afsnit 8.3 og 8.4 kræver skriftlig godkendelse og relevante samtykker til tredjepartsvisning og systematisk genbrug. Kilde: https://tjek.com/terms . Dette er en konkret forudsætning for drift, ikke en tilladelse som kan udledes af teknisk tilgængelighed. Dette projekt omgår ingen adgangskontrol.

## Madplan uden betalt OpenAI API

Den eksisterende ChatGPT-opgave **Ugens madplan** bruges til opskrifter og planlægning. Der bruges ingen OpenAI API-nøgle. GitHub Actions laver validering og publicering; workflowet foretager ingen AI-kald.

ChatGPT-opgaven skal først læse `.automation/preferences.json`, `public/data/flyers.json` og denne vejledning fra main. Dagsønsker er krav. Det er nødvendigt at kontrollere billederne visuelt ved valg af tilbud. Nettos sideliste indeholder ikke strukturerede produktdata i denne integration; tilbud derfra kan derfor ikke automatisk godkendes endnu. Billederne er stadig komplette.

Et forslag skrives til `.automation/proposed-plan.json`. Workflowet `publish-madplan.yml` henter aktuelle ønsker direkte fra D1, validerer tilbuddenes produkt-ID, variant, pris, pakkemængde, gyldighed og avisside og publicerer først derefter `public/data/madplan.json`. En fejlet validering efterlader den eksisterende madplan.

Butiksspecifikke indkøbsvarer har et `offer`-objekt med `catalogId`, `productId`, `heading`, `variant`, `price`, `quantity`, `validFrom`, `validTo`, `page`. Felterne sammenlignes med udgiverens produktdata i `flyers.json`. `purchaseAt` angiver, hvornår tilbuddene skal kunne bruges. `amount` beskriver indkøbsmængden, mens `offer.quantity` beskriver én tilbudspakke. Andre varer placeres i `Valgfri butik` uden tilbudsmetadata. Indkøbsmængder skal også afstemmes mod alle opskrifter; strukturel validering beviser ikke denne semantiske afstemning.

En ChatGPT-opgave er en ekstern afhængighed. GitHub kan ikke selv starte ChatGPT-abonnementet eller garantere, at opgaven altid gennemfører. Kontoforbindelse, tjenestefejl eller modelkontrol kan stoppe en kørsel. Der er derfor ingen skjult API-baseret reservegenerator. Påstå aldrig, at en madplan er publiceret, før workflow og den deployede side er kontrolleret.

## Kontrol

- `python scripts/validate_madplan.py`
- `python -m unittest discover -s tests -p 'test_*.py'`
- `node --test tests/flyers.test.mjs`
- `node --check public/app.js`

Cloudflare-projektet er en Worker med statiske assets og D1, ikke et Pages-projekt. Produktionsadressen er `https://madplan.v4ng3n.workers.dev`. Det brugerdefinerede domæne skal desuden testes særskilt. Build-succes alene dokumenterer ikke en fungerende avisproxy eller D1.
