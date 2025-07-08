
-- Create enum types for better data consistency
CREATE TYPE public.user_role AS ENUM ('admin', 'cashier', 'stockist');
CREATE TYPE public.transaction_type AS ENUM ('inbound', 'outbound', 'adjustment');
CREATE TYPE public.payment_method AS ENUM ('cash', 'card', 'transfer', 'credit');

-- Create profiles table for user management
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'cashier',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create categories table
CREATE TABLE public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create products table
CREATE TABLE public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    sku TEXT UNIQUE NOT NULL,
    category_id UUID REFERENCES public.categories(id),
    price DECIMAL(12,2) NOT NULL,
    cost DECIMAL(12,2) NOT NULL DEFAULT 0,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    min_stock_level INTEGER DEFAULT 10,
    description TEXT,
    image_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create stock_movements table for tracking inventory changes
CREATE TABLE public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    transaction_type transaction_type NOT NULL,
    quantity INTEGER NOT NULL,
    unit_cost DECIMAL(12,2),
    reference_number TEXT,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create sales table
CREATE TABLE public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_number TEXT UNIQUE NOT NULL,
    customer_name TEXT,
    subtotal DECIMAL(12,2) NOT NULL,
    tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12,2) NOT NULL,
    payment_method payment_method NOT NULL,
    payment_received DECIMAL(12,2) NOT NULL,
    change_amount DECIMAL(12,2) DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Create sale_items table
CREATE TABLE public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id),
    quantity INTEGER NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create settings table for system configuration
CREATE TABLE public.settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    description TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_by UUID REFERENCES auth.users(id)
);

-- Insert default settings
INSERT INTO public.settings (key, value, description) VALUES
('company_name', 'Your Company Name', 'Company name for receipts'),
('company_address', 'Your Company Address', 'Company address for receipts'),
('company_phone', 'Your Phone Number', 'Company phone for receipts'),
('tax_rate', '11', 'VAT/PPN tax rate percentage'),
('receipt_header', 'Thank you for your purchase!', 'Receipt header text'),
('receipt_footer', 'Have a great day!', 'Receipt footer text'),
('logo_url', '', 'Company logo URL');

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(user_id UUID)
RETURNS user_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM public.profiles WHERE id = user_id;
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile" ON public.profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON public.profiles
    FOR SELECT USING (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can insert profiles" ON public.profiles
    FOR INSERT WITH CHECK (public.get_user_role(auth.uid()) = 'admin');

CREATE POLICY "Admins can update all profiles" ON public.profiles
    FOR UPDATE USING (public.get_user_role(auth.uid()) = 'admin');

-- RLS Policies for categories
CREATE POLICY "All authenticated users can view categories" ON public.categories
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and stockists can manage categories" ON public.categories
    FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin', 'stockist'));

-- RLS Policies for products
CREATE POLICY "All authenticated users can view products" ON public.products
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and stockists can manage products" ON public.products
    FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin', 'stockist'));

-- RLS Policies for stock_movements
CREATE POLICY "All authenticated users can view stock movements" ON public.stock_movements
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and stockists can manage stock movements" ON public.stock_movements
    FOR ALL USING (public.get_user_role(auth.uid()) IN ('admin', 'stockist'));

-- RLS Policies for sales
CREATE POLICY "All authenticated users can view sales" ON public.sales
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "All authenticated users can create sales" ON public.sales
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Admins can manage all sales" ON public.sales
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- RLS Policies for sale_items
CREATE POLICY "Users can view sale items" ON public.sale_items
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can create sale items" ON public.sale_items
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can manage sale items" ON public.sale_items
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- RLS Policies for settings
CREATE POLICY "All authenticated users can view settings" ON public.settings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage settings" ON public.settings
    FOR ALL USING (public.get_user_role(auth.uid()) = 'admin');

-- Create trigger function to update stock quantity
CREATE OR REPLACE FUNCTION public.update_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.transaction_type = 'inbound' THEN
            UPDATE public.products 
            SET stock_quantity = stock_quantity + NEW.quantity,
                updated_at = NOW()
            WHERE id = NEW.product_id;
        ELSIF NEW.transaction_type = 'outbound' THEN
            UPDATE public.products 
            SET stock_quantity = stock_quantity - NEW.quantity,
                updated_at = NOW()
            WHERE id = NEW.product_id;
        ELSIF NEW.transaction_type = 'adjustment' THEN
            UPDATE public.products 
            SET stock_quantity = NEW.quantity,
                updated_at = NOW()
            WHERE id = NEW.product_id;
        END IF;
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

-- Create trigger to automatically update stock
CREATE TRIGGER stock_movement_trigger
    AFTER INSERT ON public.stock_movements
    FOR EACH ROW
    EXECUTE FUNCTION public.update_product_stock();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
        'cashier'
    );
    RETURN NEW;
END;
$$;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

-- Create function to generate sale number
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    sale_count INTEGER;
    sale_number TEXT;
BEGIN
    SELECT COUNT(*) + 1 INTO sale_count FROM public.sales WHERE DATE(created_at) = CURRENT_DATE;
    sale_number := 'SALE-' || TO_CHAR(CURRENT_DATE, 'YYYYMMDD') || '-' || LPAD(sale_count::TEXT, 4, '0');
    RETURN sale_number;
END;
$$;
