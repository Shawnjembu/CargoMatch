-- Run this in Supabase SQL Editor to enable image uploads

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('cargo-images', 'cargo-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT DO NOTHING;

-- Policies for cargo-images bucket
CREATE POLICY "Anyone can view cargo images"
  ON storage.objects FOR SELECT USING (bucket_id = 'cargo-images');

CREATE POLICY "Authenticated users can upload cargo images"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'cargo-images' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own cargo images"
  ON storage.objects FOR UPDATE USING (bucket_id = 'cargo-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Policies for avatars bucket
CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT USING (bucket_id = 'avatars');

CREATE POLICY "Authenticated users can upload avatars"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = split_part(name, '.', 1));

-- Add image_url column to loads table if not exists
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add avatar_url column to profiles table if not exists  
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
