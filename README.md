# CargoMatch 🚛

Logistics marketplace platform for Southern Africa.

## What's included

### Pages
| Route | Page |
|-------|------|
| `/` | Landing page |
| `/shipper` | Shipper dashboard |
| `/carrier` | Carrier dashboard |
| `/post-load` | Post a Load (4-step form) |
| `/messages` | Messaging (shipper ↔ carrier) |
| `/track/:id` | Live map tracking (OpenStreetMap) |
| `/notifications` | Notifications center |
| `/carrier/:id` | Carrier profile + reviews |

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Stack
- React 19 + Vite
- Tailwind CSS
- React Router DOM v6
- Leaflet (OpenStreetMap) for maps
- Lucide React for icons
- Syne + DM Sans fonts

## Next: Supabase Integration

1. Create project at https://supabase.com
2. Add `.env`:
   ```
   VITE_SUPABASE_URL=your_project_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
3. `npm install @supabase/supabase-js`
4. See DATABASE.md for schema
