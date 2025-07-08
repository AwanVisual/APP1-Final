
-- Add discount column to sale_items table
ALTER TABLE public.sale_items 
ADD COLUMN discount DECIMAL(10,2) DEFAULT 0;

-- Create index for better performance
CREATE INDEX idx_sale_items_discount ON public.sale_items(discount);
