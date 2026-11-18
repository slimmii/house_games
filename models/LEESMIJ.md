# Huis Oude Terelststraat 15 — Blender

Open `Huis_Oude_Terelststraat_15.blend` in Blender (gemaakt met 5.2.1 LTS). Het bestand opent op scene 45, het overzicht van de zij- en achtertuin. Scenes 46 en 47 tonen de zijtuin en achtertuin. Scene 42 toont de achtergevel met terras en buitentrap. Scene 43 toont de trapaansluiting, scene 44 de zwarte deur naar de wasruimte en scene 41 de voorgevel. Scene 37 toont de antracietkleurige buitenzijde van de voordeur; scene 36 de witte binnenzijde. De herwerkte trap staat in scene 38 (eerste overloop), scene 39 (bovenste aansluiting) en scene 40 (opengewerkt overzicht). De lichtkoepel boven de traphal staat in scene 32. Het bovenaanzicht van slaapkamer 1 volgens je schets staat in scene 31. Slaapkamer 2 staat in scenes 24–27. De kleinste slaapkamer zonder speelgoed staat in scenes 21–23. De badkamer staat in scene 17; gebruik Rendered voor echte spiegelreflecties. Scene 08 toont de living en werkplekken.

Kies bovenaan in Blender een scene:

- **01 | HOUSE - exterior**: het volledige huis met daken en buitengevels.
- **02 | FIRST FLOOR - furnished cutaway**: leefruimte, Camber-kasten, zitbank, eettafel, twee zetels, keuken en veranda.
- **03 | EXPLODED FLOORS**: de drie bouwlagen boven elkaar, opengewerkt.
- **04 | LIVING - Camber perspective**: zicht op ooghoogte naar de kastenwand.

- **05 | KITCHEN - shaped table and bench**: zicht op de afgeronde keukentafel, speciale hoekbank en ramen.
- **06 | KITCHEN - cabinets and appliances**: zicht op het L-aanrecht, bovenkasten, oven onder de kookplaat, spoelbak en geïntegreerde koelkast.

- **07 | LIVING + VERANDA - open room**: de open verbinding, witte opbergkast en het lage speeltafeltje.

De PNG-bestanden tonen de verschillende overzichts- en detailscenes. In de Outliner staan aparte collecties per verdieping en voor muren, meubels, kasten, trappen en daken. Onderdelen zijn afzonderlijk bewerkbaar. De opengewerkte scenes delen de oorspronkelijke objecten: wijzigingen worden automatisch overgenomen. Alle materialen zijn procedureel; externe texturen zijn niet nodig. Eenheden zijn meters.

## Basis en aannames

Het model combineert de plannen van 2021, het archiefplan en de Camber-tekeningen van 2 mei 2025. Het toont de geplande verbouwing. Op de tweede verdieping staat een **berging, geen wc**. De Camber-wand staat rechts op het grondplan, met de tv aan de straatzijde en de zitbank/hoge kasten richting veranda; de aansluiting met de verandawand is gesloten met een passtuk.

Dit is een bewerkbaar conceptmodel. De indeling van de tweede verdieping is gereconstrueerd uit het archief. Meubelmaten, sommige hoogtes, aansluitingen en trapdetails zijn aangenomen of vereenvoudigd. De tafel (260 × 100 cm) en zetels (260 × 100 en 230 × 100 cm) zijn schattingen op basis van de foto's. Zie `MODEL_NOTES.txt` of de Blender-tekst `START HERE - model assumptions` voor de technische aannames.

`build_house.py`, `veranda_furniture.py`, `living_office.py`, `stair_door.py`, `sofa_measured.py`, `stair_full_height.py`, `upper_floor_corrected.py` en `plan_geometry.json` zijn de reproduceerbare bronbestanden. Opnieuw genereren kan met:

```sh
blender -b --factory-startup --python build_house.py
```

Dit overschrijft het gegenereerde Blender-bestand en de renders in dezelfde map. Bewaar handmatige bewerkingen daarom onder een andere bestandsnaam.

## Keukencorrectie

De keuken is bijgewerkt volgens de twee aangeleverde perspectieven: lichte steen, witte kasten met smalle grepen, bovenkasten, geïntegreerde koelkast, oven onder de kookplaat, een organisch afgeronde tafel op één poot en een doorlopende gevormde hoekbank. Het smalle raam tussen keuken en veranda heeft een borstwering van 93 cm en een opening van 123 cm hoog volgens de doorsnede. De maatvoering van het keukenmeubilair is geschat; de referentiebeelden bevatten geen meubelmaten.

De keukenvloer loopt door in hetzelfde lichte houtmateriaal als de living.

## Open living en veranda

Volgens de aangeleverde foto vormen living en veranda één ruimte. De interne beglazing en raamprofielen zijn verwijderd; de balk en zijwanden blijven aanwezig. De witte open opbergkast met vier metalen bakken met ronde trekgaten en het lage witte speeltafeltje zijn toegevoegd, zonder losse spullen. De kast en het tafeltje volgen de nadien aangeleverde maatschets. Het raam tussen keuken en veranda blijft behouden. De goedgekeurde keuken is ongewijzigd.

## Bevestigde balk- en muurmaten

De balk tussen living en veranda is 44 cm hoog en 41,5 cm diep. De aansluitende dwarse muur en zijpenanten zijn 44 cm diep. De voorkant is op dezelfde lijn behouden; de extra diepte ligt aan de verandazijde. Met behoud van de plafondhoogte uit het model (266 cm) ligt de onderkant van de balk op 222 cm boven de vloer.

## Maten uit de meubelschets

Kast: 76 cm breed, 39 cm diep, 181 cm hoog. Het brede bovenvak is binnenin 68,5 cm breed; daaronder zijn zes vakken van 33 × 33 cm. In de onderste vier vakken staan metalen bakken met echte ronde trekgaten. Alleen de gatdiameter (36 mm) is geschat. Tafel: 118 × 57 × 51 cm, met een voorrand van 21 cm hoog. Deze maten vervangen de eerdere schattingen.

De kast staat in de inham onder de balk en niet tegen de zijmuur. Haar zijde aan de living ligt gelijk met de rand van de inham die het verst van het tuinraam ligt. De rechterzijde van het tafeltje ligt in het grondplan in dezelfde lijn als de linkerzijde van de kast.

## Living en werkplekken — fotocorrectie

De zetels staan in een L tegenover de Camber-tv, met de lange zijde naar het scherm gericht. Aan de linker straatzijde staan twee gespiegelde witte IKEA MICKE-hoekwerkplekken (artikel 502.507.13, 100 × 100 × 142 cm), met een open printerrek ertussen. De wand heeft de warme baksteenkleur en donkere voegen uit de referentiefoto. Zetelposities en printerrek zijn op basis van de foto geschat.

Scene **08 | LIVING + OFFICE - photo layout** en `living_office.png` tonen deze correcties. `living_office.py` maakt deel uit van de reproduceerbare bronbestanden. `Huis_before_living_office.blend` bewaart het model van vóór deze wijziging.

## Bakstenen trapwand en deur

De baksteen loopt door over de gebogen trapwand, de wand rond de deur, de bovendorpel en de zichtbare kopse kant. De vlakke crèmekleurige deur heeft een bijpassende rechte omlijsting, drie scharnieren links, nikkelkleurige deurkrukken en ronde sleutelrozetten. De opening volgt het plan; hoogte en beslagmaten zijn op de foto geschat. Scene **09 | STAIR - brick return and cream door** en `stair_brick_door.png` tonen het detail. `Huis_before_stair_door.blend` is de vorige versie.

## Opgegeven zetelmaten

De L-zetel meet volgens de gecorrigeerde gebruikersmaten **265 cm richting tv × 235 cm richting veranda**, met één gedeeld hoekdeel. Tot het voorvlak van het lage Camber-tv-meubel is **83 cm** vrije ruimte, tot de binnenzijde van het raamkader **64 cm**. Deze waarden vervangen 250 × 227 cm, 79 cm tot het tv-meubel en de eerder geschatte raamafstand. De zitdiepte (100 cm), zithoogte (45 cm) en totale hoogte (98 cm) blijven fotoschattingen. Scenes **10** en **55** tonen de maatvoering in bovenaanzicht.

## Traphal volledig in baksteen

De baksteentextuur loopt nu van het gelijkvloers tot bovenaan de traphal (0,00–8,11 m), inclusief de gebogen wanden, overloopwanden, muurstroken tussen de verdiepingen en de verticale randen van de trapgaten. Scene **11 | STAIR HALL - full height brick** en `stair_full_height.png` tonen de volledige hoogte. De vorige versie staat in `Huis_before_full_stair_brick.blend`.

## Controle bovenverdieping en PDF

De bovenverdieping bleef aanwezig. De eerdere reconstructie had echter een te rechte trapwand en plaatste de bergingdeur verkeerd in de wand boven de trap. Volgens het archiefplan is de traphal nu afgerond en zit de bergingdeur in de zijwand aan de overloop. De badkamerdeur is toegevoegd. Scene **12 | UPPER FLOOR - corrected complete layout** toont de volledige bovenverdieping met drie slaapkamers, badkamer en berging. Scene 11 is alleen een opengewerkt detail, niet de volledige verdieping.

De PDF-planbundel (bladen 01 en 02) en het A2-overzicht zijn aangepast met dezelfde wandgeometrie als Blender, via `upper_floor_geometry.json` en `../pdf/update_upper_plans.py`. De oude archiefmaten blijven indicatief; dit is geen nieuwe maatopname. De vorige Blender-versie is `Huis_before_upper_floor_review.blend`.

## Afwerking bovenverdieping

Het witte pleisterwerk op de dwarse wanden stopt bij de muur met de badkamerdeur. De bergingwanden (ook de deurwand) en de volledige kromme traphal blijven in baksteen. Dit vervangt de eerdere algemene baksteenafwerking voor deze bovenwanden. `upper_wall_finishes.py` verwerkt deze correctie na de bovenverdiepingsgeometrie.

De wand aan de overloop met de twee slaapkamerdeuren, inclusief de bovendorpels, is eveneens wit bepleisterd.

Keukencorrectie: onderkasten lopen door tot de achterbank met een korte kastdeur vanaf zithoogte en een dicht wit blok eronder. Bank verlengd tot muurrand; organisch tafelblad verlengd tot circa dezelfde lijn. Scene 05 toont de aangepaste keuken.

Keuken verfijnd naar aangeleverde plannen/foto: asymmetrisch tafelblad getraceerd, gebogen bank met schuin uiteinde, convectorroosters en ingewerkte onderkastgrepen. Keukenwerkbladen en tafel gebruiken dezelfde procedurele ivoorkleurige terrazzo met zwarte, bruine en okerkleurige hoekige korrels. Schaal afgeleid van de planbreedte 248 cm; geen nieuwe opmeting. Script: kitchen_reference_detail.py.

Zitbank onderaan volledig dicht met witte basis. De zichtbare zitrand steekt circa 7 cm uit ten opzichte van de basis (geschat naar voorbeeld); convectorventilatie blijft in het lage front.

Gang gelijkvloers: witte kastenwand met acht gevlochten manden, houten blad, bakstenen nis, ingepakt schilderijtje uit gebruikersfoto en drie warme messinglampjes. Donkere gemarmerde vierkante tegels (40 cm geschat) uitsluitend in de gang. Scene 13 toont de gang; maten zijn uit foto’s afgeleid. Herbouw: ground_hall_photo.py.

Wasruimte gelijkvloers naar gebruikersfoto’s: witte inbouwkasten, verhoogde wasmachine en droogkast op ladeblokken, L-vormig grijs blad met RVS-spoelbak, compacte diepvries, rood expansievat, zwarte plafondlamp en lichte houtlookvloer. Vloer en bladen vrij van rommel. Kastmaten zijn foto-inschattingen binnen bestaande ruimte; scenes 14 en 15. Herbouw: laundry_photo.py.

Twee witte vlakke deuren toegevoegd in bestaande doorgangen naar wasplaats en slaapkamer vanaf de gang op het gelijkvloers. Witte omlijstingen en zilverkleurige klinken; scene 16. Deuropeningen volgens bestaande geometrie, deurhoogte geschat.

## Badkamer — vijf referentiefoto’s

De badkamer is volledig uitgewerkt met een hol bad, douchekraan en handdouche, aluminium/glazen badscherm, geplooid douchegordijn, dubbele ovale wastafels in een zwart blad, drie onderkastdeuren met zwarte U-grepen, spiegelkast met spots en een hoge witte kast. Aan het voeteneinde staan de betegelde nis met glasplanken en verlichting en het hangtoilet met ingebouwde spoelbak. Wanden en badombouw hebben crème marmertegels met zwarte ruitmotieven; de vloer heeft lichte vierkante tegels met donkere voegen. Ook de lege witte buisradiator is gemodelleerd. Kranen, handgrepen en accessoires zijn afzonderlijk bewerkbaar.

**Het vroegere raam achter het wastafelmeubel is dichtgemaakt**, bevestigd door de gebruiker. Het raam is verwijderd en de opening is gevuld. Het toilet in de badkamer vervangt de eerdere algemene notitie dat boven geen toilet staat; de aparte berging blijft berging.

Scenes **17 | BATHROOM - bath and double vanity**, **18 | BATHROOM - niche and toilet** en **19 | BATHROOM - complete overhead** tonen de badkamer. Renders: `bathroom_vanity.png`, `bathroom_niche_wc.png`, `bathroom_overhead.png`. De hoofdversie opent op scene 17.

De bestaande binnenmaat van circa 250 × 218 cm en hoogte van 280 cm zijn behouden uit het model. Bad circa 74 × 170 cm; wastafelmeubel circa 132 × 58 cm; hoge kast circa 36 cm breed. Dit zijn schattingen binnen de bestaande ruimte, geen opgemeten maten. De foto's bepalen vorm, afwerking en onderlinge plaatsing. Los speelgoed en vloerrommel zijn weggelaten.

Herbouwscript: `bathroom_photo.py`, geïntegreerd in `build_house.py`. Reservekopie van de vorige versie: `Huis_before_bathroom_photo.blend`. Zie ook `BATHROOM_NOTES.txt`.

### Correctie decoratieve tegels en handdoekradiator

De zwarte ruitmotieven zijn vlakke decoraties, exact gecentreerd op hun eigen tegel. De radiator is vervangen door het witte model met ronde buizen uit de bijkomende referentiefoto: vijf groepen met 4, 5, 6, 7 en 9 buizen van boven naar beneden. Hij is leeg, zonder handdoeken of extra haken. De maat van circa 60 × 170 cm is geschat. Scene **20 | BATHROOM - empty towel radiator** en `bathroom_radiator.png` tonen dit detail. Vorige versie: `Huis_before_bathroom_tile_radiator_fix.blend`.

## Kleinste slaapkamer — zes referentiefoto’s

De kleinste slaapkamer is uitgewerkt binnen de bestaande kamer van circa **250 × 296 cm**. De roze accentwand, het witte bed dwars voor het raam, de crèmekleurige boogtent met botanische print, de vakkenkast met witte en roze bakken, het bruine tweezitszeteltje, de witte schommelstoel en de modulaire kast met bosmotieven volgen de foto's. Ook de radiator, het rolgordijn, de lichte houtlookvloer, berensticker zijn toegevoegd.

Scenes **21 | SMALL BEDROOM - photo reconstruction**, **22 | SMALL BEDROOM - sofa and rocking chair** en **23 | SMALL BEDROOM - complete overhead** tonen de kamer. Renders: `small_bedroom_view.png`, `small_bedroom_seating.png`, `small_bedroom_overhead.png`. De kleinste slaapkamer blijft beschikbaar via scenes 21–23.

De gebruiker heeft bevestigd dat de vakkenkast **vijf vakken hoog** is. De vier kolommen zijn behouden; de geschatte buitenmaat is nu **147 cm breed × 182 cm hoog × 39 cm diep**. De extra bovenste rij heeft witte bakken. De kast heeft KALLAX-achtige vakverhoudingen, zonder definitieve productidentificatie. De andere meubels zijn op de foto's geschat: bed circa 180 × 78 cm, zeteltje 130 × 75 cm, modulaire kast 71 × 37 × 107 cm. De bestaande deur en raamopening zijn behouden. Speelgoed, knuffels, de stylingpop, het poppenbedje en bijbehorende speelaccessoires zijn op verzoek verwijderd. De zetel is leeg.

Herbouw: `small_bedroom_photo.py`, geïntegreerd in `build_house.py`. Vorige versie: `Huis_before_small_bedroom_photo.blend`. Zie `SMALL_BEDROOM_NOTES.txt` voor aannames. Alle nieuwe onderdelen zijn afzonderlijk bewerkbaar en verschijnen ook in het volledige huis en de verdiepingsoverzichten.

### Badkamerspiegel — weergavecorrectie

De 3D-vensters zijn ingesteld voor **Rendered** met de echte scèneverlichting en scèneomgeving. Blender kan bij het heropenen terugvallen op Solid; kies dan de uiterst rechtse bol voor Rendered. Material Preview blijft een materiaalcontrole en geeft geen betrouwbare kamerreflectie. De eerdere **Material Preview** gebruikte een buitenomgeving als reflectiebron. De bestaande spiegelshader is al ondoorzichtig en spiegelend; in Rendered weerspiegelt hij de badkamergeometrie. Scene 17 toont de badkamer. Herbouwcorrectie: `bathroom_mirror_view.py`; vorige versie: `Huis_before_mirror_view_fix.blend`.

### Speelgoed verwijderd

Alle losse knuffels en speelgoedonderdelen zijn verwijderd, inclusief de stylingpop op de kast en het poppenbedje met speelaccessoires. De meubels, mand, ingelijste tekening en muurdecoratie blijven behouden. De vakkenkast blijft vijf vakken hoog. Correctiescript: `small_bedroom_remove_toys.py`; eerdere versie: `Huis_before_bedroom_toy_removal.blend`.


## Slaapkamer 2 — foto’s

Scenes **24–26** tonen slaapkamer 2 met het eiken tweepersoonsbed, de brede kopwand, zwevende nachtkastjes, gesloten witte schuifkast, lege boekenkast, gesloten witte kast met gekroonde bovenzijde, witte opbergkast en het raam met radiator. Beide kleuren uit de foto’s zijn behouden: donkerblauw achter het bed en licht blauwgrijs op de andere muren. Het bed is opgemaakt; kasten, vloeren en oppervlakken zijn vrij van losse spullen. Open vakken en verborgen kastinterieurs zijn leeg.

`bedroom2_view.png`, `bedroom2_storage.png` en `bedroom2_overhead.png` tonen beide richtingen en het bovenaanzicht. De schuifdeuren staan dicht; via de eigenschap **Slide distance** op hun CONTROL-objecten kun je ze verschuiven. Alle interieuronderdelen zijn leeg. Meubelmaten zijn geschat binnen de bestaande archiefkamer; zie `BEDROOM2_NOTES.txt`. De wandprent is via UV-coördinaten uit de meegeleverde foto overgenomen; de bron is in het bestand verpakt.

`bedroom2_photo.py` maakt deel uit van de herbouwbron. Vorige versie: `Huis_before_bedroom2_photo.blend`.


### Gelijke nachtkastjes en krappe deurzwaai in slaapkamer 2

Beide nachtkastjes zijn nu even groot: de rompen zijn **49 cm breed**; de bladen circa **51,4 × 48,5 cm**. De kopwand is aan de kastzijde verbreed.

Het kastenblok is **32,5 cm richting deur** geschoven. De grote schuifkast is aan de bed-/schilderijwandzijde ingekort tot circa **205 cm breed**, met een rompdiepte van **60 cm**. Daardoor blijft circa **3,1 cm** tussen de kast en het bredere nachtkastblad. Het witte meubel blijft circa **75 × 45 × 104 cm**. Dit zijn aangepaste schattingen binnen het bestaande model.

De volledige deurzwaai van 0–90° is inclusief de krukken tegen het slaapkamermeubilair gecontroleerd. De deur kan op verzoek net openen: in het model blijft ongeveer **2 cm speling** tot het witte meubel. Scene **27 | SLAAPKAMER 2 - door clearance** en `bedroom2_door_clearance.png` tonen de deur op 90° met een boog op de vloer. De inspectiekopie staat alleen in deze controlescene; de gewone scenes houden de bestaande gesloten kamerdeur. Vorige versie: `Huis_before_bedroom2_equal_bedsides.blend`.


## Slaapkamer 1 — gecorrigeerd volgens de schets

De schets van **24 september om 21:17** bepaalt de indeling. Het gewone tentbed ligt langs de groene wand; de SMÅSTAD staat er dwars op en steekt vanaf diezelfde wand de kamer in. De hoge vakkenwand met aangebouwde panelen volgt de hoogslaper. De kast en het lege poppenhuis staan aan de tegenoverliggende wand. Rond het vrije uiteinde van de afscheiding blijft in het model circa **80 cm** ruimte tot het poppenhuis. De eerdere parallelle plaatsing is vervallen.

Scene **31** toont het bovenaanzicht in dezelfde richting als de schets, met labels: bed linksboven, hoogslaper bovenaan, kast en poppenhuis onderaan, deur linksonder en raam rechts. Scenes **28–30** tonen het tentbed, de afscheiding en de andere kant van de hoogslaper. De nieuwe meubels staan ook in het volledige huis en de verdiepingsoverzichten.

De [IKEA SMÅSTAD](https://www.ikea.com/be/nl/p/smastad-hoogslaper-wit-wit-met-bureau-met-2-planken-s89520158/) gebruikt de buitenmaat **207 × 104 × 182 cm**, met een matras van 90 × 200 cm en een bureau van 148 × 60 × 73 cm. De interne onderdelen zijn vereenvoudigd. De schets bepaalt de onderlinge plaatsing; overige meubelmaten en exacte afstanden zijn schattingen binnen de bestaande archiefkamer. De extra afscheiding staat in een aparte, bewerkbare collectie.

Groene en warm-ivoorkleurige wanden, lichte houtvloer, witte meubels en raamprofielen, gordijnen en een radiator. Bedden opgemaakt, kasten gesloten en alle open vakken leeg. Speelgoed, knuffels en losse spullen zijn weggelaten.

Renders: `bedroom1_tent.png`, `bedroom1_divider.png`, `bedroom1_smastad.png` en `bedroom1_overhead.png`. Bron: `bedroom1_split.py`, geïntegreerd in `build_house.py`. Zie `BEDROOM1_NOTES.txt` voor de aannames. Reservekopie vóór de schetscorrectie: `Huis_before_bedroom1_sketch.blend`.


## Lichtkoepel boven de traphal

De ronde lichtkoepel uit de foto is toegevoegd met een brede witte rand, een taps toelopende witte opstand en een transparante, licht gebogen kap. Rond de opening zit een taupekleurig plafondvlak. De bestaande bakstenen wanden blijven behouden. In het echte dakvlak zit een ronde opening; licht valt door de kap de traphal binnen.

Scene **32 | TRAPHAL - looking up at roof dome** toont het zicht van binnenuit, scene **33 | DAK - round stair dome** de aansluiting op het platte dak. Renders: `stair_roof_dome_inside.png` en `stair_roof_dome_outside.png`. De koepel staat ook in het volledige huis en de traphaldetailscene en hoort bij de verwijderbare dakcollectie.

De maten zijn geschat op basis van de bestaande gebogen trapomsluiting: vrije diameter circa 121 cm, witte onderrand circa 164 cm, top op +8,691 m. Bron: `stair_roof_dome.py`, geïntegreerd in de herbouw. Zie `STAIR_DOME_NOTES.txt`. Reservekopie: `Huis_before_stair_roof_dome.blend`.


## Keukenmuren — Brave Green

De keukenmuren hebben **WE M198 Brave Green** van [Colora / BOSS paints](https://colora.be/nl/kleuren/we-m198-brave-green). De officiële digitale kleurwaarde **#74846D** is als matte verf verwerkt. De verfvlakken volgen de bestaande muren en stoppen aan de keukengrens. Kasten, terrazzo, raamprofielen en aangrenzende ruimtes behouden hun materialen. Scenes **05–06** en de vernieuwde keukenrenders tonen het resultaat. Bron: `kitchen_brave_green.py`; reservekopie: `Huis_before_kitchen_brave_green.blend`.

## Baksteenverdeling op de ronde traphal

De uitgerekte stenen kwamen door een vlakke textuurprojectie, ook zichtbaar in renders. De gebogen traphal gebruikt nu een verdeling in meters langs de muuromtrek. De voegen blijven op vaste wereldhoogtes liggen. Vlakke aansluitingen gebruiken hun eigen horizontale richting. De bestaande modelmodule van **22,5 × 6,3 cm** is behouden; dit zijn modelwaarden, geen nieuwe opmeting. De schaal is gecontroleerd tegen de werkelijke boogsegmenten.

De correctie geldt ook voor de lagere gebogen traphalwanden en ronde trapgatranden. Scenes **11** en **32** zijn opnieuw gerenderd. Bron: `stair_brick_mapping.py`; reservekopie: `Huis_before_stair_brick_mapping.blend`. Zie `STAIR_BRICK_MAPPING_NOTES.txt`.

De achterwand onder de keukenbovenkasten blijft in de oorspronkelijke beige/witte kleur, achter zowel het kookgedeelte als de spoelbak. Brave Green is de kleur van de geschilderde keukenmuren.

## Living — Botanical Green achter de tv

De accentwand achter de tv heeft **WE M187 Botanical Green** van [Colora / BOSS paints](https://colora.be/nl/kleuren/we-m187-botanical-green). De officiële digitale kleurwaarde **#445940** is als matte verf verwerkt. De verf loopt over het tv-gedeelte van de wand, vanaf de straatzijde tot aan het begin van de hoge Camber-opbouw. De Camber-kast, het witte tv-meubel en de overige livingwanden behouden hun materialen.

Scene **53 | LIVING - Botanical Green TV wall** en `living_botanical_green.png` tonen het resultaat. Bron: `living_botanical_green.py`; reservekopie: `Huis_before_living_botanical_green.blend`.

## Living — salontafel volgens foto

De 17 aanvullende foto's vervangen de eerste interpretatie van het tafeltje: één doorlopend vlak eiklook blad, houten onderplaat, vier licht schuine taps toelopende poten, witte zijpanelen en een open vak naast een lade met horizontale houten greep. De **tafelhoogte is 33 cm vanaf de vloer**, bevestigd door de gebruiker. Breedte en diepte blijven geschat op **90 × 90 cm** (greep circa 2,6 cm extra). Het eerdere hefmechanisme en lagere zijplateau zijn vervallen.

De vrije ruimte tot beide zitkanten is ingesteld op **35 cm**; dit is een plaatsingskeuze, geen opmeting. De zetel volgt de gecorrigeerde gebruikersmaten **265 × 235 cm**, **83 cm** tot het tv-meubel en **64 cm** tot de binnenzijde van het raamkader. De geschatte zithoogte is gecorrigeerd van 58,5 naar 45 cm, de totale hoogte van 121,5 naar 98 cm. Brede armleuningen, verbonden zitvlakken, dubbele stiknaden en lage metalen voeten volgen de foto's. Tafelmaten en zetelhoogtes blijven schattingen.

Scene **54 | LIVING - photo coffee table** en `living_coffee_table.png` tonen de herwerking. Scene **55 | LIVING - sofa and table clearances** en `living_seating_plan.png` tonen een bovenaanzicht met maten. Bronnen: `living_coffee_table.py` en `sofa_measured.py`; reservekopie: `Huis_before_living_seating_refinement.blend`.

## Gedetailleerde beer in de kleine slaapkamer

De eenvoudige geometrische beer is vervangen door een transparante afbeelding op basis van de detailfoto van 26 september, met zes hartballonnen, dunne touwtjes en fijne contouren. De foto is vrijgemaakt en de lichtreflectie verwijderd met imagegen; kleine afwijkingen zijn mogelijk. De textuur is ingepakt in het Blender-bestand en staat ook in `textures/small_bedroom_bear_balloon.png`. Scenes 21–22 zijn opnieuw gerenderd. Scene 34 toont de complete beer met ballonnen van dichtbij. Bron: `small_bedroom_bear.py`, ook opgenomen in de herbouw van de kleine slaapkamer. Reservekopie: `Huis_before_detailed_bear.blend`.

## Gedetailleerd draakje in slaapkamer 1

De eenvoudige draak is vervangen door een transparante referentietextuur van de foto van 26 september. Bloemen, sterren, witte omlijning en gekrulde staart zijn behouden. Vrijgemaakt met imagegen; kleine verschillen zijn mogelijk. De afbeelding is ingepakt in het blend-bestand. Scene 35 toont het detail; scene 28 toont het tentbed met de draak op de groene wand. Bron: `bedroom1_dragon.py`; reservekopie: `Huis_before_detailed_dragon.blend`.

## Voordeur — mat glas met heldere 15

De voordeur volgt de binnenfoto: witte binnenprofielen, drie glasvakken in het bewegende deurblad, een vast zijlicht, drie scharnieren en nikkelkleurige krukken. Alle vier glasvlakken hebben een semitransparante matte afwerking. In het zijlicht is **15 werkelijk uitgespaard in de matte laag**, met doorlopend helder glas erachter. Het nummer leest normaal van buiten en gespiegeld vanuit de gang.

De deur gebruikt de **182 cm brede getraceerde muuropening** uit het bestaande plan. De eerdere vereenvoudigde deur van 142 cm was te smal. Hoogte (201 cm), profielmaten, glasverdeling en nummerhoogte van circa **17,5 cm** zijn foto-inschattingen. De tegelvloer loopt door tot de dorpel. Scene **36** toont de binnenzijde, scene **37** de buitenzijde. Gebruik Rendered voor de glasafwerking. Renders: `entrance_door_inside.png` en `entrance_door_outside.png`. Bron: `entrance_door_photo.py`, opgenomen in `build_house.py`. Reservekopie: `Huis_before_entrance_door_photo.blend`. De geometrische uitsparing en het heldere glas erachter zijn met raycasts gecontroleerd; zie `entrance_door_verification.json`.


## Trap volgens de referentiefoto’s

De trap is herwerkt met beige open treden, een donkere metalen middenkolom, gebogen buissteunen, slanke spijlen en een doorlopende bronskleurige leuning. Kleding en rommel zijn weggelaten. Beide trapgaten zijn uitgelijnd met de ronde traphal. Nieuwe bordessen sluiten exact aan op de bestaande vloerniveaus van **2,41 en 5,31 m**; ook de leuningen sluiten aan op de overloopbeveiliging.

De onderste vlucht heeft 14 optredes van circa 17,21 cm, de bovenste 16 van 18,125 cm. Afwerking en detailmaten zijn afgeleid van foto’s en bestaande modelgeometrie. Scenes **38–40** en `stair_reference_first_landing.png`, `stair_reference_upper_landing.png`, `stair_reference_complete.png` tonen de trap. Bron: `stair_reference_rework.py`, opgenomen in de herbouw. Reservekopie: `Huis_before_stair_reference_rework.blend`. Controles: `stair_reference_verification.json`; toelichting: `STAIR_REFERENCE_NOTES.txt`.


## Voorgevel en buitendeur volgens de buitenfoto’s

De deur heeft antracietkleurige buitenprofielen en behoudt de witte binnenzijde. Buiten zit een verticale RVS-trekstang; binnen blijft de klink. Het matte glas en de heldere uitsparing **15** blijven behouden. De deur ligt terug in het metselwerk; een grijze stenen dorpel sluit aan op de binnenvloer en de stoep.

De voorgevel kreeg roodbruine baksteen met lichte voegen, gemetselde lateien met verticale stenen, een grafietgrijze sectionale garagepoort, het ondiepe balkon met witte boeiboord en fijn lichtmetalen hek, een gesloten wit rolluik boven de garage, de overstekende dakrand en de regenpijp rechts. Auto en losse spullen zijn weggelaten. De bestaande gevelmaat en raamopeningen zijn behouden; het linker bovenraam valt buiten de referentiefoto en is qua vorm niet gewijzigd. Detailmaten en kleuren blijven foto-inschattingen.

Scene **41** en `front_exterior_photo.png` tonen de gevel. Deur: scenes **36–37**, `entrance_door_inside.png` en `entrance_door_outside.png`. Bron: `front_exterior_photo.py`, geïntegreerd in de herbouw. Reservekopie: `Huis_before_front_exterior_photo.blend`. Zie `FRONT_EXTERIOR_NOTES.txt` en `front_exterior_verification.json`.

## Achtergevel, buitentrap en terras

De achterzijde volgt de buitenfoto’s: gladde oranjerode baksteen, antraciet veranda met twee schuifpanelen, wit keukenraam, smal donker wasraam en donker geschilderde baksteen onder de veranda. Alle drie bestaande buitenramen op de tweede verdieping hebben gesloten witte rolluiken, aan voor- en achterzijde. De eerder gesloten badkameropening blijft gesloten.

De buitentrap loopt langs de gevel, met drie gebogen boventreden en tien rechte natuurstenen treden op stalen dragers. Veertien gelijke optredes verbinden het terras op 0 met de veranda op +2,41 m. De RVS-leuningen hebben horizontale tussenstaven. Het terras heeft donkere tegels van circa 60 cm, lichte voegen, een afvoergoot en een latten-tafel met zes stoelen. De zwarte deur past in de bestaande zijopening van de wasruimte naar het overdekte terras.

Scenes **42–44** en renders `rear_exterior_photo.png`, `rear_stair_detail.png`, `terrace_laundry_door.png`. Bron: `rear_terrace_photo.py`; controle: `rear_terrace_verification.json`. Detailmaten zonder opmeting zijn foto-inschattingen. Reservekopie: `Huis_before_rear_terrace_photo.blend`.

## Zijtuin en achtertuin volgens foto’s

Breed zijgazon met zwarte gaasafsluiting en toegangspoort, groene hagen, fruitboom, houten speelhuis op palen met ladder en twee schommels, trampoline met roze rand en net, picknicktafel en kleine roze glijbaan. Zwarte verticale gevelbekleding langs de zijtuin. Een voetpad, lage haag en straatbomen geven de buitenrand aan; er staan geen auto’s in het model.

Het achtergazon sluit aan op de bestaande terrasgoot. Rondom staan gaasafsluitingen op betonnen onderplaten, privacyweving bij het terras en een witbonte achterhaag. De zandbak en lage afgedekte houten bak zijn opgenomen zonder los speelgoed of rommel. Het poortje tussen zij- en achtertuin blijft toegankelijk.

De zijtuin ligt rechts, gezien vanaf de straat naar de voordeur, overeenkomstig het zicht vanuit de veranda en de straatfoto’s. De tuinmaten en plantplaatsing zijn geschat uit de foto’s: omheinde zijtuin circa 14,20 m breed vooraan en 20,37 m achteraan, circa 26 m lang met circa 5,20 m open gazon ervoor, achtergazon circa 7,29 × 8,45 m. Dit zijn geen opgemeten perceelgrenzen. Bestaande maten van huis en terras zijn behouden.

**45** overzicht, **46** zijtuin, **47** achtertuin. Renders: `garden_overview.png`, `side_garden_photo.png`, `rear_garden_photo.png`. Bron: `garden_photo.py`, controle: `garden_photo_verification.json`; reservekopie: `Huis_before_garden_photo.blend`.

## Correctie open en gebogen voorkant van de tuin

Het voorste gazon heeft geen omheining langs de straat. De afsluiting met poort staat exact in het verlengde van de voorgevel (y = 0); ook het buitenste zijhek begint daar. De voorkant van het gazon is afgerond en het voetpad, de boordstenen en de lage openbare haag volgen de bocht. De overige tuin, het huis en het terras blijven behouden; er zijn geen auto's toegevoegd.

De heklijn is volgens de expliciete aanwijzing van de gebruiker op de voorgevellijn gelegd (y = 0). De bochtstraal (circa 5,50 m) blijft een foto-inschatting. Scene **48 – VOORTUIN - open gebogen gazon** toont deze correctie, met render `garden_open_curved_front.png`. Bron: `garden_photo.py`. Reservekopie: `Huis_before_garden_front_correction.blend`.

## Oprit hersteld volgens de aanvullende foto's

De eerdere doorlopende stoep tegen de gevel is vervangen door een afzonderlijke oprit vóór de garage en voordeur. Deze heeft grijze betonklinkers, een betonnen rand naast het gazon en een verlaagde toegang vanaf de straat. Het openbare voetpad ligt vóór de oprit; het open gazon ernaast loopt even ver naar voren en sluit aan op het gebogen voetpad. Hek en poort volgen exact de voorgevellijn. Er zijn geen auto's, vuilnisbakken of losse spullen geplaatst.

De oprit volgt de bestaande gevelbreedte van **7,3808 m**. De diepte van ongeveer **5,20 m** is uit de foto's geschat. Scene **49 – OPRIT - garage en open voortuin** en `driveway_restored.png` tonen de oprit; scene **48** en `garden_open_curved_front.png` tonen de combinatie met de gebogen tuinrand. De bron voor de terreinaanpassing is `garden_photo.py`, geïntegreerd in `build_house.py`. Reservekopie: `Huis_before_driveway_restored.blend`.

## Luchtbeeld en definitieve heklijn

Het aangeleverde luchtbeeld is opgenomen als ingepakte, verborgen referentie in het Blender-bestand en als `references/aerial_garden_2026-09-27.png`. De buitenrand en zijstraat lopen nu schuin ten opzichte van het huis; de tuin wordt naar achteren breder. De hoek van circa 13,5 graden en plaatsing van het speelhuis en de picknicktafel zijn visuele benaderingen uit dit beeld, geen opmeting. Het huis en de bestaande terrasgeometrie zijn niet vervormd.

**Hek en poort staan exact in het verlengde van de voorkant van het huis, op y = 0.** Het open gazon en de oprit lopen samen naar voren tot ongeveer y = -5,20 m. Dit vervangt de eerdere schattingen van de terugliggende heklijn. Scene **50 – TERREIN - bovenaanzicht luchtfoto** toont de totale indeling; scene **48** toont de oprit met de gebogen gazonrand, scene **49** de aansluiting aan de garage. Reservekopie vóór de luchtbeeldcorrectie: `Huis_before_aerial_garden_alignment.blend`.


## Omheining en haag tot aan het pad

De voorste omheining is in het verlengde van de voorgevel doorgetrokken tot aan de binnenrand van het pad. Het zijhek en de haag volgen die padrand; de eerder getekende brede grasstrook tussen haag en pad is vervallen. De haag staat direct achter het hek en blijft buiten het loopvlak. De oprit, het open gazon vóór de heklijn en de gebogen padrand blijven behouden.

Gecontroleerd: de voorste hekpanelen liggen op y = 0; het zijhek staat op de boordsteen, circa 5 cm binnen de rand van de bestrating. Scenes 48 en 50 zijn opnieuw gerenderd. Reservekopie: `Huis_before_fence_and_hedge_to_path.blend`.

## Camber-kast gecorrigeerd volgens technische tekeningen

De kast is herbouwd op basis van `camber.pdf`, pagina's 5–12, en de twee aangeleverde renders van uitsluitend de kast. De bestaande kamer, eettafel, stoelen, vloer, tv en tuin zijn behouden. De buitenmaten volgen de tekening: lengte 8297 mm, hoogte 2579 mm, plint 70 mm en bovenzijde van bank en tv-meubel 489 mm.

De voorkant heeft nu zes bankfronten, zes witte bovenkastdeuren rond een open nis met twee vakken, één kleine boekennis met gesloten deuren erboven en eronder, twee hoge deuren en een toren met vier laden onder vijf open eikenvakken. Het tv-meubel heeft vier witte fronten en een wit bovenblad. De hoge opbouw bij de tv heeft een gesloten witte voorkant; haar legplanken zijn bereikbaar vanaf de zijkant richting de tv. De zes Tocca-panelen en de eiken zitbank zijn behouden in de correcte nis. Het lamelprofiel is visueel benaderd; kleine passtukken verbinden de vermelde binnenmaten met de totale buitenmaatvoering.

Scenes **51 – CAMBER - volledig vooraanzicht** en **52 – CAMBER - perspectief en zijvakken** tonen de kast in een afzonderlijke neutrale studio. Die studio is niet aan de huiscollecties toegevoegd. Renders: `camber_corrected_front.png` en `camber_corrected_perspective.png`. Bron: `camber_drawing_rework.py`, geïntegreerd in `build_house.py`. Controle: `camber_drawing_verification.json`. Reservekopie: `Huis_before_camber_drawing_rework.blend`.

## Plafondlamp boven de eettafel

Scene **82 | EETTAFEL - plafondlamp met vier ringen** toont de plafondlamp naar de gebruikersfoto: vier verspringende open ringen in donker brons met warmwitte LED-randen, rechtstreeks tegen het plafond. De lamp is gecentreerd boven de eettafel in de living en volgt de lengterichting van de tafel. Afmetingen circa 145 × 49 × 12 cm zijn fotoschattingen. De lamp is gedeeld met de bestaande verdiepingsscenes; alleen de nieuwe controlescene heeft een extra plafondvlak voor de weergave. Script: `dining_ceiling_lamp.py`. Controlebeeld: `dining_ceiling_lamp.png`. Reservekopie: `Huis_before_dining_ceiling_lamp.blend`.

## Eettafel, stoelen en keyboard — nieuwe referentiefoto’s

Het tafelblad heeft nu een tonvormige omtrek: bolle lange zijden en breed afgeronde uiteinden. De bestaande geschatte maat van 260 × 100 cm blijft behouden, met een geschatte bladdikte van 3 cm. De vijf stoelen zijn vervangen door gebogen witte kunststof kuipen met een afzonderlijk ivoorkleurig zitkussen en vier schuin uitstaande, vierkante en taps toelopende houten poten. Het zwarte stalen tafelonderstel volgt de bijkomende detailfoto: vier brede rechthoekige balken die centraal kruisen, met verbindingsplaten en bouten.

Achter de zetel, aan de kant van de eettafel, staan nu een zilvergrijs keyboard met 61 toetsen op een zwart X-statief en een wit rek met drie rijen schuine open bakjes. De maatvoering van deze nieuwe onderdelen is geschat op basis van de foto’s. Het eerdere LEGO-meubel aan de bureauzijde blijft aanwezig.

- Scene **83**: aangepaste tafel en kuipstoelen; `dining_furniture_photo.png`.
- Scene **84**: bladvorm in bovenaanzicht; `dining_table_outline.png`.
- Scene **85**: keyboard en bakjesrek; `sofa_keyboard_organiser.png`.
- Scene **86**: detail zwart stalen tafelonderstel; `dining_cross_frame_detail.png`.

De plafondlamp blijft boven de tafel aanwezig. Herbouwvolgorde voor deze wijziging: `dining_and_sofa_photo_update.py`, gevolgd door `refine_dining_base_from_detail.py` (laatste referentiefoto). Reservekopie van vóór deze reeks: `Huis_before_dining_and_keyboard_photos.blend`.
