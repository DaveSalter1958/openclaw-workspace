type TripDay = {
  date: string;
  title: string;
  place: string;
  items: string[];
  alert?: string;
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
      'Leave Brera around 10:00 AM. Aim to arrive 11:00-11:30 AM.',
      'Viewing plan: Lesmo area first; Curva Grande as backup.',
      'Order/event number 8647147014.',
      'Drivers parade 1:00 PM. National anthem 2:44 PM. Grand Prix 3:00-5:00 PM.',
      'Bring sunscreen, hat, charger, water bottle, comfortable shoes, and light seat pad or towel.',
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
                  {day.items.map((item) => <li key={item}>{item}</li>)}
                </ul>
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
