// Unverified-pilot signup timeline → membership_deadline calculation.
// Day-counts live in one named config so they're tunable without touching
// the calculation logic itself.

export type CertTimelineBucket = "has_test_date" | "within_30_days" | "within_60_days" | "within_90_days" | "exploring";

export const CERT_TIMELINE_CONFIG: Record<CertTimelineBucket, { label: string; daysFromReference: number }> = {
  has_test_date: { label: "I have a test date", daysFromReference: 14 }, // from the test date, not signup
  within_30_days: { label: "Within 30 days", daysFromReference: 45 },
  within_60_days: { label: "Within 60 days", daysFromReference: 75 },
  within_90_days: { label: "Within 90 days", daysFromReference: 105 },
  exploring: { label: "Just exploring — no firm timeline", daysFromReference: 30 },
};

// Minimum runway from today even if a provided test date is in the past —
// keeps a garbage/past date from producing an already-elapsed deadline.
const MIN_DAYS_FROM_TODAY = 14;

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateOnlyString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function computeMembershipDeadline(
  bucket: CertTimelineBucket,
  signupDate: Date,
  testDate?: Date | null
): string {
  const config = CERT_TIMELINE_CONFIG[bucket];

  if (bucket === "has_test_date" && testDate) {
    const fromTestDate = addDays(testDate, config.daysFromReference);
    const floor = addDays(signupDate, MIN_DAYS_FROM_TODAY);
    return toDateOnlyString(fromTestDate > floor ? fromTestDate : floor);
  }

  return toDateOnlyString(addDays(signupDate, config.daysFromReference));
}
