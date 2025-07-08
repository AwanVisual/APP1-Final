
-- Create invoice_status enum
CREATE TYPE public.invoice_status AS ENUM ('lunas', 'dp', 'belum_bayar');

-- Add invoice_status column to sales table
ALTER TABLE public.sales 
ADD COLUMN invoice_status public.invoice_status DEFAULT 'lunas';

-- Update existing records based on payment method
UPDATE public.sales 
SET invoice_status = CASE 
  WHEN payment_method = 'credit' THEN 'belum_bayar'::public.invoice_status
  ELSE 'lunas'::public.invoice_status
END;

-- Create index for better performance
CREATE INDEX idx_sales_invoice_status ON public.sales(invoice_status);
