export interface BookingRow {
  'Booking number': string;
  'Date': string;
  'Property name': string;
  'Status': string;
  'Check-in date': string;
  'Check-out date': string;
  'Paid': string;
  'Extras with VAT on top': string;
  'Portal/Intermediary Commission: calculated commission': string;
  'nights': string;
  [key: string]: string;
}

export interface ProcessedBooking {
  'Booking number': string;
  'Date': string;
  'Property name': string;
  'Status': string;
  'Check-in date': string;
  'Check-out date': string;
  'Net Income': string;
  'nights': string;
}

export interface FinancialYear {
  label: string;
  startDate: string;
  endDate: string;
  displayRange: string;
}

export interface PropertyReport {
  propertyName: string;
  bookings: ProcessedBooking[];
  totalNights: number;
  yearRange: string;
  financialYear?: FinancialYear;
}

export interface DatabaseUser {
  id: string;
  email: string;
  raw_app_meta_data: { role?: string };
  created_at: string;
}

export interface DirectorAccess {
  id: string;
  user_id: string;
  project_id: string;
  granted_by: string;
  granted_at: string;
  user?: DatabaseUser;
}

export type SafetyDocumentType = 'stl_licence' | 'eicr' | 'pat' | 'gas_safety' | 'fire_risk_assessment' | 'other';

export interface GeneratedReport {
  id: string;
  property_name: string;
  file_name: string;
  file_type: 'csv' | 'html' | 'cover_letter' | 'uploaded';
  storage_path: string;
  date_range_start: string | null;
  date_range_end: string | null;
  year_range: string;
  booking_count: number;
  total_nights: number;
  generated_by: string | null;
  created_at: string;
  is_safety_document: boolean;
  safety_document_type: SafetyDocumentType | null;
  expiry_date: string | null;
}

export interface FireAlarmTest {
  id: string;
  property_name: string;
  tested_at: string;
  tested_by: string;
  result: 'pass' | 'fail';
  notes: string | null;
  created_at: string;
}

export interface Owner {
  id: string;
  email: string;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  approved_for_dac7: boolean;
  approved_for_portal: boolean;
  auth_user_id: string | null;
  has_account?: boolean;
  property_count?: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface OwnerProperty {
  id: string;
  user_id: string;
  owner_id: string | null;
  property_name: string;
  display_name: string;
  created_at: string;
}

export interface DateRangeFilter {
  startDate: string;
  endDate: string;
}

export interface Property {
  id: string;
  name: string;
  notes: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export type PATTestType = 'Class 1' | 'Class 2' | 'Lead' | 'Visual';
export type TestResult = 'pass' | 'fail';

export interface PATTestResult {
  id: string;
  property_id: string | null;
  property_name: string;
  test_date: string;
  asset_description: string;
  location_in_property: string;
  test_type: PATTestType;
  result: TestResult;
  notes: string | null;
  photo_url: string | null;
  tested_by: string | null;
  created_at: string;
  created_by: string | null;
}
