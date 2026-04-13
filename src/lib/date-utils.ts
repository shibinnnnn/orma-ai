import { Customer, PortingStatus } from "../types";

export function calculatePortingDate(addedAt: string): string {
  const date = new Date(addedAt);
  date.setDate(date.getDate() + 90);
  return date.toISOString();
}

export function getPortingStatus(portingDate: string, nearDays: number = 7, veryNearDays: number = 3): PortingStatus {
  const now = new Date();
  const target = new Date(portingDate);
  const diffTime = target.getTime() - now.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    daysRemaining: diffDays,
    isEligible: diffDays <= 0,
    isNear: diffDays <= nearDays && diffDays > 0,
    isVeryNear: diffDays <= veryNearDays && diffDays > 0,
  };
}

export function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}
