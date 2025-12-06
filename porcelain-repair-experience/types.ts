
export enum RepairStage {
  SELECTION = 0, // 6 vases in a circle
  ASSEMBLY = 1,  // Particles gathering
  BLUEPRINT = 2, // Wireframe/Digital base
  CLEANING = 3,  // Remove dust
  CRACK_FIX = 4, // Pinch to fix cracks
  COLORING = 5,  // Swipe to paint
  COMPLETED = 6, // Holding to finish
  INSPECT = 7    // Two fists to rotate
}

export type VaseShapeType = 'meiping' | 'yuhuchun' | 'tianqiuping' | 'hulu' | 'guanyin' | 'bangchui';

export interface HandControlState {
  stage: RepairStage;
  selectedVaseIndex: number; // 0-5
  
  // Interaction values (0.0 to 1.0)
  assemblyProgress: number;
  blueprintOpacity: number;
  cleanliness: number;
  crackRepairProgress: number;
  coloringProgress: number;
  
  // Navigation
  rotationX: number;
  rotationY: number;
  
  isHandDetected: boolean;
  gestureFeedback: string; // Text to display to user
}

export interface VaseProps {
  controlState: HandControlState;
  shapeType?: VaseShapeType;
  isMenuMode?: boolean; // If true, render simplified version
  menuIndex?: number;
}
