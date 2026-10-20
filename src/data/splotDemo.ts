import { ProjectState, DirectionOption, PageDocument, NodeElement, DesignTokens } from '../types/document';

// Curated high-quality ceramics photography from Unsplash
export const CERAMIC_IMAGES = {
  heroMateria: 'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?auto=format&fit=crop&w=1400&q=80',
  heroPracownia: 'https://images.unsplash.com/photo-1578749556568-bc2c40e68b61?auto=format&fit=crop&w=1400&q=80',
  heroRytm: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=1400&q=80',
  workshopWheel: 'https://images.unsplash.com/photo-1590682680695-43b964a3ae17?auto=format&fit=crop&w=800&q=80',
  craftProcess: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80',
  bowlsTexture: 'https://images.unsplash.com/photo-1615486511484-92e172cc4fe0?auto=format&fit=crop&w=800&q=80',
  vaseMinimal: 'https://images.unsplash.com/photo-1581783342308-f792dbdd27c5?auto=format&fit=crop&w=800&q=80',
  kilnFiring: 'https://images.unsplash.com/photo-1569974498991-d3c12a554f95?auto=format&fit=crop&w=800&q=80',
  founders: 'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=800&q=80',
  studioInterior: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80',
};

export const DEFAULT_TOKENS: DesignTokens = {
  primaryColor: '#292824',
  accentCopper: '#A86645',
  surfaceColor: '#FFFEFB',
  textColor: '#292824',
  fontFamily: 'serif',
  buttonRadius: '8px',
  buttonVariant: 'fill'
};

// ==========================================
// DIRECTION 1: MATERIA (Surowość, faktura, mocny detal)
// ==========================================
const createMateriaPages = (): Record<string, PageDocument> => {
  return {
    start: {
      id: 'page-materia-start',
      name: 'Strona główna',
      slug: 'start',
      title: 'Pracownia Splot — Autorska ceramika użytkowa',
      description: 'Ręcznie toczona ceramika z kamionki i dzikiej gliny znad Wisły.',
      root: {
        id: 'sec-root-start',
        name: 'Strona Główna',
        tag: 'div',
        type: 'container',
        styles: { backgroundColor: '#F6F4EF', color: '#292824', display: 'flex', flexDirection: 'column' },
        children: [
          // Nav
          {
            id: 'materia-nav',
            name: 'Pasek nawigacji',
            tag: 'header',
            type: 'nav',
            styles: { padding: '24px 48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #DED9CF' },
            children: [
              {
                id: 'materia-logo',
                name: 'Logo Splot',
                tag: 'span',
                type: 'text',
                content: 'SPLOT · CERAMIKA',
                styles: { fontSize: '18px', fontWeight: '700', letterSpacing: '0.12em' }
              },
              {
                id: 'materia-menu',
                name: 'Menu główne',
                tag: 'nav',
                type: 'container',
                styles: { display: 'flex', gap: '32px', fontSize: '14px', fontWeight: '500' },
                children: [
                  { id: 'nav-item-1', name: 'Link Start', tag: 'a', type: 'text', content: 'Kolekcje', href: '#kolekcje', styles: { color: '#292824' } },
                  { id: 'nav-item-2', name: 'Link Warsztaty', tag: 'a', type: 'text', content: 'Warsztaty', href: '/warsztaty', styles: { color: '#292824' } },
                  { id: 'nav-item-3', name: 'Link Pracownia', tag: 'a', type: 'text', content: 'O pracowni', href: '/o-pracowni', styles: { color: '#292824' } },
                  { id: 'nav-item-4', name: 'Link Kontakt', tag: 'a', type: 'text', content: 'Kontakt', href: '/kontakt', styles: { color: '#A86645' } }
                ]
              }
            ]
          },
          // Hero
          {
            id: 'materia-hero-section',
            name: 'Sekcja Główna Hero',
            tag: 'section',
            type: 'section',
            styles: { padding: '80px 48px', display: 'flex', flexDirection: 'column', gap: '32px', maxWidth: '1200px', margin: '0 auto', width: '100%' },
            children: [
              {
                id: 'materia-hero-kicker',
                name: 'Kicker nad nagłówkiem',
                tag: 'span',
                type: 'badge',
                content: 'KAZIMIERZ DOLNY · OD 2021',
                styles: { fontSize: '12px', fontWeight: '600', letterSpacing: '0.15em', color: '#A86645' }
              },
              {
                id: 'materia-hero-heading',
                name: 'Główny nagłówek',
                tag: 'h1',
                type: 'heading',
                content: 'Przedmioty zrodzone z cierpliwości, wody i ognia.',
                styles: { fontSize: '56px', fontWeight: '600', lineHeight: '1.1', maxWidth: '850px' },
                responsiveOverrides: {
                  mobile: { fontSize: '36px', lineHeight: '1.2' }
                }
              },
              {
                id: 'materia-hero-lead',
                name: 'Tekst wprowadzający',
                tag: 'p',
                type: 'text',
                content: 'Tworzymy naczynia użytkowe o wyrazistej, chropowatej fakturze. Każdy kubek, miska i wazon zachowują ślad dłoni i niepowtarzalny rysunek pieca.',
                styles: { fontSize: '18px', color: '#706C65', maxWidth: '620px', lineHeight: '1.6' }
              },
              {
                id: 'materia-hero-cta-group',
                name: 'Grupa przycisków CTA',
                tag: 'div',
                type: 'container',
                styles: { display: 'flex', gap: '16px', alignItems: 'center', marginTop: '12px' },
                children: [
                  {
                    id: 'materia-hero-cta-primary',
                    name: 'Główny przycisk CTA',
                    tag: 'button',
                    type: 'button',
                    content: 'Zobacz kolekcje naczyń',
                    tokenRef: 'buttonPrimary',
                    styles: {
                      padding: '14px 28px',
                      backgroundColor: '#A86645',
                      color: '#FFFFFF',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '14px'
                    }
                  },
                  {
                    id: 'materia-hero-cta-secondary',
                    name: 'Drugi przycisk CTA',
                    tag: 'button',
                    type: 'button',
                    content: 'Zapisz się na warsztaty',
                    styles: {
                      padding: '14px 28px',
                      backgroundColor: 'transparent',
                      color: '#292824',
                      borderWidth: '1px',
                      borderColor: '#DED9CF',
                      borderRadius: '8px',
                      fontWeight: '600',
                      fontSize: '14px'
                    }
                  }
                ]
              },
              {
                id: 'materia-hero-image',
                name: 'Zdjęcie Hero Naczynia',
                tag: 'img',
                type: 'image',
                src: CERAMIC_IMAGES.heroMateria,
                alt: 'Ręcznie toczone misy ceramiczne o piaskowej fakturze',
                styles: { width: '100%', height: '520px', borderRadius: '12px', objectFit: 'cover', marginTop: '24px' }
              }
            ]
          },
          // Sekcja Warsztaty
          {
            id: 'materia-workshops-section',
            name: 'Sekcja Warsztatowa',
            tag: 'section',
            type: 'section',
            styles: { padding: '80px 48px', backgroundColor: '#FFFEFB', borderTop: '1px solid #DED9CF', borderBottom: '1px solid #DED9CF' },
            children: [
              {
                id: 'materia-workshops-container',
                name: 'Kontener Warsztaty',
                tag: 'div',
                type: 'container',
                styles: { maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' },
                children: [
                  {
                    id: 'materia-workshops-title',
                    name: 'Nagłówek Warsztaty',
                    tag: 'h2',
                    type: 'heading',
                    content: 'Spotkajmy się przy kole garncarskim.',
                    styles: { fontSize: '38px', fontWeight: '600', lineHeight: '1.2' }
                  },
                  {
                    id: 'materia-workshops-desc',
                    name: 'Opis warsztatów',
                    tag: 'p',
                    type: 'text',
                    content: 'Kameralne zjazdy weekendowe dla maksymalnie 6 osób. Uczymy cierpliwości do gliny, centrowania bryły i wypału w żywym ogniu.',
                    styles: { fontSize: '16px', color: '#706C65', maxWidth: '650px', lineHeight: '1.6' }
                  },
                  {
                    id: 'materia-workshops-grid',
                    name: 'Karty warsztatów',
                    tag: 'div',
                    type: 'grid',
                    styles: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '24px' },
                    children: [
                      {
                        id: 'materia-card-w1',
                        name: 'Karta Toczenie I',
                        tag: 'div',
                        type: 'card',
                        styles: { padding: '32px', backgroundColor: '#F6F4EF', borderRadius: '12px', border: '1px solid #DED9CF' },
                        children: [
                          { id: 'w1-tag', name: 'Etykieta poziomu', tag: 'span', type: 'badge', content: 'POZIOM POCZĄTKUJĄCY · 2 DNI', styles: { fontSize: '11px', fontWeight: '700', color: '#A86645', letterSpacing: '0.08em' } },
                          { id: 'w1-title', name: 'Tytuł kursu', tag: 'h3', type: 'heading', content: 'Podstawy toczenia na kole', styles: { fontSize: '22px', fontWeight: '600', margin: '12px 0 8px 0' } },
                          { id: 'w1-p', name: 'Opis kursu', tag: 'p', type: 'text', content: 'Nauka pracy z kołem elektrycznym, formowanie pierwszych czarek i kubków oraz podstawy szkliwienia popiołowego.', styles: { fontSize: '14px', color: '#706C65', lineHeight: '1.5' } },
                          { id: 'w1-price', name: 'Cena kursu', tag: 'span', type: 'text', content: '850 zł / osoba (materiały i 2 wypały w cenie)', styles: { fontSize: '13px', fontWeight: '600', color: '#292824', marginTop: '16px', display: 'block' } }
                        ]
                      },
                      {
                        id: 'materia-card-w2',
                        name: 'Karta Ceramika Stołowa',
                        tag: 'div',
                        type: 'card',
                        styles: { padding: '32px', backgroundColor: '#F6F4EF', borderRadius: '12px', border: '1px solid #DED9CF' },
                        children: [
                          { id: 'w2-tag', name: 'Etykieta poziomu', tag: 'span', type: 'badge', content: 'DLA KAŻDEGO · 1 DZIEŃ', styles: { fontSize: '11px', fontWeight: '700', color: '#A86645', letterSpacing: '0.08em' } },
                          { id: 'w2-title', name: 'Tytuł kursu', tag: 'h3', type: 'heading', content: 'Formowanie z płata i wałków', styles: { fontSize: '22px', fontWeight: '600', margin: '12px 0 8px 0' } },
                          { id: 'w2-p', name: 'Opis kursu', tag: 'p', type: 'text', content: 'Rzeźbienie talerzy obiadowych, pater i wazonów organicznych bez użycia koła. Swobodne techniki ręczne.', styles: { fontSize: '14px', color: '#706C65', lineHeight: '1.5' } },
                          { id: 'w2-price', name: 'Cena kursu', tag: 'span', type: 'text', content: '480 zł / osoba (wypał w cenie)', styles: { fontSize: '13px', fontWeight: '600', color: '#292824', marginTop: '16px', display: 'block' } }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          // Footer
          {
            id: 'materia-footer',
            name: 'Stopka strony',
            tag: 'footer',
            type: 'container',
            styles: { padding: '48px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #DED9CF', fontSize: '13px', color: '#706C65' },
            children: [
              { id: 'f-copy', name: 'Prawa autorskie', tag: 'p', type: 'text', content: '© 2026 Pracownia Splot. Kazimierz Dolny.', styles: {} },
              { id: 'f-contact-link', name: 'Link kontaktowy', tag: 'a', type: 'text', content: 'kontakt@pracowniasplot.pl', href: 'mailto:kontakt@pracowniasplot.pl', styles: { color: '#A86645' } }
            ]
          }
        ]
      }
    },
    warsztaty: {
      id: 'page-materia-warsztaty',
      name: 'Warsztaty',
      slug: 'warsztaty',
      title: 'Warsztaty ceramiczne — Pracownia Splot',
      description: 'Zjazdy weekendowe z toczenia na kole i wypału w Kazimierzu Dolnym.',
      root: {
        id: 'sec-root-workshops',
        name: 'Podstrona Warsztaty',
        tag: 'div',
        type: 'container',
        styles: { backgroundColor: '#F6F4EF', color: '#292824', display: 'flex', flexDirection: 'column' },
        children: [
          {
            id: 'ws-header',
            name: 'Nagłówek Warsztatów',
            tag: 'section',
            type: 'section',
            styles: { padding: '80px 48px 40px 48px', maxWidth: '1000px', margin: '0 auto', textAlign: 'center' },
            children: [
              { id: 'ws-h-kicker', name: 'Kicker', tag: 'span', type: 'badge', content: 'EDUKACJA RZEMIEŚLNICZA', styles: { fontSize: '12px', fontWeight: '600', color: '#A86645', letterSpacing: '0.12em' } },
              { id: 'ws-h-title', name: 'Tytuł warsztatów', tag: 'h1', type: 'heading', content: 'Zwolnij tempo. Poczuj dotyk surowej gliny.', styles: { fontSize: '48px', fontWeight: '600', marginTop: '16px' } },
              { id: 'ws-h-p', name: 'Opis', tag: 'p', type: 'text', content: 'W każdy weekend otwieramy pracownię dla osób szukających skupienia i kontaktu z tradycyjnym rzemiosłem. Oferujemy pełne stanowiska z kołami garncarskimi Shimpo.', styles: { fontSize: '17px', color: '#706C65', marginTop: '16px', lineHeight: '1.6' } }
            ]
          },
          {
            id: 'ws-img-banner',
            name: 'Zdjęcie z warsztatu',
            tag: 'img',
            type: 'image',
            src: CERAMIC_IMAGES.workshopWheel,
            alt: 'Uczestnik warsztatów formujący naczynie na kole garncarskim',
            styles: { width: '90%', maxWidth: '1100px', height: '420px', borderRadius: '12px', margin: '0 auto', objectFit: 'cover' }
          }
        ]
      }
    },
    'o-pracowni': {
      id: 'page-materia-about',
      name: 'O pracowni',
      slug: 'o-pracowni',
      title: 'O pracowni Splot — Magda i Piotr',
      description: 'Poznaj historię naszej manufaktury w Kazimierzu Dolnym.',
      root: {
        id: 'sec-root-about',
        name: 'Podstrona O pracowni',
        tag: 'div',
        type: 'container',
        styles: { backgroundColor: '#F6F4EF', color: '#292824', padding: '60px 48px' },
        children: [
          {
            id: 'about-title',
            name: 'Tytuł o nas',
            tag: 'h1',
            type: 'heading',
            content: 'Glina pamięta każdy gest.',
            styles: { fontSize: '44px', fontWeight: '600', marginBottom: '24px' }
          },
          {
            id: 'about-body',
            name: 'Tekst biograficzny',
            tag: 'p',
            type: 'text',
            content: 'Pracownię Splot założyliśmy w 2021 roku po latach pracy przy projektowaniu przemysłowym. Zapragnęliśmy wrócić do bezpośredniego materiału. Używamy gliny kamionkowej o wysokiej zawartości żelaza, wypalanej w temperaturze 1240°C.',
            styles: { fontSize: '18px', color: '#706C65', lineHeight: '1.7', maxWidth: '750px' }
          }
        ]
      }
    },
    kontakt: {
      id: 'page-materia-contact',
      name: 'Kontakt',
      slug: 'kontakt',
      title: 'Kontakt — Pracownia Splot',
      description: 'Odwiedź nas przy ul. Garncarskiej w Kazimierzu Dolnym.',
      root: {
        id: 'sec-root-contact',
        name: 'Podstrona Kontakt',
        tag: 'div',
        type: 'container',
        styles: { backgroundColor: '#F6F4EF', color: '#292824', padding: '60px 48px', maxWidth: '900px', margin: '0 auto' },
        children: [
          { id: 'ct-title', name: 'Nagłówek Kontakt', tag: 'h1', type: 'heading', content: 'Odwiedź naszą pracownię', styles: { fontSize: '40px', fontWeight: '600' } },
          { id: 'ct-addr', name: 'Adres', tag: 'p', type: 'text', content: 'ul. Garncarska 14, 24-120 Kazimierz Dolny\nOtwarte: czwartek – niedziela, 11:00 – 18:00', styles: { fontSize: '16px', color: '#706C65', marginTop: '16px', whiteSpace: 'pre-line' } },
          {
            id: 'ct-form',
            name: 'Formularz kontaktowy',
            tag: 'form',
            type: 'form',
            styles: { marginTop: '36px', display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '500px' },
            children: [
              { id: 'inp-name', name: 'Pole Imię', tag: 'input', type: 'input', content: '', styles: { padding: '12px 16px', borderRadius: '8px', border: '1px solid #DED9CF', backgroundColor: '#FFFEFB' } },
              { id: 'inp-msg', name: 'Pole Wiadomość', tag: 'textarea', type: 'textarea', content: '', styles: { padding: '12px 16px', borderRadius: '8px', border: '1px solid #DED9CF', backgroundColor: '#FFFEFB', minHeight: '120px' } },
              { id: 'btn-submit', name: 'Przycisk Wyślij', tag: 'button', type: 'button', content: 'Wyślij zapytanie', tokenRef: 'buttonPrimary', styles: { padding: '14px 24px', backgroundColor: '#A86645', color: '#FFFFFF', borderRadius: '8px', fontWeight: '600' } }
            ]
          }
        ]
      }
    }
  };
};

// ==========================================
// DIRECTION 2: PRACOWNIA (Ludzie, ciepło, proces, warsztaty w centrum)
// ==========================================
const createPracowniaPages = (): Record<string, PageDocument> => {
  const base = createMateriaPages();
  // Modify start page to place workshops and founders first
  base.start.root.children = [
    base.start.root.children![0], // Nav
    {
      id: 'pracownia-hero',
      name: 'Hero Pracownia i Ludzie',
      tag: 'section',
      type: 'section',
      styles: { padding: '80px 48px', display: 'flex', gap: '48px', alignItems: 'center', maxWidth: '1200px', margin: '0 auto' },
      children: [
        {
          id: 'pracownia-left',
          name: 'Tekst Hero',
          tag: 'div',
          type: 'container',
          styles: { flex: '1', display: 'flex', flexDirection: 'column', gap: '24px' },
          children: [
            { id: 'pr-tag', name: 'Kicker', tag: 'span', type: 'badge', content: 'OTWARTA MANUFAKTURA', styles: { color: '#A86645', fontWeight: '700', fontSize: '13px' } },
            { id: 'pr-h1', name: 'Nagłówek', tag: 'h1', type: 'heading', content: 'Miejsce, w którym glina łączy ludzi.', styles: { fontSize: '48px', fontWeight: '700', lineHeight: '1.15' } },
            { id: 'pr-p', name: 'Opis', tag: 'p', type: 'text', content: 'Kameralna pracownia ceramiczna w Kazimierzu Dolnym. Prowadzimy weekendowe kursy toczenia oraz tworzymy autorskie serie kubków, mis i naczyń do herbaty.', styles: { fontSize: '17px', color: '#706C65', lineHeight: '1.6' } },
            {
              id: 'pr-cta',
              name: 'Przycisk Rezerwacji',
              tag: 'button',
              type: 'button',
              content: 'Zarezerwuj miejsce na warsztatach',
              tokenRef: 'buttonPrimary',
              styles: { padding: '16px 32px', backgroundColor: '#A86645', color: '#FFFFFF', borderRadius: '8px', fontWeight: '600', alignSelf: 'flex-start' }
            }
          ]
        },
        {
          id: 'pracownia-right-img',
          name: 'Zdjęcie rzemieślników',
          tag: 'img',
          type: 'image',
          src: CERAMIC_IMAGES.heroPracownia,
          alt: 'Dłonie rzemieślnika przy kole garncarskim',
          styles: { flex: '1', height: '460px', borderRadius: '16px', objectFit: 'cover' }
        }
      ]
    },
    base.start.root.children![2], // Workshops section
    base.start.root.children![3]  // Footer
  ];
  return base;
};

// ==========================================
// DIRECTION 3: RYTM (Nowoczesna kompozycja, ekspozycja, kontrast)
// ==========================================
const createRytmPages = (): Record<string, PageDocument> => {
  const base = createMateriaPages();
  base.start.root.children![1].styles.backgroundColor = '#FFFFFF';
  base.start.root.children![1].children![1].content = 'Rytm ziemi i ognia. Ceramika architektoniczna.';
  return base;
};

export const INITIAL_SPLOT_DIRECTIONS: Record<string, DirectionOption> = {
  materia: {
    id: 'materia',
    name: 'Materia',
    subtitle: 'Wierna briefowi · Surowość i wyrazista faktura',
    concept: 'Czysta, rzeźbiarska ekspozycja ceramiki. Bliskie kadry wypalonej gliny, subtelna paleta i silny nacisk na organiczne naczynia.',
    typography: 'Szeryfowy nagłówek, spokojny bezszeryfowy tekst',
    atmosphere: 'Spokojna, organiczna, minimalistyczna',
    colorPalette: {
      primary: '#292824',
      copper: '#A86645',
      surface: '#FFFEFB',
      text: '#292824'
    },
    subpagesPlan: ['Start', 'Warsztaty', 'O pracowni', 'Kontakt'],
    pages: createMateriaPages()
  },
  pracownia: {
    id: 'pracownia',
    name: 'Pracownia',
    subtitle: 'Interpretująca · Ludzie, proces i warsztaty',
    concept: 'W centrum znajdują się twórcy, pracownia i zaproszenie do wspólnej pracy przy kole. Otwarty, ciepły charakter rzemieślniczej manufaktury.',
    typography: 'Ciepły grotesk z czytelnym rytmem',
    atmosphere: 'Gościnna, warsztatowa, rzemieślnicza',
    colorPalette: {
      primary: '#1F2923',
      copper: '#B8734D',
      surface: '#FAF7F2',
      text: '#262422'
    },
    subpagesPlan: ['Start', 'Warsztaty i zjazdy', 'O nas', 'Dojazd i kontakt'],
    pages: createPracowniaPages()
  },
  rytm: {
    id: 'rytm',
    name: 'Rytm',
    subtitle: 'Odkrywcza · Galeryjny kontrast i forma',
    concept: 'Odważniejsza, wystawowa kompozycja. Duże asymetryczne kadry, architektoniczna typografia i mocny kontrast miedzi z ciemnym grafitem.',
    typography: 'Geometryczny sans-serif o wyrazistych proporcjach',
    atmosphere: 'Galeryjna, nowoczesna, ekspozycyjna',
    colorPalette: {
      primary: '#141413',
      copper: '#9E5B3E',
      surface: '#FFFFFF',
      text: '#1C1B19'
    },
    subpagesPlan: ['Kolekcja główna', 'Terminy warsztatów', 'Manufaktura', 'Zamówienia'],
    pages: createRytmPages()
  }
};

export const INITIAL_SPLOT_PROJECT: ProjectState = {
  id: 'proj-splot-kazimierz',
  name: 'Pracownia Splot',
  client: 'Magda i Piotr Winiarscy',
  lastUpdated: 'Dzisiaj, 12:40',
  assumptions: [
    { id: 'a-1', category: 'cel', label: 'Główny cel', value: 'Prezentacja autorskiej ceramiki użytkowej oraz zapełnianie miejsc na weekendowe warsztaty toczenia na kole.' },
    { id: 'a-2', category: 'odbiorcy', label: 'Grupa odbiorców', value: 'Klienci szukający unikatowego rzemiosła do domu oraz dorośli szukający twórczego odpoczynku w Kazimierzu Dolnym.' },
    { id: 'a-3', category: 'charakter', label: 'Estetyka i nastrój', value: 'Spokojna, naturalna, wabi-sabi: ciepła złamana biel, surowa glina, oszczędna miedź.' },
    { id: 'a-4', category: 'materialy', label: 'Dostępne materiały', value: '14 zdjęć naczyń i pracowni, cennik warsztatów (850 zł / 480 zł), logo wektorowe.' },
    { id: 'a-5', category: 'braki', label: 'Brakujące informacje', value: 'Brak numeru konta do bezpośrednich przedpłat (ustalono formularz zapytania).' }
  ],
  activeDirectionId: 'materia',
  directions: INITIAL_SPLOT_DIRECTIONS,
  activePageSlug: 'start',
  tokens: DEFAULT_TOKENS,
  comments: [
    {
      id: 'comm-1',
      elementId: 'materia-hero-heading',
      elementName: 'Główny nagłówek Hero',
      author: 'Magda (Klientka)',
      text: 'Brzmi bardzo poetycko! Bardzo nam się podoba to sformułowanie.',
      createdAt: 'Wczoraj, 16:20',
      resolved: false
    }
  ],
  snapshots: [
    {
      id: 'snap-1',
      createdAt: 'Wczoraj, 18:00',
      title: 'Wersja do akceptacji v1',
      directionId: 'materia',
      directionName: 'Materia',
      commentsCount: 1,
      snapshotData: {
        pages: createMateriaPages(),
        tokens: DEFAULT_TOKENS
      }
    }
  ],
  isPublished: false,
  publishedUrl: undefined
};
