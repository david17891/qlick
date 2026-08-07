export type ServiceInterestStatus =
  | "detected"
  | "contacted"
  | "qualified"
  | "won"
  | "lost";

export interface ServiceInterest {
  id: string;
  leadId: string;
  serviceId: string | null;
  serviceSlug: string;
  variantId: string | null;
  variantSlug: string | null;
  category: string;
  needSummary: string;
  preferredContactTime: string | null;
  source: "whatsapp" | "facebook_ads";
  campaignKey: string | null;
  consentBasis: "inbound_service_request";
  status: ServiceInterestStatus;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaptureServiceInterestInput {
  phoneNormalized: string;
  leadName?: string | null;
  serviceSlug: string;
  variantSlug?: string | null;
  category: string;
  needSummary: string;
  preferredContactTime?: string | null;
  source: "whatsapp" | "facebook_ads";
  campaignKey?: string | null;
  sourceMessageId: string;
  consentBasis: "inbound_service_request";
}

export interface CaptureServiceInterestResult {
  ok: boolean;
  leadId: string | null;
  interestId: string | null;
  taskId: string | null;
  createdLead: boolean;
  duplicate: boolean;
  notificationSent: boolean;
  persisted: boolean;
  note: string;
}
