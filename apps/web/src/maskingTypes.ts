export type MaskSource = 'manual' | 'ocr' | 'regex' | 'llm';

export type MaskStatus = 'candidate' | 'review' | 'accepted' | 'rejected';

export type MaskFillColor = 'black' | 'white';

export type MaskingMode = 'idle' | 'manual' | 'autoProcessing' | 'autoReview' | 'autoEdit' | 'manualFromOriginal';

export type WorkingBase = 'original' | 'autoResult';

export type MaskBox = {
  id: string;
  pageNumber: number;
  x: number;
  y: number;
  width: number;
  height: number;
  source: MaskSource;
  status: MaskStatus;
  label?: string;
  confidence?: number;
  text?: string;
  detectionId?: string;
  rawText?: string;
  maskText?: string;
};

export type PageRenderState = {
  pageNumber: number;
  width: number;
  height: number;
  scale: number;
  canvasDataUrl: string;
  masks: MaskBox[];
};

export type MaskingWorkflowState = {
  mode: MaskingMode;
  workingBase: WorkingBase;
  masks: MaskBox[];
};
