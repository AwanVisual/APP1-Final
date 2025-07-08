import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { BarChart3, Download, TrendingUp, Package, ShoppingCart, Calendar, Edit, Printer, Save, X } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { toast } from '@/hooks/use-toast';

const Reports = () => {
  const [dateRange, setDateRange] = useState('today');
  const [selectedTab, setSelectedTab] = useState('sales');
  const [editingSale, setEditingSale] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  const queryClient = useQueryClient();
  const [editingItems, setEditingItems] = useState<string | null>(null);
  const [editItemsData, setEditItemsData] = useState<any[]>([]);

  // Calculate date range
  const getDateRange = () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (dateRange) {
      case 'today':
        return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
      case 'week':
        const weekStart = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return { start: weekStart, end: now };
      case 'month':
        const monthStart = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        return { start: monthStart, end: now };
      default:
        return { start: today, end: new Date(today.getTime() + 24 * 60 * 60 * 1000) };
    }
  };

  const { start, end } = getDateRange();

  // Fetch sales data
  const { data: salesData } = useQuery({
    queryKey: ['sales-reports', dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select(`
          *,
          sale_items (
            *,
            products (name, sku, price)
          ),
          cashier:profiles!cashier_id (
            full_name
          )
        `)
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

    // Fetch all products
    const { data: allProducts } = useQuery({
      queryKey: ['products'],
      queryFn: async () => {
        const { data } = await supabase
          .from('products')
          .select('*')
          .order('name', { ascending: true });
        return data || [];
      },
    });

  // Fetch product inventory data
  const { data: inventoryData } = useQuery({
    queryKey: ['inventory-reports'],
    queryFn: async () => {
      const { data } = await supabase
        .from('products')
        .select('*, categories(name)')
        .order('stock_quantity', { ascending: true });
      return data || [];
    },
  });

  // Fetch stock movements
  const { data: stockMovements } = useQuery({
    queryKey: ['stock-movements', dateRange],
    queryFn: async () => {
      const { data } = await supabase
        .from('stock_movements')
        .select('*, products(name, sku)')
        .gte('created_at', start.toISOString())
        .lt('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  // Fetch settings for receipt printing
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('*');
      const settingsMap: Record<string, string> = {};
      data?.forEach(setting => {
        settingsMap[setting.key] = setting.value || '';
      });
      return settingsMap;
    },
  });

  // Update sale mutation
  const updateSaleMutation = useMutation({
    mutationFn: async (updatedSale: any) => {
      const { error } = await supabase
        .from('sales')
        .update({
          customer_name: updatedSale.customer_name,
          payment_method: updatedSale.payment_method,
          invoice_status: updatedSale.invoice_status,
          notes: updatedSale.notes,
        })
        .eq('id', updatedSale.id);

      if (error) throw error;
      return updatedSale;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-reports'] });
      setEditingSale(null);
      toast({
        title: "Success",
        description: "Sale updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update sale items mutation
  const updateSaleItemsMutation = useMutation({
    mutationFn: async (updatedItems: any[]) => {
      // Delete existing items
      const { error: deleteError } = await supabase
        .from('sale_items')
        .delete()
        .eq('sale_id', editingItems);

      if (deleteError) throw deleteError;

      // Insert updated items
      const { error: insertError } = await supabase
        .from('sale_items')
        .insert(
          updatedItems.map(item => {
            const price = Number(item.unit_price);
            const quantity = item.quantity;
            const discount = item.discount || 0;
            const dpp11 = (100 / 111) * price;
            const discountAmount = (discount / 100) * dpp11;
            const dppFaktur = dpp11 - discountAmount;
            const ppn11 = 0.11 * dppFaktur;
            const subtotal = (dppFaktur + ppn11) * quantity;
            
            return {
              sale_id: editingItems,
              product_id: item.product_id,
              quantity: item.quantity,
              unit_price: item.unit_price,
              discount: item.discount,
              subtotal: subtotal,
            };
          })
        );

      if (insertError) throw insertError;
      return updatedItems;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-reports'] });
      setEditingItems(null);
      toast({
        title: "Success",
        description: "Sale items updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Calculate sales metrics
  const totalSales = salesData?.reduce((sum, sale) => sum + Number(sale.total_amount), 0) || 0;
  const totalTransactions = salesData?.length || 0;
  const averageSale = totalTransactions > 0 ? totalSales / totalTransactions : 0;
  const totalItemsSold = salesData?.reduce((sum, sale) => 
    sum + (sale.sale_items?.reduce((itemSum, item) => itemSum + item.quantity, 0) || 0), 0
  ) || 0;

  // Prepare chart data
  const chartData = salesData?.reduce((acc, sale) => {
    const date = new Date(sale.created_at!).toLocaleDateString();
    const existing = acc.find(item => item.date === date);
    if (existing) {
      existing.amount += Number(sale.total_amount);
      existing.transactions += 1;
    } else {
      acc.push({
        date,
        amount: Number(sale.total_amount),
        transactions: 1,
      });
    }
    return acc;
  }, [] as Array<{ date: string; amount: number; transactions: number }>) || [];

  // Low stock products
  const lowStockProducts = inventoryData?.filter(product => 
    product.stock_quantity <= (product.min_stock_level || 10)
  ) || [];

  // Handle edit sale
  const handleEditSale = (sale: any) => {
    setEditingSale(sale.id);
    setEditFormData({
      id: sale.id,
      customer_name: sale.customer_name || '',
      payment_method: sale.payment_method,
      invoice_status: sale.invoice_status || 'lunas',
      notes: sale.notes || '',
    });
  };

  const handleSaveEdit = () => {
    updateSaleMutation.mutate(editFormData);
  };

  const handleCancelEdit = () => {
    setEditingSale(null);
    setEditFormData({});
  };

  // Handle edit items
  const handleEditItems = (sale: any) => {
    setEditingItems(sale.id);
    setEditItemsData(sale.sale_items || []);
  };

  const handleSaveItems = () => {
    updateSaleItemsMutation.mutate(editItemsData);
  };

  const handleCancelEditItems = () => {
    setEditingItems(null);
    setEditItemsData([]);
  };

  const updateEditItem = (index: number, key: string, value: any) => {
    const updatedItems = [...editItemsData];
    updatedItems[index][key] = value;
    setEditItemsData(updatedItems);
  };

  const addEditItem = () => {
    setEditItemsData([
      ...editItemsData,
      {
        product_id: '',
        quantity: 1,
        unit_price: 0,
        discount: 0,
        subtotal: 0,
      },
    ]);
  };

  const removeEditItem = (index: number) => {
    const updatedItems = [...editItemsData];
    updatedItems.splice(index, 1);
    setEditItemsData(updatedItems);
  };

  // Print receipt function
  const printReceipt = (sale: any) => {
    const logoUrl = settings?.company_logo ? settings.company_logo : "";
    const storeName = settings?.store_name || "";
    const storeAddress = settings?.store_address || "";
    const storePhone = settings?.store_phone || "";
    const storeEmail = settings?.store_email || "";
    const storeWebsite = settings?.store_website || "";
    const receiptHeader = settings?.receipt_header || "";
    const receiptFooter = settings?.receipt_footer || "";

    const cashierName = sale.cashier?.full_name || "Unknown";

    // Calculate detailed pricing for each item (matching cashier calculation exactly)
    const calculateItemPricing = (item: any) => {
      const price = Number(item.unit_price);
      const quantity = item.quantity;
      const itemDiscount = item.discount || 0; // This should be 0 since discounts are stored in customDiscount in cart, not in database

      const amount = quantity * price;
      const dpp11 = (100 / 111) * price;
      const discount = (itemDiscount / 100) * dpp11;
      const dppFaktur = dpp11 - discount;

      // PPN 11% calculation
      const ppn11 = 0.11 * dppFaktur;

      return {
        amount,
        discount: discount * quantity,
        dppFaktur: dppFaktur * quantity,
        ppn11: ppn11 * quantity,
        finalItemTotal: (dppFaktur + ppn11) * quantity,
      };
    };

    // Calculate totals using the same logic as cashier
    const detailedTotals = sale.sale_items?.reduce(
      (totals: any, item: any) => {
        const itemCalc = calculateItemPricing(item);
        return {
          amount: totals.amount + itemCalc.amount,
          discount: totals.discount + itemCalc.discount,
          dppFaktur: totals.dppFaktur + itemCalc.dppFaktur,
          ppn11: totals.ppn11 + itemCalc.ppn11,
        };
      },
      { amount: 0, discount: 0, dppFaktur: 0, ppn11: 0 },
    ) || { amount: 0, discount: 0, dppFaktur: 0, ppn11: 0 };

    const receiptContent = `
      <div style="font-family: 'HSD Display', 'DRAFT', 'Roman', 'Helvetica Neue', 'Arial', sans-serif; max-width: 800px; width: 100%; margin: 0 auto; padding: 20px; min-height: 600px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 12px;">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: 20px;">
              ${logoUrl ? `<img src="${logoUrl}" alt="Logo" style="max-height: 80px;" />` : ""}
            </div>
          </div>
          <div style="text-align: right;">
            <h2 style="margin: 0; font-size: 32px; font-weight: bold;">INVOICE</h2>
            <div style="margin-top: 15px;">
              ${storeName ? `<p style="margin: 5px 0; font-size: 16px;">${storeName}</p>` : ""}
              ${storeAddress ? `<p style="margin: 5px 0; font-size: 14px;">${storeAddress}</p>` : ""}
              ${storePhone ? `<p style="margin: 5px 0; font-size: 14px;">${storePhone}</p>` : ""}
              ${storeEmail ? `<p style="margin: 5px 0; font-size: 14px;">${storeEmail}</p>` : ""}
              ${storeWebsite ? `<p style="margin: 5px 0; font-size: 14px;">${storeWebsite}</p>` : ""}
            </div>
          </div>
        </div>

        <div style="margin-bottom: 20px;">
          <p style="margin: 5px 0; font-size: 16px;"><strong>NO INVOICE:</strong> ${sale.sale_number}</p>
          <p style="margin: 5px 0; font-size: 16px;"><strong>TANGGAL:</strong> ${new Date(sale.created_at).toLocaleDateString("id-ID")}</p>
          ${sale.customer_name ? `<p style="margin: 5px 0; font-size: 16px;"><strong>KEPADA:</strong> ${sale.customer_name}</p>` : ""}
          <p style="margin: 5px 0; font-size: 16px;"><strong>KASIR:</strong> ${cashierName}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; font-size: 14px;">
          <thead>
            <tr style="background-color: #f8f9fa; border-bottom: 2px solid #000;">
              <th style="text-align: left; padding: 12px; font-size: 16px; font-weight: bold;">KETERANGAN</th>
              <th style="text-align: center; padding: 12px; font-size: 16px; font-weight: bold;">QTY</th>
              <th style="text-align: right; padding: 12px; font-size: 16px; font-weight: bold;">HARGA</th>
              <th style="text-align: right; padding: 12px; font-size: 16px; font-weight: bold;">DISCOUNT</th>
              <th style="text-align: right; padding: 12px; font-size: 16px; font-weight: bold;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${sale.sale_items?.map((item: any) => {
              const itemCalc = calculateItemPricing(item);
              const itemDiscountPercentage = item.discount || 0;
              return `
              <tr style="border-bottom: 1px solid #ddd;">
                <td style="padding: 10px; font-size: 14px;">${item.products?.name || 'Unknown Product'}</td>
                <td style="text-align: center; padding: 10px; font-size: 14px;">${item.quantity}</td>
                <td style="text-align: right; padding: 10px; font-size: 14px;">${formatCurrency(item.unit_price)}</td>
                <td style="text-align: right; padding: 10px; font-size: 14px;">
                  ${itemDiscountPercentage > 0 ? `${itemDiscountPercentage}%` : '-'}
                  ${itemDiscountPercentage > 0 ? `<br/><small style="color: #666;">-${formatCurrency(itemCalc.discount)}</small>` : ''}
                </td>
                <td style="text-align: right; padding: 10px; font-size: 14px;">${formatCurrency(itemCalc.finalItemTotal)}</td>
              </tr>
            `;
            }).join('') || ''}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; margin-top: 30px;">
          <div style="flex: 1; max-width: 300px;">
            <div style="background-color: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <h4 style="margin: 0 0 10px 0; color: #d9534f;">CATATAN PEMBAYARAN:</h4>
              <p style="margin: 0; font-size: 12px; line-height: 1.4;">
                ${settings?.payment_note_line1 || `Harga BCA : ${formatCurrency(Math.round(detailedTotals.dppFaktur / (sale.sale_items?.length || 1)))}/PUTRA INDRAWAN`}<br/>
                ${settings?.payment_note_line2 || "No. Rekening: 7840656905"}
              </p>
            </div>
          </div>

          <div style="min-width: 300px; border-left: 2px solid #000; padding-left: 20px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
              <span>SUB TOTAL:</span>
              <span>${formatCurrency(detailedTotals.amount)}</span>
            </div>
            ${
              detailedTotals.discount > 0
                ? `
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
              <span>Total Discount:</span>
              <span>-${formatCurrency(detailedTotals.discount)}</span>
            </div>
            `
                : ""
            }
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
              <span>DPP Faktur:</span>
              <span>${formatCurrency(detailedTotals.dppFaktur)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px;">
              <span>PPN 11%:</span>
              <span>${formatCurrency(detailedTotals.ppn11)}</span>
            </div>
            <div style="border-top: 1px solid #000; margin: 15px 0; padding-top: 15px;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 10px; font-weight: bold; font-size: 18px;">
                <span>TOTAL:</span>
                <span>${formatCurrency(detailedTotals.dppFaktur + detailedTotals.ppn11)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 40px; text-align: right;">
          <p style="margin: 0; font-size: 16px; font-weight: bold;"></p>
        </div>

        ${
          receiptHeader || receiptFooter
            ? `
        <div style="text-align: center; margin-top: 30px; border-top: 1px solid #000; padding-top: 15px;">
          ${receiptHeader ? `<p style="font-size: 14px; margin: 5px 0;">${receiptHeader}</p>` : ""}
          ${receiptFooter ? `<p style="font-size: 14px; margin: 5px 0;">${receiptFooter}</p>` : ""}
        </div>
        `
            : ""
        }
      </div>
    `;

    const printWindow = window.open("", "_blank");
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Invoice - ${sale.sale_number}</title>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
            <style>
              @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
              @page { 
                size: A4 landscape; 
                margin: 15mm; 
              }
              @media print {
                body { 
                  margin: 0; 
                  font-size: 12px; 
                  font-family: 'HSD Display', 'DRAFT', 'Roman', 'Inter', 'Helvetica Neue', 'Arial', sans-serif;
                }
              }
            </style>
          </head>
          <body>${receiptContent}</body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Export functionality
  const exportData = () => {
    // Import xlsx library dinamically
    import('xlsx').then((XLSX) => {
      // Create workbook
      const wb = XLSX.utils.book_new();

      // Summary Sheet
      const summaryData = [
        ['Report Summary', ''],
        ['Date Range', dateRange],
        ['Export Date', new Date().toLocaleDateString()],
        ['Total Sales', formatCurrency(totalSales)],
        ['Total Transactions', totalTransactions],
        ['Average Sale', formatCurrency(averageSale)],
        ['Total Items Sold', totalItemsSold],
      ];
      const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

      // Sales Sheet
      if (salesData && salesData.length > 0) {
        const salesHeaders = ['Sale Number', 'Date', 'Customer', 'Cashier', 'Payment Method', 'Invoice Status', 'Bank Details', 'Total Amount', 'Items Count'];
        const salesRows = salesData.map(sale => [
          sale.sale_number,
          new Date(sale.created_at!).toLocaleDateString(),
          sale.customer_name || 'Walk-in Customer',
          sale.cashier?.full_name || 'Unknown',
          sale.payment_method,
          sale.invoice_status || 'lunas',
          sale.payment_method === 'transfer' && sale.notes ? sale.notes.replace('Bank Details: ', '') : '-',
          Number(sale.total_amount),
          sale.sale_items?.length || 0
        ]);
        const salesSheet = XLSX.utils.aoa_to_sheet([salesHeaders, ...salesRows]);
        XLSX.utils.book_append_sheet(wb, salesSheet, 'Sales');
      }

      // Inventory Sheet
      if (inventoryData && inventoryData.length > 0) {
        const inventoryHeaders = ['Product Name', 'SKU', 'Category', 'Stock Quantity', 'Min Level', 'Cost', 'Price', 'Stock Value', 'Status'];
        const inventoryRows = inventoryData.map(product => [
          product.name,
          product.sku,
          product.categories?.name || 'No Category',
          product.stock_quantity,
          product.min_stock_level,
          Number(product.cost),
          Number(product.price),
          Number(product.cost) * product.stock_quantity,
          product.stock_quantity <= (product.min_stock_level || 10) ? 'Low Stock' : 'In Stock'
        ]);
        const inventorySheet = XLSX.utils.aoa_to_sheet([inventoryHeaders, ...inventoryRows]);
        XLSX.utils.book_append_sheet(wb, inventorySheet, 'Inventory');
      }

      // Stock Movements Sheet
      if (stockMovements && stockMovements.length > 0) {
        const movementsHeaders = ['Date', 'Product Name', 'SKU', 'Type', 'Quantity', 'Reference', 'Notes'];
        const movementsRows = stockMovements.map(movement => [
          new Date(movement.created_at!).toLocaleDateString(),
          movement.products?.name || '',
          movement.products?.sku || '',
          movement.transaction_type,
          movement.quantity,
          movement.reference_number || '',
          movement.notes || ''
        ]);
        const movementsSheet = XLSX.utils.aoa_to_sheet([movementsHeaders, ...movementsRows]);
        XLSX.utils.book_append_sheet(wb, movementsSheet, 'Stock Movements');
      }

      // Write file
      const fileName = `pos-reports-${dateRange}-${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
    });
  };

  const getInvoiceStatusBadgeVariant = (status: string) => {
    switch (status) {
      case 'lunas': return 'default';
      case 'dp': return 'secondary';
      case 'belum_bayar': return 'destructive';
      default: return 'default';
    }
  };

  const getInvoiceStatusLabel = (status: string) => {
    switch (status) {
      case 'lunas': return 'Lunas';
      case 'dp': return 'DP';
      case 'belum_bayar': return 'Belum Bayar';
      default: return 'Lunas';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold">Reports</h1>
          <p className="text-gray-600">View sales and inventory reports</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">Last 7 Days</SelectItem>
              <SelectItem value="month">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={exportData} className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Reports
          </Button>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sales">Sales Reports</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Reports</TabsTrigger>
          <TabsTrigger value="movements">Stock Movements</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
                <ShoppingCart className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(totalSales)}</div>
                <p className="text-xs text-muted-foreground">
                  {dateRange === 'today' ? 'Today' : `Last ${dateRange === 'week' ? '7' : '30'} days`}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Transactions</CardTitle>
                <BarChart3 className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalTransactions}</div>
                <p className="text-xs text-muted-foreground">Total transactions</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Average Sale</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(averageSale)}</div>
                <p className="text-xs text-muted-foreground">Per transaction</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Items Sold</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalItemsSold}</div>
                <p className="text-xs text-muted-foreground">Total quantity</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Sales Trend</CardTitle>
                <CardDescription>Daily sales over the selected period</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => [formatCurrency(Number(value)), 'Sales']} />
                    <Line type="monotone" dataKey="amount" stroke="#8884d8" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Transaction Volume</CardTitle>
                <CardDescription>Number of transactions per day</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="transactions" fill="#82ca9d" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Sales</CardTitle>
              <CardDescription>Latest transactions from the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sale Number</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Cashier</TableHead>
                    <TableHead>Payment Method</TableHead>
                    <TableHead>Invoice Status</TableHead>
                    <TableHead>Bank Details</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesData?.slice(0, 10).map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell className="font-medium">{sale.sale_number}</TableCell>
                      <TableCell>{formatDate(sale.created_at!)}</TableCell>
                      <TableCell>
                        {editingSale === sale.id ? (
                          <Input
                            value={editFormData.customer_name}
                            onChange={(e) => setEditFormData({...editFormData, customer_name: e.target.value})}
                            placeholder="Customer name"
                          />
                        ) : (
                          sale.customer_name || 'Walk-in Customer'
                        )}
                      </TableCell>
                      <TableCell>{sale.cashier?.full_name || "Unknown"}</TableCell>
                      <TableCell>
                        {editingSale === sale.id ? (
                          <Select
                            value={editFormData.payment_method}
                            onValueChange={(value) => setEditFormData({...editFormData, payment_method: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="cash">Cash</SelectItem>
                              <SelectItem value="card">Card</SelectItem>
                              <SelectItem value="transfer">Transfer</SelectItem>
                              <SelectItem value="credit">Credit</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline">{sale.payment_method}</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingSale === sale.id ? (
                          <Select
                            value={editFormData.invoice_status}
                            onValueChange={(value) => setEditFormData({...editFormData, invoice_status: value})}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="lunas">Lunas</SelectItem>
                              <SelectItem value="dp">DP</SelectItem>
                              <SelectItem value="belum_bayar">Belum Bayar</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge variant={getInvoiceStatusBadgeVariant(sale.invoice_status || 'lunas')}>
                            {getInvoiceStatusLabel(sale.invoice_status || 'lunas')}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingSale === sale.id ? (
                          <Input
                            value={editFormData.notes}
                            onChange={(e) => setEditFormData({...editFormData, notes: e.target.value})}
                            placeholder="Bank details"
                          />
                        ) : (
                          sale.payment_method === 'transfer' && sale.notes ? (
                            <div className="text-sm">
                              {sale.notes.replace('Bank Details: ', '')}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )
                        )}
                      </TableCell>
                      <TableCell>{formatCurrency(Number(sale.total_amount))}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {editingSale === sale.id ? (
                            <>
                              <Button
                                size="sm"
                                onClick={handleSaveEdit}
                                disabled={updateSaleMutation.isPending}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={handleCancelEdit}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditSale(sale)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => printReceipt(sale)}
                              >
                                <Printer className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditItems(sale)}
                              >
                                Edit Items
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Edit Items Dialog */}
          <Dialog open={!!editingItems} onOpenChange={() => setEditingItems(null)}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Edit Sale Items</DialogTitle>
                <DialogDescription>
                  Modify the items, quantities, and discounts for this sale
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h4 className="font-medium">Sale Items</h4>
                  <Button size="sm" onClick={addEditItem}>
                    Add Item
                  </Button>
                </div>

                <div className="space-y-2">
                  {editItemsData.map((item, index) => (
                    <div key={item.id} className="grid grid-cols-6 gap-2 items-end p-2 border rounded">
                      <div>
                        <label className="text-sm font-medium">Product</label>
                        <Select
                          value={item.product_id}
                          onValueChange={(value) => updateEditItem(index, 'product_id', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {allProducts?.map((product) => (
                              <SelectItem key={product.id} value={product.id}>
                                {product.name} - {formatCurrency(product.price)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium">Quantity</label>
                        <Input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) => updateEditItem(index, 'quantity', parseInt(e.target.value) || 1)}
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Unit Price</label>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updateEditItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Discount (%)</label>
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={item.discount}
                          onChange={(e) => updateEditItem(index, 'discount', parseFloat(e.target.value) || 0)}
                        />
                      </div>

                      <div>
                        <label className="text-sm font-medium">Subtotal</label>
                        <div className="p-2 bg-gray-50 rounded text-sm">
                          {formatCurrency(
                            (() => {
                              const price = Number(item.unit_price);
                              const quantity = item.quantity;
                              const discount = item.discount || 0;
                              const dpp11 = (100 / 111) * price;
                              const discountAmount = (discount / 100) * dpp11;
                              const dppFaktur = dpp11 - discountAmount;
                              const ppn11 = 0.11 * dppFaktur;
                              return (dppFaktur + ppn11) * quantity;
                            })()
                          )}
                        </div>
                      </div>

                      <div>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => removeEditItem(index)}
                          disabled={editItemsData.length === 1}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-4">
                  <div className="text-right space-y-2">
                    <div className="text-lg font-semibold">
                      Total: {formatCurrency(
                        editItemsData.reduce((total, item) => {
                          const price = Number(item.unit_price);
                          const quantity = item.quantity;
                          const discount = item.discount || 0;
                          const dpp11 = (100 / 111) * price;
                          const discountAmount = (discount / 100) * dpp11;
                          const dppFaktur = dpp11 - discountAmount;
                          const ppn11 = 0.11 * dppFaktur;
                          return total + (dppFaktur + ppn11) * quantity;
                        }, 0)
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={handleCancelEditItems}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleSaveItems}
                  disabled={updateSaleItemsMutation.isPending || editItemsData.some(item => !item.product_id)}
                >
                  {updateSaleItemsMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Low Stock Alert</CardTitle>
                <CardDescription>Products below minimum stock level</CardDescription>
              </CardHeader>
              <CardContent>
                {lowStockProducts.length > 0 ? (
                  <div className="space-y-2">
                    {lowStockProducts.map((product) => (
                      <div key={product.id} className="flex justify-between items-center p-2 bg-red-50 rounded">
                        <div>
                          <p className="font-medium">{product.name}</p>
                          <p className="text-sm text-gray-600">{product.sku}</p>
                        </div>
                        <Badge variant="destructive">
                          {product.stock_quantity} left
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">All products have sufficient stock</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Inventory Summary</CardTitle>
                <CardDescription>Overview of current stock levels</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between">
                    <span>Total Products</span>
                    <span className="font-medium">{inventoryData?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Low Stock Products</span>
                    <span className="font-medium text-red-600">{lowStockProducts.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Stock Value</span>
                    <span className="font-medium">
                      {formatCurrency(
                        inventoryData?.reduce((sum, product) => 
                          sum + (Number(product.cost) * product.stock_quantity), 0
                        ) || 0
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Details</CardTitle>
              <CardDescription>Complete product inventory status</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Min Level</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData?.map((product) => (
                    <TableRow key={product.id}>
                      <TableCell className="font-medium">{product.name}</TableCell>
                      <TableCell>{product.sku}</TableCell>
                      <TableCell>{product.categories?.name || 'No Category'}</TableCell>
                      <TableCell>{product.stock_quantity}</TableCell>
                      <TableCell>{product.min_stock_level}</TableCell>
                      <TableCell>
                        {formatCurrency(Number(product.cost) * product.stock_quantity)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            product.stock_quantity <= (product.min_stock_level || 10)
                              ? "destructive"
                              : "default"
                          }
                        >
                          {product.stock_quantity <= (product.min_stock_level || 10)
                            ? "Low Stock"
                            : "In Stock"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="movements" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Stock Movement History</CardTitle>
              <CardDescription>Track all inventory changes for the selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stockMovements?.map((movement) => (
                    <TableRow key={movement.id}>
                      <TableCell>{formatDate(movement.created_at!)}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{movement.products?.name}</p>
                          <p className="text-sm text-gray-600">{movement.products?.sku}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            movement.transaction_type === 'inbound'
                              ? "default"
                              : movement.transaction_type === 'outbound'
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {movement.transaction_type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={
                          movement.transaction_type === 'inbound'
                            ? "text-green-600"
                            : movement.transaction_type === 'outbound'
                            ? "text-red-600"
                            : "text-blue-600"
                        }>
                          {movement.transaction_type === 'inbound' ? '+' : 
                           movement.transaction_type === 'outbound' ? '-' : ''}
                          {movement.quantity}
                        </span>
                      </TableCell>
                      <TableCell>{movement.reference_number || '-'}</TableCell>
                      <TableCell>{movement.notes || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Reports;