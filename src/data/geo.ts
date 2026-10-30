import type { GeoPoint } from '../types/game';

// Every point below was looked up in OpenStreetMap via Nominatim on 31 Oct 2026 and matched to the
// named OSM feature (id recorded per point). Coordinates are the feature centroid that Nominatim returned. See
// docs/data-sources.md. Companies without a verified KL point get no marker — never a guessed one.
const osm = (feature: string) => `OpenStreetMap ${feature} (Nominatim lookup, 2026-10-31)`;

export const GEO: Record<string, GeoPoint> = {
  maybank: { lng: 101.6994169, lat: 3.1474505, label: 'Menara Maybank, Jalan Tun Perak', locationType: 'hq', verificationSource: osm('way/784981167') },
  publicBank: { lng: 101.7075631, lat: 3.151198, label: 'Menara Public Bank 2, Jalan Raja Chulan', locationType: 'office', verificationSource: osm('way/1527532510') },
  tm: { lng: 101.6658065, lat: 3.1162649, label: 'Menara TM, Jalan Pantai Baharu', locationType: 'hq', verificationSource: osm('way/154443873') },
  axiata: { lng: 101.6845525, lat: 3.1336629, label: 'Axiata Tower, KL Sentral', locationType: 'hq', verificationSource: osm('way/467550544') },
  cimb: { lng: 101.6865881, lat: 3.1364636, label: 'CIMB Bank Building (Menara CIMB), KL Sentral', locationType: 'office', verificationSource: osm('way/590906078') },
  tnb: { lng: 101.6709251, lat: 3.1194589, label: 'Ibu Pejabat TNB, Jalan Panah, Bangsar', locationType: 'hq', verificationSource: osm('node/4895692113') },
  maxis: { lng: 101.7130419, lat: 3.1581548, label: 'Menara Maxis, KLCC', locationType: 'hq', verificationSource: osm('way/23034384') },
  genting: { lng: 101.7110028, lat: 3.1505748, label: 'Wisma Genting, Jalan Sultan Ismail', locationType: 'hq', verificationSource: osm('way/120770467') },
  ytl: { lng: 101.7154518, lat: 3.147892, label: 'Menara YTL, Jalan Bukit Bintang', locationType: 'office', verificationSource: osm('way/919590949') },
  ihh: { lng: 101.7213527, lat: 3.1490035, label: 'Prince Court Medical Centre (hospital)', locationType: 'asset', verificationSource: osm('way/324185283') },
  petronas: { lng: 101.7112048, lat: 3.1579679, label: 'PETRONAS Twin Towers, KLCC', locationType: 'hq', verificationSource: osm('way/279944536') },
  mrdiy: { lng: 101.7107681, lat: 3.1448698, label: 'MR.DIY store, Jalan Sultan Ismail', locationType: 'branch', verificationSource: osm('node/9371314483') },
  google: { lng: 101.6845525, lat: 3.1336629, label: 'Google office, Axiata Tower, KL Sentral', locationType: 'office', verificationSource: osm('way/467550544') },
  exxon: { lng: 101.7155782, lat: 3.1541416, label: 'Menara ExxonMobil, KLCC', locationType: 'office', verificationSource: osm('way/23034444') },
  tesla: { lng: 101.6627942, lat: 3.1481127, label: 'Tesla Experience Center, Damansara', locationType: 'branch', verificationSource: osm('node/12176202188') },
};

export interface District {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  bearing: number;
  blurb: string;
}

// Camera hotspots (district centres, not company locations).
export const DISTRICTS: District[] = [
  { id: 'klcc', name: 'KLCC', center: [101.7123, 3.1578], zoom: 16, bearing: -25, blurb: 'Twin Towers, Maxis, PETRONAS' },
  { id: 'bb', name: 'Bukit Bintang', center: [101.7128, 3.1475], zoom: 16, bearing: 20, blurb: 'Retail & tourism heart' },
  { id: 'trx', name: 'TRX', center: [101.7187, 3.1418], zoom: 16, bearing: -40, blurb: 'Tun Razak Exchange financial district' },
  { id: 'sentral', name: 'KL Sentral', center: [101.6862, 3.1338], zoom: 16.2, bearing: 35, blurb: 'Transit hub, Axiata Tower' },
  { id: 'bangsar', name: 'Bangsar', center: [101.6735, 3.1255], zoom: 15.4, bearing: 10, blurb: 'Bangsar South & Pantai' },
];
