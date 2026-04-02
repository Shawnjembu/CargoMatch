-- ============================================================
-- CargoMatch Database Schema — Supabase (PostgreSQL)
-- Run this in your Supabase SQL Editor
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- USERS (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  role        TEXT NOT NULL CHECK (role IN ('shipper', 'carrier', 'both')),
  avatar_url  TEXT,
  location    TEXT,
  bio         TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- CARRIERS (extra info for carrier accounts)
-- ============================================================
CREATE TABLE public.carriers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  company_name    TEXT NOT NULL,
  verified        BOOLEAN DEFAULT FALSE,
  top_carrier     BOOLEAN DEFAULT FALSE,
  total_trips     INTEGER DEFAULT 0,
  on_time_rate    NUMERIC(5,2) DEFAULT 100,
  response_time   TEXT DEFAULT '< 1 hr',
  rating          NUMERIC(3,2) DEFAULT 0,
  member_since    DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- TRUCKS (fleet for each carrier)
-- ============================================================
CREATE TABLE public.trucks (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carrier_id  UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,          -- e.g. 'Hino 300 (3 Ton)'
  plate       TEXT NOT NULL UNIQUE,
  capacity_kg INTEGER NOT NULL,
  status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'in_transit', 'maintenance')),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOADS (posted by shippers)
-- ============================================================
CREATE TABLE public.loads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipper_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  from_location   TEXT NOT NULL,
  to_location     TEXT NOT NULL,
  from_lat        NUMERIC(9,6),
  from_lng        NUMERIC(9,6),
  to_lat          NUMERIC(9,6),
  to_lng          NUMERIC(9,6),
  pickup_date     DATE NOT NULL,
  pickup_time     TIME,
  cargo_type      TEXT NOT NULL,
  weight_kg       INTEGER NOT NULL,
  description     TEXT,
  pooling         BOOLEAN DEFAULT TRUE,
  urgent          BOOLEAN DEFAULT FALSE,
  insurance       BOOLEAN DEFAULT FALSE,
  status          TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'in_transit', 'delivered', 'cancelled')),
  price_estimate  NUMERIC(10,2),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- SHIPMENTS (a matched load assigned to a carrier)
-- ============================================================
CREATE TABLE public.shipments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  load_id         UUID NOT NULL REFERENCES public.loads(id) ON DELETE CASCADE,
  carrier_id      UUID NOT NULL REFERENCES public.carriers(id),
  truck_id        UUID REFERENCES public.trucks(id),
  shipper_id      UUID NOT NULL REFERENCES public.profiles(id),
  reference       TEXT UNIQUE NOT NULL,   -- e.g. CM-4821
  status          TEXT DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  price           NUMERIC(10,2) NOT NULL,
  pickup_at       TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  eta             TIMESTAMPTZ,
  current_lat     NUMERIC(9,6),
  current_lng     NUMERIC(9,6),
  progress_pct    NUMERIC(5,2) DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-generate shipment reference (CM-XXXX)
CREATE SEQUENCE shipment_ref_seq START 4000;
CREATE OR REPLACE FUNCTION generate_shipment_ref()
RETURNS TRIGGER AS $$
BEGIN
  NEW.reference := 'CM-' || LPAD(nextval('shipment_ref_seq')::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_shipment_ref
  BEFORE INSERT ON public.shipments
  FOR EACH ROW WHEN (NEW.reference IS NULL)
  EXECUTE FUNCTION generate_shipment_ref();

-- ============================================================
-- MESSAGES (shipper ↔ carrier chat per shipment)
-- ============================================================
CREATE TABLE public.messages (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id   UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  sender_id     UUID NOT NULL REFERENCES public.profiles(id),
  receiver_id   UUID NOT NULL REFERENCES public.profiles(id),
  body          TEXT NOT NULL,
  read          BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('match', 'message', 'tracking', 'delivery', 'review', 'alert', 'system')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  link        TEXT,                    -- e.g. '/track/CM-4821'
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- REVIEWS (shippers review carriers and vice versa)
-- ============================================================
CREATE TABLE public.reviews (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id   UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  reviewer_id   UUID NOT NULL REFERENCES public.profiles(id),
  reviewee_id   UUID NOT NULL REFERENCES public.profiles(id),
  rating        INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (shipment_id, reviewer_id)
);

-- Update carrier rating when a review is added
CREATE OR REPLACE FUNCTION update_carrier_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.carriers
  SET rating = (
    SELECT ROUND(AVG(r.rating)::NUMERIC, 2)
    FROM public.reviews r
    JOIN public.shipments s ON r.shipment_id = s.id
    WHERE s.carrier_id = (
      SELECT s2.carrier_id FROM public.shipments s2 WHERE s2.id = NEW.shipment_id
    )
  )
  WHERE id = (
    SELECT s.carrier_id FROM public.shipments s WHERE s.id = NEW.shipment_id
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recalc_carrier_rating
  AFTER INSERT OR UPDATE ON public.reviews
  FOR EACH ROW EXECUTE FUNCTION update_carrier_rating();

-- ============================================================
-- CARRIER ROUTES (common routes a carrier covers)
-- ============================================================
CREATE TABLE public.carrier_routes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  carrier_id  UUID NOT NULL REFERENCES public.carriers(id) ON DELETE CASCADE,
  from_city   TEXT NOT NULL,
  to_city     TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- LOAD POOLING (multiple shippers on one shipment)
-- ============================================================
CREATE TABLE public.pool_members (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  shipment_id   UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  shipper_id    UUID NOT NULL REFERENCES public.profiles(id),
  load_id       UUID NOT NULL REFERENCES public.loads(id),
  weight_kg     INTEGER NOT NULL,
  price_share   NUMERIC(10,2) NOT NULL,
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (shipment_id, shipper_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carriers        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trucks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.loads           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_routes  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pool_members    ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read all, edit only their own
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Loads: anyone can view, only shipper can create/update
CREATE POLICY "Loads are viewable by everyone"
  ON public.loads FOR SELECT USING (TRUE);
CREATE POLICY "Shippers can insert their own loads"
  ON public.loads FOR INSERT WITH CHECK (auth.uid() = shipper_id);
CREATE POLICY "Shippers can update their own loads"
  ON public.loads FOR UPDATE USING (auth.uid() = shipper_id);

-- Shipments: shipper and carrier can view their own
CREATE POLICY "Shipment parties can view shipment"
  ON public.shipments FOR SELECT
  USING (auth.uid() = shipper_id OR EXISTS (
    SELECT 1 FROM public.carriers c WHERE c.id = carrier_id AND c.user_id = auth.uid()
  ));

-- Messages: only sender and receiver can see
CREATE POLICY "Message participants can view"
  ON public.messages FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY "Authenticated users can send messages"
  ON public.messages FOR INSERT WITH CHECK (auth.uid() = sender_id);

-- Notifications: only the user can see their own
CREATE POLICY "Users see own notifications"
  ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can mark own notifications read"
  ON public.notifications FOR UPDATE USING (auth.uid() = user_id);

-- Reviews: everyone can read, only reviewer can write
CREATE POLICY "Reviews are public"
  ON public.reviews FOR SELECT USING (TRUE);
CREATE POLICY "Authenticated users can leave reviews"
  ON public.reviews FOR INSERT WITH CHECK (auth.uid() = reviewer_id);

-- Carriers and routes: public read
CREATE POLICY "Carriers are public"
  ON public.carriers FOR SELECT USING (TRUE);
CREATE POLICY "Carrier routes are public"
  ON public.carrier_routes FOR SELECT USING (TRUE);

-- ============================================================
-- REALTIME (enable for live tracking + messaging)
-- ============================================================
-- Run these in Supabase Dashboard > Database > Replication
-- or uncomment here if your Supabase version supports it:
--
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.shipments;
-- ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- ============================================================
-- INDEXES (performance)
-- ============================================================
CREATE INDEX idx_loads_shipper        ON public.loads(shipper_id);
CREATE INDEX idx_loads_status         ON public.loads(status);
CREATE INDEX idx_shipments_shipper    ON public.shipments(shipper_id);
CREATE INDEX idx_shipments_carrier    ON public.shipments(carrier_id);
CREATE INDEX idx_shipments_reference  ON public.shipments(reference);
CREATE INDEX idx_messages_shipment    ON public.messages(shipment_id);
CREATE INDEX idx_messages_sender      ON public.messages(sender_id);
CREATE INDEX idx_notifications_user   ON public.notifications(user_id, read);
CREATE INDEX idx_reviews_reviewee     ON public.reviews(reviewee_id);
