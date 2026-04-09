/**
 * Product, SaleOrder, Invoice types.
 * From KOLD_FIELD_ADDENDUM.md Bloque 3.
 */

import { OdooId, OdooMany2one } from './odoo';

export interface Product {
  id: OdooId;
  name: string;
  default_code?: string;
  list_price: number;
  qty_available: number; // stock en camioneta
  sale_ok: boolean;
  product_tmpl_id: OdooMany2one;
  weight?: number;
  categ_id?: OdooMany2one;
  // BLD-20260408-P1: Product image (base64 from Odoo, smallest available)
  image_128?: string | false;
}

export type SaleOrderState = 'draft' | 'sent' | 'sale' | 'done' | 'cancel';

export interface SaleOrderLine {
  id: OdooId;
  product_id: OdooMany2one;
  product_uom_qty: number;
  price_unit: number;
  discount: number;
  price_subtotal: number;
}

export interface SaleOrder {
  id: OdooId;
  name: string;
  partner_id: OdooMany2one;
  date_order: string;
  state: SaleOrderState;
  amount_total: number;
  amount_untaxed: number;
  amount_tax: number;
  order_line: SaleOrderLine[];
  warehouse_id?: OdooMany2one;
  user_id?: OdooMany2one;
  payment_term_id?: OdooMany2one;
}

export type PaymentState = 'not_paid' | 'partial' | 'paid' | 'in_payment';

export interface Invoice {
  id: OdooId;
  name: string;
  partner_id: OdooMany2one;
  invoice_date: string;
  invoice_date_due?: string;
  amount_total: number;
  amount_residual: number;
  payment_state: PaymentState;
  state: 'draft' | 'posted' | 'cancel';
}
