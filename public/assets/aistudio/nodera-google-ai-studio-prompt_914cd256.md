# Nodera — kompletny prompt do Google AI Studio

Zaprojektuj i zaimplementuj Noderę by Brainode: działającą, dopracowaną aplikację webową do tworzenia stron internetowych z pomocą AI. Zbuduj aplikację, nie landing page reklamujący aplikację. Poniższy dokument jest samodzielnym briefem produktowym i wykonawczym. Nie potrzebujesz wcześniejszej rozmowy.

Pracuj autonomicznie w obrębie dostępnego środowiska. Najpierw ułóż wewnętrzny plan, następnie implementuj, uruchom dostępne sprawdzenia i napraw zauważone problemy. Nie kończ na planie, makiecie ani kilku dekoracyjnych ekranach. Nie pytaj o kosmetyczne szczegóły. Podejmuj spójne decyzje zgodne z tym briefem.

## 1. Istota produktu

Nodera pomaga człowiekowi zobaczyć i urzeczywistnić pomysł, którego nie umiał jeszcze w pełni wyrazić. Docelowy moment satysfakcji użytkownika:

„Tak. Właśnie o to mi chodziło — tylko wcześniej nie umiałem tego pokazać”.

Zasady: łagodność w obsłudze, precyzja w działaniu, głębia w odkrywaniu. Najważniejsza cecha: PRECYZJA. Użytkownik przed działaniem rozumie jego przedmiot i zakres, podczas działania widzi rezultat, po działaniu ma bezpieczny powrót.

Nodera jest design-first i ma solidny rdzeń techniczny. Designer oraz frontend developer powinni móc współpracować nad tym samym projektem. Początkujący może zacząć od jednego opisu i dojść do propozycji strony bez znajomości HTML. Zaawansowany użytkownik może odsłonić strukturę, wartości, zakresy responsywności i kod.

Małe, odwracalne zmiany wykonuj szybko. Większe planuj przed wykonaniem. Postęp nie powinien zamykać możliwości zmiany kierunku.

## 2. Pierwszy rzeczywisty scenariusz

Ania obsługuje zapytania klientów o strony internetowe. Przeprowadza wywiad, zbiera materiały i wkleja surowe notatki do Nodery. Nie zna designu ani HTML i nie musi umieć pisać specjalistycznych promptów.

Nodera interpretuje wywiad, przygotowuje kilka kierunków, pozwala wybrać i dopracować jeden. Ania wysyła klientowi propozycję PRZED zakupem. Po zakupie kontynuuje ten sam projekt, uzupełnia materiały, uruchamia formularze i publikuje stronę.

Główna droga: pomysł / wywiad → trzy kierunki → wybrany kierunek → dopracowanie → udostępnienie propozycji → przygotowanie do publikacji → publikacja.

Zakres: strony firmowe, portfolio, landing page'e i witryny z podstronami. Poza pierwszą realizacją: sklepy, dashboardy biznesowe, rozbudowany CMS, efekty 3D/perspektywa. Zaprojektuj możliwość późniejszego dodania kolekcji treści, bez pustych rozbudowanych paneli CMS już teraz.

## 3. Charakter wizualny

Jasny interfejs. Ciepła złamana biel, grafit, oszczędna miedź. Inspiracja: ręcznie formowana matowa ceramika o drobnej fakturze, łagodna bryła z jedną precyzyjną krawędzią. Przełóż to na proporcje, typografię, odstępy i subtelny ruch; nie nakładaj ziarnistych tekstur na obszar roboczy.

Przykładowe tokeny do dopracowania: tło #F6F4EF, powierzchnia #FFFEFB, tekst #292824, wtórny tekst #706C65, granice #DED9CF, miedź #A86645. Zapewnij czytelność i właściwy kontrast, szczególnie małych etykiet. Estetyka spokojnego profesjonalnego narzędzia, bez dominujących gradientów, nadmiaru kart, wielkich zaokrągleń i efektu glassmorphism.

Interfejs edytora jest powściągliwy. Projektowana strona może być odważna i kolorowa; to ona ma dominować. Użyj dobrej czytelnej typografii interfejsowej, niewielu stopni pisma, konsekwentnych ikon i oszczędnych animacji. Uszanuj preferencję ograniczonego ruchu. Nazwa „Nodera”, dyskretne „by Brainode”; prosta typograficzna identyfikacja wystarczy.

Język interfejsu: polski. Kod i typy: angielski. Teksty krótkie, konkretne, bez przesadnej antropomorfizacji AI i marketingowego hałasu. Ciemny wariant nie jest wymagany.

## 4. Ekrany i nawigacja

### A. Projekty / początek

Przy pierwszym wejściu dominują: „Co chcesz stworzyć?”, duże wielowierszowe pole, dołączanie zdjęć, logo, inspiracji i plików tekstowych, przycisk „Pokaż kierunki”. Dyskretna alternatywa „Zacznij od pustej strony”. Przy kolejnych wejściach dostępne zapisane projekty z podglądem i datą ostatniej pracy. Nie wymagaj podłączania repozytorium, aby zacząć.

Po przyjęciu opisu wyodrębnij edytowalne założenia: cel, odbiorcy, charakter, dostępne treści, brakujące fakty. Nie wymuszaj ankiety ani zatwierdzania każdego kroku. Nie wymyślaj cen, terminów, adresów, referencji, certyfikatów czy osiągnięć. Przykładowe treści mają jawny status roboczy.

### B. Kierunki

Trzy znacząco różne interpretacje: wierna briefowi, interpretująca oraz odkrywcza. Różnice dotyczą hierarchii, układu, typografii i sposobu opowiadania, a nie tylko koloru przycisku. Duże podglądy, pełny podgląd strony głównej, krótki opis zamysłu i plan podstron. Wybór „Rozwijaj ten kierunek”. Pozostałe propozycje zachowaj.

### C. Edytor

Centralne płótno zajmuje większość ekranu. Na górze projekt, aktywny kierunek, podstrona, szerokość podglądu oraz osobno zakres edycji. Po prawej podgląd na urządzeniu, udostępnianie i publikacja.

Przy dolnej krawędzi stałe pole polecenia z widocznym kontekstem ponad nim, np. „Zdjęcie · Rozmiar · Małe ekrany”. Historię rozmowy można rozwinąć; nie rób z dużego okna czatu centrum aplikacji.

Zwijane zasoby po bokach: podstrony, materiały, style, zachowane kierunki, struktura, kod. Pokazuj tylko narzędzia potrzebne w bieżącej czynności. Panele można przypinać. Licznik problemów, stan zapisu i operacji są dyskretne na dole.

### D. Podgląd propozycji

Czysty, tylko do odczytu widok strony z dyskretną informacją „Propozycja strony”. Pozwala przeglądać podstrony i zostawić prostą uwagę przypiętą do elementu. Nie buduj rozbudowanego systemu akceptacji. Udostępniana wersja jest niezmiennym snapshotem; dalsze edycje robocze nie zmieniają jej automatycznie. „Aktualizuj propozycję” tworzy nowy snapshot z zachowaniem wcześniejszego.

### E. Przygotowanie do publikacji

Lista konkretnych rzeczy do sprawdzenia: robocza treść, odnośniki, odbiorca formularza, alternatywne opisy zdjęć i wykryte problemy układu. Pozycja prowadzi do elementu i możliwego rozwiązania. Formularz musi mieć prawdziwy stan konfiguracji i możliwość testu, jeśli istnieje backend. Nie udawaj wysyłki e-maila.

Rozdziel stan: robocza, propozycja, opublikowana. Edycja robocza nigdy automatycznie nie zmienia publicznej wersji.

## 5. Model interakcji: bezpieczne eksplorowanie

Domyślnie płótno służy do oglądania, panningu i zoomu. Zwykłe kliknięcie lub przeciągnięcie nie modyfikuje elementów. Linki strony są aktywne w osobnym podglądzie użytkowym; eksploracja edytora nie powinna przypadkowo nawigować poza nim.

Przytrzymanie Shift chwilowo włącza wybieranie i podświetla obiekt pod kursorem. Puszczenie bez kliknięcia wraca do eksploracji. Kliknięcie wybiera obiekt; po puszczeniu Shift zaznaczenie pozostaje. Równoważny widoczny przycisk „Wybierz” zapewnia dostęp bez skrótu, również na dotyku. Nie blokuj rozpoczęcia pracy na znajomości ukrytych gestów.

Zaznaczenie samo nie pozwala przesuwać elementu. Pokazuje precyzyjny obrys, etykietę oraz mały pasek działań właściwych dla typu elementu. Dopiero wybór działania włącza edycję tekstu, rozmiaru, położenia, kolejności, obrazu czy wyglądu. Escape kończy działanie bez automatycznego cofania zaakceptowanych zmian; kolejne Escape usuwa zaznaczenie.

W stanie wyboru, poza polami tekstowymi: strzałka w górę wybiera rodzica, w dół dziecko lub ostatnio odwiedzane dziecko, lewo/prawo poprzedniego/następnego sąsiada. Etykieta i obrys pokazują przejście. W działaniu „Położenie” strzałki służą do ruchu; w „Kolejność” do zmiany kolejności. W polach tekstowych zachowuj natywne działanie klawiatury. Wszystkie aktywne gesty mają widoczną krótką podpowiedź. Nie przechwytuj globalnie systemowych skrótów.

Prześwietlenie chwilowo odsłania kontenery i nakładające się elementy bez zmiany układu. Umożliw wybór obiektu zasłoniętego przez inny, np. listą trafień pod kursorem. Skupienie przygasza otoczenie i pozwala zbliżyć fragment przy zachowaniu jego kontekstu. Drzewo jest narzędziem pomocniczym na żądanie, zsynchronizowanym z zaznaczeniem.

Nakładanie tekstu na zdjęcie, elementów dekoracyjnych i kart musi być możliwe. Interfejs kolejności warstw ma respektować rzeczywiste konteksty nakładania; nie traktuj samego zwiększania z-index jako uniwersalnego rozwiązania.

Zakres pracy: „Całość”, „Treść”, „Design”. W „Treść” gesty nie naruszają układu; można redagować teksty i wymieniać materiały. Jawne polecenie AI może przekroczyć ten zakres bez dodatkowego potwierdzenia, np. „Zmniejsz nagłówek”. Tryb pozostaje niezmieniony, a wykonana zmiana jest opisana.

## 6. Położenie i precyzja

Wyraźnie rozdziel „Korektę optyczną” od „Układu”. Korekta optyczna zmienia offset bez rozpychania sąsiadów. Układ zmienia odstępy, wyrównanie lub kolejność w rzeczywistym modelu flex/grid/flow. Nie ustawiaj wszystkim elementom position:absolute.

Element absolutny ma widoczny kontener odniesienia, krawędzie i przypięcia. Rozmiar, dopasowanie zdjęcia i kadrowanie są oddzielnymi operacjami. Obrazy można ocenić w podglądzie 1:1, z poprawnym opisem skali uwzględniającym gęstość ekranu.

Zmiana o 1 px jest możliwa i potwierdzona, np. „Logo · korekta X −1 px · Duże ekrany”. Grupuj ciągły gest w jedną operację undo, zamiast zapisywać każdy ruch kursora osobno.

## 7. Responsywność

Viewport podglądu i zakres edycji są NIEZALEŻNE. Zmiana szerokości podglądu nie zmienia zakresu operacji. Domyślnie edycja dotyczy ustawień wspólnych. Można oglądać desktop, edytując regułę dla małych ekranów.

Pokaż stale „Edytujesz: Całość” albo konkretny warunek, np. „Małe ekrany · poniżej 768 px”. Nazwy urządzeń są etykietami rzeczywistych zakresów szerokości. Zdefiniuj i udokumentuj jednoznaczne dziedziczenie i pierwszeństwo nadpisań. Każde nadpisanie ma wskazanie pochodzenia oraz „Przywróć wspólne”.

Rozwijana linijka szerokości pokazuje znacznik podglądu i osobno wyróżniony przedział edycji. Zmiana samych granic zakresów wymaga osobnej intencjonalnej czynności. Chwilowy skrót zakresu może być dostępny po jawnej konfiguracji i z widocznym feedbackiem; nie komplikuj pierwszej realizacji nieprzemyślanym Ctrl/Command.

Lokalna kolejność menu lub listy musi zachować zgodność kolejności wizualnej, klawiaturowej i dostępnego odczytu. Nie ukrywaj problemu za samą właściwością CSS order. Jeśli wybrana implementacja nie gwarantuje spójności, pokaż ograniczenie i nie oferuj pozornie działającej funkcji.

Sprawdzaj układ w kilku szerokościach. Wykrywanie overflow i nachodzenia ma być rzeczywistą heurystyką z możliwością oznaczenia fałszywego alarmu; dekoracyjne zamierzone nakładanie nie jest automatycznie błędem. AI nie decyduje, które właściwości użytkownik w ogóle ma prawo edytować na mobile.

## 8. AI: kontekst i wykonanie

Każde polecenie otrzymuje jawny kontekst: projekt, kierunek, podstrona, trwały identyfikator zaznaczenia, rodzaj działania, zakres responsywności, zaakceptowane założenia i materiały. Polecenia bez zaznaczenia dotyczą strony zgodnie z ich treścią. Kontekst można obejrzeć i zmienić.

Operacje AI są walidowanymi, ograniczonymi zmianami modelu dokumentu, nie arbitralnym zastępowaniem całej aplikacji ani wykonywaniem dowolnego skryptu. Dla każdej operacji zapisuj opis, zakres, wynik, identyfikatory zmienionych obiektów i dane potrzebne do cofnięcia. Chronione treści i jawne ograniczenia projektu muszą być respektowane.

Przykłady oczekiwanego zachowania:

• „Proszę bardziej wyeksponuj warsztaty” przy kontekście strony: przenieś istniejącą sekcję warsztatów bliżej początku, wzmocnij hierarchię i ustaw główne CTA prowadzące do niej. Zachowaj fakty, zdjęcia, terminy i ceny. Podsumuj trzy zmiany, pozwól cofnąć całość.
• „Tak, ale zostaw poprzedni przycisk na górze”: przywróć tylko poprzednie CTA, zachowując pozostałe zaakceptowane zmiany.
• „Powiększ o 20%” przy zdjęciu i działaniu Rozmiar: zmień rozmiar zdjęcia w wybranym zakresie.
• „Kontakt na koniec” w działaniu Kolejność menu: zmień kolejność, bez redakcji etykiet czy redesignu.
• „Uporządkuj” w designie: układ i wygląd, bez nieproszonej redakcji treści. W kontekście redakcji tekstu: popraw treść, zachowując fakty.
• „Napraw nagłówek, bo nachodzi na tekst”: lokalna poprawka układu z weryfikacją kilku szerokości, bez ogólnego przeprojektowania strony.

Szybkie, jasne, odwracalne operacje wykonuj od razu. Przy dwóch istotnie różnych interpretacjach zadaj jedno konkretne pytanie z opisem rozumienia. Przed większą przebudową pokaż plan, zachowywane elementy, miejsce wykonania (np. nowy kierunek) i orientacyjny przedział czasu. 10 sekund i kilka minut są orientacją projektową, nie gwarantowaną granicą. Estymacja docelowo korzysta z pomiarów podobnych operacji; bez danych pokaż „większa przebudowa”, zamiast wymyślać dokładne sekundy. Nie dodawaj sztucznych opóźnień.

Pozwalaj zatrzymać operację. Wynik powstaje względem konkretnej rewizji dokumentu. Jeśli użytkownik w międzyczasie zmienił te same obiekty, nie nadpisuj jego pracy; zachowaj wynik jako propozycję do uzgodnienia. Nie pokazuj fikcyjnego procentowego postępu. Pokazuj rzeczywiste etapy, jeśli są znane.

Przy błędzie zachowaj ostatni poprawny stan. Opisz, co się nie udało; zaoferuj ponowienie, obejrzenie próby lub ręczną poprawkę. Nie ogłaszaj sukcesu bez zastosowanej zmiany. Nie renderuj niepełnego lub niezwalidowanego wyniku jako zaakceptowanego dokumentu.

Pamiętaj jawne decyzje projektu, np. „nie zmieniaj tych zdjęć”. Nie buduj niejawnego profilu osobowości z pojedynczych cofnięć. Przyszłe preferencje mają być dostępne do edycji i usunięcia.

## 9. Historia, kierunki, trwałość

Undo/redo działa na rzeczywistym modelu dokumentu i grupuje logiczne operacje. Stan edytora (np. zoom) jest oddzielony od treści projektu. Zmiana zaznaczenia nie powinna zaśmiecać historii dokumentu. Nowa operacja po cofnięciu poprawnie obsługuje historię redo; świadomie zachowane kierunki nigdy przez to nie giną.

Większe eksperymenty jako oddzielne kierunki z nazwą, miniaturą i rewizją źródłową. Porównywanie dwóch kierunków, przywrócenie całego i przenoszenie wybranych cech/sekcji do AKTUALNEJ pracy. Treści oraz edycje wykonane później muszą być zachowane, chyba że zakres operacji wyraźnie je obejmuje. W razie konfliktu pokaż wybór zamiast udawać bezstratne łączenie.

Półka kierunków zawiera świadomie zachowane alternatywy; automatyczna historia pozostaje osobnym mechanizmem. Kierunek można zastosować do innego projektu bez automatycznego przenoszenia danych klienta i integracji.

Zapewnij trwały lokalny zapis, najlepiej IndexedDB dla dokumentów i materiałów; localStorage może przechowywać drobne preferencje. Obsłuż błędy zapisu i limit miejsca. Umożliw eksport oraz import projektu JSON z wersją schematu i walidacją. Odświeżenie strony przywraca pracę. Nie udawaj synchronizacji między urządzeniami na podstawie lokalnej pamięci.

## 10. Dokument, renderer i kod

Wybierz stos zgodny z dostępnym środowiskiem. Preferencja wykonawcza: TypeScript, komponentowy frontend i Tailwind, np. React, jeśli środowisko już go zapewnia. Nie przebudowuj działającego szkieletu tylko dla preferencji frameworka. To nie jest prośba o Angularowy builder aplikacji biznesowych.

Centralny, wersjonowany model dokumentu stanowi wspólne źródło dla płótna, zmian AI, historii, podglądu i eksportu. Nie twórz osobnej strony demonstracyjnej, którą edytor w rzeczywistości nie zmienia.

Model powinien rozróżniać: projekt, strony, kierunki/rewizje, węzły z trwałymi ID, typy elementów, relacje rodzic/dziecko, treści, materiały, komponenty i wystąpienia, tokeny wizualne, style wspólne, lokalne wyjątki, nadpisania responsywne, formularze, komentarze i opublikowane snapshoty. Nie mieszaj elementów interfejsu Nodery z elementami dokumentu użytkownika.

Tokeny dotyczące np. koloru przycisków są współdzielone. „Zmień wszystkie czerwone przyciski na niebieskie” ma być zmianą odpowiedniej zasady albo jasno określonego zbioru wystąpień, bez ręcznego przechodzenia podstron. Klasy Tailwind pomagają mapować wygląd na strukturę, ale nie zastępują modelu dziedziczenia i komponentów.

Renderer oraz eksport muszą uwzględniać zmiany dynamicznych stylów; nie zakładaj, że dowolne wygenerowane w runtime nazwy klas zostaną automatycznie skompilowane. Użyj jawnego mapowania, poprawnego generowania CSS albo kontrolowanej kombinacji klas i zmiennych CSS. Eksport nie może opierać się na niedostępnym runtime edytora.

Zapewnij izolację stylów projektowanej strony od interfejsu, np. iframe z kontrolowanym kanałem komunikacji. Jeśli używasz iframe, przeliczaj poprawnie współrzędne obrysów przy zoomie i scrollu. Nie wykonuj dowolnego kodu z odpowiedzi AI. Waliduj URL-e, strukturę i atrybuty; traktuj pliki użytkownika jako niezaufane dane. Klucze API i tokeny OAuth wyłącznie po stronie serwera, nigdy w bundle lub eksportowanym projekcie.

Kod eksportowany ma być czytelny, semantyczny, responsywny i możliwy do dalszej pracy. Obsłuż zasoby, odnośniki między stronami i style. Eksport to rzeczywisty plik lub paczka, nie toast „wyeksportowano”.

## 11. Współpraca z developerem i Git

Git docelowo przechowuje trwałe punkty kontrolne, kierunki i wymianę zmian. Historia bieżących operacji edytora nie musi oznaczać commita po każdym geście. Zapis, commit, tag i push to różne operacje.

Zaznaczenie na płótnie powinno umożliwiać przejście do odpowiadającego źródła. Komentarz ma stabilny identyfikator i wskazuje element lub konkretne wystąpienie komponentu. Docelowo może być reprezentowany w źródle przy elemencie i synchronizowany z repozytorium; repozytorium jest trwałym źródłem takich uwag, a indeks aplikacji jest odbudowywalny. Wewnętrzne komentarze nie trafiają do publicznego eksportu.

Nie obiecuj pełnego round-trip dowolnego ręcznie zmienionego HTML/JS. Określ obsługiwany kontrakt. Rozpoznawalne zmiany mogą wrócić do modelu. Nieobsługiwane wymagają uzgodnienia albo oznaczenia fragmentu jako zarządzanego w kodzie; nie wolno ich po cichu usuwać lub pozornie importować.

Pierwsza realizacja ma mieć architekturę umożliwiającą takie rozszerzenie oraz sensowny podgląd kodu. Rzeczywiste OAuth, push i import zmian implementuj tylko przy dostępnej konfiguracji backendu. Bez niej pokaż „Wymaga konfiguracji”, zamiast atrap logowania i commitów.

## 12. Podgląd na urządzeniach i prawdziwe integracje

Docelowo „Otwórz na urządzeniu” daje QR i krótki adres do bieżącej roboczej wersji, z możliwością zamrożenia snapshotu i odwołania dostępu. To odczyt, bez uprawnień edycji. Link musi być dostępny dla zewnętrznego urządzenia. QR do localhost albo lokalnego blob URL NIE jest takim rozwiązaniem.

Jeśli środowisko nie zapewnia współdzielonego backendu i publicznego adresu, zapewnij działający lokalny podgląd oraz jawny stan „Podgląd między urządzeniami wymaga połączenia”. Nie pokazuj pozornego sukcesu. Analogicznie obsłuż domenę, hosting, formularze i udostępnianie klientowi. Wyraźnie odróżniaj funkcję lokalną, demonstracyjną, nieskonfigurowaną i faktycznie połączoną.

Warstwy integracji: AIProvider, PreviewProvider, PublishingProvider, RepositoryProvider, FormDeliveryProvider. Kontrakty powinny umożliwiać zmianę dostawcy, bez wiązania całego edytora z jednym API. Nie zgaduj istnienia API Manusa ani nie twórz zmyślonych endpointów. Jeżeli dostępny jest rzeczywisty model w środowisku, użyj go zgodnie z dostępną konfiguracją i zabezpieczeniami.

Do testowania bez usług zewnętrznych dostarcz jawnie oznaczony projekt demonstracyjny i deterministyczny adapter demonstracyjny, który FAKTYCZNIE wykonuje kilka opisanych operacji na dokumencie. Nie przedstawiaj prostego parsera poleceń jako pełnego AI. Nie uruchamiaj prawdziwej publikacji ani push do cudzego repozytorium jako części testu aplikacji.

## 13. Projekt demonstracyjny

Przygotuj atrakcyjną, wielostronicową stronę fikcyjnej pracowni ceramicznej „Pracownia Splot”: Start, Warsztaty, O pracowni, Kontakt. Wszystkie informacje demonstracyjne oznacz na poziomie projektu. Użyj dobrych zdjęć dostępnych zgodnie z możliwościami środowiska, z fallbackiem przy braku zasobu. Nie zastępuj wszystkich zdjęć gradientowymi prostokątami.

Trzy kierunki: Materia — wyrazista typografia i bliskie kadry; Pracownia — ludzie, proces, zaproszenie na warsztaty; Rytm — odważniejsza kompozycja wystawowa z kolorem. Muszą różnić się strukturą i decyzjami wizualnymi. Zapewnij osobne style demonstracyjnej strony i samej Nodery.

Zaprojektuj demo tak, aby można było rzeczywiście: wyeksponować warsztaty, cofnąć zmianę, wymienić logo, zmienić tekst, wykonać korektę o 1 px, zmienić wspólny kolor przycisków na wszystkich podstronach, utworzyć nadpisanie dla małych ekranów i zachować alternatywny kierunek.

## 14. Kolejność realizacji i kryteria ukończenia

Pracuj etapami wewnątrz tego jednego zlecenia. Najpierw pionowy, działający przebieg od briefu do edycji i zachowanego podglądu. Następnie precyzja, responsywność i kierunki. Potem źródło, eksport i połączenia usługowe dostępne w środowisku. Nie próbuj zastąpić działającego rdzenia wieloma pustymi ekranami.

Priorytet P0 — musi działać lokalnie:
• Nawigacja projektu, wybór kierunku i podstron.
• Edycja rzeczywistego dokumentu: tekst, obraz, token koloru, rozmiar i położenie z bezpiecznym zaznaczaniem.
• Widoczny kontekst poleceń, działające przykłady zmian przez adapter demonstracyjny lub realny model.
• Undo/redo, zapis po odświeżeniu, kierunek jako niezależna kopia, powrót do niego.
• Niezależne ustawienia viewportu i zakresu edycji oraz realne nadpisanie responsywne.
• Podgląd bez edytora, snapshot propozycji niewrażliwy na późniejsze zmiany, eksport/import projektu.

P1 — implementuj po działającym P0: porównanie kierunków i przenoszenie wybranych cech z ochroną późniejszych zmian, prześwietlenie i skupienie, przejście do kodu, użyteczny eksport HTML/CSS i zasobów, proste komentarze przypięte do ID, przegląd przed publikacją. Jeśli brak czasu lub możliwości, pokaż ograniczenie precyzyjnie; nie dawaj aktywnych atrap.

Integracje produkcyjne wymagające infrastruktury mogą pozostać nieskonfigurowane, ale muszą mieć czytelne kontrakty, stany i instrukcję uruchomienia. Nie wolno uznać lokalnego snapshotu za publiczne udostępnienie ani zapisu w IndexedDB za commit Git.

Zweryfikuj co najmniej:
1. Zmiana stylu przycisków aktualizuje wszystkie korzystające z tokenu strony i cofa się jedną operacją.
2. Poprawka mobile nie zmienia desktopu; przełączenie viewportu samo nie zmienia zakresu edycji.
3. Zwykła eksploracja nie przesuwa niczego, a skróty nie psują pisania w polach.
4. Undo/redo i odświeżenie odtwarzają właściwe dane, bez utraty materiałów.
5. Zmiana kierunku B nie modyfikuje A; zachowany snapshot propozycji pozostaje stały.
6. Spóźniony wynik AI nie nadpisuje późniejszej edycji użytkownika.
7. Widok podglądu i eksport odzwierciedlają faktycznie edytowany dokument.
8. Brak konfiguracji usług daje uczciwy komunikat, bez fałszywego sukcesu i wycieku sekretów.

Użyj dostępnych testów automatycznych tam, gdzie sprawdzają historię, zakresy, izolację wersji i operacje modelu. Sprawdź wizualnie główne ekrany w dostępnym środowisku, usuń błędy konsoli, sprawdź klawiaturę i podstawową dostępność. Nie deklaruj sprawdzeń, których nie wykonałeś.

## 15. Rezultat

Dostarcz uruchamialną aplikację z uporządkowaną strukturą kodu, dopracowanym demo i krótką dokumentacją: uruchomienie, skróty, model danych, faktycznie działające funkcje, ograniczenia i konfiguracja usług. Krótko podsumuj wykonane sprawdzenia.

Najważniejszy sprawdzian: Ania może samodzielnie przejść od notatek z wywiadu do przekonującej propozycji; designer może precyzyjnie poprawić detal bez przypadkowego naruszenia układu; developer rozumie strukturę rezultatu. Przy każdej decyzji wracaj do zasady:

**Miękko prowadzić. Precyzyjnie reagować. Dawać swobodę i poczucie kontroli.**
