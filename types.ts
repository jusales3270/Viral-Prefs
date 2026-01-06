
export interface GroundingSource {
  web?: {
    uri: string;
    title: string;
  };
}

export enum RiskLevel {
  LOW = 'Baixo',
  MEDIUM = 'Médio',
  HIGH = 'Alto',
}

export interface AnalysisResult {
  id: string;
  trend: string;
  timestamp: Date;
  content: string;
  sources: GroundingSource[];
  riskLevel: RiskLevel;
  officialUrl?: string; // Link direto da API sem passar por filtros da IA
  isAutoDiscovery?: boolean;
}
