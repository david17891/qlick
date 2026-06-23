import type { Coupon, Payment } from "@/types";

/**
 * Pagos y cupones demo. Las cifras están en MXN.
 */

export const coupons: Coupon[] = [
  {
    id: "coupon_welcome",
    code: "BIENVENIDA20",
    description: "20% de descuento en tu primera compra.",
    percentOff: 20,
    maxRedemptions: 100,
    redeemCount: 23,
    active: true,
    expiresAt: "2026-12-31T23:59:59Z"
  },
  {
    id: "coupon_qlick",
    code: "QLICK50",
    description: "50% de descuento para comunidad Qlick.",
    percentOff: 50,
    maxRedemptions: 50,
    redeemCount: 12,
    active: true,
    expiresAt: "2026-09-30T23:59:59Z"
  },
  {
    id: "coupon_expired",
    code: "VERANO2024",
    description: "Cupón caducado (solo para probar estados).",
    percentOff: 15,
    maxRedemptions: 200,
    redeemCount: 200,
    active: false,
    expiresAt: "2024-08-31T23:59:59Z"
  }
];

export const payments: Payment[] = [
  {
    id: "pay_demo_1",
    userId: "user_alumno",
    courseId: "course_ads",
    enrollmentId: "enr_2",
    provider: "mock",
    method: "card",
    status: "approved",
    amountMXN: 1499,
    discountMXN: 0,
    currency: "MXN",
    externalReference: "MOCK-pay_1",
    createdAt: "2025-05-20T11:00:00Z",
    updatedAt: "2025-05-20T11:01:00Z"
  },
  {
    id: "pay_demo_2",
    userId: "user_alumno_2",
    courseId: "course_contenido",
    enrollmentId: "enr_3",
    couponId: "coupon_welcome",
    provider: "mock",
    method: "card",
    status: "approved",
    amountMXN: 1299,
    discountMXN: 260,
    currency: "MXN",
    externalReference: "MOCK-pay_2",
    createdAt: "2025-05-30T09:30:00Z",
    updatedAt: "2025-05-30T09:31:00Z"
  },
  {
    id: "pay_demo_3",
    userId: "user_alumno_3",
    courseId: "course_automatizacion",
    enrollmentId: "enr_4",
    provider: "mock",
    method: "oxxo",
    status: "pending",
    amountMXN: 1799,
    discountMXN: 0,
    currency: "MXN",
    externalReference: "MOCK-pay_3",
    createdAt: "2025-06-02T15:00:00Z",
    updatedAt: "2025-06-02T15:01:00Z"
  },
  {
    id: "pay_demo_4",
    userId: "user_alumno_2",
    courseId: "course_ads",
    provider: "mock",
    method: "card",
    status: "rejected",
    amountMXN: 1499,
    discountMXN: 0,
    currency: "MXN",
    externalReference: "MOCK-pay_4",
    createdAt: "2025-06-05T13:00:00Z",
    updatedAt: "2025-06-05T13:00:30Z"
  }
];

/* Accesores */

export function getCouponByCode(code: string): Coupon | undefined {
  return coupons.find((c) => c.code.toLowerCase() === code.toLowerCase());
}

export function isCouponValid(coupon: Coupon | undefined): {
  valid: boolean;
  reason?: string;
} {
  if (!coupon) return { valid: false, reason: "Cupón no encontrado." };
  if (!coupon.active) return { valid: false, reason: "Cupón inactivo." };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) {
    return { valid: false, reason: "Cupón expirado." };
  }
  if (coupon.maxRedemptions && coupon.redeemCount >= coupon.maxRedemptions) {
    return { valid: false, reason: "Cupón agotado." };
  }
  return { valid: true };
}

export function getPaymentsForUser(userId: string): Payment[] {
  return payments.filter((p) => p.userId === userId);
}

export function getAllPayments(): Payment[] {
  return payments;
}

export function getPaymentsForCourse(courseId: string): Payment[] {
  return payments.filter((p) => p.courseId === courseId);
}

export function sumRevenue(): { totalMXN: number; approvedMXN: number; pendingMXN: number } {
  let totalMXN = 0;
  let approvedMXN = 0;
  let pendingMXN = 0;
  for (const p of payments) {
    if (p.status === "approved") {
      approvedMXN += p.amountMXN - p.discountMXN;
      totalMXN += p.amountMXN - p.discountMXN;
    } else if (p.status === "pending") {
      pendingMXN += p.amountMXN - p.discountMXN;
    }
  }
  return { totalMXN, approvedMXN, pendingMXN };
}
