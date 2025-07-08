
-- Disable email confirmation requirement
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- Set default configuration to auto-confirm emails
INSERT INTO auth.config (parameter, value) 
VALUES ('SITE_URL', 'http://localhost:3000')
ON CONFLICT (parameter) DO UPDATE SET value = EXCLUDED.value;

INSERT INTO auth.config (parameter, value) 
VALUES ('MAILER_AUTOCONFIRM', 'true')
ON CONFLICT (parameter) DO UPDATE SET value = EXCLUDED.value;

-- Update auth.users table to auto-confirm new signups
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Auto-confirm email for new users
  NEW.email_confirmed_at = NOW();
  NEW.confirmed_at = NOW();
  
  -- Insert user profile
  INSERT INTO public.profiles (id, full_name, role)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', 'cashier');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create new trigger for auto-confirmation
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
