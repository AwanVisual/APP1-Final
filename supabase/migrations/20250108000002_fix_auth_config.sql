
-- Create auth.config table if it doesn't exist (for older Supabase versions)
CREATE TABLE IF NOT EXISTS auth.config (
    parameter text PRIMARY KEY,
    value text
);

-- Enable email confirmation bypass for admin user creation
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-confirm the user
    NEW.email_confirmed_at = NOW();
    NEW.email_confirm_token = NULL;
    NEW.raw_app_meta_data = COALESCE(NEW.raw_app_meta_data, '{}'::jsonb) || '{"provider":"email","providers":["email"]}'::jsonb;
    
    -- Insert into profiles table
    INSERT INTO public.profiles (id, full_name, role, created_at)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'cashier',
        NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
        full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        updated_at = NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger for new user creation
CREATE TRIGGER on_auth_user_created
  BEFORE INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Try to update auth config (ignore if table doesn't exist)
DO $$
BEGIN
    -- Try to insert into auth.config if it exists
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'config') THEN
        INSERT INTO auth.config (parameter, value)
        VALUES ('DISABLE_SIGNUP', 'false')
        ON CONFLICT (parameter) DO UPDATE SET value = 'false';
    END IF;
EXCEPTION
    WHEN others THEN
        -- Ignore any errors related to auth.config
        NULL;
END $$;
