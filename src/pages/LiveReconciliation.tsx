// Standalone route for the Live Reconciliation ledger.
// The tab is fully self-sufficient for monitoring (it loads everything it
// needs from Supabase); the Avantio booking sync still lives in the
// Booking Processor, so we pass an empty bookings list here.
import LiveReconciliationTab from './LiveReconciliationTab';

export default function LiveReconciliation() {
  return <LiveReconciliationTab bookings={[]} />;
}
