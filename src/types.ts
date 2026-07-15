/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ParsedBrief {
  assignmentName: string;
  courseName: string;
  deadline: string;
  goals: string[];
  assignmentRules?: string[];
  immediatePracticalStep?: string;
  requirements: string[];
  constraints: string[];
  suggestedSteps: Array<{
    title: string;
    description: string;
    phase: 'research' | 'ideation' | 'planning' | 'execution' | 'review' | string;
    weight?: 'core' | 'support';
  }>;
  mentorGreeting?: string;
  deepResearchInsights?: string[];
}

export interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  phase: 'research' | 'ideation' | 'planning' | 'execution' | 'review' | string;
  // core = creative/conceptual heart of the project; support = practical logistics
  weight?: 'core' | 'support';
  completed: boolean;
  // User chose to skip for now; the mentor should bring it back at the most logical later point
  skipped?: boolean;
  isCustom?: boolean;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  source?: 'voice' | 'text';
  // Provisional live transcription — replaced by the accurate one when ready
  pending?: boolean;
  // Optional analytical metrics for assistant messages
  userMoodAnalysis?: string;
  currentPhaseAnalysis?: string;
  candidates?: Array<{
    id: number;
    text: string;
    metrics: {
      empathy: number;
      briefRelevance: number;
      phaseRelevance: number;
      userStateCalibration: number;
      novelty: number;
      socraticPedagogy: number;
    };
    metricExplanations: {
      empathy: string;
      briefRelevance: string;
      phaseRelevance: string;
      userStateCalibration: string;
      novelty: string;
      socraticPedagogy: string;
    };
    totalScore: number;
  }>;
  winningCandidateId?: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  imageUrl?: string;
  imageName?: string;
  createdBy?: 'user' | 'ai';
  createdAt: string;
  updatedAt: string;
}

// Cross-conversation learning profile: how the mentor should adapt to this student
export interface UserProfile {
  name?: string;
  guidanceStyle: string;
  pace: string;
  strengths: string[];
  struggles: string[];
  vocabulary: string[];
  lastUpdated: string;
}

export interface Project {
  id: string;
  name: string;
  courseName: string;
  fileName: string;
  createdAt: string;
  lastActive: string;
  brief: ParsedBrief;
  checklist: ChecklistItem[];
  messages: ChatMessage[];
  notes?: string; // Legacy string scratchpad
  notesList?: Note[];
}
