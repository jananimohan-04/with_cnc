-- Create tables with a 'cnc_' prefix to ensure uniqueness in your existing Supabase project

CREATE TABLE IF NOT EXISTS public.cnc_customers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  industry TEXT,
  contact TEXT,
  email TEXT,
  phone TEXT,
  city TEXT,
  total_orders INTEGER DEFAULT 0,
  total_value NUMERIC DEFAULT 0,
  outstanding NUMERIC DEFAULT 0,
  rating INTEGER DEFAULT 3,
  status TEXT DEFAULT 'Active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert mock data so the page isn't empty when you connect
INSERT INTO public.cnc_customers (id, name, industry, contact, city, total_orders, total_value, outstanding, rating, status)
VALUES 
('CUST-001', 'Bharat Aerospace Ltd', 'Aerospace', 'Vikram Rao', 'Bengaluru', 47, 8420000, 320000, 5, 'Active'),
('CUST-002', 'Maruti Precision Components', 'Automotive', 'Deepak Joshi', 'Gurgaon', 89, 12650000, 0, 4, 'Active'),
('CUST-003', 'Tata Defense Systems', 'Defense', 'Anil Kapoor', 'Pune', 34, 15320000, 850000, 4, 'Active'),
('CUST-004', 'ISRO Propulsion Division', 'Space', 'Dr. Meenakshi', 'Trivandrum', 12, 42800000, 0, 5, 'Active'),
('CUST-005', 'L&T Heavy Engineering', 'Industrial', 'Suresh Kumar', 'Hazira', 65, 21500000, 1240000, 3, 'Active'),
('CUST-006', 'Godrej Aerospace', 'Aerospace', 'Priya Desai', 'Mumbai', 28, 9800000, 450000, 4, 'Active'),
('CUST-007', 'Mahindra Auto', 'Automotive', 'Rahul Singh', 'Chennai', 112, 18400000, 0, 4, 'Active'),
('CUST-008', 'HAL Engine Division', 'Aerospace', 'Wg Cdr Sharma', 'Koraput', 41, 31200000, 2100000, 5, 'Active'),
('CUST-009', 'BHEL Turbines', 'Energy', 'Ravi Teja', 'Hyderabad', 19, 11400000, 890000, 3, 'Inactive'),
('CUST-010', 'Reliance Advanced Materials', 'Industrial', 'Amit Patel', 'Jamnagar', 53, 27600000, 0, 4, 'Active')
ON CONFLICT (id) DO NOTHING;

-- Set up Row Level Security (RLS)
ALTER TABLE public.cnc_customers ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows all authenticated and anon users to read (for this demo)
CREATE POLICY "Enable read access for all users" ON public.cnc_customers FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON public.cnc_customers FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON public.cnc_customers FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON public.cnc_customers FOR DELETE USING (true);

