export type ThemePaletteId = 'dark' | 'light';

export type ActiveTab = 'monitor' | 'analytics' | 'system' | 'audit';

export interface ThemePaletteInfo {
  id: ThemePaletteId;
  name: string;
  tagline: string;
  previewColors: [string, string, string]; // [primary, secondary, accent]
}

export interface PipelineGateStatus {
  frames_seen?: number;
  frames_kept?: number;
  frames_dropped?: number;
  frame_retention?: number;
}

export interface PipelineMetricsStatus {
  tokens_in?: number;
  tokens_out?: number;
  tokens_total?: number;
  tokens_per_hour?: number;
  p50_latency_s?: number;
  p95_latency_s?: number;
  max_queue_depth?: number;
}

export interface PipelineMemoryStatus {
  bounded?: boolean;
  mode?: string;
  compactions?: number;
}

export interface PipelineStatus {
  running?: boolean;
  run_id?: string;
  url?: string;
  escalated?: boolean;
  provider?: string;
  model?: string;
  reconnects?: number;
  queue_depth?: number;
  gate?: PipelineGateStatus;
  metrics?: PipelineMetricsStatus;
  memory?: PipelineMemoryStatus;
  has_youtube_cookies?: boolean;
}

export interface PricingConfig {
  [modelName: string]:
    | {
        input_per_million: number;
        output_per_million: number;
      }
    | number
    | undefined;
  usd_to_inr?: number;
}

export interface StartRequest {
  url: string;
  tau?: number;
  escalation?: boolean;
  provider?: string;
  model?: string;
  bounded?: boolean;
  audio?: boolean;
  gate?: boolean;
  run_id?: string;
  api_key?: string;
  cookies?: string;
}

export interface VerifyKeyResponse {
  valid: boolean;
  message?: string;
  error?: string;
  model?: string;
  latency_ms?: number;
  status_code?: number;
}

export type EventCategory = 'llm' | 'gate' | 'audio' | 'system';

export interface PipelineEventBase {
  type: string;
  t?: number;
  cost?: 'billed' | 'free';
  error?: string;
  status?: PipelineStatus;
  [key: string]: any;
}

export interface FormattedEvent {
  id: string;
  rawEvent: PipelineEventBase;
  type: string;
  tag: string;
  category: EventCategory;
  timestamp: string;
  rawT: number;
  cost: 'billed' | 'free';
  title: string;
  body: string;
  badges?: Array<{ label: string; tone?: 'accent' | 'rose' | 'emerald' | 'amethyst' | 'warm' }>;
}
