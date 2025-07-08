
-- Create storage bucket for company assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-assets',
  'company-assets', 
  true,
  5242880, -- 5MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
);

-- Create storage policy for company assets
CREATE POLICY "Anyone can view company assets" ON storage.objects
FOR SELECT USING (bucket_id = 'company-assets');

CREATE POLICY "Authenticated users can upload company assets" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'company-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update company assets" ON storage.objects
FOR UPDATE USING (bucket_id = 'company-assets' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete company assets" ON storage.objects
FOR DELETE USING (bucket_id = 'company-assets' AND auth.role() = 'authenticated');
