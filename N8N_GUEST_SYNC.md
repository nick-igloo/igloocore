# n8n Guest & Booking Sync Guide

Both the Guest Ready tool and Property Safety Check tool read guest and departure dates from the Supabase table `property_bookings_cache`. To keep that table up to date, push bookings into it from n8n on a schedule. The project already exposes an Edge Function for this: `import-bookings`.

## 1. Endpoint details

- URL: `${SUPABASE_URL}/functions/v1/import-bookings`
- Method: `POST`
- Headers:
  - `Authorization: Bearer <SUPABASE_ANON_KEY>`
  - `Content-Type: application/json`
- Body shape:

```json
{
  "bookings": [
    {
      "property_name": "Igloo on the Royal Mile",
      "guest_name": "Jane Smith",
      "guest_email": "jane@example.com",
      "guest_phone": "+441312345678",
      "check_in": "2026-05-01",
      "check_out": "2026-05-04",
      "source": "airbnb",
      "external_id": "HMXYZ123"
    }
  ]
}
```

`property_name` must match an existing row in the `properties` table (case-insensitive). `check_in` and `check_out` must be ISO dates (`YYYY-MM-DD`).

## 2. Build the n8n workflow

Typical setup in n8n (one workflow per source):

1. **Trigger** - Cron node (every 15 min) or incoming webhook from Airbnb / Booking.com / Guesty / Hostfully.
2. **Source fetch** - HTTP Request node pulling the ICS / reservations API for each channel.
3. **Normalise** - Function / Set node that maps every reservation to the body shape above. Use these JavaScript helpers inside a Function node:

```javascript
return items.map((i) => {
  const r = i.json;
  return {
    json: {
      property_name: r.listing || r.property,
      guest_name: `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
      guest_email: r.email ?? '',
      guest_phone: r.phone ?? '',
      check_in: r.arrivalDate,
      check_out: r.departureDate,
      source: 'airbnb',
      external_id: r.reservationId,
    },
  };
});
```

4. **Aggregate** - Use the "Aggregate" node (mode: `All Item Data`, put output in field `bookings`) so every run posts one array.
5. **HTTP Request (send)**:
   - Method: `POST`
   - URL: `{{$env.SUPABASE_URL}}/functions/v1/import-bookings`
   - Authentication: Generic header
     - `Authorization`: `Bearer {{$env.SUPABASE_ANON_KEY}}`
   - Body Content Type: `JSON`
   - Body:
     ```
     { "bookings": {{ $json.bookings }} }
     ```

Store `SUPABASE_URL` and `SUPABASE_ANON_KEY` as n8n credentials / environment variables so they do not appear in the workflow JSON.

## 3. Verify

After the workflow runs, open the Supabase SQL editor and run:

```sql
select property_name, guest_name, check_in, check_out, source
from property_bookings_cache
order by updated_at desc
limit 20;
```

You should see fresh rows. The Property Safety Check screen will then automatically compute `days since last departure` per property, and Guest Ready will auto-populate the next guest contact details when a property is selected.

## 4. Optional extras

- **Per-channel workflows**: duplicate the workflow for Airbnb, Booking.com, direct bookings; they all POST to the same endpoint.
- **Upsert dedupe**: the edge function currently inserts. If you want true idempotency by `external_id`, add a unique index and switch the function to `.upsert(..., { onConflict: 'external_id' })`.
- **Webhook mode**: instead of cron, point channel webhooks at an n8n Webhook node so new bookings arrive within seconds.
