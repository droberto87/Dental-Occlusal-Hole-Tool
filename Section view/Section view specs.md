\# Specifikáció: Fogászati Modell Metszeti Nézet (Section View)



\## 1. Célkitűzés

Egy robusztus 3D metszeti nézet létrehozása, amely lehetővé teszi a fogászati modellek belső szerkezetének és a behelyezett csatornák (furatok) pontos vizsgálatát. A rendszernek látványosan, "tömör" modellként kell kezelnie a vágási felületet, miközben a furatokat üregesen hagyja.



\## 2. Funkcionális követelmények



\### 2.1. Aktiválás és Környezet

\- \*\*Trigger\*\*: Az 'S' billentyű vagy egy UI gomb váltja a metszeti módot.

\- \*\*Kontextus\*\*: A metszet csak akkor aktív, ha van kijelölt csatorna (activeChannelId).

\- \*\*Metszősík\*\*: A síknak pontosan a kijelölt csatorna hossztengelyén kell áthaladnia.



\### 2.2. Automatikus Beállítás (Auto-Align)

\- A sík kezdeti dőlésszögét úgy kell meghatározni, hogy a lehető legkisebb vágási hosszt (a fog legvékonyabb keresztmetszetét) mutassa.

\- Ez megakadályozza, hogy egy széles híd esetében a vágás feleslegesen érintsen más koronákat.



\### 2.3. Kamera Kezelés

\- A metszeti mód bekapcsolásakor a kamera automatikusan a vágási síkra merőleges pozícióba fordul.

\- Az animáció végén a \*\*Z tengelynek\*\* kell felfelé mutatnia.

\- A kamera távolságát a modell méretéhez kell igazítani.



\## 3. Vizuális Követelmények



\### 3.1. Modell Megjelenítése

\- A vágósík által elmetszett modellt "tömörként" kell ábrázolni.

\- A vágási felületet (keresztmetszetet) \*\*élénksárga (#fbbf24)\*\* színnel kell lezárni.

\- A modell többi része (ami nem a vágásnál van) maradjon az eredeti világosszürke színű.



\### 3.2. Csatornák (Furatok) Kezelése (KRITIKUS)

\- A furat belsejének (a henger falának) \*\*láthatónak és üregesnek\*\* kell maradnia.

\- A sárga lezáró felület \*\*NEM\*\* takarhatja el a furat belsejét.

\- A furat fala különüljön el színben: legyen \*\*sötétebb kékes-szürke (#475569)\*\*.

\- Semmilyen nézőszögből nem jelentkezhet sárga "hártya" vagy anomália a furatokon belül.



\## 4. Technikai Implementáció

\- \*\*Módszer\*\*: Geometriai alapú metszet-generálás (Geometric Capping).

\- \*\*Technológia\*\*: `three-mesh-bvh` használata a metszésvonalak kinyeréséhez és valódi 3D háló (ShapeGeometry) építése.

\- \*\*Robusztusság\*\*: Kezelnie kell a különálló szigeteket (pl. több tagú híd elvágása).

\- \*\*Interakció\*\*: Lehetővé kell tenni a sík forgatását a csatorna tengelye körül (Zustand állapotváltozón keresztül).



