export interface Character {
  id: string;
  name: string;
  role: string;
  description: string;
  physicality: string;
  closeup_notes: string;
  voice: string;
}

export interface ViralTrend {
  name: string;
  description: string;
  example: string;
  pacing: string;
  tone: string;
}

export interface KnowledgeBase {
  version: string;
  lastUpdated: string;
  trends: ViralTrend[];
  expertGuidelines: {
    mindset: string[];
    cinematicMethod: { pillar: string; detail: string }[];
    structure: {
      Hook: string;
      RelatableReality: string;
      Insight: string;
      Resolution: string;
    };
  };
}

export type AppStep = 'upload' | 'detecting' | 'edit' | 'generating';
