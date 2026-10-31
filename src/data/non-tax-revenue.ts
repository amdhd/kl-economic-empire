// Federal non-tax revenue estimated for 2027, RM, from MOF "Summary of Federal Government Revenue Estimates"
// (Fiscal Outlook 2027, pp. 234-237, revenue codes 71000-78000). Investment returns (code 75000, RM46.7bn) are excluded: the
// SOE dividend model already pays those, and the rest stays in "other public receipts". Display shares only; no new real-world claims.
export const NON_TAX_REVENUE_2027: { id: string; label: string; annual: number }[] = [
  { id: 'vehicles', label: 'Vehicle fees', annual: 4_515_036_000 },
  { id: 'individual', label: 'Individual registration fees', annual: 4_620_899_000 },
  { id: 'business', label: 'Business fees', annual: 7_679_263_000 },
  { id: 'licences', label: 'Other licences & permits', annual: 413_537_000 + 14_000 },
  { id: 'service', label: 'Service fees', annual: 2_814_123_000 },
  { id: 'fines', label: 'Fines & penalties', annual: 3_193_296_000 },
  { id: 'mtja', label: 'Malaysia–Thailand joint oil & gas area', annual: 1_473_400_000 },
  { id: 'assets', label: 'Rentals, sales & local contributions', annual: 303_787_000 + 741_701_000 + 136_920_000 },
];
export const NON_TAX_ANNUAL_2027 = NON_TAX_REVENUE_2027.reduce((a, r) => a + r.annual, 0);
