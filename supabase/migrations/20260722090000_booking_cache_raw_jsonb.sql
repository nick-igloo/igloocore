/*
  # SoT addendum: full-row storage on the booking cache

  Booking Processor / Report Splitter consume every column of the Avantio
  export, not just the reconciliation projection. The cache therefore
  carries the complete source row as jsonb, making the SoT lossless:
  any consumer needing any column reads it from here.
*/
alter table property_bookings_cache add column if not exists raw jsonb;
