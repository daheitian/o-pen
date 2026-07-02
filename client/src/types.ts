export type Note = {
  id: string;
  content: string;
  tags: string[];
  links: string[];
  backlinks: string[];
  created_at: string;
  updated_at?: string;
  is_pinned: boolean;
};

export type Stats = {
  totalNotes: number;
  totalTags: number;
  tagFrequency: Record<string, number>;
  heatmap: Array<{
    date: string;
    count: number;
  }>;
};

export type ChatMessage = {
  role: 'user' | 'model' | string;
  content: string;
  created_at?: string;
};

export type TagInfo = {
  name: string;
  count: number;
};

export type NoteChanges = {
  notes?: Note[];
  deletedIds?: string[];
};
