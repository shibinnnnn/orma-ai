export interface User {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  picture?: string;
}

export interface Customer {
  id: string;
  name: string;
  number: string;
  location: string;
  addedAt: string; // ISO string
  portingDate: string; // ISO string (addedAt + 90 days)
  portingDateMode?: 'auto' | 'manual' | 'days';
  portingDaysOffset?: string;
}

export interface PortingStatus {
  daysRemaining: number;
  isEligible: boolean;
  isNear: boolean;
  isVeryNear: boolean;
  progress: number; // 0 to 1
}

export interface Settings {
  nearDays: number;
  veryNearDays: number;
  enableEmailNotifications: boolean;
  hasDismissedPromo: boolean;
  userEmail?: string;
  updatedAt?: string;
}
