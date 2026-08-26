type TripDay = {
  date: string;
  title: string;
  place: string;
  items: string[];
  alert?: string;
  travelPlan?: Array<{ time: string; step: string }>;
  coolFacts?: Array<{ name: string; detail: string }>;
};

type InfoCard = {
  title: string;
  items: Array<{ label: string; value: string }>;
};

const tripDays: TripDay[] = [
  {
    date: 'Thu Sep 3',
    title: 'LAX pre-flight hotel',
    place: 'Los Angeles',
    items: [
      'Hilton Los Angeles Airport, 5711 West Century Blvd, Los Angeles, CA 90045.',
      'Check-in 4:00 PM-midnight. Check-out Friday 12:00 PM.',
      'Confirmation / itinerary H18460523. Reservation under Robbie Kreinces.',
      'Pack passports, converters, chargers, medications, tickets, and backup cards.',
    ],
  },
  {
    date: 'Fri Sep 4',
    title: 'Fly LAX to Milan',
    place: 'LAX / BOS / MXP',
    items: [
      'JetBlue B6 288 departs LAX 8:10 AM, arrives BOS 4:52 PM. Seats Robbie 9D, Dave 9E.',
      'Boston layover is 1 hr 19 min.',
      'JetBlue B6 331 departs BOS 6:11 PM, arrives MXP Saturday 8:10 AM. Seats Robbie 13E, Dave 13F.',
      'eTickets: Robbie 2792114694667, Dave 2792114694668.',
    ],
  },
  {
    date: 'Sat Sep 5',
    title: 'Arrive Milan',
    place: 'Brera, Milan',
    items: [
      "Milan Royal Suites - Brera, 20 Via dell'Orso, Milan, MI 20121.",
      'Expedia itinerary 73483130130493. Confirmation OK_ERICSOFT.',
      'Check-in from 3:00 PM to 10:00 PM. No front desk.',
      'Dinner confirmed 6:30 PM: Locanda Alla Scala, Via dell Orso 1, phone 02 8693273.',
    ],
    alert: 'Contact Milan property at least 24 hours before arrival; passport copy and lockbox instructions may be required.',
  },
  {
    date: 'Sun Sep 6',
    title: 'Italian F1 Grand Prix',
    place: 'Monza',
    items: [
      'Target: arrive at Gate D - Lesmo by 10:00 AM.',
      'Viewing plan: Lesmo area first; Curva Grande as backup.',
      'Order/event number 8647147014.',
      'Drivers parade 1:00 PM. National anthem 2:44 PM. Grand Prix 3:00-5:00 PM.',
      'Monza corner-name explainer: https://www.mercedesamgf1.com/news/explained-how-the-monza-corners-got-their-names',
      'Bring sunscreen, hat, charger, water bottle, comfortable shoes, and light seat pad or towel.',
    ],
    travelPlan: [
      { time: '7:35 AM', step: "Leave Milan Royal Suites - Brera, 20 Via dell'Orso. Walk to Lanza M2 or take a short taxi to Milano Porta Garibaldi if you want less walking." },
      { time: '8:00 AM', step: 'Be inside Milano Porta Garibaldi with tickets ready. Use the race-day train to Biassono-Lesmo if available; Gate D is the Lesmo-side gate and Biassono-Lesmo is the useful station for it.' },
      { time: '8:17 AM', step: 'Conservative target train: regular S7 toward Lecco from Milano Porta Garibaldi to Biassono-Lesmo. Published normal pattern is about 32 minutes, with regular departures around 17 minutes past the hour.' },
      { time: '8:40-8:50 AM', step: 'If race-day special trains are posted, take the first direct/special Porta Garibaldi to Biassono-Lesmo train instead. Monza official info says special trains run on Sunday Sep 6 subject to availability; GP travel guides describe a faster roughly 23-minute express service.' },
      { time: '8:50-9:00 AM', step: 'Arrive Biassono-Lesmo. Do not default to the Black Shuttle from Monza FS for Gate D; that shuttle is mainly for Gate G and Parabolica.' },
      { time: '9:00-9:35 AM', step: 'Walk from Biassono-Lesmo toward Gate D / Lesmo. Allow 20-30 minutes plus crowd flow. Follow event wayfinding for Ingresso D / Lesmo.' },
      { time: '9:35-10:00 AM', step: 'Security, ticket scan, water stop, and orientation inside the gate. Keep ticket, ID, phone battery, and sunscreen easy to reach.' },
      { time: 'Backup', step: 'If you miss the 8:17-ish option, take the next special train if available. Avoid relying on the 9:17 regular train if you truly need Gate D by 10:00; it likely reaches Biassono-Lesmo around 9:49 before the walk and entry queue.' },
      { time: 'Return', step: 'After the race, consider waiting for crowds to thin. Regular return pattern noted by GP travel guides is Biassono-Lesmo toward Milan around 9 minutes past the hour; verify live Trenord times that day.' },
    ],
    coolFacts: [
      { name: 'Prima Variante - Turns 1 and 2', detail: 'First chicane. It has kept the Prima Variante name since being added in 1972; older layout/name referenced the Rettifilo, meaning the straight stretch.' },
      { name: 'Biassono / Curva Grande - Turn 3', detail: 'Named for the nearby village of Biassono. Fans also call it Curva Grande, the great curve, because it is the huge fast right-hander through the park.' },
      { name: 'Seconda Variante / Roggia - Turns 4 and 5', detail: 'Second chicane. The Roggia name comes from a nearby stream; it is also a common passing and first-lap trouble spot.' },
      { name: 'Lesmo 1 and 2 - Turns 6 and 7', detail: 'Originally linked with the oaks in the surrounding forest, then renamed Lesmo in 1927. The exact origin is debated, with theories tied to the Laetissimus family or Lesbos.' },
      { name: 'Serraglio', detail: 'A gentle left flick that is not usually counted as a numbered F1 corner. It is named after a royal hunting lodge that once stood in the forest.' },
      { name: 'Variante Ascari - Turns 8, 9 and 10', detail: 'Named for Italian racing legend Alberto Ascari after his fatal 1955 Monza accident. Earlier names included Plane Tree Curve and Avenue Curve.' },
      { name: 'Parabolica / Curva Alboreto - Turn 11', detail: 'The sweeping final right-hander. Officially renamed Curva Alboreto in 2021 for Michele Alboreto; older Parabolica history includes the porphyry stones used in construction.' },
      { name: 'Rettilineo Box', detail: 'The pit straight. Literally the straight by the pits, which is unusually honest as corner names go.' },
    ],
  },
  {
    date: 'Mon Sep 7',
    title: 'Fly Milan to Sardinia',
    place: 'MXP / Cagliari / Villasimius',
    items: [
      'easyJet U23567, MXP to CAG, departs 10:30 AM and arrives 12:05 PM.',
      'Booking.com reference 40-1017969355, PIN 5702, flight reference KCVVW1T.',
      'Seats 7E and 7F. Baggage: 2 personal items and 4 checked bags max 50.7 lb.',
      'City Airport Taxis reservation DS665554591, receipt 1090-5403, paid EUR 112.50 / USD 132.28.',
      'Driver meets in arrivals with lead passenger sign. WhatsApp emergency +39 3292243464. Backup +44 20 3062 9502.',
    ],
    alert: 'Milan checkout says 11:00 AM, but the flight leaves MXP at 10:30 AM. Leave early and confirm key drop/check-out procedure.',
  },
  {
    date: 'Sep 7-11',
    title: 'Hotel Cala Caterina',
    place: 'Villasimius, Sardinia',
    items: [
      'Hotel Cala Caterina - Relaxing Escape, Via Lago Maggiore, 32, Villasimius, SU, 09049 Italy.',
      'Expedia confirmation 2495121451. Expedia itinerary 73483411763451.',
      'Check-in Monday 2:00 PM. Check-out Friday 10:30 AM.',
      'Open Sardinia days Tuesday, Wednesday, and Thursday.',
      'Hotel offers transfers for surcharge; contact property with arrival details before travel.',
    ],
    alert: 'Confirm September 11 transfer from Villasimius to Cagliari Airport.',
  },
  {
    date: 'Fri Sep 11',
    title: 'Fly Cagliari to Paris',
    place: 'CAG / ORY / Marais',
    items: [
      'Transavia France TO3891, CAG to ORY, departs 1:05 PM and arrives 3:20 PM.',
      'Booking.com reference 40-1027137424, PIN 6921, flight reference EGI4QA.',
      'Seats 4E and 4F. Baggage: 2 personal items and 2 checked bags max 44.1 lb.',
      'Paris Marais Arev, 9 Rue des Gravilliers, 75003 Paris. Phone +33 6 14 08 88 56.',
      'Booking.com confirmation 6846.096.372, PIN 4324. Check-in from 16:00.',
    ],
  },
  {
    date: 'Sat Sep 12',
    title: 'Paris day',
    place: 'Paris',
    items: [
      'Stay at Paris Marais Arev.',
      'Open Paris day.',
      'Public parking nearby, no reservation needed, EUR 35/day. WiFi free.',
    ],
  },
  {
    date: 'Sun Sep 13',
    title: 'Return to Los Angeles',
    place: 'CDG / JFK / LAX',
    items: [
      'CG Mobility pickup at Paris Marais Arev, 8:30 AM. Booking reference 877018133, booking ID 985457897.',
      'JetBlue confirmation AUDGIH.',
      'B6 1408 departs CDG 12:25 PM, arrives JFK 2:55 PM. Seats Robbie 16D, Dave 16E.',
      'JFK layover is 1 hr 30 min.',
      'B6 623 departs JFK 4:25 PM, arrives LAX 7:30 PM. Seats Robbie 10B, Dave 10C.',
      'Return eTickets: Robbie 2792115275369, Dave 2792115275370.',
    ],
    alert: 'Car document shows impossible 08:11 drop-off after 08:30 pickup. Treat as likely 09:11 and verify before travel.',
  },
];

const quickInfo: InfoCard[] = [
  {
    title: 'Travelers',
    items: [
      { label: 'Dave', value: 'David Robert Salter' },
      { label: 'Robbie', value: 'Robbie Julia Kreinces' },
      { label: 'Dave mobile', value: '+1 310-699-1274' },
    ],
  },
  {
    title: 'Key Flights',
    items: [
      { label: 'Outbound', value: 'JetBlue B6 288 LAX-BOS, B6 331 BOS-MXP' },
      { label: 'Sardinia', value: 'easyJet U23567 MXP-CAG' },
      { label: 'Paris', value: 'Transavia TO3891 CAG-ORY' },
      { label: 'Return', value: 'JetBlue B6 1408 CDG-JFK, B6 623 JFK-LAX' },
    ],
  },
  {
    title: 'Stays',
    items: [
      { label: 'Sep 3', value: 'Hilton Los Angeles Airport' },
      { label: 'Sep 5-7', value: 'Milan Royal Suites - Brera' },
      { label: 'Sep 7-11', value: 'Hotel Cala Caterina, Villasimius' },
      { label: 'Sep 11-13', value: 'Paris Marais Arev' },
    ],
  },
  {
    title: 'Emergency / Support',
    items: [
      { label: 'CAG taxi WhatsApp', value: '+39 3292243464' },
      { label: 'CAG taxi backup', value: '+44 20 3062 9502' },
      { label: 'Paris apartment', value: '+33 6 14 08 88 56' },
      { label: 'LAX hotel support', value: '+1-800-497-2175' },
    ],
  },
];

const openItems = [
  'Get or confirm Duomo tickets.',
  'Confirm Milan property contact details, passport-copy process, and lockbox instructions.',
  'Confirm transfer from Brera to MXP for the Sep 7 10:30 AM flight.',
  'Confirm easyJet and Transavia check-in / boarding passes.',
  'Send or confirm arrival details with Hotel Cala Caterina.',
  'Confirm Sep 11 transfer from Villasimius to Cagliari Airport.',
  'Confirm Paris Marais Arev arrival instructions and early checkout / key return.',
  'Verify Paris-to-CDG car pickup/drop-off timing.',
  'Add travel reminders for packing, check-ins, flights, transfers, and race day.',
];

export const dynamic = 'force-static';

function renderTripItem(item: string) {
  const monzaUrl = 'https://www.mercedesamgf1.com/news/explained-how-the-monza-corners-got-their-names';
  if (item.includes(monzaUrl)) {
    return (
      <>
        Monza corner-name explainer:{' '}
        <a href={monzaUrl} target="_blank" rel="noreferrer">Mercedes-AMG F1 guide</a>
      </>
    );
  }
  return item;
}

export default function SardiniaPage() {
  return (
    <main className="reference-dashboard sardinia-page">
      <section className="reference-header sardinia-header">
        <div className="reference-header-top">
          <div>
            <div className="reference-title-pill">Sardinia Trip</div>
            <h1 className="sardinia-page-title">Sep 3-13, 2026</h1>
          </div>
          <div className="reference-metrics">
            <div className="reference-metric"><strong>11</strong><span>Days</span></div>
            <div className="reference-metric"><strong>6</strong><span>Flights</span></div>
            <div className="reference-metric"><strong>4</strong><span>Stays</span></div>
            <div className="reference-metric"><strong>2</strong><span>Travelers</span></div>
          </div>
        </div>
      </section>

      <section className="sardinia-grid">
        <div className="sardinia-timeline">
          {tripDays.map((day) => (
            <article className="sardinia-day" key={`${day.date}-${day.title}`}>
              <div className="sardinia-day-date">{day.date}</div>
              <div className="sardinia-day-body">
                <div className="sardinia-day-heading">
                  <h2>{day.title}</h2>
                  <span>{day.place}</span>
                </div>
                {day.alert ? <p className="sardinia-alert">{day.alert}</p> : null}
                <ul>
                  {day.items.map((item) => <li key={item}>{renderTripItem(item)}</li>)}
                </ul>
                {day.travelPlan ? (
                  <section className="sardinia-race-plan">
                    <h3>Gate D Arrival Plan</h3>
                    <div className="sardinia-step-list">
                      {day.travelPlan.map((step) => (
                        <div className="sardinia-step" key={`${step.time}-${step.step}`}>
                          <strong>{step.time}</strong>
                          <span>{step.step}</span>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
                {day.coolFacts ? (
                  <section className="sardinia-cool-facts">
                    <h3>Monza Cool Facts</h3>
                    <div className="sardinia-fact-grid">
                      {day.coolFacts.map((fact) => (
                        <article className="sardinia-fact" key={fact.name}>
                          <h4>{fact.name}</h4>
                          <p>{fact.detail}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </article>
          ))}
        </div>

        <aside className="sardinia-side-panel">
          {quickInfo.map((card) => (
            <section className="sardinia-info-card" key={card.title}>
              <h2>{card.title}</h2>
              <dl>
                {card.items.map((item) => (
                  <div key={`${card.title}-${item.label}`}>
                    <dt>{item.label}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <section className="sardinia-info-card sardinia-open-items">
            <h2>Before Travel</h2>
            <ul>
              {openItems.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </section>
        </aside>
      </section>
    </main>
  );
}
