
-- Enable email confirmation bypass for admin user creation
UPDATE auth.users SET email_confirmed_at = NOW() WHERE email_confirmed_at IS NULL;

-- Create or replace the trigger function
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Auto-confirm the user
    NEW.email_confirmed_at = NOW();
    
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

-- Update auth config to disable email confirmation
INSERT INTO auth.config (parameter, value)
VALUES ('DISABLE_SIGNUP', 'false')
ON CONFLICT (parameter) DO UPDATE SET value = 'false';
