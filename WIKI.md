# Dental Occlusal Hole Tool - Használati Útmutató (WIKI)

Üdvözöljük a **Dental Occlusal Hole Tool** használati útmutatójában. Ez a szoftver egy professzionális CAD szerkesztő, amelyet fogászati STL modellek precíziós furataival (csatornáival) történő kiegészítésére terveztek.

## 📖 Alapvető műveletek

### 1. Modell betöltése
- Kattintson az **Import STL** gombra a bal oldalsávban.
- Válassza ki a kívánt `.stl` fájlt a számítógépéről.
- A modell automatikusan a képernyő közepére kerül és a szoftver beállítja az optimális nézetet.

### 2. Furatok elhelyezése (Point & Shoot)
A szoftver egy egyedülálló, kamera-alapú "átlövést" használ:
- Kattintson az **Add Channel** (Új furat elhelyezése) gombra.
- A kurzor megváltozik. Kattintson a modell felületére ott, ahol a furat belépési pontját szeretné.
- A szoftver automatikusan kiszámítja a furat kilépési pontját a kamera nézési iránya mentén, átszúrva a teljes modellt.
- **Gyorsbillentyű:** A modellen való **dupla kattintás** azonnal elhelyez egy új furatot az adott ponton, az aktuális nézetnek megfelelően.

### 3. Furatok szerkesztése
- **Mozgatás:** Kattintson a furat végén található **marker gömbre** (kék/sárga) és húzza a modell felszínén a kívánt helyre.
- **Teljes furat eltolása (Pan):** Tartsa nyomva a **Ctrl** (Mac-en **Cmd**) billentyűt, miközben húzza az egyik markert. Így a teljes furat egyben mozgatható, megtartva az eredeti irányát és hosszát.
- **Átmérő módosítása:**
    - Válassza ki a furatot a listából vagy kattintson rá a 3D nézetben.
    - Használja az **egérgörgőt** a marker felett az átmérő azonnali (0.2 mm-es lépésközű) állításához.
    - Vagy használja a bal oldalsávban található csúszkát.

### 4. Exportálás
- Ha minden furat a helyén van, kattintson az **Export STL** gombra.
- A szoftver elvégzi a matematikai Boolean műveleteket (kivonja a furatokat a modellből).
- A letöltés automatikusan elindul a módosított STL fájllal.

## ⚙️ Speciális funkciók

### Sötét / Világos mód
A fejlécben található Nap/Hold ikonnal válthat a témák között. A **Mély Padlizsán** sötét mód kíméli a szemet hosszú távú munka során.

### Többnyelvűség
A fejléc alatt található nyelvválasztóval (EN, DE, HU) bármikor átválthatja a kezelőfelület nyelvét.

### Visszavonás / Előre (Undo/Redo)
Minden mozdulatot és átmérő állítást rögzít a rendszer. A sáv alján lévő gombokkal bármikor visszaléphet egy korábbi állapotra.

## ⚠️ Biztonsági figyelmeztetés
Ez a szoftver egy CAD szerkesztő segédeszköz. Bár a matematikai műveletek precízek, **gyártás (nyomtatás vagy marás) előtt minden esetben ellenőrizze a végleges STL modellt** a CAM szoftverében!
