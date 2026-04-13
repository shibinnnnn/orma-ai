export interface Customer {
  id: string;
  name: string;
  number: string;
  location: string;
  addedAt: string; // ISO string
  portingDate: string; // ISO string (addedAt + 90 days)
}

export interface PortingStatus {
  daysRemaining: number;
  isEligible: boolean;
  isNear: boolean;
  isVeryNear: boolean;
}

export interface Settings {
  nearDays: number;
  veryNearDays: number;
}
