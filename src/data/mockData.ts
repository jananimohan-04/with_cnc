// CNC Manufacturing ERP — Mock Data
// All sample data is realistic CNC manufacturing content, UI-only.

export type MachineStatus = 'Running' | 'Idle' | 'Maintenance' | 'Breakdown';
export type OrderStatus = 'Planning' | 'In Progress' | 'Completed' | 'On Hold' | 'Cancelled';
export type JobStatus = 'Pending' | 'Setup' | 'Running' | 'Completed' | 'Paused';
export type QualityStatus = 'Pass' | 'Fail' | 'Pending' | 'Rework';
export type StockStatus = 'In Stock' | 'Low Stock' | 'Out of Stock' | 'On Order';

export interface Machine {
  id: string;
  code: string;
  name: string;
  type: string;
  status: MachineStatus;
  utilization: number;
  operator: string;
  currentJob: string | null;
  location: string;
  lastMaintenance: string;
  nextMaintenance: string;
  spindleHours: number;
}

export const machines: Machine[] = [
  { id: 'M001', code: 'VMC-01', name: 'CNC VMC 3-Axis', type: 'Milling', status: 'Running', utilization: 87, operator: 'R. Sharma', currentJob: 'WO-2026-0847', location: 'Bay A-1', lastMaintenance: '2026-08-12', nextMaintenance: '2026-09-12', spindleHours: 14820 },
  { id: 'M002', code: 'VMC-02', name: 'CNC VMC High Speed', type: 'Milling', status: 'Running', utilization: 92, operator: 'A. Patel', currentJob: 'WO-2026-0851', location: 'Bay A-2', lastMaintenance: '2026-08-05', nextMaintenance: '2026-09-05', spindleHours: 21340 },
  { id: 'M003', code: 'HMC-01', name: 'CNC HMC Dual Pallet', type: 'Milling', status: 'Idle', utilization: 45, operator: '—', currentJob: null, location: 'Bay B-1', lastMaintenance: '2026-08-20', nextMaintenance: '2026-09-20', spindleHours: 18760 },
  { id: 'M004', code: 'VTL-01', name: 'Vertical Turning Lathe', type: 'Turning', status: 'Running', utilization: 78, operator: 'S. Nair', currentJob: 'WO-2026-0849', location: 'Bay B-2', lastMaintenance: '2026-07-28', nextMaintenance: '2026-09-28', spindleHours: 9450 },
  { id: 'M005', code: 'GRIND-01', name: 'CNC Cylindrical Grinder', type: 'Grinding', status: 'Maintenance', utilization: 0, operator: '—', currentJob: null, location: 'Bay C-1', lastMaintenance: '2026-09-01', nextMaintenance: '2026-09-04', spindleHours: 16280 },
  { id: 'M006', code: 'EDM-01', name: 'Wire EDM Machine', type: 'EDM', status: 'Running', utilization: 81, operator: 'M. Iyer', currentJob: 'WO-2026-0855', location: 'Bay C-2', lastMaintenance: '2026-08-15', nextMaintenance: '2026-09-15', spindleHours: 11200 },
  { id: 'M007', code: 'CNC-T01', name: 'CNC Turning Center', type: 'Turning', status: 'Breakdown', utilization: 0, operator: '—', currentJob: null, location: 'Bay A-3', lastMaintenance: '2026-08-22', nextMaintenance: '2026-09-22', spindleHours: 19500 },
];

export interface Customer {
  id: string;
  name: string;
  industry: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  totalOrders: number;
  totalValue: number;
  outstanding: number;
  status: 'Active' | 'Inactive';
  rating: number;
}

export const customers: Customer[] = [
  { id: 'CUST-001', name: 'Bharat Aerospace Ltd', industry: 'Aerospace', contact: 'Vikram Rao', email: 'vk.rao@bharataero.in', phone: '+91 98200 11223', city: 'Bengaluru', totalOrders: 47, totalValue: 8420000, outstanding: 320000, status: 'Active', rating: 5 },
  { id: 'CUST-002', name: 'Maruti Precision Components', industry: 'Automotive', contact: 'Deepak Joshi', email: 'd.joshi@marutipc.in', phone: '+91 98101 44556', city: 'Gurgaon', totalOrders: 89, totalValue: 12650000, outstanding: 0, status: 'Active', rating: 5 },
  { id: 'CUST-003', name: 'Tata Defense Systems', industry: 'Defense', contact: 'Anil Kapoor', email: 'a.kapoor@tatadef.in', phone: '+91 98225 77889', city: 'Pune', totalOrders: 34, totalValue: 15320000, outstanding: 850000, status: 'Active', rating: 4 },
  { id: 'CUST-004', name: 'ISRO Propulsion Division', industry: 'Space', contact: 'Dr. S. Menon', email: 's.menon@isro.gov.in', phone: '+91 98400 22331', city: 'Thiruvananthapuram', totalOrders: 12, totalValue: 6200000, outstanding: 0, status: 'Active', rating: 5 },
  { id: 'CUST-005', name: 'L&T Heavy Engineering', industry: 'Industrial', contact: 'Rajesh Gupta', email: 'r.gupta@lthe.in', phone: '+91 98300 55667', city: 'Mumbai', totalOrders: 56, totalValue: 9870000, outstanding: 210000, status: 'Active', rating: 4 },
  { id: 'CUST-006', name: 'Godrej Aerospace', industry: 'Aerospace', contact: 'P. Krishnan', email: 'p.krishnan@godrejareo.in', phone: '+91 98450 88990', city: 'Mumbai', totalOrders: 23, totalValue: 4520000, outstanding: 0, status: 'Active', rating: 4 },
  { id: 'CUST-007', name: 'Ashok Leyland Defense', industry: 'Defense', contact: 'S. Subramanian', email: 's.sub@ashokleyland.in', phone: '+91 98400 11200', city: 'Chennai', totalOrders: 18, totalValue: 3210000, outstanding: 180000, status: 'Active', rating: 3 },
  { id: 'CUST-008', name: 'Kalyani Stratsun', industry: 'Defense', contact: 'N. Prasad', email: 'n.prasad@kalyani.in', phone: '+91 98220 33445', city: 'Pune', totalOrders: 29, totalValue: 7890000, outstanding: 0, status: 'Active', rating: 5 },
  { id: 'CUST-009', name: 'Hyundai Precision India', industry: 'Automotive', contact: 'J. Park', email: 'j.park@hmp.in', phone: '+91 98100 99887', city: 'Chennai', totalOrders: 41, totalValue: 5630000, outstanding: 95000, status: 'Active', rating: 4 },
  { id: 'CUST-010', name: 'Siemens Energy India', industry: 'Energy', contact: 'M. Banerjee', email: 'm.ban@siemens.in', phone: '+91 98330 22110', city: 'Gurgaon', totalOrders: 7, totalValue: 2150000, outstanding: 0, status: 'Inactive', rating: 3 },
];

export interface Enquiry {
  id: string;
  enquiryNo: string;
  customer: string;
  partName: string;
  partNo: string;
  quantity: number;
  expectedDate: string;
  receivedDate: string;
  status: 'New' | 'Under Review' | 'Quoted' | 'Converted' | 'Lost';
  estimatedValue: number;
  source: string;
}

export const enquiries: Enquiry[] = [
  { id: '1', enquiryNo: 'ENQ-2026-0142', customer: 'Bharat Aerospace Ltd', partName: 'Turbine Bracket', partNo: 'BA-TB-204', quantity: 500, expectedDate: '2026-10-15', receivedDate: '2026-09-01', status: 'New', estimatedValue: 850000, source: 'Direct' },
  { id: '2', enquiryNo: 'ENQ-2026-0141', customer: 'Maruti Precision Components', partName: 'Gear Housing', partNo: 'MPC-GH-118', quantity: 2000, expectedDate: '2026-10-20', receivedDate: '2026-08-30', status: 'Under Review', estimatedValue: 1240000, source: 'Direct' },
  { id: '3', enquiryNo: 'ENQ-2026-0140', customer: 'Tata Defense Systems', partName: 'Mounting Flange', partNo: 'TDS-MF-077', quantity: 150, expectedDate: '2026-10-05', receivedDate: '2026-08-28', status: 'Quoted', estimatedValue: 420000, source: 'Tender' },
  { id: '4', enquiryNo: 'ENQ-2026-0139', customer: 'ISRO Propulsion Division', partName: 'Nozzle Insert', partNo: 'IPD-NI-015', quantity: 24, expectedDate: '2026-11-01', receivedDate: '2026-08-25', status: 'Converted', estimatedValue: 1850000, source: 'Tender' },
  { id: '5', enquiryNo: 'ENQ-2026-0138', customer: 'L&T Heavy Engineering', partName: 'Shaft Coupling', partNo: 'LHE-SC-301', quantity: 800, expectedDate: '2026-10-10', receivedDate: '2026-08-22', status: 'New', estimatedValue: 680000, source: 'Direct' },
  { id: '6', enquiryNo: 'ENQ-2026-0137', customer: 'Godrej Aerospace', partName: 'Actuator Bracket', partNo: 'GA-AB-052', quantity: 320, expectedDate: '2026-10-25', receivedDate: '2026-08-20', status: 'Lost', estimatedValue: 540000, source: 'Direct' },
  { id: '7', enquiryNo: 'ENQ-2026-0136', customer: 'Kalyani Stratsun', partName: 'Weapon Mount', partNo: 'KS-WM-019', quantity: 60, expectedDate: '2026-11-10', receivedDate: '2026-08-18', status: 'Quoted', estimatedValue: 980000, source: 'Tender' },
  { id: '8', enquiryNo: 'ENQ-2026-0135', customer: 'Hyundai Precision India', partName: 'Engine Bracket', partNo: 'HPI-EB-244', quantity: 5000, expectedDate: '2026-10-30', receivedDate: '2026-08-15', status: 'Converted', estimatedValue: 2150000, source: 'Direct' },
];

export interface Quotation {
  id: string;
  quoteNo: string;
  customer: string;
  enquiryNo: string;
  partName: string;
  quantity: number;
  unitPrice: number;
  totalValue: number;
  validTill: string;
  date: string;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected' | 'Expired';
}

export const quotations: Quotation[] = [
  { id: '1', quoteNo: 'QT-2026-0089', customer: 'Bharat Aerospace Ltd', enquiryNo: 'ENQ-2026-0142', partName: 'Turbine Bracket', quantity: 500, unitPrice: 1700, totalValue: 850000, validTill: '2026-10-01', date: '2026-09-02', status: 'Draft' },
  { id: '2', quoteNo: 'QT-2026-0088', customer: 'Tata Defense Systems', enquiryNo: 'ENQ-2026-0140', partName: 'Mounting Flange', quantity: 150, unitPrice: 2800, totalValue: 420000, validTill: '2026-09-28', date: '2026-08-29', status: 'Sent' },
  { id: '3', quoteNo: 'QT-2026-0087', customer: 'ISRO Propulsion Division', enquiryNo: 'ENQ-2026-0139', partName: 'Nozzle Insert', quantity: 24, unitPrice: 77000, totalValue: 1848000, validTill: '2026-09-25', date: '2026-08-26', status: 'Accepted' },
  { id: '4', quoteNo: 'QT-2026-0086', customer: 'Kalyani Stratsun', enquiryNo: 'ENQ-2026-0136', partName: 'Weapon Mount', quantity: 60, unitPrice: 16300, totalValue: 978000, validTill: '2026-09-20', date: '2026-08-19', status: 'Sent' },
  { id: '5', quoteNo: 'QT-2026-0085', customer: 'Godrej Aerospace', enquiryNo: 'ENQ-2026-0137', partName: 'Actuator Bracket', quantity: 320, unitPrice: 1680, totalValue: 537600, validTill: '2026-09-15', date: '2026-08-21', status: 'Rejected' },
  { id: '6', quoteNo: 'QT-2026-0084', customer: 'Hyundai Precision India', enquiryNo: 'ENQ-2026-0135', partName: 'Engine Bracket', quantity: 5000, unitPrice: 430, totalValue: 2150000, validTill: '2026-09-18', date: '2026-08-16', status: 'Accepted' },
  { id: '7', quoteNo: 'QT-2026-0083', customer: 'L&T Heavy Engineering', enquiryNo: 'ENQ-2026-0138', partName: 'Shaft Coupling', quantity: 800, unitPrice: 850, totalValue: 680000, validTill: '2026-09-22', date: '2026-08-23', status: 'Draft' },
];

export interface SalesOrder {
  id: string;
  orderNo: string;
  customer: string;
  quoteNo: string;
  partName: string;
  partNo: string;
  quantity: number;
  delivered: number;
  value: number;
  orderDate: string;
  deliveryDate: string;
  status: 'Confirmed' | 'In Production' | 'Partially Delivered' | 'Delivered' | 'On Hold';
}

export const salesOrders: SalesOrder[] = [
  { id: '1', orderNo: 'SO-2026-0067', customer: 'ISRO Propulsion Division', quoteNo: 'QT-2026-0087', partName: 'Nozzle Insert', partNo: 'IPD-NI-015', quantity: 24, delivered: 8, value: 1848000, orderDate: '2026-08-27', deliveryDate: '2026-11-01', status: 'In Production' },
  { id: '2', orderNo: 'SO-2026-0066', customer: 'Hyundai Precision India', quoteNo: 'QT-2026-0084', partName: 'Engine Bracket', partNo: 'HPI-EB-244', quantity: 5000, delivered: 1500, value: 2150000, orderDate: '2026-08-17', deliveryDate: '2026-10-30', status: 'Partially Delivered' },
  { id: '3', orderNo: 'SO-2026-0065', customer: 'Maruti Precision Components', quoteNo: 'QT-2026-0082', partName: 'Gear Housing', partNo: 'MPC-GH-118', quantity: 2000, delivered: 2000, value: 1240000, orderDate: '2026-07-15', deliveryDate: '2026-09-10', status: 'Delivered' },
  { id: '4', orderNo: 'SO-2026-0064', customer: 'Bharat Aerospace Ltd', quoteNo: 'QT-2026-0080', partName: 'Wing Fitting', partNo: 'BA-WF-188', quantity: 200, delivered: 0, value: 960000, orderDate: '2026-08-20', deliveryDate: '2026-10-20', status: 'Confirmed' },
  { id: '5', orderNo: 'SO-2026-0063', customer: 'Tata Defense Systems', quoteNo: 'QT-2026-0079', partName: 'Sensor Housing', partNo: 'TDS-SH-045', quantity: 400, delivered: 120, value: 720000, orderDate: '2026-08-10', deliveryDate: '2026-10-05', status: 'In Production' },
  { id: '6', orderNo: 'SO-2026-0062', customer: 'Kalyani Stratsun', quoteNo: 'QT-2026-0078', partName: 'Mounting Plate', partNo: 'KS-MP-031', quantity: 100, delivered: 0, value: 540000, orderDate: '2026-08-05', deliveryDate: '2026-10-15', status: 'On Hold' },
  { id: '7', orderNo: 'SO-2026-0061', customer: 'L&T Heavy Engineering', quoteNo: 'QT-2026-0077', partName: 'Pump Casing', partNo: 'LHE-PC-288', quantity: 300, delivered: 300, value: 870000, orderDate: '2026-07-20', deliveryDate: '2026-09-15', status: 'Delivered' },
];

export interface Delivery {
  id: string;
  deliveryNo: string;
  orderNo: string;
  customer: string;
  partName: string;
  quantity: number;
  dispatchDate: string;
  expectedDelivery: string;
  carrier: string;
  trackingNo: string;
  status: 'Pending' | 'Dispatched' | 'In Transit' | 'Delivered' | 'Delayed';
}

export const deliveries: Delivery[] = [
  { id: '1', deliveryNo: 'DN-2026-0054', orderNo: 'SO-2026-0066', customer: 'Hyundai Precision India', partName: 'Engine Bracket', quantity: 1500, dispatchDate: '2026-09-03', expectedDelivery: '2026-09-07', carrier: 'Blue Dart Express', trackingNo: 'BD8872934IN', status: 'In Transit' },
  { id: '2', deliveryNo: 'DN-2026-0053', orderNo: 'SO-2026-0065', customer: 'Maruti Precision Components', partName: 'Gear Housing', quantity: 2000, dispatchDate: '2026-09-01', expectedDelivery: '2026-09-05', carrier: 'DTDC', trackingNo: 'DT5512087IN', status: 'Delivered' },
  { id: '3', deliveryNo: 'DN-2026-0052', orderNo: 'SO-2026-0061', customer: 'L&T Heavy Engineering', partName: 'Pump Casing', quantity: 300, dispatchDate: '2026-08-30', expectedDelivery: '2026-09-03', carrier: 'Safe Express', trackingNo: 'SF9920145IN', status: 'Delivered' },
  { id: '4', deliveryNo: 'DN-2026-0051', orderNo: 'SO-2026-0063', customer: 'Tata Defense Systems', partName: 'Sensor Housing', quantity: 120, dispatchDate: '2026-09-05', expectedDelivery: '2026-09-09', carrier: 'Blue Dart Express', trackingNo: 'BD8872998IN', status: 'Pending' },
  { id: '5', deliveryNo: 'DN-2026-0050', orderNo: 'SO-2026-0067', customer: 'ISRO Propulsion Division', partName: 'Nozzle Insert', quantity: 8, dispatchDate: '2026-08-28', expectedDelivery: '2026-09-04', carrier: 'Professional Courier', trackingNo: 'PC4451287IN', status: 'Delayed' },
];

export interface PartMaster {
  id: string;
  partNo: string;
  partName: string;
  drawingNo: string;
  revision: string;
  material: string;
  surfaceFinish: string;
  tolerance: string;
  category: string;
  weight: number;
  unit: string;
  status: 'Active' | 'Obsolete' | 'Prototype';
}

export const parts: PartMaster[] = [
  { id: '1', partNo: 'BA-TB-204', partName: 'Turbine Bracket', drawingNo: 'DWG-BA-TB-204-R3', revision: 'R3', material: 'Inconel 718', surfaceFinish: 'Ra 1.6', tolerance: '±0.02mm', category: 'Aerospace', weight: 0.85, unit: 'kg', status: 'Active' },
  { id: '2', partNo: 'MPC-GH-118', partName: 'Gear Housing', drawingNo: 'DWG-MPC-GH-118-R2', revision: 'R2', material: 'Aluminum 7075-T6', surfaceFinish: 'Ra 3.2', tolerance: '±0.05mm', category: 'Automotive', weight: 2.4, unit: 'kg', status: 'Active' },
  { id: '3', partNo: 'IPD-NI-015', partName: 'Nozzle Insert', drawingNo: 'DWG-IPD-NI-015-R1', revision: 'R1', material: 'Hastelloy C-276', surfaceFinish: 'Ra 0.8', tolerance: '±0.01mm', category: 'Space', weight: 1.2, unit: 'kg', status: 'Active' },
  { id: '4', partNo: 'TDS-MF-077', partName: 'Mounting Flange', drawingNo: 'DWG-TDS-MF-077-R4', revision: 'R4', material: 'SS 316L', surfaceFinish: 'Ra 1.6', tolerance: '±0.03mm', category: 'Defense', weight: 3.8, unit: 'kg', status: 'Active' },
  { id: '5', partNo: 'HPI-EB-244', partName: 'Engine Bracket', drawingNo: 'DWG-HPI-EB-244-R2', revision: 'R2', material: 'Aluminum 6061-T6', surfaceFinish: 'Ra 3.2', tolerance: '±0.1mm', category: 'Automotive', weight: 0.45, unit: 'kg', status: 'Active' },
  { id: '6', partNo: 'KS-WM-019', partName: 'Weapon Mount', drawingNo: 'DWG-KS-WM-019-R1', revision: 'R1', material: 'EN24 Alloy Steel', surfaceFinish: 'Ra 1.6', tolerance: '±0.02mm', category: 'Defense', weight: 5.6, unit: 'kg', status: 'Active' },
  { id: '7', partNo: 'LHE-SC-301', partName: 'Shaft Coupling', drawingNo: 'DWG-LHE-SC-301-R5', revision: 'R5', material: 'EN31 Bearing Steel', surfaceFinish: 'Ra 0.8', tolerance: '±0.01mm', category: 'Industrial', weight: 1.8, unit: 'kg', status: 'Active' },
  { id: '8', partNo: 'BA-WF-188', partName: 'Wing Fitting', drawingNo: 'DWG-BA-WF-188-R2', revision: 'R2', material: 'Titanium Ti-6Al-4V', surfaceFinish: 'Ra 1.6', tolerance: '±0.02mm', category: 'Aerospace', weight: 2.1, unit: 'kg', status: 'Active' },
  { id: '9', partNo: 'TDS-SH-045', partName: 'Sensor Housing', drawingNo: 'DWG-TDS-SH-045-R3', revision: 'R3', material: 'SS 304', surfaceFinish: 'Ra 1.6', tolerance: '±0.05mm', category: 'Defense', weight: 0.95, unit: 'kg', status: 'Active' },
  { id: '10', partNo: 'GA-AB-052', partName: 'Actuator Bracket', drawingNo: 'DWG-GA-AB-052-R0', revision: 'R0', material: 'Aluminum 2024-T3', surfaceFinish: 'Ra 3.2', tolerance: '±0.1mm', category: 'Aerospace', weight: 0.6, unit: 'kg', status: 'Prototype' },
  { id: '11', partNo: 'LHE-PC-288', partName: 'Pump Casing', drawingNo: 'DWG-LHE-PC-288-R1', revision: 'R1', material: 'Cast Iron GG25', surfaceFinish: 'Ra 6.3', tolerance: '±0.1mm', category: 'Industrial', weight: 8.5, unit: 'kg', status: 'Active' },
  { id: '12', partNo: 'MPC-GS-205', partName: 'Gear Shaft', drawingNo: 'DWG-MPC-GS-205-R1', revision: 'R1', material: 'EN36B Case Hardened', surfaceFinish: 'Ra 0.8', tolerance: '±0.01mm', category: 'Automotive', weight: 1.1, unit: 'kg', status: 'Obsolete' },
];

export interface BOMItem {
  level: number;
  partNo: string;
  partName: string;
  material: string;
  quantity: number;
  unit: string;
  make: string;
  operation: string;
}

export const bom: BOMItem[] = [
  { level: 0, partNo: 'BA-TB-204', partName: 'Turbine Bracket (Assembly)', material: 'Inconel 718', quantity: 1, unit: 'SET', make: 'Make', operation: '—' },
  { level: 1, partNo: 'BA-TB-204-A', partName: 'Bracket Body', material: 'Inconel 718', quantity: 1, unit: 'PC', make: 'Make', operation: 'Turn + Mill + Grind' },
  { level: 1, partNo: 'BA-TB-204-B', partName: 'Mounting Plate', material: 'Inconel 718', quantity: 1, unit: 'PC', make: 'Make', operation: 'Mill + Drill' },
  { level: 1, partNo: 'BA-TB-204-C', partName: 'Fastener Kit', material: 'A286 CRES', quantity: 8, unit: 'SET', make: 'Buy', operation: '—' },
  { level: 2, partNo: 'BA-TB-204-A-1', partName: 'Raw Blank', material: 'Inconel 718 Bar', quantity: 1, unit: 'PC', make: 'Buy', operation: '—' },
];

export interface RoutingOp {
  opNo: number;
  operation: string;
  machine: string;
  setupTime: number;
  cycleTime: number;
  tools: string;
  description: string;
  cncProgram?: string;
}

export const routing: RoutingOp[] = [
  { opNo: 10, operation: 'Facing & Turning', machine: 'CNC-T01', setupTime: 45, cycleTime: 12.5, tools: 'TNMG-160404, Drill Ø12', description: 'Face both ends, turn OD to Ø48±0.02, drill center hole' },
  { opNo: 20, operation: 'Rough Milling', machine: 'VMC-02', setupTime: 60, cycleTime: 18.0, tools: 'Ø10 End Mill, Ø16 End Mill', description: 'Rough profile to 0.5mm stock allowance' },
  { opNo: 30, operation: 'Finish Milling', machine: 'VMC-02', setupTime: 15, cycleTime: 8.5, tools: 'Ø6 Ball Mill, Ø8 End Mill', description: 'Finish profile to drawing dimensions' },
  { opNo: 40, operation: 'Drilling & Tapping', machine: 'VMC-02', setupTime: 20, cycleTime: 5.0, tools: 'Ø5.5 Drill, M6 Tap', description: 'Drill and tap 4x M6 mounting holes' },
  { opNo: 50, operation: '5-Axis Contouring', machine: 'VTL-01', setupTime: 90, cycleTime: 22.0, tools: 'Ø4 Ball Mill', description: '5-axis contour on complex surfaces' },
  { opNo: 60, operation: 'Grinding', machine: 'GRIND-01', setupTime: 30, cycleTime: 6.0, tools: 'Grinding Wheel G46', description: 'Surface grind to Ra 1.6' },
  { opNo: 70, operation: 'Inspection', machine: 'CMM', setupTime: 10, cycleTime: 8.0, tools: 'CMM Probe', description: 'Full dimensional inspection on CMM' },
];

export interface WorkOrder {
  id: string;
  woNo: string;
  partName: string;
  partNo: string;
  customer: string;
  salesOrder: string;
  quantity: number;
  completed: number;
  rejected: number;
  startDate: string;
  dueDate: string;
  status: OrderStatus;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
}

export const workOrders: WorkOrder[] = [
  { id: '1', woNo: 'WO-2026-0847', partName: 'Turbine Bracket', partNo: 'BA-TB-204', customer: 'Bharat Aerospace Ltd', salesOrder: 'SO-2026-0064', quantity: 500, completed: 180, rejected: 6, startDate: '2026-08-25', dueDate: '2026-10-15', status: 'In Progress', priority: 'High' },
  { id: '2', woNo: 'WO-2026-0851', partName: 'Gear Housing', partNo: 'MPC-GH-118', customer: 'Maruti Precision Components', salesOrder: 'SO-2026-0066', quantity: 2000, completed: 850, rejected: 12, startDate: '2026-08-20', dueDate: '2026-10-20', status: 'In Progress', priority: 'High' },
  { id: '3', woNo: 'WO-2026-0849', partName: 'Nozzle Insert', partNo: 'IPD-NI-015', customer: 'ISRO Propulsion Division', salesOrder: 'SO-2026-0067', quantity: 24, completed: 8, rejected: 0, startDate: '2026-08-28', dueDate: '2026-11-01', status: 'In Progress', priority: 'Critical' },
  { id: '4', woNo: 'WO-2026-0853', partName: 'Mounting Flange', partNo: 'TDS-MF-077', customer: 'Tata Defense Systems', salesOrder: 'SO-2026-0063', quantity: 150, completed: 0, rejected: 0, startDate: '2026-09-05', dueDate: '2026-10-05', status: 'Planning', priority: 'Medium' },
  { id: '5', woNo: 'WO-2026-0855', partName: 'Engine Bracket', partNo: 'HPI-EB-244', customer: 'Hyundai Precision India', salesOrder: 'SO-2026-0066', quantity: 5000, completed: 1500, rejected: 25, startDate: '2026-08-15', dueDate: '2026-10-30', status: 'In Progress', priority: 'High' },
  { id: '6', woNo: 'WO-2026-0842', partName: 'Gear Housing', partNo: 'MPC-GH-118', customer: 'Maruti Precision Components', salesOrder: 'SO-2026-0065', quantity: 2000, completed: 2000, rejected: 15, startDate: '2026-07-15', dueDate: '2026-09-10', status: 'Completed', priority: 'Medium' },
  { id: '7', woNo: 'WO-2026-0838', partName: 'Pump Casing', partNo: 'LHE-PC-288', customer: 'L&T Heavy Engineering', salesOrder: 'SO-2026-0061', quantity: 300, completed: 300, rejected: 4, startDate: '2026-07-20', dueDate: '2026-09-15', status: 'Completed', priority: 'Medium' },
  { id: '8', woNo: 'WO-2026-0860', partName: 'Weapon Mount', partNo: 'KS-WM-019', customer: 'Kalyani Stratsun', salesOrder: 'SO-2026-0062', quantity: 60, completed: 0, rejected: 0, startDate: '2026-09-10', dueDate: '2026-10-15', status: 'On Hold', priority: 'Low' },
];

export interface JobCard {
  id: string;
  jobNo: string;
  workOrder: string;
  partName: string;
  operation: string;
  opNo: number;
  machine: string;
  operator: string;
  cncProgram: string;
  toolNo: string;
  qtyPlanned: number;
  qtyCompleted: number;
  qtyRejected: number;
  cycleTime: number;
  setupTime: number;
  startDate: string;
  status: JobStatus;
}

export const jobCards: JobCard[] = [
  { id: '1', jobNo: 'JC-0847-10', workOrder: 'WO-2026-0847', partName: 'Turbine Bracket', operation: 'Facing & Turning', opNo: 10, machine: 'CNC-T01', operator: 'R. Sharma', cncProgram: 'O8471', toolNo: 'T01-T04', qtyPlanned: 500, qtyCompleted: 180, qtyRejected: 6, cycleTime: 12.5, setupTime: 45, startDate: '2026-08-25', status: 'Running' },
  { id: '2', jobNo: 'JC-0851-20', workOrder: 'WO-2026-0851', partName: 'Gear Housing', operation: 'Rough Milling', opNo: 20, machine: 'VMC-02', operator: 'A. Patel', cncProgram: 'O8512', toolNo: 'T02-T06', qtyPlanned: 2000, qtyCompleted: 850, qtyRejected: 12, cycleTime: 18.0, setupTime: 60, startDate: '2026-08-20', status: 'Running' },
  { id: '3', jobNo: 'JC-0849-50', workOrder: 'WO-2026-0849', partName: 'Nozzle Insert', operation: '5-Axis Contouring', opNo: 50, machine: 'VTL-01', operator: 'S. Nair', cncProgram: 'O8495', toolNo: 'T03-T08', qtyPlanned: 24, qtyCompleted: 8, qtyRejected: 0, cycleTime: 22.0, setupTime: 90, startDate: '2026-08-28', status: 'Running' },
  { id: '4', jobNo: 'JC-0855-10', workOrder: 'WO-2026-0855', partName: 'Engine Bracket', operation: 'Facing & Turning', opNo: 10, machine: 'VMC-01', operator: 'K. Reddy', cncProgram: 'O8551', toolNo: 'T01-T05', qtyPlanned: 5000, qtyCompleted: 1500, qtyRejected: 25, cycleTime: 8.0, setupTime: 30, startDate: '2026-08-15', status: 'Running' },
  { id: '5', jobNo: 'JC-0853-10', workOrder: 'WO-2026-0853', partName: 'Mounting Flange', operation: 'Facing & Turning', opNo: 10, machine: 'CNC-T01', operator: '—', cncProgram: 'O8531', toolNo: 'T01-T03', qtyPlanned: 150, qtyCompleted: 0, qtyRejected: 0, cycleTime: 10.0, setupTime: 40, startDate: '2026-09-05', status: 'Pending' },
  { id: '6', jobNo: 'JC-0842-30', workOrder: 'WO-2026-0842', partName: 'Gear Housing', operation: 'Finish Milling', opNo: 30, machine: 'VMC-02', operator: 'A. Patel', cncProgram: 'O8423', toolNo: 'T04-T07', qtyPlanned: 2000, qtyCompleted: 2000, qtyRejected: 15, cycleTime: 8.5, setupTime: 15, startDate: '2026-08-28', status: 'Completed' },
  { id: '7', jobNo: 'JC-0847-20', workOrder: 'WO-2026-0847', partName: 'Turbine Bracket', operation: 'Rough Milling', opNo: 20, machine: 'VMC-02', operator: '—', cncProgram: 'O8472', toolNo: 'T02-T06', qtyPlanned: 500, qtyCompleted: 0, qtyRejected: 0, cycleTime: 18.0, setupTime: 60, startDate: '2026-09-06', status: 'Setup' },
];

export interface RawMaterial {
  id: string;
  materialCode: string;
  name: string;
  grade: string;
  form: string;
  specification: string;
  uom: string;
  stockQty: number;
  minStock: number;
  reorderQty: number;
  unitCost: number;
  location: string;
  status: StockStatus;
}

export const rawMaterials: RawMaterial[] = [
  { id: '1', materialCode: 'RM-IN718-B', name: 'Inconel 718 Bar', grade: 'Inconel 718', form: 'Round Bar Ø50', specification: 'ASTM B637', uom: 'kg', stockQty: 340, minStock: 100, reorderQty: 200, unitCost: 4200, location: 'Store-A1', status: 'In Stock' },
  { id: '2', materialCode: 'RM-AL7075-P', name: 'Aluminum 7075-T6 Plate', grade: 'Al 7075-T6', form: 'Plate 20mm', specification: 'ASTM B209', uom: 'kg', stockQty: 85, minStock: 120, reorderQty: 300, unitCost: 850, location: 'Store-A2', status: 'Low Stock' },
  { id: '3', materialCode: 'RM-SS316-B', name: 'SS 316L Bar', grade: 'SS 316L', form: 'Round Bar Ø40', specification: 'ASTM A276', uom: 'kg', stockQty: 520, minStock: 150, reorderQty: 300, unitCost: 320, location: 'Store-A3', status: 'In Stock' },
  { id: '4', materialCode: 'RM-HAST-C', name: 'Hastelloy C-276 Bar', grade: 'Hastelloy C-276', form: 'Round Bar Ø35', specification: 'ASTM B574', uom: 'kg', stockQty: 48, minStock: 60, reorderQty: 100, unitCost: 6800, location: 'Store-B1', status: 'Low Stock' },
  { id: '5', materialCode: 'RM-TI64-P', name: 'Titanium Ti-6Al-4V Plate', grade: 'Ti-6Al-4V', form: 'Plate 12mm', specification: 'ASTM B265', uom: 'kg', stockQty: 0, minStock: 40, reorderQty: 80, unitCost: 5200, location: 'Store-B2', status: 'Out of Stock' },
  { id: '6', materialCode: 'RM-EN24-B', name: 'EN24 Alloy Steel Bar', grade: 'EN24', form: 'Round Bar Ø60', specification: 'BS 970', uom: 'kg', stockQty: 680, minStock: 200, reorderQty: 400, unitCost: 180, location: 'Store-A4', status: 'In Stock' },
  { id: '7', materialCode: 'RM-EN31-B', name: 'EN31 Bearing Steel Bar', grade: 'EN31', form: 'Round Bar Ø45', specification: 'BS 970', uom: 'kg', stockQty: 420, minStock: 100, reorderQty: 200, unitCost: 210, location: 'Store-A5', status: 'In Stock' },
  { id: '8', materialCode: 'RM-AL6061-P', name: 'Aluminum 6061-T6 Plate', grade: 'Al 6061-T6', form: 'Plate 15mm', specification: 'ASTM B209', uom: 'kg', stockQty: 190, minStock: 80, reorderQty: 200, unitCost: 420, location: 'Store-A6', status: 'In Stock' },
  { id: '9', materialCode: 'RM-SS304-B', name: 'SS 304 Bar', grade: 'SS 304', form: 'Round Bar Ø30', specification: 'ASTM A276', uom: 'kg', stockQty: 95, minStock: 100, reorderQty: 250, unitCost: 280, location: 'Store-A7', status: 'Low Stock' },
  { id: '10', materialCode: 'RM-A286-F', name: 'A286 CRES Fasteners', grade: 'A286', form: 'M6x1.0 SHCS', specification: 'NAS1351', uom: 'set', stockQty: 1200, minStock: 500, reorderQty: 1000, unitCost: 45, location: 'Store-C1', status: 'In Stock' },
];

export interface StockMovement {
  id: string;
  date: string;
  type: 'Receipt' | 'Issue' | 'Transfer' | 'Adjustment';
  material: string;
  qty: number;
  uom: string;
  from: string;
  to: string;
  reference: string;
  user: string;
}

export const stockMovements: StockMovement[] = [
  { id: '1', date: '2026-09-05', type: 'Issue', material: 'Inconel 718 Bar', qty: 50, uom: 'kg', from: 'Store-A1', to: 'Shop Floor', reference: 'WO-2026-0847', user: 'P. Stores' },
  { id: '2', date: '2026-09-04', type: 'Receipt', material: 'SS 316L Bar', qty: 300, uom: 'kg', from: 'Supplier: Jindal Steel', to: 'Store-A3', reference: 'PO-2026-0045', user: 'P. Stores' },
  { id: '3', date: '2026-09-03', type: 'Issue', material: 'Aluminum 7075-T6 Plate', qty: 35, uom: 'kg', from: 'Store-A2', to: 'Shop Floor', reference: 'WO-2026-0851', user: 'P. Stores' },
  { id: '4', date: '2026-09-02', type: 'Transfer', material: 'EN24 Alloy Steel Bar', qty: 100, uom: 'kg', from: 'Store-A4', to: 'Store-B3', reference: 'TRF-0034', user: 'R. Stores' },
  { id: '5', date: '2026-09-01', type: 'Adjustment', material: 'Hastelloy C-276 Bar', qty: -3, uom: 'kg', from: 'Store-B1', to: '—', reference: 'ADJ-0012', user: 'R. Stores' },
  { id: '6', date: '2026-08-31', type: 'Issue', material: 'Titanium Ti-6Al-4V Plate', qty: 12, uom: 'kg', from: 'Store-B2', to: 'Shop Floor', reference: 'WO-2026-0840', user: 'P. Stores' },
];

export interface Supplier {
  id: string;
  name: string;
  category: string;
  contact: string;
  email: string;
  phone: string;
  city: string;
  rating: number;
  onTimeRate: number;
  totalOrders: number;
  totalValue: number;
  outstanding: number;
  status: 'Active' | 'Inactive';
}

export const suppliers: Supplier[] = [
  { id: 'SUP-001', name: 'Jindal Steel & Power', category: 'Raw Material', contact: 'R. Agarwal', email: 'ragarwal@jindal.in', phone: '+91 98180 11223', city: 'Hisar', rating: 5, onTimeRate: 94, totalOrders: 56, totalValue: 4280000, outstanding: 180000, status: 'Active' },
  { id: 'SUP-002', name: 'Sandvik Coromant India', category: 'Tooling', contact: 'K. Srinivas', email: 'k.srinivas@sandvik.in', phone: '+91 98400 44556', city: 'Bengaluru', rating: 5, onTimeRate: 97, totalOrders: 89, totalValue: 2150000, outstanding: 0, status: 'Active' },
  { id: 'SUP-003', name: 'Kennametal India', category: 'Tooling', contact: 'V. Menon', email: 'v.menon@kennametal.in', phone: '+91 98225 77889', city: 'Pune', rating: 4, onTimeRate: 91, totalOrders: 42, totalValue: 1340000, outstanding: 95000, status: 'Active' },
  { id: 'SUP-004', name: 'Tata Steel Speciality', category: 'Raw Material', contact: 'S. Bose', email: 's.bose@tatasteel.in', phone: '+91 98300 55667', city: 'Jamshedpur', rating: 4, onTimeRate: 88, totalOrders: 34, totalValue: 3120000, outstanding: 0, status: 'Active' },
  { id: 'SUP-005', name: 'Mitsubishi Materials India', category: 'Tooling', contact: 'T. Nakamura', email: 't.nakamura@mitsubishi.in', phone: '+91 98450 88990', city: 'Gurgaon', rating: 5, onTimeRate: 96, totalOrders: 28, totalValue: 980000, outstanding: 42000, status: 'Active' },
  { id: 'SUP-006', name: 'Hindalco Industries', category: 'Raw Material', contact: 'A. Desai', email: 'a.desai@hindalco.in', phone: '+91 98220 33445', city: 'Mumbai', rating: 4, onTimeRate: 90, totalOrders: 23, totalValue: 870000, outstanding: 0, status: 'Active' },
  { id: 'SUP-007', name: 'VBC Engineering', category: 'Heat Treatment', contact: 'C. Thomas', email: 'c.thomas@vbceng.in', phone: '+91 98100 99887', city: 'Chennai', rating: 3, onTimeRate: 82, totalOrders: 15, totalValue: 320000, outstanding: 28000, status: 'Active' },
  { id: 'SUP-008', name: 'Aequs Aerospace', category: 'Surface Treatment', contact: "F. D'Souza", email: 'f.dsouza@aequs.in', phone: '+91 98330 22110', city: 'Belagavi', rating: 4, onTimeRate: 89, totalOrders: 11, totalValue: 450000, outstanding: 0, status: 'Inactive' },
];

export interface PurchaseOrder {
  id: string;
  poNo: string;
  supplier: string;
  category: string;
  orderDate: string;
  expectedDate: string;
  items: number;
  totalValue: number;
  receivedQty: number;
  orderedQty: number;
  status: 'Draft' | 'Sent' | 'Partially Received' | 'Received' | 'Cancelled';
}

export const purchaseOrders: PurchaseOrder[] = [
  { id: '1', poNo: 'PO-2026-0048', supplier: 'Jindal Steel & Power', category: 'Raw Material', orderDate: '2026-09-02', expectedDate: '2026-09-15', items: 3, totalValue: 840000, receivedQty: 0, orderedQty: 500, status: 'Sent' },
  { id: '2', poNo: 'PO-2026-0047', supplier: 'Sandvik Coromant India', category: 'Tooling', orderDate: '2026-08-30', expectedDate: '2026-09-10', items: 12, totalValue: 185000, receivedQty: 8, orderedQty: 12, status: 'Partially Received' },
  { id: '3', poNo: 'PO-2026-0046', supplier: 'Hindalco Industries', category: 'Raw Material', orderDate: '2026-08-28', expectedDate: '2026-09-12', items: 2, totalValue: 320000, receivedQty: 300, orderedQty: 300, status: 'Received' },
  { id: '4', poNo: 'PO-2026-0045', supplier: 'Tata Steel Speciality', category: 'Raw Material', orderDate: '2026-08-25', expectedDate: '2026-09-08', items: 4, totalValue: 680000, receivedQty: 300, orderedQty: 500, status: 'Partially Received' },
  { id: '5', poNo: 'PO-2026-0044', supplier: 'Kennametal India', category: 'Tooling', orderDate: '2026-08-22', expectedDate: '2026-09-05', items: 8, totalValue: 95000, receivedQty: 8, orderedQty: 8, status: 'Received' },
  { id: '6', poNo: 'PO-2026-0043', supplier: 'Mitsubishi Materials India', category: 'Tooling', orderDate: '2026-08-20', expectedDate: '2026-09-03', items: 6, totalValue: 72000, receivedQty: 0, orderedQty: 6, status: 'Sent' },
  { id: '7', poNo: 'PO-2026-0042', supplier: 'VBC Engineering', category: 'Heat Treatment', orderDate: '2026-08-18', expectedDate: '2026-08-30', items: 1, totalValue: 45000, receivedQty: 0, orderedQty: 1, status: 'Cancelled' },
];

export interface Inspection {
  id: string;
  inspectionNo: string;
  type: 'Incoming' | 'In-Process' | 'Final';
  partName: string;
  partNo: string;
  workOrder: string;
  qtyInspected: number;
  qtyAccepted: number;
  qtyRejected: number;
  inspector: string;
  date: string;
  status: QualityStatus;
}

export const inspections: Inspection[] = [
  { id: '1', inspectionNo: 'INSP-2026-0234', type: 'In-Process', partName: 'Turbine Bracket', partNo: 'BA-TB-204', workOrder: 'WO-2026-0847', qtyInspected: 50, qtyAccepted: 48, qtyRejected: 2, inspector: 'Q. Singh', date: '2026-09-05', status: 'Pass' },
  { id: '2', inspectionNo: 'INSP-2026-0233', type: 'In-Process', partName: 'Gear Housing', partNo: 'MPC-GH-118', workOrder: 'WO-2026-0851', qtyInspected: 100, qtyAccepted: 94, qtyRejected: 6, inspector: 'Q. Singh', date: '2026-09-04', status: 'Rework' },
  { id: '3', inspectionNo: 'INSP-2026-0232', type: 'Final', partName: 'Gear Housing', partNo: 'MPC-GH-118', workOrder: 'WO-2026-0842', qtyInspected: 200, qtyAccepted: 198, qtyRejected: 2, inspector: 'P. Quality', date: '2026-09-03', status: 'Pass' },
  { id: '4', inspectionNo: 'INSP-2026-0231', type: 'Incoming', partName: 'SS 316L Bar', partNo: 'RM-SS316-B', workOrder: '—', qtyInspected: 300, qtyAccepted: 300, qtyRejected: 0, inspector: 'R. Stores', date: '2026-09-04', status: 'Pass' },
  { id: '5', inspectionNo: 'INSP-2026-0230', type: 'In-Process', partName: 'Nozzle Insert', partNo: 'IPD-NI-015', workOrder: 'WO-2026-0849', qtyInspected: 8, qtyAccepted: 8, qtyRejected: 0, inspector: 'Q. Singh', date: '2026-09-03', status: 'Pass' },
  { id: '6', inspectionNo: 'INSP-2026-0229', type: 'Final', partName: 'Engine Bracket', partNo: 'HPI-EB-244', workOrder: 'WO-2026-0855', qtyInspected: 150, qtyAccepted: 142, qtyRejected: 8, inspector: 'P. Quality', date: '2026-09-02', status: 'Fail' },
  { id: '7', inspectionNo: 'INSP-2026-0228', type: 'In-Process', partName: 'Pump Casing', partNo: 'LHE-PC-288', workOrder: 'WO-2026-0838', qtyInspected: 100, qtyAccepted: 99, qtyRejected: 1, inspector: 'Q. Singh', date: '2026-08-30', status: 'Pass' },
];

export interface NCR {
  id: string;
  ncrNo: string;
  partName: string;
  partNo: string;
  workOrder: string;
  defectType: string;
  severity: 'Minor' | 'Major' | 'Critical';
  qtyRejected: number;
  rootCause: string;
  correctiveAction: string;
  raisedBy: string;
  date: string;
  status: 'Open' | 'Under Investigation' | 'Action Taken' | 'Closed';
}

export const ncrs: NCR[] = [
  { id: '1', ncrNo: 'NCR-2026-0034', partName: 'Engine Bracket', partNo: 'HPI-EB-244', workOrder: 'WO-2026-0855', defectType: 'Dimensional Out of Tolerance', severity: 'Major', qtyRejected: 8, rootCause: 'Tool wear on Op-20', correctiveAction: 'Replaced insert, adjusted tool offset', raisedBy: 'Q. Singh', date: '2026-09-02', status: 'Action Taken' },
  { id: '2', ncrNo: 'NCR-2026-0033', partName: 'Gear Housing', partNo: 'MPC-GH-118', workOrder: 'WO-2026-0851', defectType: 'Surface Finish Below Spec', severity: 'Minor', qtyRejected: 6, rootCause: 'Coolant concentration low', correctiveAction: 'Adjusted coolant mix ratio to 8%', raisedBy: 'Q. Singh', date: '2026-09-04', status: 'Closed' },
  { id: '3', ncrNo: 'NCR-2026-0032', partName: 'Turbine Bracket', partNo: 'BA-TB-204', workOrder: 'WO-2026-0847', defectType: 'Burr at Hole Exit', severity: 'Minor', qtyRejected: 2, rootCause: 'Dull drill bit', correctiveAction: 'Replaced drill bit, added deburring op', raisedBy: 'Q. Singh', date: '2026-09-05', status: 'Open' },
  { id: '4', ncrNo: 'NCR-2026-0031', partName: 'Pump Casing', partNo: 'LHE-PC-288', workOrder: 'WO-2026-0838', defectType: 'Porosity in Casting', severity: 'Critical', qtyRejected: 1, rootCause: 'Supplier casting defect', correctiveAction: 'Returned to supplier, raised SCAR', raisedBy: 'P. Quality', date: '2026-08-28', status: 'Closed' },
];

export interface MaintenanceRecord {
  id: string;
  machineCode: string;
  machineName: string;
  type: 'Preventive' | 'Breakdown' | 'Calibration';
  description: string;
  startDate: string;
  endDate: string;
  duration: number;
  technician: string;
  cost: number;
  status: 'Scheduled' | 'In Progress' | 'Completed' | 'Overdue';
}

export const maintenanceRecords: MaintenanceRecord[] = [
  { id: '1', machineCode: 'GRIND-01', machineName: 'CNC Grinding Machine', type: 'Preventive', description: 'Quarterly PM — spindle, slides, coolant system', startDate: '2026-09-01', endDate: '2026-09-04', duration: 72, technician: 'M. Service', cost: 18000, status: 'In Progress' },
  { id: '2', machineCode: 'CNC-T01', machineName: 'CNC Turning Center', type: 'Breakdown', description: 'Spindle drive alarm — replaced servo drive board', startDate: '2026-09-03', endDate: '2026-09-05', duration: 48, technician: 'OEM Service', cost: 85000, status: 'In Progress' },
  { id: '3', machineCode: 'CNC-T01', machineName: 'CNC Turning Center', type: 'Preventive', description: 'Monthly PM — lubrication, filter change, geometry check', startDate: '2026-09-12', endDate: '2026-09-12', duration: 8, technician: 'M. Service', cost: 5000, status: 'Scheduled' },
  { id: '4', machineCode: 'VMC-02', machineName: 'CNC VMC', type: 'Calibration', description: 'Ballbar test and axis calibration', startDate: '2026-09-05', endDate: '2026-09-05', duration: 6, technician: 'M. Service', cost: 12000, status: 'Scheduled' },
  { id: '5', machineCode: 'VTL-01', machineName: '5-Axis Machining Center', type: 'Preventive', description: 'Bi-annual PM — full service, rotary axis overhaul', startDate: '2026-09-28', endDate: '2026-09-30', duration: 48, technician: 'OEM Service', cost: 45000, status: 'Scheduled' },
  { id: '6', machineCode: 'VMC-01', machineName: 'CNC VMC', type: 'Preventive', description: 'Monthly PM — lubrication, filter change', startDate: '2026-09-10', endDate: '2026-09-10', duration: 6, technician: 'M. Service', cost: 4500, status: 'Scheduled' },
  { id: '7', machineCode: 'EDM-01', machineName: 'Wire EDM', type: 'Breakdown', description: 'Wire threader failure — replaced threader unit', startDate: '2026-08-15', endDate: '2026-08-17', duration: 36, technician: 'OEM Service', cost: 38000, status: 'Completed' },
  { id: '8', machineCode: 'HMC-01', machineName: 'CNC HMC', type: 'Calibration', description: 'Annual calibration overdue — laser interferometer', startDate: '2026-08-20', endDate: '2026-08-20', duration: 8, technician: 'M. Service', cost: 15000, status: 'Overdue' },
];

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  phone: string;
  lastLogin: string;
  status: 'Active' | 'Inactive' | 'Suspended';
  avatar: string;
}

export const users: User[] = [
  { id: 'U001', name: 'Rajesh Kumar', email: 'r.kumar@cncforge.in', role: 'Administrator', department: 'IT', phone: '+91 98200 11223', lastLogin: '2026-09-07 08:42', status: 'Active', avatar: 'RK' },
  { id: 'U002', name: 'Priya Sharma', email: 'p.sharma@cncforge.in', role: 'Production Manager', department: 'Production', phone: '+91 98101 44556', lastLogin: '2026-09-07 07:15', status: 'Active', avatar: 'PS' },
  { id: 'U003', name: 'Amit Patel', email: 'a.patel@cncforge.in', role: 'CNC Operator', department: 'Shop Floor', phone: '+91 98225 77889', lastLogin: '2026-09-06 16:30', status: 'Active', avatar: 'AP' },
  { id: 'U004', name: 'Sneha Nair', email: 's.nair@cncforge.in', role: 'Quality Engineer', department: 'Quality', phone: '+91 98300 55667', lastLogin: '2026-09-07 09:00', status: 'Active', avatar: 'SN' },
  { id: 'U005', name: 'Vikram Singh', email: 'v.singh@cncforge.in', role: 'Sales Manager', department: 'Sales', phone: '+91 98450 88990', lastLogin: '2026-09-06 18:45', status: 'Active', avatar: 'VS' },
  { id: 'U006', name: 'Deepak Reddy', email: 'd.reddy@cncforge.in', role: 'Purchase Manager', department: 'Purchasing', phone: '+91 98220 33445', lastLogin: '2026-09-07 08:10', status: 'Active', avatar: 'DR' },
  { id: 'U007', name: 'Karthik Iyer', email: 'k.iyer@cncforge.in', role: 'CNC Operator', department: 'Shop Floor', phone: '+91 98100 99887', lastLogin: '2026-09-05 14:20', status: 'Inactive', avatar: 'KI' },
  { id: 'U008', name: 'Meera Banerjee', email: 'm.banerjee@cncforge.in', role: 'Engineering Lead', department: 'Engineering', phone: '+91 98330 22110', lastLogin: '2026-09-07 08:55', status: 'Active', avatar: 'MB' },
];

export interface Activity {
  id: string;
  type: 'production' | 'quality' | 'sales' | 'purchase' | 'maintenance' | 'inventory' | 'engineering';
  message: string;
  user: string;
  time: string;
}

export const recentActivities: Activity[] = [
  { id: '1', type: 'production', message: 'WO-2026-0847 completed 50 units on Op-10 (CNC-T01)', user: 'R. Sharma', time: '12 min ago' },
  { id: '2', type: 'quality', message: 'NCR-2026-0034 raised for Engine Bracket — 8 pcs rejected', user: 'Q. Singh', time: '35 min ago' },
  { id: '3', type: 'maintenance', message: 'CNC-T01 breakdown — spindle drive alarm', user: 'System', time: '1 hour ago' },
  { id: '4', type: 'sales', message: 'ENQ-2026-0142 received from Bharat Aerospace Ltd', user: 'V. Singh', time: '2 hours ago' },
  { id: '5', type: 'purchase', message: 'PO-2026-0047 partially received from Sandvik Coromant', user: 'D. Reddy', time: '3 hours ago' },
  { id: '6', type: 'inventory', message: 'SS 316L Bar restocked — 300 kg received', user: 'P. Stores', time: '4 hours ago' },
  { id: '7', type: 'production', message: 'WO-2026-0849 setup started on VTL-01', user: 'S. Nair', time: '5 hours ago' },
  { id: '8', type: 'engineering', message: 'Drawing DWG-BA-TB-204-R3 released for production', user: 'M. Banerjee', time: '6 hours ago' },
];

// Chart data
export const productionTrend = [
  { month: 'Mar', planned: 4200, completed: 3800, rejected: 120 },
  { month: 'Apr', planned: 4500, completed: 4100, rejected: 95 },
  { month: 'May', planned: 4800, completed: 4600, rejected: 110 },
  { month: 'Jun', planned: 5100, completed: 4900, rejected: 85 },
  { month: 'Jul', planned: 5300, completed: 5100, rejected: 130 },
  { month: 'Aug', planned: 5600, completed: 5400, rejected: 100 },
  { month: 'Sep', planned: 5900, completed: 5200, rejected: 75 },
];

export const orderStatusData = [
  { label: 'In Progress', value: 18, color: '#4f46e5' },
  { label: 'Completed', value: 24, color: '#16a34a' },
  { label: 'Planning', value: 7, color: '#f59e0b' },
  { label: 'On Hold', value: 4, color: '#64748b' },
  { label: 'Cancelled', value: 2, color: '#dc2626' },
];

export const qualityData = [
  { month: 'Mar', pass: 97.2, reject: 2.8 },
  { month: 'Apr', pass: 97.8, reject: 2.2 },
  { month: 'May', pass: 97.5, reject: 2.5 },
  { month: 'Jun', pass: 98.3, reject: 1.7 },
  { month: 'Jul', pass: 97.6, reject: 2.4 },
  { month: 'Aug', pass: 98.1, reject: 1.9 },
  { month: 'Sep', pass: 98.5, reject: 1.5 },
];

export interface RevisionRecord {
  id: string;
  drawingNo: string;
  partName: string;
  revision: string;
  description: string;
  date: string;
  approvedBy: string;
  status: 'Released' | 'Pending' | 'Superseded';
}

export const revisions: RevisionRecord[] = [
  { id: '1', drawingNo: 'DWG-BA-TB-204', partName: 'Turbine Bracket', revision: 'R3', description: 'Updated tolerance on bore Ø25 to ±0.02mm', date: '2026-08-20', approvedBy: 'M. Banerjee', status: 'Released' },
  { id: '2', drawingNo: 'DWG-BA-TB-204', partName: 'Turbine Bracket', revision: 'R2', description: 'Added 4x M6 mounting holes', date: '2026-06-15', approvedBy: 'M. Banerjee', status: 'Superseded' },
  { id: '3', drawingNo: 'DWG-BA-TB-204', partName: 'Turbine Bracket', revision: 'R1', description: 'Initial release', date: '2026-04-10', approvedBy: 'M. Banerjee', status: 'Superseded' },
  { id: '4', drawingNo: 'DWG-MPC-GH-118', partName: 'Gear Housing', revision: 'R2', description: 'Modified wall thickness to 5mm', date: '2026-07-22', approvedBy: 'M. Banerjee', status: 'Released' },
  { id: '5', drawingNo: 'DWG-IPD-NI-015', partName: 'Nozzle Insert', revision: 'R1', description: 'Initial release for ISRO contract', date: '2026-08-25', approvedBy: 'M. Banerjee', status: 'Released' },
  { id: '6', drawingNo: 'DWG-GA-AB-052', partName: 'Actuator Bracket', revision: 'R0', description: 'Prototype — pending design review', date: '2026-08-21', approvedBy: '—', status: 'Pending' },
];

export interface CostBreakdown {
  category: string;
  material: number;
  machine: number;
  labour: number;
  tooling: number;
  overhead: number;
  total: number;
}

export const jobCosting: CostBreakdown[] = [
  { category: 'WO-2026-0847 (Turbine Bracket)', material: 178500, machine: 92000, labour: 45000, tooling: 28000, overhead: 35000, total: 378500 },
  { category: 'WO-2026-0851 (Gear Housing)', material: 142800, machine: 108000, labour: 52000, tooling: 22000, overhead: 38000, total: 362800 },
  { category: 'WO-2026-0849 (Nozzle Insert)', material: 184320, machine: 86000, labour: 38000, tooling: 31000, overhead: 29000, total: 368320 },
  { category: 'WO-2026-0855 (Engine Bracket)', material: 95000, machine: 124000, labour: 62000, tooling: 18000, overhead: 42000, total: 341000 },
  { category: 'WO-2026-0842 (Gear Housing)', material: 142800, machine: 102000, labour: 48000, tooling: 20000, overhead: 35000, total: 347800 },
];

export interface AuditLog {
  id: string;
  user: string;
  action: string;
  module: string;
  detail: string;
  ip: string;
  timestamp: string;
}

export const auditLogs: AuditLog[] = [
  { id: '1', user: 'Rajesh Kumar', action: 'LOGIN', module: 'Auth', detail: 'User logged in successfully', ip: '192.168.1.24', timestamp: '2026-09-07 08:42:15' },
  { id: '2', user: 'Priya Sharma', action: 'UPDATE', module: 'Production', detail: 'Updated WO-2026-0847 quantity from 150 to 180', ip: '192.168.1.35', timestamp: '2026-09-07 08:38:02' },
  { id: '3', user: 'Sneha Nair', action: 'CREATE', module: 'Quality', detail: 'Created NCR-2026-0034', ip: '192.168.1.48', timestamp: '2026-09-07 08:25:41' },
  { id: '4', user: 'Vikram Singh', action: 'CREATE', module: 'Sales', detail: 'Created enquiry ENQ-2026-0142', ip: '192.168.1.52', timestamp: '2026-09-07 07:55:18' },
  { id: '5', user: 'Deepak Reddy', action: 'UPDATE', module: 'Purchasing', detail: 'Received partial goods for PO-2026-0047', ip: '192.168.1.61', timestamp: '2026-09-07 06:40:33' },
  { id: '6', user: 'Meera Banerjee', action: 'UPDATE', module: 'Engineering', detail: 'Released drawing DWG-BA-TB-204-R3', ip: '192.168.1.44', timestamp: '2026-09-06 17:22:09' },
  { id: '7', user: 'Rajesh Kumar', action: 'DELETE', module: 'Admin', detail: 'Deactivated user K. Iyer', ip: '192.168.1.24', timestamp: '2026-09-06 16:10:55' },
  { id: '8', user: 'Amit Patel', action: 'UPDATE', module: 'Production', detail: 'Completed JC-0842-30 (2000 units)', ip: '192.168.1.72', timestamp: '2026-09-06 15:48:21' },
];
