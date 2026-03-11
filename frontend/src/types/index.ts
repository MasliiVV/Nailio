/* ============================================
   API Response Types — matching backend DTOs
   ============================================ */

// ---- Common ----
export interface ApiResponse<T> {
  success: boolean;
  data: T;
}

export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

// ---- Auth ----
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  role: UserRole;
  needsOnboarding: boolean;
  profile: Profile;
  tenant: Tenant | null;
}

export type UserRole = 'master' | 'client' | 'admin' | 'platform_admin';

// ---- Profile ----
export interface Profile {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  avatarUrl: string | null;
}

export interface UpdateProfileDto {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

// ---- Tenant ----
export interface Tenant {
  id: string;
  displayName: string;
  slug: string;
  logoUrl: string | null;
  branding: TenantBranding | null;
}

export interface TenantBranding {
  primaryColor?: string;
  secondaryColor?: string;
  welcomeMessage?: string;
}

// ---- Service ----
export interface Service {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number; // in kopecks (e.g. 80000 = 800.00 UAH)
  currency: string;
  category: string | null;
  color: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CreateServiceDto {
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  currency?: string;
  bufferMinutes?: number;
  category?: string;
  color?: string;
}

export interface UpdateServiceDto extends Partial<CreateServiceDto> {
  isActive?: boolean;
  sortOrder?: number;
}

// ---- Schedule ----
export interface WorkingHours {
  dayOfWeek: number; // 0=Mon ... 6=Sun
  isWorking: boolean;
  startTime: string; // "09:00"
  endTime: string;   // "18:00"
}

export interface ScheduleOverride {
  id: string;
  date: string;
  isDayOff: boolean;
  startTime: string | null;
  endTime: string | null;
}

export interface Schedule {
  hours: WorkingHours[];
  overrides: ScheduleOverride[];
}

export interface CreateOverrideDto {
  date: string;
  isDayOff: boolean;
  startTime?: string;
  endTime?: string;
}

// ---- Slots ----
export interface TimeSlot {
  startTime: string; // "09:00"
  endTime: string;   // "10:00"
  available: boolean;
}

export interface SlotsResponse {
  date: string;
  timezone: string;
  slots: TimeSlot[];
}

// ---- Booking ----
export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';

export interface Booking {
  id: string;
  serviceNameSnapshot: string;
  priceAtBooking: number;
  durationAtBooking: number;
  startTime: string;
  endTime: string;
  status: BookingStatus;
  notes: string | null;
  createdBy: 'client' | 'master';
  createdAt: string;
  client?: {
    id: string;
    firstName: string;
    lastName: string | null;
    phone: string | null;
  };
  service?: {
    id: string;
    name: string;
    color: string | null;
  };
}

export interface CreateBookingDto {
  serviceId: string;
  startTime: string;
  notes?: string;
  clientId?: string; // master creating for a client
}

export interface CancelBookingDto {
  reason?: string;
}

// ---- Client (CRM) ----
export interface Client {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  notes: string | null;
  tags: string[];
  isBlocked: boolean;
  lastVisitAt: string | null;
  stats: ClientStats;
}

export interface ClientStats {
  totalBookings: number;
  completed: number;
  cancelled: number;
  noShows: number;
  totalSpent: number;
}

export interface ClientDetail extends Client {
  recentBookings: Booking[];
}

// ---- Analytics ----
export interface DashboardData {
  today: {
    bookings: number;
    completed: number;
    revenue: number;
    nextBooking: Booking | null;
  };
  period: {
    totalBookings: number;
    completed: number;
    cancelled: number;
    noShows: number;
    revenue: number;
    newClients: number;
    popularServices: { name: string; count: number }[];
  };
}

// ---- Finance ----
export type TransactionType = 'income' | 'expense';

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  category: string | null;
  bookingId: string | null;
  createdAt: string;
}

export interface FinanceSummary {
  income: number;
  expense: number;
  net: number;
}

export interface CreateTransactionDto {
  type: TransactionType;
  amount: number;
  description: string;
  category?: string;
  bookingId?: string;
}

// ---- Subscription ----
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'expired' | 'cancelled';

export interface Subscription {
  status: SubscriptionStatus;
  plan: string;
  pricePerMonth: number | null;
  currentPeriodEnd: string;
  trialEndsAt: string | null;
  cancelledAt: string | null;
  daysLeft: number;
}

export interface SubscriptionPayment {
  id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  createdAt: string;
}

export interface CheckoutResponse {
  paymentUrl: string;
  invoiceId: string;
}

// ---- Bot ----
export interface BotStatus {
  botUsername: string;
  botId: number;
  webhookSet: boolean;
  miniAppUrl: string;
}

export interface ConnectBotDto {
  botToken: string;
}

// ---- Client Onboarding ----
export interface ClientOnboardingDto {
  firstName: string;
  lastName?: string;
  phone?: string;
}

// ---- Settings ----
export interface TenantSettings {
  branding: TenantBranding;
  general: {
    timezone: string;
    cancellationWindowHours: number;
    autoConfirm: boolean;
  };
}

export interface UpdateBrandingDto {
  primaryColor?: string;
  secondaryColor?: string;
  displayName?: string;
  welcomeMessage?: string;
}
