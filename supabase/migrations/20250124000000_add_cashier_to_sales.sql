
-- Add cashier_id column to sales table
ALTER TABLE public.sales 
ADD COLUMN cashier_id UUID REFERENCES public.profiles(id);

-- Create index for better performance
CREATE INDEX idx_sales_cashier_id ON public.sales(cashier_id);

-- Update existing sales to use created_by as cashier_id
UPDATE public.sales 
SET cashier_id = created_by 
WHERE cashier_id IS NULL;
