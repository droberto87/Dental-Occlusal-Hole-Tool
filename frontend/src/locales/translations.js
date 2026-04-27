export const translations = {
  en: {
    title: 'Dental Occlusal Hole Tool',
    subtitle: 'CAD Occlusal Hole Editor',
    import: 'Import STL',
    export: 'Export STL',
    exporting: 'Exporting...',
    pierce: 'Click on Model to Pierce',
    addChannel: 'Add Channel',
    diameter: 'Diameter',
    holes: 'Holes List',
    hole: 'Hole',
    undo: 'Undo',
    redo: 'Redo',
    version: 'v1.1.1-fix',
    disclaimer: 'Professional CAD Editor. Always verify final STL model before production!',
    help: 'Help / Wiki',
    close: 'Close',
    errorImport: 'Failed to read STL file.',
    errorExport: 'Failed to export model.',
    sectionView: 'Section View',
    sectionAngle: 'Rotation',
    sectionHint: 'Shift+drag to rotate plane',
    emptyTitle: 'No Model Loaded',
    emptyDesc: 'Import an STL file to begin cutting channels.',
    clearHoles: 'Clear All Holes',
    resetApp: 'Reset Application',
    confirmClear: 'Are you sure you want to delete all holes?',
    confirmReset: 'Are you sure you want to reset the entire workspace? This will remove the model and all holes.',
    dontShowAgain: "Don't show again",
    cancel: 'Cancel',
    confirm: 'Yes, proceed',
    copyright: '© 2026 Robert Deak. All Rights Reserved.'
  },
  de: {
    title: 'Dental Okklusal-Loch-Tool',
    subtitle: 'CAD-Okklusal-Loch-Editor',
    import: 'STL Importieren',
    export: 'STL Exportieren',
    exporting: 'Exportiere...',
    pierce: 'Klicken Sie zum Durchstechen',
    addChannel: 'Kanal hinzufügen',
    diameter: 'Durchmesser',
    holes: 'Loch-Liste',
    hole: 'Loch',
    undo: 'Rückgängig',
    redo: 'Wiederholen',
    version: 'v1.1.1-fix',
    disclaimer: 'Professioneller CAD-Editor. Vor der Produktion immer das finale STL-Modell prüfen!',
    help: 'Hilfe / Wiki',
    close: 'Schließen',
    errorImport: 'STL-Datei konnte nem gelesen werden.',
    errorExport: 'Export fehlgeschlagen.',
    sectionView: 'Schnittansicht',
    sectionAngle: 'Rotation',
    sectionHint: 'Shift+Ziehen zum Drehen',
    emptyTitle: 'Kein Modell geladen',
    emptyDesc: 'Importieren Sie eine STL-Datei, um Kanäle zu schneiden.',
    clearHoles: 'Alle Kanäle löschen',
    resetApp: 'Anwendung zurücksetzen',
    confirmClear: 'Möchten Sie wirklich alle Kanäle löschen?',
    confirmReset: 'Möchten Sie den gesamten Arbeitsbereich wirklich zurücksetzen? Das Modell und alle Kanäle werden entfernt.',
    dontShowAgain: 'Nicht mehr anzeigen',
    cancel: 'Abbrechen',
    confirm: 'Ja, fortfahren',
    copyright: '© 2026 Robert Deak. Alle Rechte vorbehalten.'
  },
  hu: {
    title: 'Dental Occlusal Hole Tool',
    subtitle: 'CAD Okkluzális Furatszerkesztő',
    import: 'STL Importálása',
    export: 'Kész modell letöltése',
    exporting: 'Exportálás...',
    pierce: 'Kattintson a modellre',
    addChannel: 'Új furat elhelyezése',
    diameter: 'Átmérő',
    holes: 'Furatok listája',
    hole: 'Furat',
    undo: 'Vissza',
    redo: 'Előre',
    version: 'v1.1.1-fix',
    disclaimer: 'Professzionális CAD szerkesztő szoftver. Gyártás előtt mindig ellenőrizze a végleges STL modellt!',
    help: 'Súgó / Wiki',
    close: 'Bezárás',
    errorImport: 'Hiba történt az STL beolvasása során.',
    errorExport: 'Hiba történt az exportálás során.',
    sectionView: 'Metszeti nézet',
    sectionAngle: 'Forgatás',
    sectionHint: 'Shift+húzás a sík forgatásához',
    emptyTitle: 'Nincs betöltött modell',
    emptyDesc: 'Importáljon egy STL fájlt a fúrási csatornák elhelyezéséhez.',
    clearHoles: 'Összes furat törlése',
    resetApp: 'Munkaterület ürítése',
    confirmClear: 'Biztosan törölni szeretné az összes furatot?',
    confirmReset: 'Biztosan alaphelyzetbe állítja a munkaterületet? A modell és az összes furat elvész.',
    dontShowAgain: 'Ne jelenjen meg többet',
    cancel: 'Mégse',
    confirm: 'Igen, mehet',
    copyright: '© 2026 Deák Róbert. Minden jog fenntartva.'
  }
};

export const wikiContent = {
  en: `
    <h3>1. Loading a Model</h3>
    <p>Click <b>Import STL</b> to load your dental model.</p>
    <h3>2. Placing Holes</h3>
    <p>Click <b>Add Channel</b> or <b>double-click</b> on the model. The cut starts 5mm behind the first point and goes <b>infinitely</b> towards the second point (ideal for occlusal openings).</p>
    <h3>3. Section View & Navigation</h3>
    <p>Press <b>'S'</b> to enter Section View. Use <b>Ctrl + Mouse Wheel</b> to rotate the plane; the camera will follow to keep a face-on view.</p>
    <h3>4. Advanced Editing</h3>
    <p>Drag the <b>yellow ring</b> in section view to <b>pan</b> the hole within the plane. Use <b>Mouse Wheel</b> over a marker to change its diameter. Hold <b>Ctrl</b> while dragging a marker to move the entire hole.</p>
  `,
  de: `
    <h3>1. Modell laden</h3>
    <p>Klicken Sie auf <b>STL Importieren</b>.</p>
    <h3>2. Löcher platzieren</h3>
    <p>Doppelklicken Sie auf die Oberfläche. Der Schnitt beginnt 5 mm hinter dem Startpunkt und verläuft <b>unendlich</b> in Richtung des Endpunkts.</p>
    <h3>3. Schnittansicht</h3>
    <p>Drücken Sie <b>'S'</b> für die Schnittansicht. Nutzen Sie <b>Strg + Mausrad</b>, um die Ebene zu drehen; die Kamera folgt automatisch.</p>
    <h3>4. Bearbeitung</h3>
    <p>Ziehen Sie den <b>gelben Ring</b>, um das Loch in der Ebene zu verschieben. Halten Sie <b>Strg</b> beim Ziehen eines Markers, um den gesamten Kanal zu verschieben.</p>
  `,
  hu: `
    <h3>1. Modell betöltése</h3>
    <p>Kattintson az <b>STL Importálása</b> gombra.</p>
    <h3>2. Furatok elhelyezése</h3>
    <p>Használja az <b>Új furat</b> gombot vagy a <b>dupla kattintást</b>. A vágás a kezdőpont mögött 5mm-rel indul és <b>végtelenítve</b> halad a végpont felé (ideális okkluzális nyitáshoz).</p>
    <h3>3. Metszeti nézet (S billentyű)</h3>
    <p>Nyomja meg az <b>'S'</b> gombot a belépéshez. A <b>Ctrl + Egérgörgő</b> kombinációval forgathatja a metszeti síkot, a kamera automatikusan követi a vágást.</p>
    <h3>4. Speciális szerkesztés</h3>
    <p>Metszeti nézetben a <b>sárga gyűrű</b> húzásával eltolhatja (pan) a furatot a síkban. A <b>Ctrl + Húzás</b> a teljes furatot mozgatja, a <b>Görgő</b> a marker felett az átmérőt módosítja.</p>
  `
};
